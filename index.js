require('dotenv').config();
const express = require('express');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { MongoClient } = require('mongodb');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
app.set('trust proxy', true);

const PORT = process.env.PORT || 3000;
const ICON_URL = 'https://tout.adamdh7.org/Tout.png';
const SERVER_TOKEN = process.env.TOUT_SERVER_TOKEN || 'https://tout.adamdh7.org';
const TRUSTED_BROWSER_HOSTS = new Set(['tout.adamdh7.org', 'server.tout.adamdh7.org']);

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

async function getDb() {
  if (!db) {
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

const getRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

async function cleanupEphemeralFiles() {
  try {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: 'tout' }));
    if (list.Contents) {
      for (const item of list.Contents) {
        if (item.Key.includes('tfsip')) {
          await s3.send(new DeleteObjectCommand({ Bucket: 'tout', Key: item.Key }));
        }
      }
    }
  } catch (e) {}
}
cleanupEphemeralFiles();

async function saveEphemeral(buffer, contentType, ext) {
  const randomNum = Math.floor(Math.random() * 10000000).toString();
  const key = `TF-${randomNum}/tfsip-${Date.now()}.${ext}`;
  await s3.send(new PutObjectCommand({ Bucket: 'tout', Key: key, Body: buffer, ContentType: contentType }));
  setTimeout(async () => {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: 'tout', Key: key }));
    } catch (e) {}
  }, 420000);
  return `https://server.tout.adamdh7.org/${key}`;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

function cleanRequestPath(reqPath) {
  return safeDecode(reqPath || '').replace(/^\/+/, '');
}

function contentTypeFromName(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.ts': 'video/mp2t',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.m2ts': 'video/mp2t',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript'
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

function isPdfFile(filename) {
  return path.extname(filename).toLowerCase() === '.pdf';
}

function isDirectVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp4', '.webm', '.m4v'].includes(ext);
}

function needsTranscode(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.mov', '.mkv', '.avi', '.wmv', '.flv', '.3gp', '.ts', '.mpeg', '.mpg', '.m2ts'].includes(ext);
}

function isMediaLikeFile(filename) {
  return isImageFile(filename) || isAudioFile(filename) || isPdfFile(filename) || isDirectVideoFile(filename) || needsTranscode(filename);
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

  if (parts.length === 0) {
    return 'Tout';
  }

  if (/^TF-/i.test(parts[0]) && parts[1]) {
    return path.basename(parts[1], path.extname(parts[1])).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Tout';
  }

  return path.basename(parts[parts.length - 1], path.extname(parts[parts.length - 1])) || 'Tout';
}

