const express = require("express");
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { MongoClient } = require("mongodb");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { Readable } = require("stream");

const s3 = new S3Client({
  region: "auto",
  endpoint: "https://49bdcdc6f29c08eda8bb7bcb8db9e27f.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "0b4381f979d1a203e25454e46ca21451",
    secretAccessKey: "f91be74d39cdc8861e9c450cc0c0443c103f60d33ad6e6ed6602d9c41294f2bf"
  }
});

const mongoClient = new MongoClient("mongodb+srv://adamdh7:Tchengy1@adamdh7.hlvtcf9.mongodb.net/?appName=adamdh7");
let db;

async function getDb() {
  if (!db) {
    await mongoClient.connect();
    db = mongoClient.db("chatdb");
  }
  return db;
}

async function processAndUploadImage(prompt) {
  try {
    await new Promise(resolve => setTimeout(resolve, 7));
    const aiRaw = await fetch("https://api.cloudflare.com/client/v4/accounts/49bdcdc6f29c08eda8bb7bcb8db9e27f/ai/run/@cf/black-forest-labs/flux-1-schnell", {
      method: "POST",
      headers: {
        "Authorization": "Bearer cfut_UZIu1b9rh4R44PlKSJAHs4JhRKq0h2d7lWjKCrcie67bcd42",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt: prompt, num_steps: 4 })
    });
    const aiResponse = await aiRaw.json();
    await new Promise(resolve => setTimeout(resolve, 7));
    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) return "";
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const filename = `TF-${randomNum}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: "tout",
      Key: filename,
      Body: bytes,
      ContentType: "image/png"
    }));
    await new Promise(resolve => setTimeout(resolve, 7));
    return `https://server.tout.adamdh7.org/${filename}`;
  } catch (error) {
    return "";
  }
}

async function performSearch(query) {
  try {
    await new Promise(resolve => setTimeout(resolve, 7));
    const TAVILY_KEY = "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";
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: TAVILY_KEY, query: query, search_depth: "basic", max_results: 5, include_images: true })
    });
    await new Promise(resolve => setTimeout(resolve, 7));
    const data = await res.json();
    let text = "";
    let foundImages = [];
    let foundLinks = [];
    if (data.images && data.images.length > 0) {
      foundImages = data.images;
    }
    if (!data.results) {
      return { context: "No results found.", images: [], links: [] };
    }
    for (const r of data.results) {
      text += "URL: " + (r.url || "Lien indisponible") + "\nContenu: " + r.content + "\n\n";
      if (r.url) {
        foundLinks.push(r.url);
      }
    }
    return { context: text.substring(0, 4000), images: foundImages, links: foundLinks };
  } catch (e) {
    return { context: "Error during the search process.", images: [], links: [] };
  }
}

const ICON_URL = "https://tout.adamdh7.org/Tout.png";

const FFMPEG_AVAILABLE = (() => {
  try {
    const result = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
})();

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cleanRequestPath(reqPath) {
  return safeDecode(reqPath || "").replace(/^\/+/, "");
}

function contentTypeFromName(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".m4v": "video/x-m4v",
    ".3gp": "video/3gpp",
    ".ts": "video/mp2t",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".json": "application/json",
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript"
  };
  return map[ext] || "application/octet-stream";
}

function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(ext);
}

function isAudioFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return [".mp3", ".wav", ".ogg", ".m4a"].includes(ext);
}

function isPdfFile(filename) {
  return path.extname(filename).toLowerCase() === ".pdf";
}

function isDirectVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return [".mp4", ".webm", ".m4v"].includes(ext);
}

function needsTranscode(filename) {
  const ext = path.extname(filename).toLowerCase();
  return [".mov", ".mkv", ".avi", ".wmv", ".flv", ".3gp", ".ts", ".mpeg", ".mpg", ".m2ts"].includes(ext);
}

function getDisplayName(requestPath) {
  const clean = requestPath.replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);

  if (parts.length === 0) {
    return "Tout";
  }

  if (/^TF-/i.test(parts[0]) && parts[1]) {
    return path.basename(parts[1], path.extname(parts[1])).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Tout";
  }

  return path.basename(parts[parts.length - 1], path.extname(parts[parts.length - 1])) || "Tout";
}

function encodePathSegments(requestPath) {
  return requestPath.split("/").map(part => encodeURIComponent(part)).join("/");
}

function buildMediaUrl(requestPath, mode) {
  return `/${encodePathSegments(requestPath)}?${mode}=1`;
}

