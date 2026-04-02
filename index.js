import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { MongoClient } from "mongodb";

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

async function processAndUploadImage(env, prompt) {
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
  return `https://pub-71f8327fad474b50aa0cb0f764fa467f.r2.dev/${filename}`;
}

async function performSearch(query) {
  await new Promise(resolve => setTimeout(resolve, 7));
  const TAVILY_KEY = "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";
  try {
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const userAgent = request.headers.get("User-Agent") || "";
    const authHeader = request.headers.get("Authorization");
    const isBrowser = userAgent.includes("Mozilla") || request.headers.get("Sec-Fetch-Mode");
    
    const originHost = origin ? new URL(origin).hostname : "";
    const isAllowedOrigin = originHost === "adamdh7.org" || originHost.endsWith(".adamdh7.org");
    
    let authorized = false;
    if (isAllowedOrigin && isBrowser) {
      authorized = true;
    }
    if (authHeader === "Bearer adamdh7" || authHeader === "adamdh7") {
      authorized = true;
    }
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    
    if (!authorized) {
      return new Response("Forbidden: Invalid origin or missing token", { status: 403, headers: corsHeaders });
    }

    try {
      if (url.pathname === "/ai") {
        const headers = new Headers(corsHeaders);
        if (request.method === "GET") {
          headers.set("Content-Type", "application/json");
          const sess = url.searchParams.get("session_id") || "global";
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
            return new Response(JSON.stringify({ messages: Array.from(messagesMap.values()) }), { headers });
          } catch (err) {
            return new Response(JSON.stringify({ error: "Database Error", details: err.message }), { status: 500, headers });
          }
        }
        
        if (request.method === "POST") {
          headers.set("Content-Type", "text/plain; charset=utf-8");
          let body;
          try {
            body = await request.json();
          } catch (e) {
            headers.set("Content-Type", "application/json");
            return new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400, headers });
          }
          
          const userMessage = body.message?.trim();
          const sess = body.session_id || "global";
          if (!userMessage) {
            headers.set("Content-Type", "application/json");
            return new Response(JSON.stringify({ error: "Empty message provided" }), { status: 400, headers });
          }
          
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
                      const imgUrl = await processAndUploadImage(env, prompt);
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
          return new Response(stream, { headers });
        }
      }
      
      if (url.pathname === "/jerere") {
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", "application/json");
        if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
        }
        const prompt = body.prompt?.trim();
        if (!prompt) return new Response(JSON.stringify({ error: "No prompt provided" }), { status: 400, headers });
        
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
        
        const returnedUrl = `https://pub-71f8327fad474b50aa0cb0f764fa467f.r2.dev/${filename}`;
        return new Response(JSON.stringify({ url: returnedUrl }), { headers });
      }
      
      if (url.pathname === "/calcul") {
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", "application/json");
        if (request.method !== "POST") {
          return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
        }
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ error: "Invalid JSON format" }), { status: 400, headers });
        }
        const calculation = body.calculation?.trim();
        if (!calculation) {
          return new Response(JSON.stringify({ error: "No expression provided" }), { status: 400, headers });
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
          const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Serveur lancé sur le port ${port}`);
});
          const aiResponseStream = aiRaw.body;
          let analysis = "";
          
          if (aiResponseStream && aiResponseStream.getReader) {
            const reader = aiResponseStream.getReader();
            const decoder = new TextDecoder();
            let bufferCalcul = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bufferCalcul += decoder.decode(value, { stream: true });
              const lines = bufferCalcul.split('\n');
              bufferCalcul = lines.pop();
              for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith("data: ") && cleanLine !== "data: [DONE]") {
                  try {
                    const data = JSON.parse(cleanLine.slice(6));
                    if (data.response) analysis += data.response;
                  } catch(e) {}
                }
              }
              await new Promise(resolve => setTimeout(resolve, 7));
            }
          } else {
            analysis = "Unable to analyze the expression at this moment.";
          }
          return new Response(JSON.stringify({ result: analysis }), { headers });
        } catch (e) {
          return new Response(JSON.stringify({ error: "Internal error during mathematical analysis" }), { status: 500, headers });
        }
      }
    } catch (e) {
      const errorHeaders = { ...corsHeaders, "Content-Type": "application/json" };
      return new Response(JSON.stringify({ 
        error: "Internal Server Error", 
        message: e.message
      }), { status: 500, headers: errorHeaders });
    }
    return new Response("Oui", { status: 404, headers: corsHeaders });
  }
};