function buildViewerHtml(title, mediaUrl, filename) {
  const safeTitle = String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let mediaBlock = '';

  if (isImageFile(filename)) {
    mediaBlock = `<img src="${mediaUrl}" alt="${safeTitle}" />`;
  } else if (isDirectVideoFile(filename) || needsTranscode(filename)) {
    mediaBlock = `<video src="${mediaUrl}" controls autoplay playsinline preload="metadata"></video>`;
  } else {
    mediaBlock = `<a href="${mediaUrl}" style="color:#fff;font-family:Arial,sans-serif;word-break:break-all;text-decoration:none;font-size:18px;">${mediaUrl}</a>`;
  }

  return `<!doctype html>
<html lang="ht">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<link rel="icon" type="image/png" href="${ICON_URL}">
<link rel="shortcut icon" type="image/png" href="${ICON_URL}">
<link rel="apple-touch-icon" href="${ICON_URL}">
<meta name="theme-color" content="#000000">
<style>
html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; background: #000; }
.wrap { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; position: relative; }
img, video { max-width: 100%; max-height: 100%; object-fit: contain; outline: none; }
</style>
</head>
<body>
<div class="wrap">
${mediaBlock}
</div>
<script>
function forceDownload() {
  window.location.href = "${mediaUrl}&raw=1";
}
var mediaEl = document.querySelector('img, video');
if (mediaEl) {
  mediaEl.addEventListener('error', forceDownload);
}
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
  try {
    return new URL(value).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
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
  if (hasValidToken(req)) {
    return { allowed: true, mode: 'token' };
  }

  const browserLike = isBrowserLikeRequest(req);
  const hasTrustedOrigin = hasTrustedBrowserOrigin(req);

  if (browserLike && hasTrustedOrigin) {
    return { allowed: true, mode: 'browser' };
  }

  if (browserLike) {
    return { allowed: false, reason: 'Entèdi: orijin navigatè a pa otorize' };
  }

  return { allowed: false, reason: 'Entèdi: ou dwe mete yon token' };
}

function requireAuth(req, res, next) {
  const access = canAccessPrivate(req);
  if (!access.allowed) {
    return res.status(403).send(access.reason);
  }
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

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

app.use(corsAndOptions);

function isReservedPublicName(name) {
  return ['ok', 'health', 'ai', 'jerere', 'calcul', 'Tout.png', 'favicon.ico', 'qrcode', 'compress', 'resize', 'code', 'images-to-pdf'].includes(name.split('/')[0]);
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
    const params = {
      Bucket: 'tout',
      Key: key
    };

    if (range) {
      params.Range = range;
    }

    const s3Response = await s3.send(new GetObjectCommand(params));
    res.setHeader('Content-Type', s3Response.ContentType || contentTypeFromName(filename));
    res.setHeader('Accept-Ranges', 'bytes');

    if (s3Response.ContentRange) {
      res.setHeader('Content-Range', s3Response.ContentRange);
    }

    if (s3Response.ContentLength) {
      res.setHeader('Content-Length', s3Response.ContentLength);
    }

    res.status(range ? 206 : 200);

    if (!s3Response.Body) {
      return res.end();
    }

    s3Response.Body.pipe(res);
  } catch (e) {
    sendUnknown(req, res);
  }
}

function reqLikeCleanup(inputStream, ffmpeg, res, abort) {
  const stop = () => {
    abort();
    try {
      if (inputStream.destroy) inputStream.destroy();
    } catch (e) {}
    try {
      if (ffmpeg.stdin) ffmpeg.stdin.destroy();
    } catch (e) {}
  };

  res.on('close', stop);
  res.on('finish', stop);

  if (inputStream && inputStream.on) {
    inputStream.on('error', stop);
  }
}

function transcodeVideoStreamToMp4(inputStream, res) {
  if (!FFMPEG_AVAILABLE) {
    res.status(415).type('text/plain').send('Pa gen ffmpeg sou sèvè a');
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'none');

  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1'
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const abort = () => {
    try {
      ffmpeg.kill('SIGKILL');
    } catch (e) {}
  };

  reqLikeCleanup(inputStream, ffmpeg, res, abort);
  inputStream.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  let stderr = '';
  ffmpeg.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  ffmpeg.on('close', code => {
    if (code !== 0 && !res.headersSent) {
      res.status(415).type('text/plain').send(stderr || 'Pa ka konvèti videyo sa a');
    } else if (code !== 0 && !res.writableEnded) {
      res.end();
    }
  });

  ffmpeg.on('error', () => {
    if (!res.headersSent) {
      res.status(500).type('text/plain').send('Erè ffmpeg');
    }
  });
}

async function serveS3VideoTranscode(req, res, key) {
  try {
    const s3Response = await s3.send(new GetObjectCommand({
      Bucket: 'tout',
      Key: key
    }));

    if (!s3Response.Body) {
      return sendUnknown(req, res);
    }

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

  if (browserView && !wantsRaw && !wantsTranscode) {
    const exists = await resourceExists(key);
    if (!exists) {
      return sendUnknown(req, res);
    }

    const isImageOrVideo = isImageFile(filename) || isDirectVideoFile(filename) || needsTranscode(filename);
    if (!isImageOrVideo) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return serveS3RawFile(req, res, key, filename);
    }

    const mediaMode = needsTranscode(filename) && FFMPEG_AVAILABLE ? 'transcode' : 'raw';
    const mediaUrl = buildMediaUrl(key, mediaMode);
    return res.status(200).type('html').send(buildViewerHtml(getDisplayName(key), mediaUrl, filename));
  }

  if (wantsTranscode && needsTranscode(filename) && FFMPEG_AVAILABLE) {
    return serveS3VideoTranscode(req, res, key);
  }

  return serveS3RawFile(req, res, key, filename);
}

async function processAndUploadImage(prompt) {
  try {
    await new Promise(resolve => setTimeout(resolve, 7));
    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: prompt, num_steps: 4 })
    });
    if (!aiRaw.ok) return '';
    const aiResponse = await aiRaw.json();
    await new Promise(resolve => setTimeout(resolve, 7));
    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) return '';
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const filename = `TF-${randomNum}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: 'tout',
      Key: filename,
      Body: bytes,
      ContentType: 'image/png'
    }));
    await new Promise(resolve => setTimeout(resolve, 7));
    return `https://server.tout.adamdh7.org/${filename}`;
  } catch (e) {
    return '';
  }
}

