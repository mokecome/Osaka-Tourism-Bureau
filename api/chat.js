import {
  buildAnswerDisplay,
  buildChatContext,
  buildInstructions,
  detectResponseLanguage
} from "../lib/chat-context.js";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
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

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
}

export default async function handler(req, res) {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!openaiApiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not set." });
    return;
  }

  try {
    const { message } = await readJsonBody(req);
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) {
      sendJson(res, 400, { error: "Message is required." });
      return;
    }

    const sourceContext = buildChatContext(text);
    const responseLanguage = detectResponseLanguage(text);

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: openaiModel,
        instructions: buildInstructions(),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${sourceContext}\n\nRESPONSE LANGUAGE\n${responseLanguage}\n\nUSER QUESTION\n${text}`
              }
            ]
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

    const answer = extractOutputText(data) || "回答を生成できませんでした。";

    sendJson(res, 200, {
      answer,
      display: buildAnswerDisplay(text, answer),
      model: openaiModel
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
}
