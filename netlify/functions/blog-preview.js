// netlify/functions/blog-preview.js
// Intercepts /blog/:slug requests.
// - Social bots  → returns an HTML page with proper og: / twitter: meta tags.
// - Regular users → returns a small HTML redirect to the SPA (index.html).

const https = require('https');

const SUPABASE_URL  = 'https://dbqbxhtqvsvfasbmvahe.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicWJ4aHRxdnN2ZmFzYm12YWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzQwNzgsImV4cCI6MjA4NDE1MDA3OH0.l7MKGPMyCx4EYpdGXG8MPu1PxDFXIWSZwHI8tBSjqRY';
const SITE_URL      = 'https://server-manfredonia.netlify.app';
const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;

// Social-media / preview bot user-agent keywords
const BOT_PATTERNS = [
  'facebookexternalhit', 'facebookcatalog', 'twitterbot', 'linkedinbot',
  'whatsapp', 'telegrambot', 'discordbot', 'slackbot', 'slack-imgproxy',
  'googlebot', 'bingbot', 'yandexbot', 'applebot', 'ia_archiver',
  'rogerbot', 'embedly', 'quora link preview', 'showyoubot', 'outbrain',
  'pinterest', 'vkshare', 'w3c_validator', 'redditbot', 'skypeuripreview',
  'bitlybot', 'tumblr', 'viber'
];

function isBot(userAgent = '') {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some(p => ua.includes(p));
}

function fetchFromSupabase(slug) {
  return new Promise((resolve, reject) => {
    const path = `/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=title,excerpt,cover_image_url&limit=1`;
    const options = {
      hostname: SUPABASE_URL.replace('https://', ''),
      path,
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: 'application/json',
      },
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(Array.isArray(data) && data.length > 0 ? data[0] : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildBotHtml({ title, description, image, pageUrl, slug }) {
  const safeTitle = escapeHtml(title);
  const safeDesc  = escapeHtml(description);
  const safeImage = escapeHtml(image);
  const safeUrl   = escapeHtml(pageUrl);

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />

  <!-- Open Graph -->
  <meta property="og:type"        content="article" />
  <meta property="og:site_name"   content="Server Manfredonia" />
  <meta property="og:url"         content="${safeUrl}" />
  <meta property="og:title"       content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image"       content="${safeImage}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale"      content="it_IT" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image"       content="${safeImage}" />

  <!-- Redirect regular users who land here somehow -->
  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
  <link rel="canonical" href="${safeUrl}" />
</head>
<body>
  <p>Reindirizzamento in corso… <a href="${safeUrl}">Clicca qui</a></p>
</body>
</html>`;
}

function buildRedirectHtml(pageUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=${escapeHtml(pageUrl)}" />
  <link rel="canonical" href="${escapeHtml(pageUrl)}" />
</head>
<body></body>
</html>`;
}

exports.handler = async function(event) {
  const slug = event.queryStringParameters?.slug || '';
  const userAgent = event.headers?.['user-agent'] || '';
  const pageUrl = `${SITE_URL}/blog/${slug}`;

  // For regular browser users just send them straight to the SPA page
  if (!isBot(userAgent)) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: buildRedirectHtml(pageUrl),
    };
  }

  // For bots: fetch the post metadata from Supabase
  let post = null;
  try {
    post = await fetchFromSupabase(slug);
  } catch (e) {
    console.error('Supabase fetch error:', e);
  }

  const title       = post?.title       || 'Server Manfredonia';
  const description = post?.excerpt     || 'News e aggiornamenti dalla community di Server Manfredonia.';
  const image       = post?.cover_image_url || DEFAULT_IMAGE;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: buildBotHtml({ title, description, image, pageUrl, slug }),
  };
};