async function performSearch(query) {
  try {
    await new Promise(resolve => setTimeout(resolve, 7));
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: process.env.TAVILY_KEY, query: query, search_depth: 'basic', max_results: 5, include_images: true })
    });
    await new Promise(resolve => setTimeout(resolve, 7));
    const data = await res.json();
    let text = '';
    let foundImages = [];
    let foundLinks = [];
    if (data.images && data.images.length > 0) {
      foundImages = data.images;
    }
    if (!data.results) {
      return { context: 'Nou pa jwenn anyen.', images: [], links: [] };
    }
    for (const r of data.results) {
      text += 'URL: ' + (r.url || 'Lyen pa disponib') + '\nContenu: ' + r.content + '\n\n';
      if (r.url) {
        foundLinks.push(r.url);
      }
    }
    return { context: text.substring(0, 4000), images: foundImages, links: foundLinks };
  } catch (e) {
    return { context: 'Sistèm nan gen yon erè pandan l ap chèche.', images: [], links: [] };
  }
}

app.get('/ok', (req, res) => {
  res.json({ ok: true });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, tokenRequiredForPrivateRoutes: true, trustedBrowserHosts: Array.from(TRUSTED_BROWSER_HOSTS) });
});

app.get('/Tout.png', async (req, res) => {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: 'tout', Key: 'Tout.png' }));
    res.setHeader('Content-Type', object.ContentType || 'image/png');
    if (object.ContentLength) {
      res.setHeader('Content-Length', object.ContentLength);
    }
    if (object.Body) {
      object.Body.pipe(res);
      return;
    }
    res.status(404).send('Nou pa jwenn imaj la');
  } catch (e) {
    res.status(404).send('Nou pa jwenn imaj la');
  }
});

