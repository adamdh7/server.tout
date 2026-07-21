const express = require('express');
const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { MongoClient } = require('mongodb');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');
require('dotenv').config();

const app = express();
app.set('trust proxy', true);

const PORT = process.env.PORT || 3000;
const ICON_URL = 'https://tout.adamdh7.org/Tout.png';
const SERVER_TOKEN = process.env.TOUT_SERVER_TOKEN || 'https://tout.adamdh7.org';

const CLOUDCONVERT_KEYS = Object.keys(process.env)
  .filter(key => key.startsWith('CLOUDCONVERT_KEY') || key === 'CLOUDCONVERT_API_KEY')
  .map(key => process.env[key])
  .filter(k => typeof k === 'string' && k.trim().length > 0);

const CF_AI_CREDENTIALS = [];
if (process.env.CF_ACCOUNT_ID && process.env.CF_AI_TOKEN) {
  CF_AI_CREDENTIALS.push({ account: process.env.CF_ACCOUNT_ID, token: process.env.CF_AI_TOKEN });
}
for (let i = 1; i <= 20; i++) {
  const acc = process.env[`CF_AI_ACCOUNT_${i}`];
  const tok = process.env[`CF_AI_TOKEN_${i}`];
  if (acc && tok) {
    CF_AI_CREDENTIALS.push({ account: acc, token: tok });
  }
}

const TAVILY_KEYS = [];
if (process.env.TAVILY_KEY) TAVILY_KEYS.push(process.env.TAVILY_KEY);
for (let i = 1; i <= 20; i++) {
  if (process.env[`TAVILY_KEY_${i}`]) TAVILY_KEYS.push(process.env[`TAVILY_KEY_${i}`]);
}

const TRUSTED_BROWSER_HOSTS = new Set(['tout.adamdh7.org', 'localhost:']);

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

const tasks = new Map();
const activeStreams = new Map();

async function getDb() {
  try {
    if (!db) {
      db = mongoClient.db('chatdb');
    }
    await db.command({ ping: 1 }, { maxTimeMS: 2000 });
  } catch (e) {
    try { await mongoClient.close(); } catch (err) {}
    await mongoClient.connect();
    db = mongoClient.db('chatdb');
  }
  return db;
}

const FFMPEG_AVAILABLE = (() => {
  try {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return !result.error && result.status === 0;
  } catch (e) {
    return false;
  }
})();

app.use(express.json({ limit: '25mb' }));

const getRawBody = (req, taskId) => new Promise((resolve, reject) => {
  const chunks = [];
  let received = 0;
  req.on('data', chunk => {
    chunks.push(chunk);
    received += chunk.length;
    if (taskId) tasks.set(taskId, { step: 'telechargement', received, total: req.headers['content-length'] });
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

async function uploadToBref(buffer, filename) {
  try {
    const boundary = '----ToutFormBoundary' + Date.now().toString(16);
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([Buffer.from(header, 'utf8'), buffer, Buffer.from(footer, 'utf8')]);

    const res = await fetch('https://bref.adamdh7.org/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body
    });
    if (!res.ok) throw new Error('Echek sou bref');
    const data = await res.json();
    return data.url;
  } catch (e) {
    throw e;
  }
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch (e) { return value; }
}

function cleanRequestPath(reqPath) {
  return safeDecode(reqPath || '').replace(/^\/+/, '');
}

function contentTypeFromName(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
    '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv', '.flv': 'video/x-flv', '.m4v': 'video/x-m4v', '.3gp': 'video/3gpp',
    '.ts': 'video/mp2t', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg', '.m2ts': 'video/mp2t',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf', '.json': 'application/json', '.txt': 'text/plain',
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript'
  };
  return map[ext] || 'application/octet-stream';
}

function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext);
}

function isAudioFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext);
}

function isDirectVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp4', '.webm', '.m4v'].includes(ext);
}

function needsTranscode(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.mov', '.mkv', '.avi', '.wmv', '.flv', '.3gp', '.ts', '.mpeg', '.mpg', '.m2ts'].includes(ext);
}

function encodePathSegments(requestPath) {
  return requestPath.split('/').map(part => encodeURIComponent(part)).join('/');
}

function buildMediaUrl(requestPath, mode) {
  return `/${encodePathSegments(requestPath)}?${mode}=1`;
}

function getDisplayName(requestPath) {
  const clean = requestPath.replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return 'Tout';
  if (/^TF-/i.test(parts[0]) && parts[1]) {
    return path.basename(parts[1], path.extname(parts[1])).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Tout';
  }
  return path.basename(parts[parts.length - 1], path.extname(parts[parts.length - 1])) || 'Tout';
}

function buildViewerHtml(title, mediaUrl, filename) {
  const safeTitle = String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let mediaBlock = '';
  const isImg = isImageFile(filename);
  const isVid = isDirectVideoFile(filename) || needsTranscode(filename);
  const isAud = isAudioFile(filename);

  if (isImg) mediaBlock = `<img id="media-element" src="${mediaUrl}" alt="${safeTitle}" />`;
  else if (isVid) mediaBlock = `<video id="media-element" src="${mediaUrl}" controls autoplay playsinline preload="metadata"></video>`;
  else if (isAud) mediaBlock = `<audio id="media-element" src="${mediaUrl}" controls autoplay preload="metadata"></audio>`;
  else mediaBlock = `<a href="${mediaUrl}" style="color:#fff;font-family:Arial,sans-serif;word-break:break-all;text-decoration:none;font-size:18px;">${mediaUrl}</a>`;

  const downloadUrl = mediaUrl.replace('transcode=1', 'raw=1');

  return `<!doctype html>
<html lang="ht">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<link rel="icon" type="image/png" href="${ICON_URL}">
<style>
html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; background: #000; }
.wrap { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; position: relative; }
img, video, audio { max-width: 100%; max-height: 100%; object-fit: contain; outline: none; }
.download-btn {
  position: absolute; bottom: 30px; z-index: 9999; display: none; background: rgba(255,255,255,0.2); width: 56px; height: 56px; border-radius: 50%; align-items: center; justify-content: center; color: #fff; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); transition: opacity 0.3s ease, transform 0.2s ease; cursor: pointer; text-decoration: none;
}
.download-btn:active { transform: scale(0.9); }
.download-btn svg { width: 24px; height: 24px; fill: currentColor; }
</style>
</head>
<body>
<div class="wrap">${mediaBlock}</div>
<div style="display:flex; justify-content:center; width:100%;">
  <a id="download-btn" class="download-btn" href="${downloadUrl}" download="${filename}">
    <svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>
  </a>
</div>
<script>
function forceDownload() { window.location.href = "${downloadUrl}"; }
var mediaEl = document.getElementById('media-element');
var btn = document.getElementById('download-btn');
if (mediaEl) {
  mediaEl.addEventListener('error', forceDownload);
  if (mediaEl.tagName === 'IMG') { btn.style.display = 'flex'; }
  else {
    mediaEl.addEventListener('playing', function() { btn.style.display = 'flex'; });
    mediaEl.addEventListener('loadedmetadata', function() { if (mediaEl.duration && mediaEl.currentTime > 0) { btn.style.display = 'flex'; } });
  }
} else { btn.style.display = 'flex'; }
</script>
</body>
</html>`;
}

