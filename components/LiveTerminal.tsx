
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface LiveTerminalProps {
    serverOnline?: boolean;
}

const LiveTerminal: React.FC<LiveTerminalProps> = ({ serverOnline = false }) => {
    const { mcssService, user } = useAuth();
    // ... rest of state
    const [logs, setLogs] = useState<string[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [serverId, setServerId] = useState<string | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchServers = async () => {
            if (!mcssService) return;
            try {
                const servers = await mcssService.getServers();
                if (servers.length > 0) {
                    setServerId(servers[0].serverId);
                }
            } catch (err) {
                // console.error('Failed to fetch servers:', err);
            }
        };
        fetchServers();
    }, [mcssService]);

    useEffect(() => {
        if (!mcssService || !serverId) return;

        const pollLogs = async () => {
            try {
                const newLogs = await mcssService.getConsole(serverId, 100);
                setLogs(newLogs);
                setLoading(false);
            } catch (err) {
                // console.error('Failed to poll logs:', err);
            }
        };

        pollLogs();

        const interval = setInterval(() => {
            if (!document.hidden) pollLogs();
        }, 1000);
        return () => clearInterval(interval);
    }, [mcssService, serverId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const handleCommand = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !mcssService || !serverId || isExecuting || !serverOnline) return;

        const cmd = input.trim();
        setInput('');
        setIsExecuting(true);

        try {
            await mcssService.executeCommand(serverId, cmd);
            setLogs(prev => [...prev.slice(-100), `> [EXEC]: ${cmd}`]);
        } catch (err: any) {
            setLogs(prev => [...prev.slice(-100), `>> ERROR: ${err.message}`]);
        } finally {
            setIsExecuting(false);
        }
    };

    if (loading && !logs.length && serverOnline) {
        return (
            <div className="flex items-center justify-center h-full text-white/10 uppercase font-black text-[10px] tracking-widest animate-pulse">
                Establishing_Neural_Link...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full relative group/terminal select-none text-white/70">
            {/* TERMINAL BODY */}
            <div
                ref={scrollRef}
                className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-snug custom-terminal-scrollbar bg-black/20"
                style={{ scrollbarWidth: 'none' }}
            >
                <div className="flex flex-col gap-0.5">
                    {logs.map((log, i) => (
                        <div key={i} className="flex gap-3 group/line hover:bg-white/[0.02] items-start">
                            <span className="text-white/5 shrink-0 tabular-nums">{(i + 1).toString().padStart(4, '0')}</span>
                            <span className="break-all selection:bg-purple-500/30">
                                {log.startsWith('>') ? (
                                    <span className="text-emerald-400/80 font-bold">{log}</span>
                                ) : log.includes('ERROR') || log.includes('FAILED') ? (
                                    <span className="text-red-400/80">{log}</span>
                                ) : (
                                    <span className="text-white/40">{log}</span>
                                )}
                            </span>
                        </div>
                    ))}
                    <div className="h-4"></div>
                </div>
            </div>

            {/* INPUT FIELD */}
            <div className={`px-4 py-3 bg-white/[0.01] border-t border-white/5 backdrop-blur-md transition-opacity ${!serverOnline ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
                <form onSubmit={handleCommand} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 shrink-0 opacity-40">
                        <span className="text-purple-400 font-bold text-xs tracking-tighter uppercase whitespace-nowrap">Node@Remote</span>
                        <span className="text-white/20 text-xs">:~$</span>
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={serverOnline ? "Type tactical directive..." : "Node cluster offline. Input locked."}
                        autoComplete="off"
                        className="flex-1 bg-transparent border-none text-white font-mono text-xs focus:outline-none placeholder:text-white/5 tracking-tight disabled:opacity-20 translate-y-[0.5px]"
                        disabled={isExecuting || !serverOnline}
                    />
                    <AnimatePresence>
                        {isExecuting && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center gap-2"
                            >
                                <div className="size-1 rounded-full bg-orange-500 animate-pulse"></div>
                                <span className="text-[7px] font-black text-orange-500/60 uppercase tracking-widest">TRANSMITTING</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </form>
            </div>
        </div>
    );
};

export default LiveTerminal;