app.get('/ai', requireAuth, async (req, res) => {
  const sess = req.query.session_id || 'global';
  try {
    const database = await getDb();
    const messagesCollection = database.collection('messages');
    const attachmentsCollection = database.collection('attachments');

    const messages = await messagesCollection.find({ session_id: sess }).sort({ timestamp: 1 }).toArray();
    await new Promise(resolve => setTimeout(resolve, 7));

    const messageIds = messages.map(m => m.id);
    const attachments = await attachmentsCollection.find({ message_id: { $in: messageIds } }).toArray();

    const messagesMap = new Map();
    if (messages) {
      for (const row of messages) {
        if (!messagesMap.has(row.id)) {
          messagesMap.set(row.id, { role: row.role, content: row.content, timestamp: row.timestamp });
        }
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
    res.status(400).json({ error: 'Ou bay yon mesaj vid' });
    return;
  }

  try {
    const database = await getDb();
    const messagesCollection = database.collection('messages');
    const attachmentsCollection = database.collection('attachments');
    const userMsgId = Date.now().toString() + Math.random().toString();

    await messagesCollection.insertOne({
      id: userMsgId,
      role: 'user',
      content: userMessage,
      session_id: sess,
      timestamp: new Date().toISOString()
    });
    await new Promise(resolve => setTimeout(resolve, 7));

    const recentMessages = await messagesCollection.find({ session_id: sess }).sort({ timestamp: -1 }).limit(7).toArray();
    await new Promise(resolve => setTimeout(resolve, 7));
    const context = recentMessages ? recentMessages.reverse().map(m => ({ role: m.role, content: m.content })) : [];

    const systemPrompt = "You are Asistan. If unsure, lacking info, or needing current data, output EXACTLY [SEARCH: query]. If the user asks for an image or it improves your explanation, output EXACTLY [IMAGE: english description]. Do not guess. Do not use emojis in your responses.";

    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          ...context
        ],
        max_tokens: 3000,
        stream: true
      })
    });

    let frontendMessage = '';
    let dbMessage = '';
    let attachmentsToSave = [];
    let imageIndex = 0;
    let searchImageIndex = 0;
    let allImages = [];
    let isBuffering = false;
    let buffer = '';

    async function processChar(char) {
      if (!isBuffering) {
        if (char === '[') {
          isBuffering = true;
          buffer = '[';
        } else {
          res.write(JSON.stringify({ type: 'final', content: char }) + '\n');
          frontendMessage += char;
          dbMessage += char;
        }
      } else {
        buffer += char;
        const tImg = '[IMAGE:';
        const tSrc = '[SEARCH:';
        if (char === ']') {
          isBuffering = false;
          if (buffer.startsWith(tImg)) {
            const prompt = buffer.substring(7, buffer.length - 1).trim();
            imageIndex++;
            await new Promise(resolve => setTimeout(resolve, 7));
            const keepAliveImg = setInterval(() => {
              try { res.write(JSON.stringify({ type: 'final', content: '• ' }) + '\n'); } catch (e) {}
            }, 1000);
            const imgUrl = await processAndUploadImage(prompt);
            clearInterval(keepAliveImg);
            const dbTag = `[IMAGES: ${imageIndex}]`;
            if (imgUrl) {
              attachmentsToSave.push({ placeholder: dbTag, url: `\n\n${imgUrl}\n\n` });
            }
            const replacement = imgUrl ? `\n\n${imgUrl}\n\n` : '';
            res.write(JSON.stringify({ type: 'final', content: replacement }) + '\n');
            frontendMessage += replacement;
            dbMessage += dbTag;
          } else if (buffer.startsWith(tSrc)) {
            const query = buffer.substring(8, buffer.length - 1).trim();
            await new Promise(resolve => setTimeout(resolve, 7));
            const keepAliveSrc = setInterval(() => {
              try { res.write(JSON.stringify({ type: 'final', content: '• ' }) + '\n'); } catch (e) {}
            }, 1000);
            const searchRes = await performSearch(query);
            clearInterval(keepAliveSrc);
            let searchResultsText = 'Query:\n' + query + '\nResults:\n' + searchRes.context + '\n\n';
            if (searchRes.images && searchRes.images.length > 0) {
              allImages = allImages.concat(searchRes.images);
              searchResultsText += 'Images URLs:\n' + searchRes.images.join('\n') + '\n\n';
              searchRes.images.forEach(imgUrl => {
                searchImageIndex++;
                const dbTag = `[IMAGES: SEARCH_${searchImageIndex}]`;
                attachmentsToSave.push({ placeholder: dbTag, url: imgUrl });
              });
            }
            const finalSystemPrompt = "You are Asistan. Answer the user in their language. Synthesize a natural, direct, and conversational response using the provided search results. Respond strictly to the user's expectations. Do not include anything that was not requested. Answer only the specific prompt that triggered the search. Do not integrate elements that the user never asked for in their request. Do not use emojis in your responses.\n\nResults:\n" + searchResultsText;
            const contextLimit = context.slice(-6);

            try {
              const aiFinalRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messages: [
                    { role: 'system', content: finalSystemPrompt },
                    ...contextLimit
                  ],
                  max_tokens: 3000,
                  stream: true
                })
              });
              if (!aiFinalRaw.ok) {
                const errMsg = "Sistèm sa a pa disponib kounye a.";
                for (const char of errMsg) await processChar(char);
                return;
              }
              const aiFinalStream = aiFinalRaw.body;
              if (aiFinalStream && aiFinalStream.getReader) {
                const readerFinal = aiFinalStream.getReader();
                const decoderFinal = new TextDecoder();
                let bufferFinal = '';
                while (true) {
                  const { done, value } = await readerFinal.read();
                  if (done) break;
                  bufferFinal += decoderFinal.decode(value, { stream: true });
                  const linesFinal = bufferFinal.split('\n');
                  bufferFinal = linesFinal.pop();
                  for (const lineFinal of linesFinal) {
                    const cleanLineFinal = lineFinal.trim();
                    if (cleanLineFinal.startsWith('data: ') && cleanLineFinal !== 'data: [DONE]') {
                      try {
                        const dataFinal = JSON.parse(cleanLineFinal.slice(6));
                        if (dataFinal.response) {
                          for (const c of dataFinal.response) {
                            await processChar(c);
                          }
                        }
                      } catch (e) {}
                    }
                  }
                  await new Promise(resolve => setTimeout(resolve, 7));
                }
              }
            } catch (e) {}
          } else {
            res.write(JSON.stringify({ type: 'final', content: buffer }) + '\n');
            frontendMessage += buffer;
            dbMessage += buffer;
          }
          buffer = '';
        } else {
          const pImg = tImg.startsWith(buffer);
          const pSrc = tSrc.startsWith(buffer);
          const iImg = buffer.startsWith(tImg);
          const iSrc = buffer.startsWith(tSrc);
          if (!pImg && !pSrc && !iImg && !iSrc) {
            isBuffering = false;
            res.write(JSON.stringify({ type: 'final', content: buffer }) + '\n');
            frontendMessage += buffer;
            dbMessage += buffer;
            buffer = '';
          }
        }
      }
    }

    if (!aiRaw.ok) {
      const errMsg = "Sistèm sa a pa disponib kounye a.";
      for (const char of errMsg) await processChar(char);
    } else {
      const aiResponseStream = aiRaw.body;
      if (aiResponseStream && aiResponseStream.getReader) {
        const reader = aiResponseStream.getReader();
        const decoder = new TextDecoder();
        let bufferMain = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bufferMain += decoder.decode(value, { stream: true });
            const lines = bufferMain.split('\n');
            bufferMain = lines.pop();
            for (const line of lines) {
              const cleanLine = line.trim();
              if (cleanLine.startsWith('data: ') && cleanLine !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(cleanLine.slice(6));
                  if (data.response) {
                    for (const char of data.response) {
                      await processChar(char);
                    }
                  }
                } catch (e) {}
              }
            }
            await new Promise(resolve => setTimeout(resolve, 7));
          }
        } catch (e) {
          const errMsg = "Gen yon erè ki fèt nan kouran an (stream).";
          for (const char of errMsg) await processChar(char);
        }
      } else {
        const errMsg = "Mwen regrèt, mwen pa ka bay yon repons.";
        for (const char of errMsg) await processChar(char);
      }
    }

    if (isBuffering) {
      res.write(JSON.stringify({ type: 'final', content: buffer }) + '\n');
      frontendMessage += buffer;
      dbMessage += buffer;
    }

    if (allImages.length > 0) {
      allImages.forEach((imgUrl, idx) => {
        const dbTag = `[IMAGES: SEARCH_${idx + 1}]`;
        if (dbMessage.includes(imgUrl)) {
          dbMessage = dbMessage.split(imgUrl).join(dbTag);
          if (!attachmentsToSave.some(a => a.url === imgUrl)) {
            attachmentsToSave.push({ placeholder: dbTag, url: imgUrl });
          }
        }
      });
    }

    try {
      const asstMsgId = Date.now().toString() + Math.random().toString();
      await messagesCollection.insertOne({
        id: asstMsgId,
        role: 'assistant',
        content: dbMessage,
        session_id: sess,
        timestamp: new Date().toISOString()
      });
      await new Promise(resolve => setTimeout(resolve, 7));

      if (attachmentsToSave.length > 0) {
        for (const att of attachmentsToSave) {
          await attachmentsCollection.insertOne({
            message_id: asstMsgId,
            placeholder: att.placeholder,
            url: att.url
          });
          await new Promise(resolve => setTimeout(resolve, 7));
        }
      }
    } catch (e) {}

    res.end();
  } catch (e) {
    res.end();
  }
});