function sendUnknown(req, res) {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    res.status(404).send('<!doctype html><html lang="ht"><head><meta charset="UTF-8"><title>Enkoni</title></head><body style="background:#000;color:#fff;text-align:center;padding:50px;font-family:sans-serif;"><h1>Enkoni</h1><script>setTimeout(function(){ window.close(); window.history.back(); }, 1500);</script></body></html>');
  } else {
    res.status(404).send('Enkoni');
  }
}

function getUrlHost(value) {
  if (!value) return '';
  try { return new URL(value).hostname.toLowerCase(); } catch (e) { return ''; }
}

function isBrowserLikeRequest(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const accept = (req.headers.accept || '').toLowerCase();
  const secFetchMode = (req.headers['sec-fetch-mode'] || '').toLowerCase();
  const secFetchDest = (req.headers['sec-fetch-dest'] || '').toLowerCase();
  return ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox') || ua.includes('edg') || ua.includes('opr') || accept.includes('text/html') || secFetchMode === 'navigate' || secFetchDest === 'document';
}

function hasValidToken(req) {
  const authHeader = (req.headers.authorization || '').trim();
  const customToken = (req.headers['x-tout-token'] || '').trim();
  const expectedBearer = `Bearer ${SERVER_TOKEN}`;
  return authHeader === expectedBearer || authHeader === SERVER_TOKEN || customToken === SERVER_TOKEN;
}

function hasTrustedBrowserOrigin(req) {
  const originHost = getUrlHost(req.headers.origin);
  const refererHost = getUrlHost(req.headers.referer);
  return TRUSTED_BROWSER_HOSTS.has(originHost) || TRUSTED_BROWSER_HOSTS.has(refererHost);
}

function canAccessPrivate(req) {
  if (hasValidToken(req)) return { allowed: true, mode: 'token' };
  const browserLike = isBrowserLikeRequest(req);
  const hasTrustedOrigin = hasTrustedBrowserOrigin(req);
  if (browserLike && hasTrustedOrigin) return { allowed: true, mode: 'browser' };
  if (browserLike) return { allowed: false, reason: 'Entèdi: orijin navigatè a pa otorize' };
  return { allowed: false, reason: 'Entèdi: ou dwe mete yon token' };
}

function requireAuth(req, res, next) {
  const access = canAccessPrivate(req);
  if (!access.allowed) return res.status(403).send(access.reason);
  res.locals.accessMode = access.mode;
  next();
}

function corsAndOptions(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tout-Token, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
      Vary: 'Origin'
    });
  } else {
    res.set({
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tout-Token, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type'
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}
app.use(corsAndOptions);

function isReservedPublicName(name) {
  return ['ok', 'health', 'ai', 'jerere', 'calcul', 'Tout.png', 'favicon.ico', 'qrcode', 'compress', 'resize', 'code', 'images-to-pdf', 'upload', 'status'].includes(name.split('/')[0]);
}

async function resourceExists(requestPath) {
  const key = cleanRequestPath(requestPath);
  try {
    await s3.send(new HeadObjectCommand({ Bucket: 'tout', Key: key }));
    return true;
  } catch (e) {
    return false;
  }
}

async function serveS3RawFile(req, res, key, filename) {
  try {
    const range = req.headers.range;
    const params = { Bucket: 'tout', Key: key };
    if (range) params.Range = range;
    const s3Response = await s3.send(new GetObjectCommand(params));
    res.setHeader('Content-Type', s3Response.ContentType || contentTypeFromName(filename));
    res.setHeader('Accept-Ranges', 'bytes');
    if (s3Response.ContentRange) res.setHeader('Content-Range', s3Response.ContentRange);
    if (s3Response.ContentLength) res.setHeader('Content-Length', s3Response.ContentLength);
    res.status(range ? 206 : 200);
    if (!s3Response.Body) return res.end();
    s3Response.Body.pipe(res);
  } catch (e) {
    sendUnknown(req, res);
  }
}

function reqLikeCleanup(inputStream, ffmpeg, res, abort) {
  const stop = () => {
    abort();
    try { if (inputStream.destroy) inputStream.destroy(); } catch (e) {}
    try { if (ffmpeg.stdin) ffmpeg.stdin.destroy(); } catch (e) {}
  };
  res.on('close', stop);
  res.on('finish', stop);
  if (inputStream && inputStream.on) inputStream.on('error', stop);
}

function transcodeVideoStreamToMp4(inputStream, res) {
  if (!FFMPEG_AVAILABLE) {
    res.status(415).type('text/plain').send('Pa gen ffmpeg sou sèvè a');
    return;
  }
  res.status(200);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'none');
  const ffmpeg = spawn('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const abort = () => { try { ffmpeg.kill('SIGKILL'); } catch (e) {} };
  reqLikeCleanup(inputStream, ffmpeg, res, abort);
  inputStream.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);
  let stderr = '';
  ffmpeg.stderr.on('data', chunk => { stderr += chunk.toString(); });
  let responded = false;
  ffmpeg.on('error', () => {
    if (responded) return;
    responded = true;
    if (!res.headersSent) res.status(500).type('text/plain').send('Erè ffmpeg');
  });
  ffmpeg.on('close', code => {
    if (responded) return;
    responded = true;
    if (code !== 0 && !res.headersSent) res.status(415).type('text/plain').send(stderr || 'Pa ka konvèti videyo sa a');
    else if (code !== 0 && !res.writableEnded) res.end();
  });
}

async function serveS3VideoTranscode(req, res, key) {
  try {
    const s3Response = await s3.send(new GetObjectCommand({ Bucket: 'tout', Key: key }));
    if (!s3Response.Body) return sendUnknown(req, res);
    transcodeVideoStreamToMp4(s3Response.Body, res);
  } catch (e) {
    sendUnknown(req, res);
  }
}

async function servePublicFile(req, res, requestPath) {
  const key = cleanRequestPath(requestPath);
  const filename = path.basename(key) || 'Tout';
  const browserView = isBrowserLikeRequest(req) && (req.headers.accept || '').includes('text/html');
  const wantsRaw = req.query.raw === '1';
  const wantsTranscode = req.query.transcode === '1';
  if (wantsRaw) res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (browserView && !wantsRaw && !wantsTranscode) {
    const exists = await resourceExists(key);
    if (!exists) return sendUnknown(req, res);
    const isImageOrVideo = isImageFile(filename) || isDirectVideoFile(filename) || needsTranscode(filename);
    if (!isImageOrVideo) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return serveS3RawFile(req, res, key, filename);
    }
    const mediaMode = needsTranscode(filename) && FFMPEG_AVAILABLE ? 'transcode' : 'raw';
    const mediaUrl = buildMediaUrl(key, mediaMode);
    return res.status(200).type('html').send(buildViewerHtml(getDisplayName(key), mediaUrl, filename));
  }
  if (wantsTranscode && needsTranscode(filename) && FFMPEG_AVAILABLE) return serveS3VideoTranscode(req, res, key);
  return serveS3RawFile(req, res, key, filename);
}

