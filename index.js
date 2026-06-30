require('dotenv').config();
const express = require('express');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { MongoClient } = require('mongodb');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');

const app = express();
app.set('trust proxy', true);

const PORT = process.env.PORT || 3000;
const ICON_URL = 'https://tout.adamdh7.org/Tout.png';
const SERVER_TOKEN = process.env.TOUT_SERVER_TOKEN || 'https://tout.adamdh7.org';

const CLOUDCONVERT_KEYS = [
  process.env.CLOUDCONVERT_API_KEY,
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYWU2YTc1NWE4OWEwODg3MTVkODhhNTZmMDM4OGE1OGNiZTY0OWJiZjZmYTViYzg3ZDkzNThkNTMwZWM3YjZmY2Q0Zjg4OTI2OWVmNDNmYWEiLCJpYXQiOjE3ODI4NDgxNDYuMTgwNzU3LCJuYmYiOjE3ODI4NDgxNDYuMTgwNzU4LCJleHAiOjQ5Mzg1MjE3NDYuMTc0OTgzLCJzdWIiOiI3NjE1ODM1NCIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ1c2VyLndyaXRlIiwidGFzay5yZWFkIiwidGFzay53cml0ZSIsIndlYmhvb2sucmVhZCIsInByZXNldC53cml0ZSIsInByZXNldC5yZWFkIiwid2ViaG9vay53cml0ZSJdfQ.IWtqehZZt8E1mkxUii3g0CKwwHyYqcrL4rKmYbGmB6oNpjEIlKhiNjfqDKcdAjebBsinY2sqf7rMnAJ4DS9osBBYpRTZSvMbPSVvE0wWL5K9zzCthrSchhODv7yRMOhmZkwoPqqcg3X8zhLtPR7em2zrhSUWJYfMy7T8GwXDPWjhZ7UsU4dsFZttbxbVXp2HbUUqmKtHpW1QvlXsh9iwAUSuYZWRKKRfzMU5_m80lerl1OGWY-rxttDCBROAzpp93RflkPdgy_EW0msCEkC0Agkvl6Y9iFLge1VCYevjvuz6Tg_M1EU-4WieJJUA8SlVefxOE_6enbpY3KFV32tucUCvE3MIusBtSsyafdgcxtPCM06pOhmK53Ne4K-7EDA9eBHQAVIcprMoabiQH2gct_dZOb58pDtoItPKrNTFBzs1lWZpPZfMN7oVzlfeTnZnO-srbmLQg7tNRdDjx2an4VO_BQtuZbiysO8E99YBx2GlDsCulkt2yS6vjUhkW9SQQPS7i-X3b9QmpcmOXsaz71g9yON6WWEElqIyu9Zu0rGnJM1VBy6oYr-L_ZXlhKDLf_0SpCuyjq9IZ_k-ONL0jCYOWEi9MQVEnEW-wR7FmHtivNcf7vTWYnksjYSSue939W7nKboo_mwYVyRfINmibxLb6Ha1y9BHu9vsS-AR4jM',
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYjU5MWZiYTU5MzgzY2I0ZWI4NTJlYWEzNGMyOTAzNjVmMzdkMGEzYzllNjM4NjIwYzAzMDI0MmUyNmFhZTJlYTU2NzNkMDkyZDZlZjRhMDgiLCJpYXQiOjE3ODI4NTEwODguNzMzMjYyLCJuYmYiOjE3ODI4NTEwODguNzMzMjYzLCJleHAiOjQ5Mzg1MjQ2ODguNzI4MTQ5LCJzdWIiOiI3NjE1ODg3MiIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ1c2VyLndyaXRlIiwidGFzay5yZWFkIiwidGFzay53cml0ZSIsIndlYmhvb2sucmVhZCIsIndlYmhvb2sud3JpdGUiLCJwcmVzZXQucmVhZCIsInByZXNldC53cml0ZSJdfQ.NwXOyWgVrXMiJC7mk2NYUWFBy-9Dqs4UaxR2VezRWZe8Sx-QsI0HgpHhX8QsvuVa9VMr6ejg464IETha3vaCtpmwLEh2VPvzUd2FWYydQ4KSL4jO3TYBsnm0mwBaJoxmNUsXolK10O3maYqRXUCXj2sCTEe8pPKDKaL6xyUhCKj6u1VLJkQMXGeJVWxf624CPtiGiZ2_ihfRZIIckhVDMgzfy3kHqHwG-ElOTJ76_mF--P_tCsJHJ3C3S4BRo0xQlLzeWa-znI_Uy6PhbD8fEDTYFWm-eUPtVYxaMrc9_pcqPu7XIMpYkb8jI-pXNTFyyUspAIBs2Q1lJjyO_cnoGgjwjWKUPXkgkn7cyFS9ixV_GcYZtV6OV1jSPT0zgs-RQMBPdPK53dDSBFaZkd51NXzNu12ryPF9Bd5Uzib0Dh96IUtFY0xCWVqkVfe9nGrYHJMZygXz_ILZhf13YIgzIevs1iyaVh8ymIfk9P2-DnBuldAeHKFoPv_UCdFtfa2sFtB1NM6zMGvMtNUboJdgodYtemVsBuQ-P80ERWq3CDUI5rk9rcV1Rbg7mxvx56QUA8GQM8c1PjPq07muuqIVoj6cMyAFcK_rTpHV0_x36m_KAATOf8xwod_4VwKarLdjSE3vV1nHLSS83T0Cyv7zIdeAU1pyoQoeEf7bQY16q1U',
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiNWU4YTUwZTVmODczNWI3Y2RiMTczOTcyYTlmODFiMmQ4NGY5YzU4NmVmOGU4MWNiOTkwNWNjYWQ4ZGI0YWFmNTA0YjA5ZjkwZWNiMjg0N2UiLCJpYXQiOjE3ODI4NTExNTUuMzE5ODY1LCJuYmYiOjE3ODI4NTExNTUuMzE5ODY2LCJleHAiOjQ5Mzg1MjQ3NTUuMzE1NTQ2LCJzdWIiOiI3NjE1ODg4NCIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ1c2VyLndyaXRlIiwidGFzay5yZWFkIiwidGFzay53cml0ZSIsIndlYmhvb2sucmVhZCIsIndlYmhvb2sud3JpdGUiLCJwcmVzZXQucmVhZCIsInByZXNldC53cml0ZSJdfQ.J9UI0QSs4nFVlyfIXEBal71tvFL4Sd8P-oVlvtQKsy1z-8AB_E6MpKQVEOP39MBogTaawJVyrJTu4BYq2tYBYWuH5AsHXSF6vhNO2gwafvL0yoPXmV6jbAHT9gb0u9rn6K1qskPaqf-Aqr278uQqzDqAEk-Ws1hnbhAPr-4RFjd0pXWfFNn8Vy-lPtgJzXcYbE7i-zpf6g1Vu5YUbFhtkwDOmG97POhqSD9oqb284iX_iQMwlwLPA2A-bcRzmBuUrU1WgeFdYNubr-4pDH8b-p0Lx532CFcYNo9w2yeDmdmSaQyoykA-kyW5pffV6k5TRTvOyklNPqzWfJ4MILOK8iqBNbhpwsn9SFLrEuy6vsfGop0YBnnjnmlQ6SQsfiVhBje8_FcqHADOyTZrSWRtzsWpHx4Nkv1QosUMbHKAQ59zEORz2yim_CKkZkH6tcE8vcrG4TosEFDd6zE7UFeE-36YSLRZvQ8YMgxSKQ2UdYuaY0TgMZUM-Eg3UMUprRMUjMa8YuX49DteBm4YNP9oyKjpyqLAKnl8_M3ibUWnV0iV9zpe9qsZWbE8VEJ37lI90fhP-pLwQX-RV2bkS5J8dGqmYgmU4afzc4RJiiV85YTBOA28BaGoPobDB_mPSliJsZeEdNn8HtSt10cglcU9PasWJF3MdCnmKNzZuh4d6o4',
  '',
  '',
  '',
  ''
];

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