app.post('/jerere', requireAuth, async (req, res) => {
  let body;
  try {
    body = req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Fòma JSON pa valab' });
  }
  const prompt = body.prompt?.trim();
  if (!prompt) return res.status(400).json({ error: 'Ou pa bay okenn enstriksyon (prompt)' });

  try {
    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: prompt, num_steps: 4 })
    });
    if (!aiRaw.ok) {
      return res.status(503).json({ error: "Sistèm sa a pa disponib kounye a." });
    }
    const aiResponse = await aiRaw.json();
    await new Promise(resolve => setTimeout(resolve, 7));

    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) {
      throw new Error("Entèlijans atifisyèl la pa bay yon imaj ki valab.");
    }
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));

    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const filename = `TF-${randomNum}.png`;

    await s3.send(new PutObjectCommand({
      Bucket: 'tout',
      Key: filename,
      Body: bytes,
      ContentType: 'image/png'
    }));
    await new Promise(resolve => setTimeout(resolve, 7));

    const returnedUrl = `https://server.tout.adamdh7.org/${filename}`;
    res.json({ url: returnedUrl });
  } catch (error) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
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
  try {
    body = req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Fòma JSON pa valab' });
  }
  const calculation = body.calculation?.trim();
  if (!calculation) {
    return res.status(400).json({ error: 'Ou pa bay okenn ekspresyon matematik' });
  }
  try {
    const systemPrompt = "You are Asistan, an expert polymath specializing in Mathematics, Physics, and all scientific calculations.\nCRITICAL RULES:\n1. LANGUAGE: Always respond in the exact same language used by the user.\n2. CONTEXT: Thoroughly analyze and incorporate any specific user notes, variables, or constraints provided to tailor the calculation.\n3. STEP-BY-STEP LOGIC: Do not just give the answer. Deconstruct the solution into a clear, numbered logical path. Explain the reasoning and formulas for every step.";
    const userPrompt = `"${calculation}"`;

    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 3000,
        stream: true
      })
    });
    if (!aiRaw.ok) {
      res.write("Sistèm sa a pa disponib kounye a.");
      return res.end();
    }
    const aiResponseStream = aiRaw.body;
    if (!aiResponseStream || !aiResponseStream.getReader) {
      res.end("Sistèm sa a pa disponib kounye a.");
      return;
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
        if (cleanLine.startsWith('data: ') && cleanLine !== 'data: [DONE]') {
          try {
            const data = JSON.parse(cleanLine.slice(6));
            if (data.response) {
              res.write(data.response);
            }
          } catch (e) {}
        }
      }
      await new Promise(resolve => setTimeout(resolve, 7));
    }
    res.end();
  } catch (e) {
    res.write("Sistèm sa a pa disponib kounye a.");
    res.end();
  }
});