async function fetchAIFallback(model, bodyPayload, signal) {
  for (const cred of CF_AI_CREDENTIALS) {
    try {
      const fetchOptions = {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cred.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      };
      if (signal) fetchOptions.signal = signal;
      
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cred.account}/ai/run/${model}`, fetchOptions);
      if (res.ok) return res;
    } catch (e) {}
  }
  return null;
}

async function processAndUploadImage(prompt) {
  try {
    const aiRaw = await fetchAIFallback('@cf/black-forest-labs/flux-1-schnell', { prompt: prompt, num_steps: 4 });
    if (!aiRaw) return '';
    const aiResponse = await aiRaw.json();
    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) return '';
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const filename = `TF-${randomNum}.png`;
    return await uploadToBref(Buffer.from(bytes), filename);
  } catch (e) {
    return '';
  }
}

async function performToolSearch(toolData, signal, writeThinkContent) {
  const isResearch = (toolData.name === 'research' || toolData.action === 'research');
  const endpoint = isResearch ? 'research' : 'search';
  const query = toolData.input || toolData.query;
  
  if (!query) return { context: '' };

  for (let i = 0; i < TAVILY_KEYS.length; i++) {
    const key = TAVILY_KEYS[i];
    let keepAliveSrc = null;
    try {
      keepAliveSrc = setInterval(() => {
        try { if (!signal.aborted) writeThinkContent(''); } catch (e) {}
      }, 4000);

      const bodyPayload = isResearch ? {
        query: query,
        search_depth: toolData.search_depth || 'advanced',
        include_sources: true,
        stream: true
      } : {
        query: query,
        search_depth: toolData.search_depth || 'basic',
        include_answer: true,
        include_images: false
      };

      const res = await fetch(`https://api.tavily.com/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal
      });

      if (keepAliveSrc) clearInterval(keepAliveSrc);

      if (!res.ok) {
        continue;
      }

      let fullContext = '';

      if (!isResearch) {
        const data = await res.json();
        
        if (data.answer) {
            fullContext += `${data.answer}\n\n`;
            writeThinkContent(`${data.answer}\n\n`);
        }
        
        if (data.results && data.results.length > 0) {
            data.results.forEach((r) => {
                const snippet = `${r.title}\n${r.url}\n${r.content}\n\n`;
                fullContext += snippet;
                writeThinkContent(snippet);
            });
        }
        return { context: fullContext };

      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('data:') && cleanLine !== 'data: [DONE]') {
              try {
                const data = JSON.parse(cleanLine.substring(5).trim());
                let chunk = '';
                
                if (data.choices && data.choices[0] && data.choices[0].delta) {
                    const delta = data.choices[0].delta;
                    if (delta.content) {
                        chunk = delta.content;
                    }
                } else if (data.content) {
                    chunk = data.content;
                }
                
                if (chunk) {
                  fullContext += chunk;
                  writeThinkContent(chunk);
                }
              } catch (e) {}
            }
          }
        }
        return { context: fullContext };
      }

    } catch (err) {
      if (keepAliveSrc) clearInterval(keepAliveSrc);
      if (err.name === 'AbortError') return { context: '' };
    }
  }
  return { context: '' };
}

app.post('/ai/clear', requireAuth, async (req, res) => {
  const sess = req.body.session_id || 'global';
  if (activeStreams.has(sess)) {
    try { activeStreams.get(sess).abortController.abort(); } catch (e) {}
    activeStreams.delete(sess);
  }
  try {
    const database = await getDb();
    const msgIds = await database.collection('messages').find({ session_id: sess }).map(m => m.id).toArray();
    if (msgIds.length > 0) {
      await database.collection('attachments').deleteMany({ message_id: { $in: msgIds } });
    }
    await database.collection('messages').deleteMany({ session_id: sess });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Nou pa ka efase done yo kounye a.' });
  }
});

app.post('/calcul/clear', requireAuth, async (req, res) => {
  try {
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Nou pa ka efase done yo kounye a.' });
  }
});

app.get('/status/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId);
  if (task) res.json(task);
  else res.status(404).json({ error: 'Nou pa jwenn okenn travay' });
});

app.get('/ok', (req, res) => res.json({ ok: true }));

app.get('/health', (req, res) => {
  res.json({ ok: true, tokenRequiredForPrivateRoutes: true, trustedBrowserHosts: Array.from(TRUSTED_BROWSER_HOSTS) });
});

app.get('/Tout.png', async (req, res) => {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: 'tout', Key: 'Tout.png' }));
    res.setHeader('Content-Type', object.ContentType || 'image/png');
    if (object.ContentLength) res.setHeader('Content-Length', object.ContentLength);
    if (object.Body) {
      object.Body.pipe(res);
      return;
    }
    res.status(404).send('Nou pa jwenn imaj la');
  } catch (e) {
    res.status(404).send('Nou pa jwenn imaj la');
  }
});

app.get('/ai/recover', requireAuth, (req, res) => {
  const sess = req.query.session_id || 'global';
  if (activeStreams.has(sess)) {
    res.json({ active: true, frontendMessage: activeStreams.get(sess).frontendMessage });
  } else {
    res.json({ active: false, frontendMessage: '' });
  }
});

app.get('/ai', requireAuth, async (req, res) => {
  const sess = req.query.session_id || 'global';
  try {
    const database = await getDb();
    const messagesCollection = database.collection('messages');
    const attachmentsCollection = database.collection('attachments');
    const messages = await messagesCollection.find({ session_id: sess }).sort({ timestamp: 1 }).toArray();
    const messageIds = messages.map(m => m.id);
    const attachments = await attachmentsCollection.find({ message_id: { $in: messageIds } }).toArray();
    const messagesMap = new Map();
    if (messages) {
      for (const row of messages) {
        if (!messagesMap.has(row.id)) messagesMap.set(row.id, { role: row.role, content: row.content, timestamp: row.timestamp });
      }
      for (const att of attachments) {
        if (messagesMap.has(att.message_id) && att.placeholder && att.url) {
          const currentContent = messagesMap.get(att.message_id).content;
          messagesMap.get(att.message_id).content = currentContent.split(att.placeholder).join(att.url);
        }
      }
    }
    res.json({ messages: Array.from(messagesMap.values()) });
  } catch (err) {
    res.status(500).json({ error: 'Erè baz done', details: err.message });
  }
});

