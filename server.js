import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

function loadEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;

    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) process.env[key] = value;
  }
}

loadEnv();

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function handleChat(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (!openaiApiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not set in .env." });
    return;
  }

  try {
    const { message } = await readJsonBody(req);
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) {
      sendJson(res, 400, { error: "Message is required." });
      return;
    }

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: openaiModel,
        instructions:
          "You are the Osaka Tourism Bureau AI analyst for a Japanese tourism data website. Answer in Japanese. Be concise, practical, and business-oriented. If you do not have enough source data for a numeric claim, say that the site data connection is not available in this demo and give a cautious qualitative answer.",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text }]
          }
        ],
        max_output_tokens: 700
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const error =
        data?.error?.message || `OpenAI API request failed (${upstream.status}).`;
      sendJson(res, upstream.status, { error });
      return;
    }

    sendJson(res, 200, {
      answer: extractOutputText(data) || "回答を生成できませんでした。",
      model: openaiModel
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(rootDir, `.${safePath}`);

  if (!filePath.startsWith(rootDir) || path.basename(filePath).startsWith(".")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const file = await readFile(filePath);
    const contentType =
      mimeTypes.get(path.extname(filePath).toLowerCase()) ||
      "application/octet-stream";
    res.writeHead(200, { "content-type": contentType });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/chat")) {
    void handleChat(req, res);
    return;
  }
  void serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Osaka Tourism AI site running at http://localhost:${port}`);
});
