const express = require("express");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { MongoClient } = require("mongodb");

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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const corsAndOptions = (req, res, next) => {
  const origin = req.headers.origin;
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    "Content-Type": "text/plain; charset=utf-8",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
  
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

    const aiResponseStream = aiRaw.body;
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        let isBuffering = false;
        let buffer = "";
        let frontendMessage = "";
        let dbMessage = "";
        let attachmentsToSave = [];
        let imageIndex = 0;
        let searchImageIndex = 0;
        let allImages = [];

        async function processChar(char) {
          if (!isBuffering) {
            if (char === '[') {
              isBuffering = true;
              buffer = "[";
            } else {
              controller.enqueue(encoder.encode(char));
              frontendMessage += char;
              dbMessage += char;
            }
          } else {
            buffer += char;
            const tImg = "[IMAGE:";
            const tSrc = "[SEARCH:";
            if (char === ']') {
              isBuffering = false;
              if (buffer.startsWith(tImg)) {
                const prompt = buffer.substring(7, buffer.length - 1).trim();
                imageIndex++;
                await new Promise(resolve => setTimeout(resolve, 7));
                const keepAliveImg = setInterval(() => {
                  try { controller.enqueue(encoder.encode("• ")); } catch (e) {}
                }, 1000);
                const imgUrl = await processAndUploadImage(prompt);
                clearInterval(keepAliveImg);
                const dbTag = `[IMAGES: ${imageIndex}]`;
                if (imgUrl) {
                  attachmentsToSave.push({ placeholder: dbTag, url: `\n\n${imgUrl}\n\n` });
                }
                const replacement = imgUrl ? `\n\n${imgUrl}\n\n` : "";
                controller.enqueue(encoder.encode(replacement));
                frontendMessage += replacement;
                dbMessage += dbTag;
              } else if (buffer.startsWith(tSrc)) {
                const query = buffer.substring(8, buffer.length - 1).trim();
                await new Promise(resolve => setTimeout(resolve, 7));
                const keepAliveSrc = setInterval(() => {
                  try { controller.enqueue(encoder.encode("• ")); } catch (e) {}
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
                      const linesFinal = bufferFinal.split('\n');
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
                controller.enqueue(encoder.encode(buffer));
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
                controller.enqueue(encoder.encode(buffer));
                frontendMessage += buffer;
                dbMessage += buffer;
                buffer = "";
              }
            }
          }
        }

        if (aiResponseStream && aiResponseStream.getReader) {
          const reader = aiResponseStream.getReader();
          const decoder = new TextDecoder();
          let bufferMain = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bufferMain += decoder.decode(value, { stream: true });
              const lines = bufferMain.split('\n');
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
          controller.enqueue(encoder.encode(buffer));
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

        controller.close();
      }
    });

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
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
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
  
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
      const lines = buffer.split('\n');
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

app.get("/:tfid/:filename", async (req, res) => {
  const tfid = req.params.tfid;
  const filename = req.params.filename;
  if (!tfid.startsWith("TF-") || !/^\d+$/.test(tfid.slice(3))) {
    return res.status(404).send("Not found");
  }
  const key = `${tfid}/${filename}`;
  try {
    const command = new GetObjectCommand({
      Bucket: "tout",
      Key: key
    });
    const s3Response = await s3.send(command);
    res.setHeader("Content-Type", s3Response.ContentType || "application/octet-stream");
    if (s3Response.ContentLength) {
      res.setHeader("Content-Length", s3Response.ContentLength);
    }
    s3Response.Body.pipe(res);
  } catch (error) {
    res.status(404).send("File not found");
  }
});

app.get("/:filename", async (req, res) => {
  const filename = req.params.filename;
  if (!/^TF-\d+\.png$/.test(filename)) {
    return res.status(404).send("Not found");
  }
  try {
    const command = new GetObjectCommand({
      Bucket: "tout",
      Key: filename
    });
    const s3Response = await s3.send(command);
    res.setHeader("Content-Type", s3Response.ContentType || "image/png");
    if (s3Response.ContentLength) {
      res.setHeader("Content-Length", s3Response.ContentLength);
    }
    s3Response.Body.pipe(res);
  } catch (error) {
    res.status(404).send("Image not found");
  }
});

app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});