app.post('/ai', requireAuth, async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff'
  });
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (res.socket) res.socket.setNoDelay(true);

  const body = req.body;
  const userMessage = body.message?.trim();
  const sess = body.session_id || 'global';
  
  if (!userMessage) {
    res.write(JSON.stringify({ type: 'error', content: 'Ou bay yon mesaj vid' }) + '\n');
    return res.end();
  }

  if (activeStreams.has(sess)) {
    try { activeStreams.get(sess).abortController.abort(); } catch (e) {}
    activeStreams.delete(sess);
  }
  
  const streamState = { 
    abortController: new AbortController(), 
    frontendMessage: '', 
    dbMessage: '',
    thinkOpen: false
  };
  activeStreams.set(sess, streamState);
  const signal = streamState.abortController.signal;

  let responseFinished = false;

  try {
    const database = await getDb();
    const messagesCollection = database.collection('messages');
    const attachmentsCollection = database.collection('attachments');
    const userMsgId = Date.now().toString() + Math.random().toString();
    await messagesCollection.insertOne({
      id: userMsgId, role: 'user', content: userMessage, session_id: sess, timestamp: new Date().toISOString()
    });

    req.on('close', async () => {
      if (!responseFinished) {
        try { streamState.abortController.abort(); } catch (e) {}
        if (activeStreams.get(sess) === streamState) activeStreams.delete(sess);
        try {
          const dbInstance = await getDb();
          await dbInstance.collection('messages').deleteOne({ id: userMsgId });
          await dbInstance.collection('attachments').deleteMany({ message_id: userMsgId });
        } catch (e) {}
      }
    });

    const recentMessages = await messagesCollection.find({ session_id: sess }).sort({ timestamp: -1 }).toArray();
    
    let totalLength = 0;
    const validContext = [];
    if (recentMessages) {
        for (const m of recentMessages) {
            const l = (m.content || '').length + (m.role || '').length;
            if (totalLength + l > 7000) break;
            validContext.push(m);
            totalLength += l;
        }
    }
    
    const stripThink = (text) => {
      let t = (text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
      t = t.replace(/<think>[\s\S]*$/gi, '');
      return t.trim();
    };
    
    const context = validContext.reverse().map(m => ({ role: m.role, content: stripThink(m.content) }));
    const currentModel = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';

    const systemPrompt = `You are Asistan.

Understand the conversation context, prioritize the user's latest message, and reply in its exact language.

Use tools only when necessary:

- "search": web or current information.
- "research": complex or in-depth research.
- "image": image generation only when explicitly requested.

If no tool is needed, respond directly.

When using a tool, output only the exact format:

[TOOL: {"name":"search","params":{"query":"...","search_depth":"basic"}}]

[TOOL: {"name":"research","params":{"query":"...","search_depth":"advanced"}}]

[TOOL: {"name":"image","params":{"prompt":"..."}}]`;

    const aiRaw = await fetchAIFallback(currentModel, { messages: [{ role: 'system', content: systemPrompt }, ...context], max_tokens: 3000, stream: true }, signal);

    let attachmentsToSave = [];

    function writeThinkContent(str) {
      if (!str || signal.aborted) return;
      if (!streamState.thinkOpen) {
        streamState.dbMessage += '<think>\n';
        streamState.thinkOpen = true;
      }
      streamState.dbMessage += str;
      res.write(JSON.stringify({ type: 'think', content: str }) + '\n');
    }

    function closeThink() {
      if (streamState.thinkOpen) {
        streamState.dbMessage += '\n</think>\n';
        streamState.thinkOpen = false;
      }
    }

    function writeFinalContent(str) {
      if (!str || signal.aborted) return;
      closeThink();
      streamState.dbMessage += str;
      streamState.frontendMessage += str;
      res.write(JSON.stringify({ type: 'final', content: str }) + '\n');
    }

    async function handleTag(tagContent, allowTools, isThinking) {
      if (signal.aborted) return;
      const match = tagContent.match(/^\[\s*TOOL\s*:\s*(\{[\s\S]*?\})\s*\]$/i);
      if (!match) return;

      let toolData;
      try {
        toolData = JSON.parse(match[1]);
      } catch (e) {
        return;
      }

      const action = (toolData.action || toolData.name || '').toLowerCase();
      const params = toolData.params || toolData;

      if (action === 'image') {
        const prompt = params.prompt || params.input || params.query;
        if (!prompt) return;
        const keepAliveImg = setInterval(() => { try { if(!signal.aborted) res.write(JSON.stringify({ type: 'final', content: '• ' }) + '\n'); } catch (e) {} }, 4000);
        const imgUrl = await processAndUploadImage(prompt);
        clearInterval(keepAliveImg);
        if (signal.aborted) return;

        if (imgUrl) {
          const dbTag = `[IMAGE GENERATED: "${prompt}"]`;
          attachmentsToSave.push({ placeholder: dbTag, url: `\n\n${imgUrl}\n\n` });
          writeFinalContent(`\n\n${imgUrl}\n\n`);
        }
      } else if ((action === 'search' || action === 'research') && allowTools) {
        writeThinkContent('\n\n');
        
        const searchRes = await performToolSearch(params, signal, writeThinkContent);
        if (signal.aborted) return;
        
        let searchResultsText = searchRes.context;
        const preContent = streamState.frontendMessage.trim();
        
        let finalSystemPrompt = `You are Asistan.
CRITICAL: You MUST formulate your final response in the EXACT SAME LANGUAGE as the user's last message.

You just performed a web search. Read the following context from the search carefully.
Answer the user's request using the information from the context.
DO NOT repeat the context verbatim. Synthesize and explain it naturally in the user's language.
If the user's previous messages modify the context of their request, take them into account.`;
        
        if (searchResultsText) {
             finalSystemPrompt += `\n\nContext from web search:\n${searchResultsText}`;
        }
        
        if (preContent) {
          finalSystemPrompt += `\n\nNote: You already started saying this to the user before the search:\n${preContent}\nContinue your response naturally from there.`;
        }
        
        try {
          const aiFinalRaw = await fetchAIFallback(currentModel, { messages: [{ role: 'system', content: finalSystemPrompt }, ...context], max_tokens: 3000, stream: true }, signal);
          if (!aiFinalRaw) {
            if (!signal.aborted) res.write(JSON.stringify({ type: 'error', content: 'Sistèm sa a pa disponib kounye a.' }) + '\n');
            return;
          }
          const aiFinalStream = aiFinalRaw.body;
          if (aiFinalStream && aiFinalStream.getReader) {
            const readerFinal = aiFinalStream.getReader();
            const decoderFinal = new TextDecoder();
            let bufferFinal = '';
            
            const innerProcessor = createProcessor(false);

            while (!signal.aborted) {
              const { done, value } = await readerFinal.read();
              if (done || signal.aborted) break;
              bufferFinal += decoderFinal.decode(value, { stream: true });
              const linesFinal = bufferFinal.split('\n');
              bufferFinal = linesFinal.pop() || '';
              for (const lineFinal of linesFinal) {
                const cleanLineFinal = lineFinal.trim();
                if (cleanLineFinal.startsWith('data:') && cleanLineFinal !== 'data: [DONE]') {
                  try {
                    const dataStr = cleanLineFinal.substring(5).trim();
                    const dataFinal = JSON.parse(dataStr);
                    if (dataFinal.response !== undefined && dataFinal.response !== null) {
                      await innerProcessor.processStr(String(dataFinal.response));
                    }
                  } catch (e) {}
                }
              }
            }
            innerProcessor.flush();
          }
        } catch (e) {}
      }
    }

    function createProcessor(allowTools) {
      return {
        streamBuffer: '',
        isThinking: false,
        async processStr(str) {
          if (!str || signal.aborted) return false;
          this.streamBuffer += str;
          let abortOuter = false;

          while (!signal.aborted) {
            if (!this.isThinking) {
              const thinkStart = this.streamBuffer.indexOf('<think>');
              if (thinkStart !== -1) {
                writeFinalContent(this.streamBuffer.substring(0, thinkStart));
                this.isThinking = true;
                this.streamBuffer = this.streamBuffer.substring(thinkStart + 7);
                continue;
              }
            } else {
              const thinkEnd = this.streamBuffer.indexOf('</think>');
              if (thinkEnd !== -1) {
                const thinkContent = this.streamBuffer.substring(0, thinkEnd);
                writeThinkContent(thinkContent);
                closeThink();
                this.isThinking = false;
                this.streamBuffer = this.streamBuffer.substring(thinkEnd + 8);
                continue;
              }
            }

            const tagStart = this.streamBuffer.indexOf('[');
            if (tagStart !== -1) {
                if (tagStart > 0) {
                    const chunk = this.streamBuffer.substring(0, tagStart);
                    if (this.isThinking) writeThinkContent(chunk);
                    else writeFinalContent(chunk);
                    this.streamBuffer = this.streamBuffer.substring(tagStart);
                    continue;
                }

                const target = "[TOOL: ";
                const checkLen = Math.min(this.streamBuffer.length, target.length);
                const isMatchSoFar = this.streamBuffer.substring(0, checkLen).toUpperCase() === target.substring(0, checkLen);

                if (!isMatchSoFar) {
                    if (this.isThinking) writeThinkContent('[');
                    else writeFinalContent('[');
                    this.streamBuffer = this.streamBuffer.substring(1);
                    continue;
                }

                if (this.streamBuffer.length >= target.length) {
                    const tagEnd = this.streamBuffer.indexOf(']');
                    if (tagEnd !== -1) {
                        const tagContent = this.streamBuffer.substring(0, tagEnd + 1);
                        this.streamBuffer = this.streamBuffer.substring(tagEnd + 1);
                        await handleTag(tagContent, allowTools, this.isThinking);
                        if (allowTools && /^\[\s*TOOL\s*:/i.test(tagContent)) {
                            abortOuter = true;
                        }
                        continue;
                    } else {
                        if (this.streamBuffer.length > 3000) {
                            if (this.isThinking) writeThinkContent(this.streamBuffer.substring(0, 1));
                            else writeFinalContent(this.streamBuffer.substring(0, 1));
                            this.streamBuffer = this.streamBuffer.substring(1);
                            continue;
                        }
                        break;
                    }
                } else {
                    break;
                }
            }

            let safeLen = this.streamBuffer.length;
            const lastLt = this.streamBuffer.lastIndexOf('<');
            const lastSq = this.streamBuffer.lastIndexOf('[');

            if (lastLt !== -1 || lastSq !== -1) {
                safeLen = Math.max(lastLt !== -1 ? lastLt : 0, lastSq !== -1 ? lastSq : 0);
            }

            if (safeLen > 0) {
                const chunkToFlush = this.streamBuffer.substring(0, safeLen);
                if (this.isThinking) writeThinkContent(chunkToFlush);
                else writeFinalContent(chunkToFlush);
                this.streamBuffer = this.streamBuffer.substring(safeLen);
                continue;
            }
            break;
          }
          return abortOuter;
        },
        flush() {
          if (this.streamBuffer.length > 0 && !signal.aborted) {
            if (this.isThinking) writeThinkContent(this.streamBuffer);
            else writeFinalContent(this.streamBuffer);
            this.streamBuffer = '';
          }
        }
      };
    }

    const mainProcessor = createProcessor(true);

    if (!aiRaw && !signal.aborted) {
      res.write(JSON.stringify({ type: 'error', content: 'Sistèm sa a pa disponib kounye a.' }) + '\n');
    } else if (aiRaw) {
      const aiResponseStream = aiRaw.body;
      if (aiResponseStream && aiResponseStream.getReader) {
        const reader = aiResponseStream.getReader();
        const decoder = new TextDecoder();
        let bufferMain = '';
        let streamAborted = false;
        try {
          while (!signal.aborted) {
            const { done, value } = await reader.read();
            if (done || signal.aborted) break;
            bufferMain += decoder.decode(value, { stream: true });
            const lines = bufferMain.split('\n');
            bufferMain = lines.pop() || '';
            for (const line of lines) {
              const cleanLine = line.trim();
              if (cleanLine.startsWith('data:') && cleanLine !== 'data: [DONE]') {
                try {
                  const dataStr = cleanLine.substring(5).trim();
                  const data = JSON.parse(dataStr);
                  if (data.response !== undefined && data.response !== null) {
                    const shouldAbort = await mainProcessor.processStr(String(data.response));
                    if (shouldAbort) {
                      streamAborted = true;
                      try { await reader.cancel(); } catch (err) {}
                      break;
                    }
                  }
                } catch (e) {}
              }
            }
            if (streamAborted) break;
          }
        } catch (e) {
          if (!signal.aborted) res.write(JSON.stringify({ type: 'error', content: 'Sistèm sa a pa disponib kounye a.' }) + '\n');
        }
      } else {
        if (!signal.aborted) res.write(JSON.stringify({ type: 'error', content: 'Sistèm sa a pa disponib kounye a.' }) + '\n');
      }
    }

    mainProcessor.flush();

    try {
      if (streamState.dbMessage.trim() !== '') {
        const asstMsgId = Date.now().toString() + Math.random().toString();
        await messagesCollection.insertOne({
          id: asstMsgId, role: 'assistant', content: streamState.dbMessage, session_id: sess, timestamp: new Date().toISOString()
        });

        if (attachmentsToSave.length > 0) {
          for (const att of attachmentsToSave) {
            await attachmentsCollection.insertOne({ message_id: asstMsgId, placeholder: att.placeholder, url: att.url });
          }
        }
      }
      responseFinished = true;
    } catch (e) {}
    
    if (activeStreams.has(sess) && activeStreams.get(sess) === streamState) {
      activeStreams.delete(sess);
    }
    res.end();
  } catch (e) {
    if (activeStreams.has(sess) && activeStreams.get(sess) === streamState) {
      activeStreams.delete(sess);
    }
    res.end();
  }
});