function buildViewerHtml(title, mediaUrl, filename) {
  const safeTitle = String(title).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ext = path.extname(filename).toLowerCase();

  let mediaBlock = "";

  if (isImageFile(filename)) {
    mediaBlock = `<img src="${mediaUrl}" alt="${safeTitle}" style="display:block;max-width:100vw;max-height:100vh;width:auto;height:auto;object-fit:contain;" />`;
  } else if (isDirectVideoFile(filename) || needsTranscode(filename)) {
    mediaBlock = `<video src="${mediaUrl}" controls autoplay playsinline preload="metadata" style="display:block;max-width:100vw;max-height:100vh;width:auto;height:auto;object-fit:contain;background:#000;"></video>`;
  } else if (isAudioFile(filename)) {
    mediaBlock = `<audio src="${mediaUrl}" controls autoplay preload="metadata" style="display:block;max-width:min(92vw,900px);width:100%;height:auto;"></audio>`;
  } else if (isPdfFile(filename)) {
    mediaBlock = `<iframe src="${mediaUrl}" style="display:block;width:min(100vw,1200px);height:100vh;border:0;background:#000;"></iframe>`;
  } else {
    mediaBlock = `<a href="${mediaUrl}" style="color:#fff;font-family:Arial,sans-serif;word-break:break-all;text-decoration:none;font-size:18px;">${mediaUrl}</a>`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<link rel="icon" type="image/png" href="${ICON_URL}">
<link rel="shortcut icon" type="image/png" href="${ICON_URL}">
<link rel="apple-touch-icon" href="${ICON_URL}">
<meta name="theme-color" content="#000000">
<style>
html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
}
body {
    display: flex;
    align-items: center;
    justify-content: center;
}
#wrap {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
}
#wrap > * {
    max-width: 100vw;
    max-height: 100vh;
}
</style>
</head>
<body>
<div id="wrap">
${mediaBlock}
</div>
</body>
</html>`;
}

function sendUnknown(req, res) {
  if (req.headers.accept && req.headers.accept.includes("text/html")) {
    res.status(404).send("<!doctype html><html lang=\"fr\"><head><meta charset=\"UTF-8\"><title>Inconnu</title></head><body style=\"background:#000;color:#fff;text-align:center;padding:50px;font-family:sans-serif;\"><h1>Inconnu</h1><script>setTimeout(function(){ window.close(); window.history.back(); }, 1500);</script></body></html>");
  } else {
    res.status(404).send("Inconnu");
  }
}

async function serveRemoteRawFile(req, res, remotePath, filename) {
  const key = remotePath;
  try {
    let commandParams = {
      Bucket: "tout",
      Key: key
    };
    if (req.headers.range) {
      commandParams.Range = req.headers.range;
    }
    const command = new GetObjectCommand(commandParams);
    const s3Response = await s3.send(command);
    const contentType = s3Response.ContentType || contentTypeFromName(filename);
    const contentLength = s3Response.ContentLength;
    const acceptRanges = s3Response.AcceptRanges;
    const contentRange = s3Response.ContentRange;
    res.status(!!req.headers.range && contentRange ? 206 : 200);
    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
    if (contentRange) res.setHeader("Content-Range", contentRange);
    if (!s3Response.Body) {
      return res.end();
    }
    s3Response.Body.pipe(res);
  } catch (error) {
    return sendUnknown(req, res);
  }
}

async function serveRemoteVideoTranscode(req, res, remotePath) {
  const key = remotePath;
  try {
    const command = new GetObjectCommand({
      Bucket: "tout",
      Key: key
    });
    const s3Response = await s3.send(command);
    if (!s3Response.Body) {
      return sendUnknown(req, res);
    }
    const inputStream = s3Response.Body;
    transcodeVideoStreamToMp4(inputStream, res);
  } catch (error) {
    return sendUnknown(req, res);
  }
}

function transcodeVideoStreamToMp4(inputStream, res) {
  if (!FFMPEG_AVAILABLE) {
    res.status(415).type("text/plain").send("ffmpeg manquant sur le serveur");
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "none");

  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-i", "pipe:0",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1"
  ], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  const abort = () => {
    try {
      ffmpeg.kill("SIGKILL");
    } catch {}
  };

  reqLikeCleanup(inputStream, ffmpeg, res, abort);

  inputStream.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  let stderr = "";
  ffmpeg.stderr.on("data", chunk => {
    stderr += chunk.toString();
  });

  ffmpeg.on("close", code => {
    if (code !== 0 && !res.headersSent) {
      res.status(415).type("text/plain").send(stderr || "Impossible de convertir cette vidéo");
    } else if (code !== 0 && !res.writableEnded) {
      res.end();
    }
  });

  ffmpeg.on("error", () => {
    if (!res.headersSent) {
      res.status(500).type("text/plain").send("Erreur ffmpeg");
    }
  });
}

function reqLikeCleanup(inputStream, ffmpeg, res, abort) {
  const stop = () => {
    abort();
    try {
      inputStream.destroy();
    } catch {}
    try {
      ffmpeg.stdin.destroy();
    } catch {}
  };

  res.on("close", stop);
  res.on("finish", stop);
  inputStream.on("error", stop);
}

async function resourceExists(requestPath) {
  const key = requestPath;
  try {
    const command = new HeadObjectCommand({
      Bucket: "tout",
      Key: key
    });
    await s3.send(command);
    return true;
  } catch {
    return false;
  }
}

function servePage(req, res, requestPath, filename) {
  const displayName = getDisplayName(requestPath);
  const mediaMode = needsTranscode(filename) && FFMPEG_AVAILABLE ? "transcode" : "raw";
  const mediaUrl = buildMediaUrl(requestPath, mediaMode);
  return res.status(200).type("html").send(buildViewerHtml(displayName, mediaUrl, filename));
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const corsAndOptions = (req, res, next) => {
  const origin = req.headers.origin;
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, Origin, X-Requested-With, Accept",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type",
  };
  res.set(corsHeaders);
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
};

const requireAuth = (req, res, next) => {
  const origin = req.headers.origin;
  const userAgent = req.headers["user-agent"] || "";
  const authHeader = req.headers.authorization;
  const isBrowser = userAgent.includes("Mozilla") || req.headers["sec-fetch-mode"];
  const originHost = origin ? new URL(origin).hostname : "";
  const isAllowedOrigin = originHost === "adamdh7.org" || originHost.endsWith(".adamdh7.org");
  let authorized = false;
  if (isAllowedOrigin && isBrowser) {
    authorized = true;
  }
  if (authHeader === "Bearer adamdh7" || authHeader === "adamdh7") {
    authorized = true;
  }
  if (!authorized) {
    return res.status(403).send("Forbidden: Invalid origin or missing token");
  }
  next();
};

const mediaAuth = (req, res, next) => {
  const origin = req.headers.origin;
  const userAgent = req.headers["user-agent"] || "";
  const authHeader = req.headers.authorization;
  const isBrowserDoc = req.headers.accept && req.headers.accept.includes("text/html") && !["image", "video", "audio"].includes(req.headers["sec-fetch-dest"] || "");
  const originHost = origin ? new URL(origin).hostname : "";
  const isToutOrigin = originHost === "tout.adamdh7.org" || originHost.endsWith(".adamdh7.org");
  const isBrowser = userAgent.includes("Mozilla") || !!req.headers["sec-fetch-mode"];
  let authorized = false;
  if (isBrowserDoc) {
    if (isToutOrigin || !origin) {
      authorized = true;
    }
  } else if (isBrowser && isToutOrigin) {
    authorized = true;
  }
  if (authHeader === "Bearer adamdh7" || authHeader === "adamdh7") {
    authorized = true;
  }
  if (!authorized) {
    return res.status(403).send("Forbidden: Invalid origin or missing token");
  }
  next();
};

app.use(corsAndOptions);

app.get("/ai", requireAuth, async (req, res) => {
  const sess = req.query.session_id || "global";
  try {
    const database = await getDb();
    const messagesCollection = database.collection("messages");
    const attachmentsCollection = database.collection("attachments");
    
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
          let currentContent = messagesMap.get(att.message_id).content;
          messagesMap.get(att.message_id).content = currentContent.split(att.placeholder).join(att.url);
        }
      }
    }
    res.json({ messages: Array.from(messagesMap.values()) });
  } catch (err) {
    res.status(500).json({ error: "Database Error", details: err.message });
  }
});

app.post("/ai", requireAuth, async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff"
  });
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  if (res.socket) res.socket.setNoDelay(true);

  let body = req.body;
  const userMessage = body.message?.trim();
  const sess = body.session_id || "global";
  if (!userMessage) {
    res.status(400).json({ error: "Empty message provided" });
    return;
  }
  
  try {
    const database = await getDb();
    const messagesCollection = database.collection("messages");
    const attachmentsCollection = database.collection("attachments");
    const userMsgId = Date.now().toString() + Math.random().toString();
    
    await messagesCollection.insertOne({
      id: userMsgId,
      role: "user",
      content: userMessage,
      session_id: sess,
      timestamp: new Date().toISOString()
    });
    await new Promise(resolve => setTimeout(resolve, 7));
    
    const recentMessages = await messagesCollection.find({ session_id: sess }).sort({ timestamp: -1 }).limit(7).toArray();
    await new Promise(resolve => setTimeout(resolve, 7));
    const context = recentMessages ? recentMessages.reverse().map(m => ({ role: m.role, content: m.content })) : [];
    
    const systemPrompt = "You are Adam_D'H7. If unsure, lacking info, or needing current data, output EXACTLY [SEARCH: query]. If the user asks for an image or it improves your explanation, output EXACTLY [IMAGE: english description]. Do not guess.";
    
    const aiRaw = await fetch("https://api.cloudflare.com/client/v4/accounts/49bdcdc6f29c08eda8bb7bcb8db9e27f/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      method: "POST",
      headers: {
        "Authorization": "Bearer cfut_UZIu1b9rh4R44PlKSJAHs4JhRKq0h2d7lWjKCrcie67bcd42",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          ...context
        ],
        max_tokens: 3000,
        stream: true
      })
    });

    let frontendMessage = "";
    let dbMessage = "";
    let attachmentsToSave = [];
    let imageIndex = 0;
    let searchImageIndex = 0;
    let allImages = [];
    let isBuffering = false;
    let buffer = "";

    async function processChar(char) {
      if (!isBuffering) {
        if (char === "[") {
          isBuffering = true;
          buffer = "[";
        } else {
          res.write(JSON.stringify({ type: "final", content: char }) + "\n");
          frontendMessage += char;
          dbMessage += char;
        }
      } else {
        buffer += char;
        const tImg = "[IMAGE:";
        const tSrc = "[SEARCH:";
        if (char === "]") {
          isBuffering = false;
          if (buffer.startsWith(tImg)) {
            const prompt = buffer.substring(7, buffer.length - 1).trim();
            imageIndex++;
            await new Promise(resolve => setTimeout(resolve, 7));
            const keepAliveImg = setInterval(() => {
              try { res.write(JSON.stringify({ type: "final", content: "• " }) + "\n"); } catch (e) {}
            }, 1000);
            const imgUrl = await processAndUploadImage(prompt);
            clearInterval(keepAliveImg);
            const dbTag = `[IMAGES: ${imageIndex}]`;
            if (imgUrl) {
              attachmentsToSave.push({ placeholder: dbTag, url: `\n\n${imgUrl}\n\n` });
            }
            const replacement = imgUrl ? `\n\n${imgUrl}\n\n` : "";
            res.write(JSON.stringify({ type: "final", content: replacement }) + "\n");
            frontendMessage += replacement;
            dbMessage += dbTag;
          } else if (buffer.startsWith(tSrc)) {
            const query = buffer.substring(8, buffer.length - 1).trim();
            await new Promise(resolve => setTimeout(resolve, 7));
            const keepAliveSrc = setInterval(() => {
              try { res.write(JSON.stringify({ type: "final", content: "• " }) + "\n"); } catch (e) {}
            }, 1000);
            const searchRes = await performSearch(query);
            clearInterval(keepAliveSrc);
            let searchResultsText = "Query:\n" + query + "\nResults:\n" + searchRes.context + "\n\n";
            if (searchRes.images && searchRes.images.length > 0) {
              allImages = allImages.concat(searchRes.images);
              searchResultsText += "Images URLs:\n" + searchRes.images.join("\n") + "\n\n";
              searchRes.images.forEach(imgUrl => {
                searchImageIndex++;
                const dbTag = `[IMAGES: SEARCH_${searchImageIndex}]`;
                attachmentsToSave.push({ placeholder: dbTag, url: imgUrl });
              });
            }
            const finalSystemPrompt = "You are Adam_D'H7. Answer the user in their language. Synthesize a natural, direct, and conversational response using the provided search results. Respond strictly to the user's expectations. Do not include anything that was not requested. Answer only the specific prompt that triggered the search. Do not integrate elements that the user never asked for in their request.\n\nResults:\n" + searchResultsText;
            const contextLimit = context.slice(-6);
            
            try {
              const aiFinalRaw = await fetch("https://api.cloudflare.com/client/v4/accounts/49bdcdc6f29c08eda8bb7bcb8db9e27f/ai/run/@cf/meta/llama-3.1-8b-instruct", {
                method: "POST",
                headers: {
                  "Authorization": "Bearer cfut_UZIu1b9rh4R44PlKSJAHs4JhRKq0h2d7lWjKCrcie67bcd42",
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  messages: [
                    { role: "system", content: finalSystemPrompt },
                    ...contextLimit
                  ],
                  max_tokens: 3000,
                  stream: true
                })
              });
              const aiFinalStream = aiFinalRaw.body;
              if (aiFinalStream && aiFinalStream.getReader) {
                const readerFinal = aiFinalStream.getReader();
                const decoderFinal = new TextDecoder();
                let bufferFinal = "";
                while (true) {
                  const { done, value } = await readerFinal.read();
                  if (done) break;
                  bufferFinal += decoderFinal.decode(value, { stream: true });
                  const linesFinal = bufferFinal.split("\n");
                  bufferFinal = linesFinal.pop();
                  for (const lineFinal of linesFinal) {
                    const cleanLineFinal = lineFinal.trim();
                    if (cleanLineFinal.startsWith("data: ") && cleanLineFinal !== "data: [DONE]") {
                      try {
                        const dataFinal = JSON.parse(cleanLineFinal.slice(6));
                        if (dataFinal.response) {
                          for (const c of dataFinal.response) {
                            await processChar(c);
                          }
                        }
                      } catch(e) {}
                    }
                  }
                  await new Promise(resolve => setTimeout(resolve, 7));
                }
              }
            } catch (e) {}
          } else {
            res.write(JSON.stringify({ type: "final", content: buffer }) + "\n");
            frontendMessage += buffer;
            dbMessage += buffer;
          }
          buffer = "";
        } else {
          let pImg = tImg.startsWith(buffer);
          let pSrc = tSrc.startsWith(buffer);
          let iImg = buffer.startsWith(tImg);
          let iSrc = buffer.startsWith(tSrc);
          if (!pImg && !pSrc && !iImg && !iSrc) {
            isBuffering = false;
            res.write(JSON.stringify({ type: "final", content: buffer }) + "\n");
            frontendMessage += buffer;
            dbMessage += buffer;
            buffer = "";
          }
        }
      }
    }

    const aiResponseStream = aiRaw.body;
    if (aiResponseStream && aiResponseStream.getReader) {
      const reader = aiResponseStream.getReader();
      const decoder = new TextDecoder();
      let bufferMain = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bufferMain += decoder.decode(value, { stream: true });
          const lines = bufferMain.split("\n");
          bufferMain = lines.pop();
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.startsWith("data: ") && cleanLine !== "data: [DONE]") {
              try {
                const data = JSON.parse(cleanLine.slice(6));
                if (data.response) {
                  for (const char of data.response) {
                    await processChar(char);
                  }
                }
              } catch(e) {}
            }
          }
          await new Promise(resolve => setTimeout(resolve, 7));
        }
      } catch (e) {
        const errMsg = "Stream error occurred.";
        for (const char of errMsg) await processChar(char);
      }
    } else {
      const errMsg = "Sorry, I could not generate a response.";
      for (const char of errMsg) await processChar(char);
    }

    if (isBuffering) {
      res.write(JSON.stringify({ type: "final", content: buffer }) + "\n");
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
        role: "assistant",
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
  } catch (err) {
    res.end();
  }
});

app.post("/jerere", requireAuth, async (req, res) => {
  let body;
  try {
    body = req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  const prompt = body.prompt?.trim();
  if (!prompt) return res.status(400).json({ error: "No prompt provided" });
  
  try {
    const aiRaw = await fetch("https://api.cloudflare.com/client/v4/accounts/49bdcdc6f29c08eda8bb7bcb8db9e27f/ai/run/@cf/black-forest-labs/flux-1-schnell", {
      method: "POST",
      headers: {
        "Authorization": "Bearer cfut_UZIu1b9rh4R44PlKSJAHs4JhRKq0h2d7lWjKCrcie67bcd42",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt: prompt, num_steps: 4 })
    });
    const aiResponse = await aiRaw.json();
    await new Promise(resolve => setTimeout(resolve, 7));
    
    if (!aiResponse || !aiResponse.result || !aiResponse.result.image) {
      throw new Error("The AI did not return a valid image.");
    }
    const binaryString = atob(aiResponse.result.image);
    const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const filename = `TF-${randomNum}.png`;
    
    await s3.send(new PutObjectCommand({
      Bucket: "tout",
      Key: filename,
      Body: bytes,
      ContentType: "image/png"
    }));
    await new Promise(resolve => setTimeout(resolve, 7));
    
    const returnedUrl = `https://server.tout.adamdh7.org/${filename}`;
    res.json({ url: returnedUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/calcul", requireAuth, async (req, res) => {
  res.set({
    "Content-Type": "text/plain; charset=utf-8",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache, no-transform",
    "Pragma": "no-cache",
    "Expires": "0",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff"
  });
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  if (res.socket) res.socket.setNoDelay(true);
  
  let body;
  try {
    body = req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON format" });
  }
  const calculation = body.calculation?.trim();
  if (!calculation) {
    return res.status(400).json({ error: "No expression provided" });
  }
  try {
    const systemPrompt = "You are Adam_D'H7, an expert polymath specializing in Mathematics, Physics, and all scientific calculations.\nCRITICAL RULES:\n1. LANGUAGE: Always respond in the exact same language used by the user.\n2. CONTEXT: Thoroughly analyze and incorporate any specific user notes, variables, or constraints provided to tailor the calculation.\n3. STEP-BY-STEP LOGIC: Do not just give the answer. Deconstruct the solution into a clear, numbered logical path. Explain the reasoning and formulas for every step.";
    const userPrompt = `"${calculation}"`;
    
    const aiRaw = await fetch("https://api.cloudflare.com/client/v4/accounts/49bdcdc6f29c08eda8bb7bcb8db9e27f/ai/run/@cf/meta/llama-3.1-8b-instruct", {
      method: "POST",
      headers: {
        "Authorization": "Bearer cfut_UZIu1b9rh4R44PlKSJAHs4JhRKq0h2d7lWjKCrcie67bcd42",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 3000,
        stream: true
      })
    });
    const aiResponseStream = aiRaw.body;
    if (!aiResponseStream || !aiResponseStream.getReader) {
      res.end("Unable to analyze the expression at this moment.");
      return;
    }
    const reader = aiResponseStream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith("data: ") && cleanLine !== "data: [DONE]") {
          try {
            const data = JSON.parse(cleanLine.slice(6));
            if (data.response) {
              res.write(data.response);
            }
          } catch(e) {}
        }
      }
      await new Promise(resolve => setTimeout(resolve, 7));
    }
    res.end();
  } catch (e) {
    res.end("Internal error during mathematical analysis");
  }
});