const tasks = new Map();

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

async function saveEphemeral(buffer, contentType, filenameOrExt) {
  const randomNum = Math.floor(Math.random() * 10000000).toString();
  let nameToUse = filenameOrExt;
  if (!nameToUse.includes('.')) {
    nameToUse = `tfsip-${Date.now()}.${filenameOrExt}`;
  } else if (!nameToUse.startsWith('tfsip-')) {
    nameToUse = `tfsip-${nameToUse}`;
  }
  const key = `TF-${randomNum}/${nameToUse}`;
  console.log(`[S3 UPLOAD] Préparation de l'envoi de ${key} (${buffer.length} octets, type: ${contentType})`);
  await s3.send(new PutObjectCommand({ Bucket: 'tout', Key: key, Body: buffer, ContentType: contentType }));
  console.log(`[S3 UPLOAD SUCCESS] Fichier stocké sur S3 sous la clé: ${key}`);
  setTimeout(async () => {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: 'tout', Key: key }));
      console.log(`[S3 AUTO-CLEANUP] Fichier éphémère supprimé: ${key}`);
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

  if (isImg) {
    mediaBlock = `<img id="media-element" src="${mediaUrl}" alt="${safeTitle}" />`;
  } else if (isVid) {
    mediaBlock = `<video id="media-element" src="${mediaUrl}" controls autoplay playsinline preload="metadata"></video>`;
  } else if (isAud) {
    mediaBlock = `<audio id="media-element" src="${mediaUrl}" controls autoplay preload="metadata"></audio>`;
  } else {
    mediaBlock = `<a href="${mediaUrl}" style="color:#fff;font-family:Arial,sans-serif;word-break:break-all;text-decoration:none;font-size:18px;">${mediaUrl}</a>`;
  }

  const downloadUrl = mediaUrl.replace('transcode=1', 'raw=1');

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