app.post('/jerere', requireAuth, async (req, res) => {
  let body;
  try { body = req.body; } catch (e) { return res.status(400).json({ error: 'Fòma JSON pa valab' }); }
  const prompt = body.prompt?.trim();
  if (!prompt) return res.status(400).json({ error: 'Ou pa bay okenn enstriksyon (prompt)' });
  try {
    const aiRaw = await fetchAIFallback('@cf/black-forest-labs/flux-1-schnell', { prompt: prompt, num_steps: 4 });
    if (!aiRaw) return res.status(503).json({ type: 'error', error: "Sistèm sa a pa disponib kounye a." });
    const aiResponse = await aiRaw.json();
    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) throw new Error("Entèlijans atifisyèl la pa bay yon imaj ki valab.");
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const filename = `TF-${randomNum}.png`;
    const url = await uploadToBref(Buffer.from(bytes), filename);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ type: 'error', error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/calcul', requireAuth, async (req, res) => {
  res.set({
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache, no-transform',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff'
  });
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (res.socket) res.socket.setNoDelay(true);

  let body;
  try { body = req.body; } catch (e) { return res.status(400).json({ error: 'Fòma JSON pa valab' }); }
  const calculation = body.calculation?.trim();
  if (!calculation) return res.status(400).json({ error: 'Ou pa bay okenn ekspresyon matematik' });
  try {
    const systemPrompt = "You are Asistan, an expert in Math and Science. Break down calculations step-by-step logically.";
    const userPrompt = `"${calculation}"`;

    const aiRaw = await fetchAIFallback('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 3000, stream: true });
    if (!aiRaw) {
      res.write(JSON.stringify({ type: 'error', content: 'Sistèm sa a pa disponib kounye a.' }) + '\n');
      return res.end();
    }
    const aiResponseStream = aiRaw.body;
    if (!aiResponseStream || !aiResponseStream.getReader) {
      res.write(JSON.stringify({ type: 'error', content: 'Sistèm sa a pa disponib kounye a.' }) + '\n');
      return res.end();
    }
    const reader = aiResponseStream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith('data:') && cleanLine !== 'data: [DONE]') {
          try {
            const dataStr = cleanLine.substring(5).trim();
            const data = JSON.parse(dataStr);
            if (data.response !== undefined && data.response !== null) {
              const strChunk = String(data.response);
              if (strChunk) res.write(strChunk);
            }
          } catch (e) {}
        }
      }
    }
    res.end();
  } catch (e) {
    res.write(JSON.stringify({ type: 'error', content: 'Sistèm sa a pa disponib kounye a.' }) + '\n');
    res.end();
  }
});

