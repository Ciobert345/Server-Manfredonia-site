import net from 'net';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, mc-host, mc-port',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: 'OK' };
    }

    const host = (event.headers['mc-host'] || '').trim();
    const port = parseInt((event.headers['mc-port'] || '').trim(), 10) || 25565;

    if (!host) {
        return {
            statusCode: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Missing mc-host header' })
        };
    }

    try {
        const status = await pingMinecraftServer(host, port, 5000);
        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                online: true,
                onlinePlayers: status.players?.online ?? 0,
                maxPlayers: status.players?.max ?? 0,
                playerNames: (status.players?.sample || []).map(p => p.name),
                versionName: status.version?.name || null,
            })
        };
    } catch (err) {
        // Server offline / unreachable / timed out — not a hard error, just no data.
        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                online: false,
                onlinePlayers: 0,
                maxPlayers: 0,
                playerNames: [],
                error: err.message
            })
        };
    }
};

function writeVarInt(value) {
    const bytes = [];
    do {
        let temp = value & 0b01111111;
        value >>>= 7;
        if (value !== 0) temp |= 0b10000000;
        bytes.push(temp);
    } while (value !== 0);
    return Buffer.from(bytes);
}

function readVarInt(buffer, offset) {
    let value = 0;
    let size = 0;
    let byte;
    do {
        if (offset + size >= buffer.length) return null; // not enough data yet
        byte = buffer[offset + size];
        value |= (byte & 0b01111111) << (7 * size);
        size++;
    } while ((byte & 0b10000000) !== 0);
    return { value, size };
}

function writeString(str) {
    const strBuf = Buffer.from(str, 'utf8');
    return Buffer.concat([writeVarInt(strBuf.length), strBuf]);
}

/**
 * Minecraft Java Edition "Server List Ping" protocol:
 * https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping
 *
 * 1. Send a Handshake packet (state=1, "status")
 * 2. Send an empty Status Request packet
 * 3. Read back a Status Response packet containing a JSON payload
 */
function pingMinecraftServer(host, port, timeoutMs) {
    return new Promise((resolve, reject) => {
        let finished = false;
        let buffer = Buffer.alloc(0);

        const socket = net.connect({ host, port });

        const done = (err, data) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try { socket.destroy(); } catch { }
            if (err) reject(err); else resolve(data);
        };

        const timer = setTimeout(() => done(new Error('Timeout: server did not respond')), timeoutMs);

        socket.on('error', (e) => done(new Error(e.message)));

        socket.on('connect', () => {
            // Handshake packet (id 0x00)
            const protocolVersion = writeVarInt(-1); // let the server report its own version
            const serverAddress = writeString(host);
            const serverPort = Buffer.alloc(2);
            serverPort.writeUInt16BE(port, 0);
            const nextState = writeVarInt(1); // 1 = status

            const handshakeData = Buffer.concat([
                writeVarInt(0x00), protocolVersion, serverAddress, serverPort, nextState
            ]);
            const handshakePacket = Buffer.concat([writeVarInt(handshakeData.length), handshakeData]);

            // Status Request packet (id 0x00, empty body)
            const requestData = writeVarInt(0x00);
            const requestPacket = Buffer.concat([writeVarInt(requestData.length), requestData]);

            socket.write(Buffer.concat([handshakePacket, requestPacket]));
        });

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            const lengthInfo = readVarInt(buffer, 0);
            if (!lengthInfo) return; // wait for more data
            const packetLength = lengthInfo.value;
            const packetStart = lengthInfo.size;

            if (buffer.length < packetStart + packetLength) return; // wait for more data

            const packetIdInfo = readVarInt(buffer, packetStart);
            if (!packetIdInfo) return done(new Error('Malformed response packet'));

            const jsonStart = packetStart + packetIdInfo.size;
            const jsonLengthInfo = readVarInt(buffer, jsonStart);
            if (!jsonLengthInfo) return done(new Error('Malformed response payload'));

            const strStart = jsonStart + jsonLengthInfo.size;
            const strEnd = strStart + jsonLengthInfo.value;
            if (buffer.length < strEnd) return; // wait for more data

            const jsonStr = buffer.toString('utf8', strStart, strEnd);
            try {
                const parsed = JSON.parse(jsonStr);
                done(null, parsed);
            } catch (e) {
                done(new Error('Invalid JSON in server response'));
            }
        });
    });
}