async function processAndUploadImage(prompt) {
  try {
    await new Promise(resolve => setTimeout(resolve, 7));
    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
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
    await s3.send(new PutObjectCommand({ Bucket: 'tout', Key: filename, Body: bytes, ContentType: 'image/png' }));
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
    if (data.images && data.images.length > 0) foundImages = data.images;
    if (!data.results) return { context: 'Nou pa jwenn anyen.', images: [], links: [] };
    for (const r of data.results) {
      text += 'URL: ' + (r.url || 'Lyen pa disponib') + '\nContenu: ' + r.content + '\n\n';
      if (r.url) foundLinks.push(r.url);
    }
    return { context: text.substring(0, 4000), images: foundImages, links: foundLinks };
  } catch (e) {
    return { context: 'Sistèm nan gen yon erè pandan l ap chèche.', images: [], links: [] };
  }
}

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
  if (!userMessage) return res.status(400).json({ error: 'Ou bay yon mesaj vid' });

  try {
    const database = await getDb();
    const messagesCollection = database.collection('messages');
    const attachmentsCollection = database.collection('attachments');
    const userMsgId = Date.now().toString() + Math.random().toString();
    await messagesCollection.insertOne({
      id: userMsgId, role: 'user', content: userMessage, session_id: sess, timestamp: new Date().toISOString()
    });
    await new Promise(resolve => setTimeout(resolve, 7));

    const recentMessages = await messagesCollection.find({ session_id: sess }).sort({ timestamp: -1 }).limit(30).toArray();
    await new Promise(resolve => setTimeout(resolve, 7));
    
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
    const context = validContext.reverse().map(m => ({ role: m.role, content: m.content }));

    const contextAttMap = new Map();
    if (validContext.length > 0) {
      const msgIds = validContext.map(m => m.id);
      const contextAtts = await attachmentsCollection.find({ message_id: { $in: msgIds } }).toArray();
      contextAtts.forEach(a => {
        if (a.placeholder) contextAttMap.set(a.placeholder.trim().toUpperCase(), a.url);
      });
    }

    const systemPrompt = "You are Asistan. If unsure, lacking info, or needing current data, output EXACTLY [SEARCH: query]. If the user asks for an image or it improves your explanation, output EXACTLY [IMAGE: english description]. Do not guess.";

    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, ...context], max_tokens: 3000, stream: true })
    });

    let frontendMessage = '';
    let dbMessage = '';
    let attachmentsToSave = [];
    let imageIndex = 0;
    let searchImageIndex = 0;
    let allImages = [];
    let isBuffering = false;
    let buffer = '';

    function sendToClient(str) {
      if (!str) return;
      res.write(JSON.stringify({ type: 'final', content: str }) + '\n');
      frontendMessage += str;
      dbMessage += str;
    }

    async function handleTag(tag) {
      const tImgMatch = tag.match(/^\[IMAGE:\s*(.*)\]$/i);
      const tSrcMatch = tag.match(/^\[SEARCH:\s*(.*)\]$/i);
      const tRefMatch = tag.match(/^\[IMAGES?:\s*(SEARCH_)?(\d+)\]$/i);

      if (tImgMatch) {
        const prompt = tImgMatch[1].trim();
        imageIndex++;
        await new Promise(resolve => setTimeout(resolve, 7));
        const keepAliveImg = setInterval(() => { try { res.write(JSON.stringify({ type: 'final', content: '• ' }) + '\n'); } catch (e) {} }, 1000);
        const imgUrl = await processAndUploadImage(prompt);
        clearInterval(keepAliveImg);
        const dbTag = `[IMAGES: ${imageIndex}]`;
        if (imgUrl) attachmentsToSave.push({ placeholder: dbTag, url: `\n\n${imgUrl}\n\n` });
        sendToClient(imgUrl ? `\n\n${imgUrl}\n\n` : '');
      } else if (tSrcMatch) {
        const query = tSrcMatch[1].trim();
        await new Promise(resolve => setTimeout(resolve, 7));
        const keepAliveSrc = setInterval(() => { try { res.write(JSON.stringify({ type: 'final', content: '• ' }) + '\n'); } catch (e) {} }, 1000);
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
        const finalSystemPrompt = "You are Asistan. Answer the user in their language. Synthesize a natural, direct, and conversational response using the provided search results. Respond strictly to the user's expectations. Do not include anything that was not requested. Answer only the specific prompt that triggered the search. Do not integrate elements that the user never asked for in their request.\n\nResults:\n" + searchResultsText;
        const contextLimit = context.slice(-6);

        try {
          const aiFinalRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'system', content: finalSystemPrompt }, ...contextLimit], max_tokens: 3000, stream: true })
          });
          if (!aiFinalRaw.ok) {
            sendToClient("Sistèm sa a pa disponib kounye a.");
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
                      for (const c of dataFinal.response) await processChar(c);
                    }
                  } catch (e) {}
                }
              }
              await new Promise(resolve => setTimeout(resolve, 7));
            }
          }
        } catch (e) {}
      } else if (tRefMatch) {
        const rawTag = tag.trim().toUpperCase();
        let foundUrl = contextAttMap.get(rawTag);
        if (!foundUrl && tRefMatch[1]) {
          const idx = parseInt(tRefMatch[2], 10) - 1;
          if (allImages && allImages[idx]) foundUrl = `\n\n${allImages[idx]}\n\n`;
        }
        if (foundUrl) {
          let cleanUrl = foundUrl;
          if (!cleanUrl.startsWith('\n')) cleanUrl = `\n\n${cleanUrl}\n\n`;
          sendToClient(cleanUrl);
        } else {
          sendToClient(tag);
        }
      } else {
        sendToClient(tag);
      }
    }

    async function processChar(char) {
      if (!char) return;
      if (!isBuffering) {
        if (char === '[') {
          isBuffering = true;
          buffer = '[';
        } else {
          sendToClient(char);
        }
      } else {
        buffer += char;
        if (char === ']') {
          isBuffering = false;
          await handleTag(buffer);
          buffer = '';
        } else {
          const uBuf = buffer.toUpperCase();
          const isMatch = "[IMAGE:".startsWith(uBuf) || uBuf.startsWith("[IMAGE:") ||
                          "[SEARCH:".startsWith(uBuf) || uBuf.startsWith("[SEARCH:") ||
                          "[IMAGES:".startsWith(uBuf) || uBuf.startsWith("[IMAGES:");
          if (!isMatch) {
            isBuffering = false;
            sendToClient(buffer);
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
                    for (const char of data.response) await processChar(char);
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
      sendToClient(buffer);
    }

    try {
      const asstMsgId = Date.now().toString() + Math.random().toString();
      await messagesCollection.insertOne({
        id: asstMsgId, role: 'assistant', content: dbMessage, session_id: sess, timestamp: new Date().toISOString()
      });
      await new Promise(resolve => setTimeout(resolve, 7));

      if (attachmentsToSave.length > 0) {
        for (const att of attachmentsToSave) {
          await attachmentsCollection.insertOne({ message_id: asstMsgId, placeholder: att.placeholder, url: att.url });
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
  try { body = req.body; } catch (e) { return res.status(400).json({ error: 'Fòma JSON pa valab' }); }
  const prompt = body.prompt?.trim();
  if (!prompt) return res.status(400).json({ error: 'Ou pa bay okenn enstriksyon (prompt)' });
  try {
    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, num_steps: 4 })
    });
    if (!aiRaw.ok) return res.status(503).json({ error: "Sistèm sa a pa disponib kounye a." });
    const aiResponse = await aiRaw.json();
    await new Promise(resolve => setTimeout(resolve, 7));
    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) throw new Error("Entèlijans atifisyèl la pa bay yon imaj ki valab.");
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const filename = `TF-${randomNum}.png`;
    await s3.send(new PutObjectCommand({ Bucket: 'tout', Key: filename, Body: bytes, ContentType: 'image/png' }));
    await new Promise(resolve => setTimeout(resolve, 7));
    res.json({ url: `https://server.tout.adamdh7.org/${filename}` });
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
  try { body = req.body; } catch (e) { return res.status(400).json({ error: 'Fòma JSON pa valab' }); }
  const calculation = body.calculation?.trim();
  if (!calculation) return res.status(400).json({ error: 'Ou pa bay okenn ekspresyon matematik' });
  try {
    const systemPrompt = "You are Asistan, an expert polymath specializing in Mathematics, Physics, and all scientific calculations.\nCRITICAL RULES:\n1. LANGUAGE: Always respond in the exact same language used by the user.\n2. CONTEXT: Thoroughly analyze and incorporate any specific user notes, variables, or constraints provided to tailor the calculation.\n3. STEP-BY-STEP LOGIC: Do not just give the answer. Deconstruct the solution into a clear, numbered logical path. Explain the reasoning and formulas for every step.";
    const userPrompt = `"${calculation}"`;

    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 3000, stream: true })
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
              let cleanChunk = data.response;
              if (cleanChunk) res.write(cleanChunk);
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
  const taskId = req.query.taskId;
  console.log(`[COMPRESS START] Demande de compression initiée. TaskID: ${taskId}`);
  try {
    if (taskId) tasks.set(taskId, { step: 'kòmanse' });
    const buffer = await getRawBody(req, taskId);
    console.log(`[COMPRESS RAW] Fichier d'entrée récupéré. Taille: ${buffer.length} octets`);
    if (buffer.length === 0) {
      console.error('[COMPRESS ERROR] Échec : Aucun contenu');
      return res.status(400).json({ error: 'Pa gen done fichye' });
    }
    const isVideo = req.query.type === 'video';
    if (isVideo && buffer.length > 52428800) {
      console.error(`[COMPRESS ERROR] Échec : Fichier vidéo trop volumineux (${buffer.length} octets)`);
      return res.status(400).json({ error: 'Videyo sa a twò gwo' });
    }
    
    let origFilename = req.query.filename || req.headers['x-file-name'] || '';
    console.log(`[COMPRESS FILENAME] Nom brut reçu: "${origFilename}"`);

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
    console.log(`[COMPRESS TARGET] Nom cible final structuré: "${finalRequestedName}"`);
    
    if (taskId) tasks.set(taskId, { step: 'telechargement' });
    const sourceExt = isVideo ? 'mp4' : 'png';
    const sourceMime = isVideo ? 'video/mp4' : 'image/png';
    let sourceUploadName = origFilename || sourceExt;
    const sourceUrlRaw = await saveEphemeral(buffer, sourceMime, sourceUploadName);
    const sourceUrl = encodeURI(sourceUrlRaw);
    console.log(`[COMPRESS URL] Téléversement éphémère effectué: ${sourceUrl}`);
    
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
            video_codec: "x264",
            crf: 32,
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

    const jobPayloadSimple = {
      tasks: {
        "import-1": { operation: "import/url", url: sourceUrl },
        "task-1": { 
          operation: "convert", 
          input: "import-1", 
          output_format: outFormat
        },
        "export-1": { operation: "export/url", input: "task-1" }
      }
    };

    const validKeys = CLOUDCONVERT_KEYS.filter(k => typeof k === 'string' && k.trim().length > 0);
    console.log(`[COMPRESS API KEYS] Clés CloudConvert actives: ${validKeys.length}`);
    if (validKeys.length === 0) throw new Error("Aucune clé API CloudConvert valide");

    let exportUrl = null;
    let jobSuccess = false;

    for (let keyIdx = 0; keyIdx < validKeys.length; keyIdx++) {
      const key = validKeys[keyIdx];
      const obscuredKey = key.substring(0, 15) + '...';
      console.log(`[COMPRESS ATTEMPT] Clé [${keyIdx + 1}/${validKeys.length}]: ${obscuredKey}`);
      
      const payloadsToTry = [jobPayloadWithParams, jobPayloadSimple];
      
      for (let pIdx = 0; pIdx < payloadsToTry.length; pIdx++) {
        const payload = payloadsToTry[pIdx];
        const isFallbackPayload = pIdx === 1;
        console.log(`[COMPRESS PAYLOAD] Lancement avec profil: ${isFallbackPayload ? 'REPLI' : 'OPTIMISÉ'}`);
        
        try {
          const ccRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${key}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });
          
          if (!ccRes.ok) {
            const errBody = await ccRes.text();
            console.warn(`[COMPRESS CC WARN] Échec de l'init du job. Statut: ${ccRes.status}, Message: ${errBody}`);
            continue;
          }
          
          const jobData = await ccRes.json();
          const jobId = jobData.data.id;
          console.log(`[COMPRESS CC JOB] Job créé avec succès. ID: ${jobId}`);
          
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
              console.warn(`[COMPRESS CC STATUS WARN] Erreur de récupération. Statut: ${checkRes.status} (Essai ${fetchFailedCount}/3)`);
              if (fetchFailedCount > 3) {
                jobError = true;
                break;
              }
              continue;
            }
            fetchFailedCount = 0;
            const checkData = await checkRes.json();
            const status = checkData.data.status;
            
            const taskProgress = checkData.data.tasks || [];
            taskProgress.forEach(t => {
              if (t.operation || t.status) {
                console.log(`[COMPRESS CC STEP LOG] Tâche: ${t.operation || 'convert'}, Statut: ${t.status}, Avancement: ${t.percent || 0}%`);
              }
            });

            if (status === 'finished') {
              finished = true;
              const exportTask = checkData.data.tasks.find(t => t.name === 'export-1');
              if (exportTask && exportTask.result && exportTask.result.files && exportTask.result.files.length > 0) {
                exportUrl = exportTask.result.files[0].url;
                jobSuccess = true;
                console.log(`[COMPRESS CC SUCCESS] Job achevé. Fichier de sortie: ${exportUrl}`);
              } else {
                console.error(`[COMPRESS CC ERROR] Job fini mais aucune donnée d'exportation.`);
                jobError = true;
              }
            } else if (status === 'error') {
              const failedSubTask = checkData.data.tasks.find(t => t.status === 'failed' || t.status === 'error');
              const failedMsg = failedSubTask ? failedSubTask.message : 'Inconnu';
              console.error(`[COMPRESS CC FAIL DETECTED] CloudConvert a renvoyé une erreur: ${failedMsg}`);
              jobError = true;
            }
          }
          if (jobSuccess) break;
        } catch (e) {
          console.error(`[COMPRESS INTERNAL EXCEPTION] Échec critique durant l'appel:`, e);
          continue;
        }
      }
      if (jobSuccess) break;
    }

    if (!jobSuccess || !exportUrl) {
      console.error('[COMPRESS OVERALL ERROR] Toutes les clés et tous les profils ont échoué.');
      throw new Error("Echek jeneral konpresyon");
    }
    
    if (taskId) tasks.set(taskId, { step: 'sovgade' });
    console.log(`[COMPRESS DOWNLOAD] Téléchargement du fichier final compressé... URL: ${exportUrl}`);
    const dlRes = await fetch(exportUrl);
    if (!dlRes.ok) throw new Error("Echek telechajman");
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    console.log(`[COMPRESS DOWNLOAD SUCCESS] Fichier fini récupéré. Taille: ${dlBuf.length} octets`);
    
    const finalMime = isVideo ? 'video/mp4' : 'image/jpeg';
    const finalUrl = await saveEphemeral(dlBuf, finalMime, finalRequestedName);
    console.log(`[COMPRESS FINISHED] Traitement de compression finalisé. Lien public: ${finalUrl}`);
    
    if (taskId) tasks.set(taskId, { step: 'fini', url: finalUrl });
    res.json({ url: finalUrl });
  } catch (e) {
    console.error('[COMPRESS CATCH EXCEPTION] Exception attrapée:', e);
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
          const url = await saveEphemeral(outBuf, 'image/png', 'png');
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
            urls.push(await saveEphemeral(outBuf, 'image/png', 'png'));
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
  console.log(`[UPLOAD START] Demande d'upload brute reçue. TaskID: ${taskId}`);
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
    const url = await saveEphemeral(fileBuffer, 'application/pdf', 'pdf');
    if (taskId) tasks.set(taskId, { step: 'fini', url });
    console.log(`[UPLOAD SUCCESS] Fichier enregistré via upload sous l'URL: ${url}`);
    res.json({ url });
  } catch (e) {
    console.error('[UPLOAD ERROR] Échec upload brute:', e);
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
  console.log(`[IMAGES-TO-PDF] Nouvelle demande de génération PDF. TaskID: ${taskId}`);
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

    const validKeys = CLOUDCONVERT_KEYS.filter(k => typeof k === 'string' && k.trim().length > 0);
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
        console.log(`[IMAGES-TO-PDF CC JOB] Job démarré. ID: ${jobId}`);
        
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
    
    const finalUrl = await saveEphemeral(dlBuf, 'application/pdf', 'tfsip-document.pdf');
    
    if (taskId) tasks.set(taskId, { step: 'fini', url: finalUrl });
    console.log(`[IMAGES-TO-PDF SUCCESS] PDF complet généré et disponible à l'adresse: ${finalUrl}`);
    res.json({ url: finalUrl });
  } catch (error) {
    console.error('[IMAGES-TO-PDF ERROR] Échec lors de la création du document PDF:', error);
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
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const tfid = `TF-${randomNum}`;
    const key = `${tfid}/${filename}`;
    await s3.send(new PutObjectCommand({ Bucket: 'tout', Key: key, Body: buffer, ContentType: req.headers['content-type'] || 'application/octet-stream' }));
    const serverUrl = `https://server.tout.adamdh7.org/${key}`;
    if (taskId) tasks.set(taskId, { step: 'fini', url: serverUrl });
    res.send(serverUrl);
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

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL UNHANDLED REJECTION] Raison:', reason);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER START] Tout est démarré sur le port ${PORT}`);
});