app.get("/ok", (req, res) => {
  res.json({ ok: true });
});

app.put("/:filename", async (req, res) => {
  const filename = req.params.filename;
  if (!filename) {
    return res.status(400).json({ error: "No filename provided" });
  }
  const getRawBody = () => new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
  const buffer = await getRawBody();
  if (buffer.length === 0) {
    return res.status(400).json({ error: "No file data provided" });
  }
  try {
    const randomNum = Math.floor(Math.random() * 10000000).toString();
    const tfid = `TF-${randomNum}`;
    const key = `${tfid}/${filename}`;
    await s3.send(new PutObjectCommand({
      Bucket: "tout",
      Key: key,
      Body: buffer,
      ContentType: req.headers["content-type"] || "application/octet-stream"
    }));
    const serverUrl = `https://server.tout.adamdh7.org/${key}`;
    res.send(serverUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("*", mediaAuth, async (req, res) => {
  const requestPath = cleanRequestPath(req.path || "");
  const filename = path.basename(requestPath) || "Tout";
  let wantsRaw = req.query.raw === "1";
  let wantsTranscode = req.query.transcode === "1";

  if (!requestPath) {
    return sendUnknown(req, res);
  }

  const isBrowserDoc = req.headers.accept && req.headers.accept.includes("text/html") && !["image", "video", "audio"].includes(req.headers["sec-fetch-dest"] || "");

  if (!isBrowserDoc && !wantsTranscode) {
    wantsRaw = true;
  }

  if (!wantsRaw && !wantsTranscode) {
    const exists = await resourceExists(requestPath);
    if (!exists) {
      return sendUnknown(req, res);
    }

    return servePage(req, res, requestPath, filename);
  }

  if (wantsTranscode && needsTranscode(filename) && FFMPEG_AVAILABLE) {
    return serveRemoteVideoTranscode(req, res, requestPath);
  }

  return serveRemoteRawFile(req, res, requestPath, filename);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
