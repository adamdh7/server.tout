require('dotenv').config();
const express = require('express');
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
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiNWU4YTUwZTVmODczNWI3Y2RiMTczOTcyYTlmODFiMmQ4NGY5YzU4NmVmOGU4MWNiOTkwNWNjYWQ4ZGI0YWFmNTA0YjA5ZjkwZWNiMjg0N2UiLCJpYXQiOjE3ODI4NTExNTUuMzE5ODY1LCJuYmYiOjE3ODI4NTExNTUuMzE5ODY2LCJleHAiOjQ5Mzg1MjQ3NTUuMzE1NTQ2LCJzdWIiOiI3NjE1ODg4NCIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ1c2VyLndyaXRlIiwidGFzay5yZWFkIiwidGFzay53cml0ZSIsIndlYmhvb2sucmVhZCIsIndlYmhvb2sud3JpdGUiLCJwcmVzZXQucmVhZCIsInByZXNldC53cml0ZSJdfQ.J9UI0QSs4nFVlyfIXEBal71tvFL4Sd8P-oVlvtQKsy1z-8AB_E6MpKQVEOP39MBogTaawJVyrJTu4BYq2tYBYWuH5AsHXSF6vhNO2gwafvL0yoPXmV6jbAHT9gb0u9rn6K1qskPaqf-Aqr278uQqzDqAEk-Ws1hnbhAPr-4RFjd0pXWfFNn8Vy-lPtgJzXcYbE7i-zpf6g1Vu5YUbFhtkwDOmG97POhqSD9oqb284iX_iQMwlwLPA2A-bcRzmBuUrU1WgeFdYNubr-4pDH8b-p0Lx532CFcYNo9w2yeDmdmSaQyoykA-kyW5pffV6k5TRTvOyklNPqzWfJ4MILOK8iqBNbhpwsn9SFLrEuy6vsfGop0YBnnjnmlQ6SQsfiVhBje8_FcqHADOyTZrSWRtzsWpHx4Nkv1QosUMbHKAQ59zEORz2yim_CKkZkH6tcE8vcrG4TosEFDd6zE7UFeE-36YSLRZvQ8YMgxSKQ2UdYuaY0TgMZUM-Eg3UMUprRMUjMa8YuX49DteBm4YNP9oyKjpyqLAKnl8_M3ibUWnV0iV9zpe9qsZWbE8VEJ37lI90fhP-pLwQX-RV2bkS5J8dGqmYgmU4afzc4RJiiV85YTBOA28BaGoPobDB_mPSliJsZeEdNn8HtSt10cglcU9PasWJF3MdCnmKNzZuh4d6o4'
];

const TRUSTED_BROWSER_HOSTS = new Set(['tout.adamdh7.org', 'server.tout.adamdh7.org']);

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

async function uploadToBref(buffer, mimeType, filenameExt) {
  const boundary = '----BrefUploadBoundary' + Date.now().toString(16);
  let filename = filenameExt;
  if (!filename.includes('.')) {
    filename = `file_${Date.now()}.${filenameExt}`;
  }
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(head, 'utf8'),
    buffer,
    Buffer.from(tail, 'utf8')
  ]);

  const res = await fetch('https://bref.adamdh7.org/upload', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString()
    },
    body: body
  });

  if (!res.ok) {
    throw new Error('Echek sou Bref');
  }

  const data = await res.json();
  return data.url;
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

async function processAndUploadImage(prompt) {
  try {
    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, num_steps: 4 })
    });
    if (!aiRaw.ok) return '';
    const aiResponse = await aiRaw.json();
    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) return '';
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    return await uploadToBref(Buffer.from(bytes), 'image/png', 'png');
  } catch (e) {
    return '';
  }
}

