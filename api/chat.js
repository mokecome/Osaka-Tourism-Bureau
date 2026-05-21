function sendJson(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
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

export default async function handler(request) {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed." });
  }

  if (!openaiApiKey) {
    return sendJson(500, { error: "OPENAI_API_KEY is not set." });
  }

  try {
    const { message } = await request.json();
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) {
      return sendJson(400, { error: "Message is required." });
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
      return sendJson(upstream.status, { error });
    }

    return sendJson(200, {
      answer: extractOutputText(data) || "回答を生成できませんでした。",
      model: openaiModel
    });
  } catch (error) {
    return sendJson(500, { error: error.message || "Unexpected server error." });
  }
}