app.post('/qrcode', requireAuth, async (req, res) => {
  try {
    const text = req.body.text || '';
    if (!text) return res.status(400).json({ error: 'Ou pa bay okenn tèks' });
    const fetchRes = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`);
    const arrayBuf = await fetchRes.arrayBuffer();
    const url = await saveEphemeral(Buffer.from(arrayBuf), 'image/png', 'png');
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/compress', requireAuth, async (req, res) => {
  let tmpIn;
  let tmpOut;
  try {
    const buffer = await getRawBody(req);
    if (buffer.length === 0) return res.status(400).json({ error: 'Pa gen done fichye' });
    const isVideo = req.query.type === 'video';
    if (isVideo && buffer.length > 52428800) {
      return res.status(400).json({ error: 'Videyo sa a twò gwo pou konprese l' });
    }
    const ext = isVideo ? 'mp4' : 'png';
    tmpIn = path.join(os.tmpdir(), `in-comp-${Date.now()}.${ext}`);
    tmpOut = path.join(os.tmpdir(), `out-comp-${Date.now()}.${ext}`);
    fs.writeFileSync(tmpIn, buffer);
    if (isVideo) {
      spawnSync('ffmpeg', ['-i', tmpIn, '-vcodec', 'libx264', '-crf', '28', '-preset', 'faster', tmpOut]);
    } else {
      spawnSync('ffmpeg', ['-i', tmpIn, '-q:v', '10', '-compression_level', '9', tmpOut]);
    }

    const inSize = fs.statSync(tmpIn).size;
    let outSize = 0;
    try {
      outSize = fs.statSync(tmpOut).size;
    } catch (e) {}

    let finalBuf = buffer;
    if (outSize > 0 && outSize < inSize) {
      finalBuf = fs.readFileSync(tmpOut);
    }
    
    const cType = isVideo ? 'video/mp4' : 'image/png';
    const url = await saveEphemeral(finalBuf, cType, ext);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  } finally {
    try { if (tmpIn) fs.unlinkSync(tmpIn); } catch (e) {}
    try { if (tmpOut) fs.unlinkSync(tmpOut); } catch (e) {}
  }
});

app.post('/resize', requireAuth, async (req, res) => {
  let tmpImg;
  try {
    const buffer = await getRawBody(req);
    if (buffer.length === 0) return res.status(400).json({ error: 'Pa gen done fichye' });
    const width = req.query.width;
    const height = req.query.height;
    tmpImg = path.join(os.tmpdir(), `in-res-${Date.now()}.png`);
    fs.writeFileSync(tmpImg, buffer);
    if (width && height) {
      const outImg = path.join(os.tmpdir(), `out-res-${Date.now()}.png`);
      spawnSync('ffmpeg', ['-i', tmpImg, '-vf', `scale=${width}:${height}`, outImg]);
      const outBuf = fs.readFileSync(outImg);
      const url = await saveEphemeral(outBuf, 'image/png', 'png');
      try { fs.unlinkSync(outImg); } catch (e) {}
      return res.json({ url });
    }
    const sizes = [192, 512, 1024, 2024];
    const urls = [];
    for (const s of sizes) {
      const outImg = path.join(os.tmpdir(), `out-res-${s}-${Date.now()}.png`);
      spawnSync('ffmpeg', ['-i', tmpImg, '-vf', `scale=${s}:${s}`, outImg]);
      const outBuf = fs.readFileSync(outImg);
      urls.push(await saveEphemeral(outBuf, 'image/png', 'png'));
      try { fs.unlinkSync(outImg); } catch (e) {}
    }
    res.json({ urls });
  } catch (e) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  } finally {
    try { if (tmpImg) fs.unlinkSync(tmpImg); } catch (e) {}
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
      if (t.includes(query)) {
        score += 1000;
      }
      let wordMatches = 0;
      qWords.forEach(w => {
        if (t.includes(w)) wordMatches++;
      });
      score += (wordMatches * 50);
      let charMatches = 0;
      for (let i = 0; i < query.length; i++) {
        if (t.includes(query[i])) charMatches++;
      }
      score += charMatches;

      if (score > (query.length * 0.3) && line.trim().length > 0) {
        results.push({ text: `${index + 1} : ${line.trim()}`, score });
      }
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
    if (type === 'js') {
      try {
        new Function(bodyCode);
      } catch (err) {
        errors.push(err.message);
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
      const selfClosing = new Set(['img','br','hr','input','meta','link']);
      while ((match = regex.exec(bodyCode)) !== null) {
          const tag = match[1].toLowerCase();
          const isClosing = match[0].startsWith('</');
          if (!isClosing) {
              if (!selfClosing.has(tag)) stack.push({tag, index: match.index});
          } else {
              if (stack.length === 0) {
                  errors.push(`Tag fèmiti inatandi: </${tag}> nan pozisyon ${match.index}`);
              } else {
                  const last = stack.pop();
                  if (last.tag !== tag) {
                      errors.push(`Erè tag: nou te atann </${last.tag}> men nou jwenn </${tag}> nan pozisyon ${match.index}`);
                  }
              }
          }
      }
      if (stack.length > 0) {
          stack.forEach(unclosed => {
              errors.push(`Tag pa fèmen: <${unclosed.tag}> louvri nan pozisyon ${unclosed.index}`);
          });
      }
    }
    if (errors.length === 0) {
      res.json({ status: 'Valab' });
    } else {
      res.json({ status: 'Nou jwenn erè', errors });
    }
  } catch (e) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/images-to-pdf', requireAuth, async (req, res) => {
  let tmpDir;
  try {
    const urls = req.body.images || [];
    if (urls.length === 0) return res.status(400).json({ error: 'Ou pa voye okenn imaj' });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));
    for (let i = 0; i < urls.length; i++) {
      const imgRes = await fetch(urls[i]);
      const imgBuf = await imgRes.arrayBuffer();
      const padIndex = String(i + 1).padStart(3, '0');
      const imgPath = path.join(tmpDir, `img${padIndex}.jpg`);
      fs.writeFileSync(imgPath, Buffer.from(imgBuf));
    }
    const pdfPath = path.join(tmpDir, 'output.pdf');
    spawnSync('ffmpeg', ['-f', 'image2', '-i', path.join(tmpDir, 'img%03d.jpg'), pdfPath]);
    const pdfBuffer = fs.readFileSync(pdfPath);
    const finalUrl = await saveEphemeral(pdfBuffer, 'application/pdf', 'pdf');
    res.json({ url: finalUrl });
  } catch (error) {
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
});

app.put('/:filename', requireAuth, async (req, res) => {
  const filename = path.basename(req.params.filename || '');
  if (!filename) {
    return res.status(400).json({ error: 'Ou pa mete non fichye a' });
  }

  const buffer = await getRawBody(req);
  if (buffer.length === 0) {
    return res.status(400).json({ error: 'Ou pa voye okenn fichye' });
  }

  try {
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const tfid = `TF-${randomNum}`;
    const key = `${tfid}/${filename}`;

    await s3.send(new PutObjectCommand({
      Bucket: 'tout',
      Key: key,
      Body: buffer,
      ContentType: req.headers['content-type'] || 'application/octet-stream'
    }));

    const serverUrl = `https://server.tout.adamdh7.org/${key}`;
    res.send(serverUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/:tfid/:filename', async (req, res, next) => {
  const tfid = req.params.tfid;
  const filename = req.params.filename;

  if (!tfid.startsWith('TF-') || !/^\d+$/.test(tfid.slice(3))) {
    return next();
  }

  const key = `${tfid}/${filename}`;
  const exists = await resourceExists(key);
  if (!exists) {
    return sendUnknown(req, res);
  }

  return servePublicFile(req, res, key);
});

app.get('/:filename', async (req, res, next) => {
  const filename = req.params.filename;

  if (isReservedPublicName(filename)) {
    return next();
  }

  const exists = await resourceExists(filename);
  if (!exists) {
    return next();
  }

  return servePublicFile(req, res, filename);
});

app.use((req, res) => {
  res.status(404).send('Nou pa jwenn sa w ap chèche a');
});

process.on('uncaughtException', (err) => {});
process.on('unhandledRejection', (reason, promise) => {});

app.listen(PORT, '0.0.0.0', () => {
});