async function performSearch(query) {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: process.env.TAVILY_KEY, query: query, search_depth: 'basic', max_results: 5, include_images: true })
    });
    const data = await res.json();
    let text = '';
    let foundImages = [];
    let foundLinks = [];
    if (data.images && data.images.length > 0) foundImages = data.images;
    if (!data.results) return { context: 'Nou pa jwenn anyen.', images: [], links: [] };
    for (const r of data.results) {
      text += 'URL: ' + (r.url || '') + '\nInfo: ' + r.content + '\n\n';
      if (r.url) foundLinks.push(r.url);
    }
    return { context: text.substring(0, 4000), images: foundImages, links: foundLinks };
  } catch (e) {
    return { context: 'Erè rechèch.', images: [], links: [] };
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

app.get('/Tout.png', (req, res) => {
  res.redirect(ICON_URL);
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
  if (!userMessage) return res.status(400).json({ error: 'Ou bay yon mesaj vid' });

  try {
    const database = await getDb();
    const messagesCollection = database.collection('messages');
    const attachmentsCollection = database.collection('attachments');
    const userMsgId = Date.now().toString() + Math.random().toString();
    await messagesCollection.insertOne({
      id: userMsgId, role: 'user', content: userMessage, session_id: sess, timestamp: new Date().toISOString()
    });

    const recentMessages = await messagesCollection.find({ session_id: sess }).sort({ timestamp: -1 }).limit(30).toArray();
    
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

    const systemPrompt = "Tu es Asistan, une IA experte et concise. Ne fais pas de longues phrases inutiles. Pour chercher sur internet, ecris EXACTEMENT [SEARCH: ta requete]. Pour generer une image, ecris EXACTEMENT [IMAGE: description en anglais].";

    const aiRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
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
      if (str === undefined || str === null || str === '') return;
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
        const keepAliveImg = setInterval(() => { try { res.write(JSON.stringify({ type: 'final', content: '• ' }) + '\n'); } catch (e) {} }, 1000);
        const imgUrl = await processAndUploadImage(prompt);
        clearInterval(keepAliveImg);
        const dbTag = `[IMAGES: ${imageIndex}]`;
        if (imgUrl) attachmentsToSave.push({ placeholder: dbTag, url: `\n\n${imgUrl}\n\n` });
        sendToClient(imgUrl ? `\n\n${imgUrl}\n\n` : '');
      } else if (tSrcMatch) {
        const query = tSrcMatch[1].trim();
        const keepAliveSrc = setInterval(() => { try { res.write(JSON.stringify({ type: 'final', content: '• ' }) + '\n'); } catch (e) {} }, 1000);
        const searchRes = await performSearch(query);
        clearInterval(keepAliveSrc);
        let searchResultsText = 'Requete:\n' + query + '\nResultats:\n' + searchRes.context + '\n\n';
        if (searchRes.images && searchRes.images.length > 0) {
          allImages = allImages.concat(searchRes.images);
          searchResultsText += 'Images URLs:\n' + searchRes.images.join('\n') + '\n\n';
          searchRes.images.forEach(imgUrl => {
            searchImageIndex++;
            const dbTag = `[IMAGES: SEARCH_${searchImageIndex}]`;
            attachmentsToSave.push({ placeholder: dbTag, url: imgUrl });
          });
        }
        const finalSystemPrompt = "Tu es Asistan. Reponds de maniere concise et naturelle en utilisant UNIQUEMENT ces resultats de recherche.\n\nResultats:\n" + searchResultsText;
        const contextLimit = context.slice(-6);

        try {
          const aiFinalRaw = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`, {
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
                    let textChunkF = "";
                    if (dataFinal.response !== undefined) textChunkF = String(dataFinal.response);
                    else if (dataFinal.choices && dataFinal.choices[0] && dataFinal.choices[0].delta && dataFinal.choices[0].delta.content !== undefined) textChunkF = String(dataFinal.choices[0].delta.content);
                    for (const c of textChunkF) await processChar(c);
                  } catch (e) {}
                }
              }
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
      if (char === undefined || char === null || char === '') return;
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
                  let textChunk = "";
                  if (data.response !== undefined) textChunk = String(data.response);
                  else if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content !== undefined) textChunk = String(data.choices[0].delta.content);
                  for (const char of textChunk) await processChar(char);
                } catch (e) {}
              }
            }
          }
        } catch (e) {
          const errMsg = "Gen yon erè ki fèt nan kouran an.";
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

      if (attachmentsToSave.length > 0) {
        for (const att of attachmentsToSave) {
          await attachmentsCollection.insertOne({ message_id: asstMsgId, placeholder: att.placeholder, url: att.url });
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
    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) throw new Error("Erè jenerasyon.");
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const url = await uploadToBref(Buffer.from(bytes), 'image/png', 'png');
    res.json({ url });
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
  if (!calculation) return res.status(400).json({ error: 'Ou pa bay okenn ekspresyon' });
  try {
    const systemPrompt = "Tu es Asistan, expert en mathematiques. Donne le resultat et explique les etapes de calcul clairement et brievement.";
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
            let textChunk = "";
            if (data.response !== undefined) textChunk = String(data.response);
            else if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content !== undefined) textChunk = String(data.choices[0].delta.content);
            if (textChunk) res.write(textChunk);
          } catch (e) {}
        }
      }
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
    const url = await uploadToBref(Buffer.from(arrayBuf), 'image/png', 'png');
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
    if (buffer.length === 0) return res.status(400).json({ error: 'Pa gen done fichye' });
    const isVideo = req.query.type === 'video';
    if (isVideo && buffer.length > 52428800) return res.status(400).json({ error: 'Videyo sa a twò gwo' });
    
    let origFilename = req.query.filename || req.headers['x-file-name'] || req.headers['x-filename'] || req.headers['file-name'] || '';
    if (!origFilename && req.headers['content-disposition']) {
      const cd = req.headers['content-disposition'];
      const match = cd.match(/filename\*?=["']?(?:UTF-8'')?([^"';\r\n]+)["']?/i);
      if (match) origFilename = match[1];
    }
    if (origFilename) {
      try { origFilename = decodeURIComponent(origFilename.replace(/\+/g, '%20')); } catch(e) {}
      origFilename = origFilename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      if (!origFilename.replace(/_/g, '').trim()) origFilename = `file_${Date.now()}.${isVideo ? 'mp4' : 'png'}`;
    } else {
      origFilename = `file_${Date.now()}.${isVideo ? 'mp4' : 'png'}`;
    }

    let outFormat = isVideo ? 'mp4' : 'jpg';
    const parsed = path.parse(origFilename);
    const safeName = parsed.name || "compressed";
    let finalRequestedName = `${safeName}.${outFormat}`;
    
    if (taskId) tasks.set(taskId, { step: 'telechargement' });
    const sourceExt = isVideo ? 'mp4' : 'png';
    const sourceMime = isVideo ? 'video/mp4' : 'image/png';
    const sourceUploadName = origFilename || sourceExt;
    const sourceUrl = encodeURI(await uploadToBref(buffer, sourceMime, sourceUploadName));
    
    if (taskId) tasks.set(taskId, { step: 'konpresyon' });
    
    let jobPayload = {
      tasks: {
        "import-1": { operation: "import/url", url: sourceUrl },
        "task-1": { 
          operation: "convert", 
          input: "import-1", 
          output_format: outFormat,
          ...(isVideo ? { video_codec: "h264", crf: 30, preset: "medium", audio_codec: "aac", audio_bitrate: "64k", width: 1280, height: 720, fit: "max" } : { quality: 40 })
        },
        "export-1": { operation: "export/url", input: "task-1" }
      }
    };

    const validKeys = CLOUDCONVERT_KEYS.filter(k => typeof k === 'string' && k.trim().length > 0);
    if (validKeys.length === 0) throw new Error("Aucune clé API CloudConvert valide");

    let exportUrl = null;
    let jobSuccess = false;
    const key = validKeys[0]; 

    const ccRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload)
    });
    
    if (!ccRes.ok) throw new Error("Echek inisyalizasyon API");
    const jobData = await ccRes.json();
    const jobId = jobData.data.id;
    
    let finished = false;
    let jobError = false;
    while (!finished && !jobError) {
      await new Promise(r => setTimeout(r, 2000));
      const checkRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, { headers: { "Authorization": `Bearer ${key}` } });
      if (!checkRes.ok) { jobError = true; break; }
      const checkData = await checkRes.json();
      const status = checkData.data.status;
      if (status === 'finished') {
        finished = true;
        const exportTask = checkData.data.tasks.find(t => t.name === 'export-1');
        if (exportTask && exportTask.result && exportTask.result.files && exportTask.result.files.length > 0) {
          exportUrl = exportTask.result.files[0].url;
          jobSuccess = true;
        } else jobError = true;
      } else if (status === 'error') jobError = true;
    }

    if (!jobSuccess || !exportUrl) throw new Error("Echek konpresyon");
    
    if (taskId) tasks.set(taskId, { step: 'sovgade' });
    const dlRes = await fetch(exportUrl);
    if (!dlRes.ok) throw new Error("Echek telechajman");
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    
    const finalMime = isVideo ? 'video/mp4' : 'image/jpeg';
    const finalUrl = await uploadToBref(dlBuf, finalMime, finalRequestedName);
    
    if (taskId) tasks.set(taskId, { step: 'fini', url: finalUrl });
    res.json({ url: finalUrl });
  } catch (e) {
    if (taskId) tasks.set(taskId, { step: 'erè' });
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.post('/resize', requireAuth, async (req, res) => {
  if (!FFMPEG_AVAILABLE) return res.status(501).json({ error: 'Ffmpeg pa disponib' });
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
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e) {} }, 60000);

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
          const url = await uploadToBref(outBuf, 'image/png', 'png');
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
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch(e) {} }, 60000);

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
            urls.push(await uploadToBref(outBuf, 'image/png', 'png'));
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
            if (contentEnd !== -1) fileBuffer = buffer.subarray(contentStart, contentEnd);
            else fileBuffer = buffer.subarray(contentStart);
          }
        }
      }
    }
    if (taskId) tasks.set(taskId, { step: 'sovgade' });
    const url = await uploadToBref(fileBuffer, 'application/pdf', 'pdf');
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
    tasksPayload["merge-1"] = { operation: "merge", input: mergeInputs, output_format: "pdf" };
    tasksPayload["export-1"] = { operation: "export/url", input: "merge-1" };

    const validKeys = CLOUDCONVERT_KEYS.filter(k => typeof k === 'string' && k.trim().length > 0);
    if (validKeys.length === 0) throw new Error("Echek");

    let exportUrl = null;
    let jobSuccess = false;
    const key = validKeys[0];

    const ccRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: tasksPayload })
    });
    
    if (!ccRes.ok) throw new Error("Echek");
    const jobData = await ccRes.json();
    const jobId = jobData.data.id;
    
    let finished = false;
    let jobError = false;
    while (!finished && !jobError) {
      await new Promise(r => setTimeout(r, 2000));
      const checkRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, { headers: { "Authorization": `Bearer ${key}` } });
      if (!checkRes.ok) { jobError = true; break; }
      const checkData = await checkRes.json();
      const status = checkData.data.status;
      if (status === 'finished') {
        finished = true;
        const exportTask = checkData.data.tasks.find(t => t.name === 'export-1');
        exportUrl = exportTask.result.files[0].url;
        jobSuccess = true;
      } else if (status === 'error') jobError = true;
    }
    
    if (!jobSuccess || !exportUrl) throw new Error("Echek");
    
    if (taskId) tasks.set(taskId, { step: 'sovgade' });
    const dlRes = await fetch(exportUrl);
    const dlBuf = Buffer.from(await dlRes.arrayBuffer());
    const finalUrl = await uploadToBref(dlBuf, 'application/pdf', 'pdf');
    
    if (taskId) tasks.set(taskId, { step: 'fini', url: finalUrl });
    res.json({ url: finalUrl });
  } catch (error) {
    if (taskId) tasks.set(taskId, { step: 'erè' });
    res.status(500).json({ error: "Sistèm sa a pa disponib kounye a." });
  }
});

app.use((req, res) => { res.status(404).send('Nou pa jwenn sa w ap chèche a'); });

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

app.listen(PORT, '0.0.0.0', () => {});