app.post('/qrcode', requireAuth, async (req, res) => {
  try {
    const text = req.body.text || '';
    if (!text) return res.status(400).json({ error: 'Ou pa bay okenn tèks' });
    const fetchRes = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`);
    const arrayBuf = await fetchRes.arrayBuffer();
    const url = await uploadToBref(Buffer.from(arrayBuf), 'qrcode.png');
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/compress', requireAuth, async (req, res) => {
  const taskId = req.query.taskId;
  try {
    if (taskId) tasks.set(taskId, { step: 'kòmanse' });
    const buffer = await getRawBody(req, taskId);
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Pa gen done fichye' });
    }
    const isVideo = req.query.type === 'video';
    if (isVideo && buffer.length > 52428800) {
      return res.status(400).json({ error: 'Videyo sa a twò gwo' });
    }
    
    let origFilename = req.query.filename || req.headers['x-file-name'] || req.headers['x-filename'] || req.headers['file-name'] || '';

    if (!origFilename && req.headers['content-disposition']) {
      const cd = req.headers['content-disposition'];
      const match = cd.match(/filename\*?=["']?(?:UTF-8'')?([^"';\r\n]+)["']?/i);
      if (match) {
        origFilename = match[1];
      }
    }

    if (origFilename) {
      try {
         origFilename = decodeURIComponent(origFilename.replace(/\+/g, '%20'));
      } catch(e) {}
      origFilename = origFilename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      if (!origFilename.replace(/_/g, '').trim()) {
        origFilename = `file_${Date.now()}.${isVideo ? 'mp4' : 'png'}`;
      }
    } else {
      origFilename = `file_${Date.now()}.${isVideo ? 'mp4' : 'png'}`;
    }

    let outFormat = isVideo ? 'mp4' : 'jpg';
    const parsed = path.parse(origFilename);
    const safeName = parsed.name || "compressed";
    let finalRequestedName = `${safeName}.${outFormat}`;
    
    if (taskId) tasks.set(taskId, { step: 'telechargement' });
    const sourceExt = isVideo ? 'mp4' : 'png';
    let sourceUploadName = origFilename || sourceExt;
    const sourceUrlRaw = await uploadToBref(buffer, sourceUploadName);
    const sourceUrl = encodeURI(sourceUrlRaw);
    
    if (taskId) tasks.set(taskId, { step: 'konpresyon' });
    
    let jobPayloadWithParams;
    if (isVideo) {
      jobPayloadWithParams = {
        tasks: {
          "import-1": { operation: "import/url", url: sourceUrl },
          "task-1": { 
            operation: "convert", 
            input: "import-1", 
            output_format: outFormat,
            video_codec: "h264",
            crf: 30,
            preset: "medium",
            audio_codec: "aac",
            audio_bitrate: "64k",
            width: 1280,
            height: 720,
            fit: "max"
          },
          "export-1": { operation: "export/url", input: "task-1" }
        }
      };
    } else {
      jobPayloadWithParams = {
        tasks: {
          "import-1": { operation: "import/url", url: sourceUrl },
          "task-1": { 
            operation: "convert", 
            input: "import-1", 
            output_format: outFormat,
            quality: 40
          },
          "export-1": { operation: "export/url", input: "task-1" }
        }
      };
    }

    let jobPayloadSimple;
    if (isVideo) {
      jobPayloadSimple = {
        tasks: {
          "import-1": { operation: "import/url", url: sourceUrl },
          "task-1": { 
            operation: "convert", 
            input: "import-1", 
            output_format: outFormat,
            video_codec: "h264",
            crf: 33
          },
          "export-1": { operation: "export/url", input: "task-1" }
        }
      };
    } else {
      jobPayloadSimple = {
        tasks: {
          "import-1": { operation: "import/url", url: sourceUrl },
          "task-1": { 
            operation: "convert", 
            input: "import-1", 
            output_format: outFormat,
            quality: 50
          },
          "export-1": { operation: "export/url", input: "task-1" }
        }
      };
    }

    const validKeys = CLOUDCONVERT_KEYS;
    if (validKeys.length === 0) throw new Error("Aucune clé API CloudConvert valide");

    let exportUrl = null;
    let jobSuccess = false;

    for (let keyIdx = 0; keyIdx < validKeys.length; keyIdx++) {
      const key = validKeys[keyIdx];
      const payloadsToTry = [jobPayloadWithParams, jobPayloadSimple];
      
      for (let pIdx = 0; pIdx < payloadsToTry.length; pIdx++) {
        const payload = payloadsToTry[pIdx];
        
        try {
          const ccRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${key}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });
          
          if (!ccRes.ok) continue;
          
          const jobData = await ccRes.json();
          const jobId = jobData.data.id;
          
          let finished = false;
          let jobError = false;
          let fetchFailedCount = 0;

          while (!finished && !jobError) {
            await new Promise(r => setTimeout(r, 2000));
            const checkRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
              headers: { "Authorization": `Bearer ${key}` }
            });
            if (!checkRes.ok) {
              fetchFailedCount++;
              if (fetchFailedCount > 3) {
                jobError = true;
                break;
              }
              continue;
            }
            fetchFailedCount = 0;
            const checkData = await checkRes.json();
            const status = checkData.data.status;

            if (status === 'finished') {
              finished = true;
              const exportTask = checkData.data.tasks.find(t => t.name === 'export-1');
              if (exportTask && exportTask.result && exportTask.result.files && exportTask.result.files.length > 0) {
                exportUrl = exportTask.result.files[0].url;
                jobSuccess = true;
              } else {
                jobError = true;
              }
            } else if (status === 'error') {
              jobError = true;
            }
          }
          if (jobSuccess) break;
        } catch (e) {
          continue;
        }
      }
      if (jobSuccess) break;
    }

    if (!jobSuccess || !exportUrl) throw new Error("Echek jeneral konpresyon");
    
    if (taskId) tasks.set(taskId, { step: 'sovgade' });
    const dlRes = await fetch(exportUrl);
    if (!dlRes.ok) throw new Error("Echek telechajman");
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    
    const finalUrl = await uploadToBref(dlBuf, finalRequestedName);
    
    if (taskId) tasks.set(taskId, { step: 'fini', url: finalUrl });
    res.json({ url: finalUrl });
  } catch (e) {
    if (taskId) tasks.set(taskId, { step: 'erè' });
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/resize', requireAuth, async (req, res) => {
  if (!FFMPEG_AVAILABLE) return res.status(501).json({ error: 'Ffmpeg pa disponib sou sèvè a' });
  let tmpImg;
  const taskId = req.query.taskId;
  try {
    if (taskId) tasks.set(taskId, { step: 'kòmanse' });
    const buffer = await getRawBody(req, taskId);
    if (buffer.length === 0) return res.status(400).json({ error: 'Pa gen done fichye' });
    const width = req.query.width;
    const height = req.query.height;
    tmpImg = path.join(os.tmpdir(), `in-res-${Date.now()}.png`);
    fs.writeFileSync(tmpImg, buffer);
    if (taskId) tasks.set(taskId, { step: 'redimansyon' });

    if (width && height) {
      const outImg = path.join(os.tmpdir(), `out-res-${Date.now()}.png`);
      const child = spawn('ffmpeg', ['-nostdin', '-i', tmpImg, '-vf', `scale=${width}:${height}`, '-y', outImg], { stdio: 'ignore' });
      
      let responded = false;
      
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch(e) {}
      }, 60000);

      child.on('error', (err) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;
        try { fs.unlinkSync(tmpImg); } catch (e) {}
        try { fs.unlinkSync(outImg); } catch (e) {}
        res.status(500).json({ error: "Erè redimansyon" });
      });

      child.on('close', async (code) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;
        try {
          if (code !== 0) throw new Error('Echek');
          const outBuf = fs.readFileSync(outImg);
          if (taskId) tasks.set(taskId, { step: 'sovgade' });
          const url = await uploadToBref(outBuf, 'resized.png');
          if (taskId) tasks.set(taskId, { step: 'fini', url });
          res.json({ url });
        } catch (e) {
          res.status(500).json({ error: "Erè redimansyon" });
        } finally {
          try { fs.unlinkSync(tmpImg); } catch (e) {}
          try { fs.unlinkSync(outImg); } catch (e) {}
        }
      });
      return;
    }
    const sizes = [192, 512, 1024, 2024];
    const urls = [];
    let completed = 0;
    let responded = false;
    for (const s of sizes) {
      const outImg = path.join(os.tmpdir(), `out-res-${s}-${Date.now()}.png`);
      const child = spawn('ffmpeg', ['-nostdin', '-i', tmpImg, '-vf', `scale=${s}:${s}`, '-y', outImg], { stdio: 'ignore' });
      
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch(e) {}
      }, 60000);

      child.on('error', (err) => {
        clearTimeout(timer);
        completed++;
        if (completed === sizes.length && !responded) {
          responded = true;
          try { fs.unlinkSync(tmpImg); } catch (e) {}
          if (taskId) tasks.set(taskId, { step: 'fini', urls });
          res.json({ urls });
        }
      });

      child.on('close', async (code) => {
        clearTimeout(timer);
        try {
          if (code === 0) {
            const outBuf = fs.readFileSync(outImg);
            urls.push(await uploadToBref(outBuf, `resized-${s}.png`));
          }
        } catch (e) {}
        try { fs.unlinkSync(outImg); } catch (e) {}
        completed++;
        if (completed === sizes.length && !responded) {
          responded = true;
          try { fs.unlinkSync(tmpImg); } catch (e) {}
          if (taskId) tasks.set(taskId, { step: 'fini', urls });
          res.json({ urls });
        }
      });
    }
  } catch (e) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/upload', requireAuth, async (req, res) => {
  const taskId = req.query.taskId;
  try {
    if (taskId) tasks.set(taskId, { step: 'kòmanse' });
    const buffer = await getRawBody(req, taskId);
    let fileBuffer = buffer;
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      const match = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (match) {
        const boundary = match[1] || match[2];
        const startStr = '--' + boundary;
        const endStr = '\r\n--' + boundary;
        const startBuf = Buffer.from(startStr);
        const endBuf = Buffer.from(endStr);
        const headEndBuf = Buffer.from('\r\n\r\n');
        const startIdx = buffer.indexOf(startBuf);
        if (startIdx !== -1) {
          const headEndIdx = buffer.indexOf(headEndBuf, startIdx);
          if (headEndIdx !== -1) {
            const contentStart = headEndIdx + 4;
            const contentEnd = buffer.indexOf(endBuf, contentStart);
            if (contentEnd !== -1) {
              fileBuffer = buffer.subarray(contentStart, contentEnd);
            } else {
              fileBuffer = buffer.subarray(contentStart);
            }
          }
        }
      }
    }
    if (taskId) tasks.set(taskId, { step: 'sovgade' });
    const url = await uploadToBref(fileBuffer, 'upload.pdf');
    if (taskId) tasks.set(taskId, { step: 'fini', url });
    res.json({ url });
  } catch (e) {
    if (taskId) tasks.set(taskId, { step: 'erè' });
    res.status(500).json({ error: "Erè pandan telechargement an" });
  }
});

app.post('/code/search', requireAuth, (req, res) => {
  try {
    const bodyCode = req.body.code || '';
    const query = (req.body.query || '').toLowerCase();
    const lines = bodyCode.split('\n');
    const results = [];
    const qWords = query.split(/\s+/).filter(Boolean);
    lines.forEach((line, index) => {
      const t = line.toLowerCase();
      let score = 0;
      if (t === query) score += 5000;
      if (t.includes(query)) score += 1000;
      let wordMatches = 0;
      qWords.forEach(w => { if (t.includes(w)) wordMatches++; });
      score += (wordMatches * 100);
      let charMatches = 0;
      for (let i = 0; i < query.length; i++) { if (t.includes(query[i])) charMatches++; }
      score += charMatches;
      if (score > (query.length * 0.5) && line.trim().length > 0) results.push({ text: `${index + 1} : ${line.trim()}`, score });
    });
    results.sort((a, b) => b.score - a.score);
    res.json({ results: results.map(r => r.text) });
  } catch (e) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/code/syntax', requireAuth, (req, res) => {
  try {
    const bodyCode = req.body.code || '';
    const type = req.body.type || 'js';
    let errors = [];
    const getLineCol = (str, index) => {
      const upTo = str.slice(0, index);
      const linesCount = upTo.split('\n');
      return `liy ${linesCount.length}`;
    };
    if (type === 'js') {
      try {
        new vm.Script(bodyCode, { filename: 'script.js' });
      } catch (err) {
        let lineTarget = '?';
        if (err.stack) {
          const match = err.stack.match(/script\.js:(\d+)/);
          if (match) lineTarget = match[1];
        }
        errors.push(`Erè liy ${lineTarget} : ${err.message}`);
      }
    } else if (type === 'json') {
      try {
        JSON.parse(bodyCode);
      } catch (err) {
        errors.push(err.message);
      }
    } else if (type === 'html') {
      const stack = [];
      const regex = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
      let match;
      const selfClosing = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
      while ((match = regex.exec(bodyCode)) !== null) {
        const tag = match[1].toLowerCase();
        const isClosing = match[0].startsWith('</');
        const pos = getLineCol(bodyCode, match.index);
        if (!isClosing) {
          if (!selfClosing.has(tag)) stack.push({ tag, pos });
        } else {
          if (stack.length === 0) {
            errors.push(`Ou gen yon tag fèmiti inatandi: </${tag}> nan ${pos}`);
          } else {
            const last = stack.pop();
            if (last.tag !== tag) errors.push(`Erè tag: nou te atann </${last.tag}> men nou jwenn </${tag}> nan ${pos}`);
          }
        }
      }
      if (stack.length > 0) {
        stack.forEach(unclosed => { errors.push(`Tag pa fèmen: <${unclosed.tag}> louvri nan ${unclosed.pos}`); });
      }
    }
    if (errors.length === 0) res.json({ status: 'Valab' });
    else res.json({ status: 'Nou jwenn erè', errors });
  } catch (e) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/images-to-pdf', requireAuth, async (req, res) => {
  const taskId = req.query.taskId;
  try {
    if (taskId) tasks.set(taskId, { step: 'kòmanse' });
    const urls = req.body.images || [];
    if (urls.length === 0) return res.status(400).json({ error: 'Ou pa voye okenn imaj' });
    
    if (taskId) tasks.set(taskId, { step: 'jenere_pdf' });
    
    const tasksPayload = {};
    const mergeInputs = [];
    
    urls.forEach((url, i) => {
      const importName = `import-${i}`;
      const convertName = `convert-${i}`;
      tasksPayload[importName] = { operation: "import/url", url: url };
      tasksPayload[convertName] = { operation: "convert", input: importName, output_format: "pdf" };
      mergeInputs.push(convertName);
    });
    
    tasksPayload["merge-1"] = {
      operation: "merge",
      input: mergeInputs,
      output_format: "pdf"
    };
    
    tasksPayload["export-1"] = {
      operation: "export/url",
      input: "merge-1"
    };

    const validKeys = CLOUDCONVERT_KEYS;
    if (validKeys.length === 0) throw new Error("Echek");

    let exportUrl = null;
    let jobSuccess = false;

    for (const key of validKeys) {
      try {
        const ccRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ tasks: tasksPayload })
        });
        
        if (!ccRes.ok) continue;
        
        const jobData = await ccRes.json();
        const jobId = jobData.data.id;
        
        let finished = false;
        let jobError = false;
        while (!finished && !jobError) {
          await new Promise(r => setTimeout(r, 2000));
          const checkRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
            headers: { "Authorization": `Bearer ${key}` }
          });
          if (!checkRes.ok) {
            jobError = true;
            break;
          }
          const checkData = await checkRes.json();
          const status = checkData.data.status;
          if (status === 'finished') {
            finished = true;
            const exportTask = checkData.data.tasks.find(t => t.name === 'export-1');
            exportUrl = exportTask.result.files[0].url;
            jobSuccess = true;
          } else if (status === 'error') {
            jobError = true;
          }
        }
        if (jobSuccess) break;
      } catch (e) {
        continue;
      }
    }
    
    if (!jobSuccess || !exportUrl) throw new Error("Echek");
    
    if (taskId) tasks.set(taskId, { step: 'sovgade' });
    const dlRes = await fetch(exportUrl);
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    
    const finalUrl = await uploadToBref(dlBuf, 'document.pdf');
    
    if (taskId) tasks.set(taskId, { step: 'fini', url: finalUrl });
    res.json({ url: finalUrl });
  } catch (error) {
    if (taskId) tasks.set(taskId, { step: 'erè' });
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.put('/:filename', requireAuth, async (req, res) => {
  const taskId = req.query.taskId;
  const filename = path.basename(req.params.filename || '');
  if (!filename) return res.status(400).json({ error: 'Ou pa mete non fichye a' });
  try {
    if (taskId) tasks.set(taskId, { step: 'kòmanse' });
    const buffer = await getRawBody(req, taskId);
    if (buffer.length === 0) return res.status(400).json({ error: 'Ou pa voye okenn fichye' });
    if (taskId) tasks.set(taskId, { step: 'sovgade' });
    const url = await uploadToBref(buffer, filename);
    if (taskId) tasks.set(taskId, { step: 'fini', url });
    res.send(url);
  } catch (error) {
    if (taskId) tasks.set(taskId, { step: 'erè' });
    res.status(500).json({ error: error.message });
  }
});

app.get('/:tfid/:filename', async (req, res, next) => {
  const tfid = req.params.tfid;
  const filename = req.params.filename;
  if (!tfid.startsWith('TF-') || !/^\d+$/.test(tfid.slice(3))) return next();
  const key = `${tfid}/${filename}`;
  const exists = await resourceExists(key);
  if (!exists) return sendUnknown(req, res);
  return servePublicFile(req, res, key);
});

app.get('/:filename', async (req, res, next) => {
  const filename = req.params.filename;
  if (isReservedPublicName(filename)) return next();
  const exists = await resourceExists(filename);
  if (!exists) return next();
  return servePublicFile(req, res, filename);
});

app.use((req, res) => { res.status(404).send('Nou pa jwenn sa w ap chèche a'); });

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

app.listen(PORT, '0.0.0.0', () => {});
