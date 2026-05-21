import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const faqPath = path.resolve(__dirname, "../data/osaka-faq.json");

let faqCache;

const DATAHUB_CONTEXT = {
  title: "訪日外国人旅行者調査（旅ナカ） / International Visitor Survey (National Survey)",
  url: "https://www.datahub.osaka-info.jp/data_03/",
  summary:
    "訪阪した外国人旅行者の体験や満足度を把握し、市場別の関心や観光アクティビティごとのターゲット層を明らかにする大阪観光データハブの調査ページ。",
  sections: ["基本分析", "クロス分析", "リフトアップ分析"],
  tableauViews: [
    "https://public.tableau.com/views/_17647285928920/sheet0",
    "https://public.tableau.com/views/_17647285928920/sheet1",
    "https://public.tableau.com/views/_17647285928920/sheet2"
  ],
  note:
    "公開ページ上のグラフはPDFやPowerPoint等でダウンロード可能。チャート内の正確な数値は、FAQコンテキストに明記がある場合だけ断定する。"
};

function loadFaq() {
  if (!faqCache) {
    faqCache = JSON.parse(readFileSync(faqPath, "utf8").replace(/^\uFEFF/, "")).records || [];
  }
  return faqCache;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[，、。．・：:；;！？!?（）()[\]{}"“”'‘’`~|/\\<>@#$%^&*_+=-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const normalized = normalizeText(value);
  const chunks = normalized.match(/[a-z0-9]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) || [];
  const tokens = new Set();

  for (const chunk of chunks) {
    if (chunk.length <= 4) {
      tokens.add(chunk);
      continue;
    }

    if (/^[a-z0-9]+$/.test(chunk)) {
      tokens.add(chunk);
      continue;
    }

    for (let i = 0; i < chunk.length - 1; i += 1) {
      tokens.add(chunk.slice(i, i + 2));
    }
  }

  return [...tokens].filter((token) => token.length > 1);
}

function scoreRecord(record, query, queryTokens) {
  const weightedFields = [
    ["question", 12],
    ["question_jp", 12],
    ["question_zh_variant", 12],
    ["question_en_variant", 10],
    ["answer_direction", 7],
    ["key_data_points", 6],
    ["stage_name", 5],
    ["business_value", 4],
    ["data_source_primary", 4],
    ["data_source_secondary", 3]
  ];

  let score = 0;
  for (const [field, weight] of weightedFields) {
    const normalized = normalizeText(record[field]);
    if (!normalized) continue;
    if (query && normalized.includes(query)) score += weight * 6;
    if (query && query.includes(normalized) && normalized.length > 4) score += weight * 4;
    for (const token of queryTokens) {
      if (normalized.includes(token)) score += weight;
    }
  }

  if (record.test_priority === "smoke") score += 2;
  if (record.is_demo_question === "Y") score += 1;
  return score;
}

export function findRelevantFaq(message, limit = 6) {
  const query = normalizeText(message);
  const queryTokens = tokenize(message);

  return loadFaq()
    .map((record) => ({
      record,
      score: scoreRecord(record, query, queryTokens)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.record);
}

function formatFaqRecord(record) {
  return [
    `ID: ${record.id}`,
    `Stage: ${record.stage_no}. ${record.stage_name}`,
    `Question: ${record.question}`,
    `Japanese question: ${record.question_jp}`,
    `Chinese variant: ${record.question_zh_variant}`,
    `English variant: ${record.question_en_variant}`,
    `Answer direction: ${record.answer_direction}`,
    `Key data points: ${record.key_data_points}`,
    `Primary source: ${record.data_source_primary}`,
    record.data_source_secondary ? `Secondary source: ${record.data_source_secondary}` : "",
    `Data type: ${record.data_type}`,
    `Business value: ${record.business_value}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildChatContext(message) {
  const matches = findRelevantFaq(message);
  const faqContext = matches.length
    ? matches.map((record, index) => `FAQ match ${index + 1}\n${formatFaqRecord(record)}`).join("\n\n")
    : "No direct FAQ match was found. Use the DataHub page context only and say when the available context is insufficient.";

  return [
    "SOURCE CONTEXT",
    `DataHub page: ${DATAHUB_CONTEXT.title}`,
    `URL: ${DATAHUB_CONTEXT.url}`,
    `Summary: ${DATAHUB_CONTEXT.summary}`,
    `Available analysis sections: ${DATAHUB_CONTEXT.sections.join(" / ")}`,
    `Tableau views: ${DATAHUB_CONTEXT.tableauViews.join(" , ")}`,
    `DataHub note: ${DATAHUB_CONTEXT.note}`,
    "",
    `FAQ source: ${path.basename(faqPath)} / FAQ_Data / ${loadFaq().length} records`,
    faqContext
  ].join("\n");
}

export function detectResponseLanguage(message) {
  const text = String(message || "");
  if (/[\u3040-\u30ff]/.test(text)) return "Japanese";
  if (/[\u4e00-\u9fff]/.test(text)) return "Traditional Chinese";
  return "same language as the user question";
}

export function buildInstructions() {
  return [
    "You are the Osaka Tourism Bureau AI analyst for an Osaka tourism data website.",
    "Answer in the same language as the user's question. If the user asks in Chinese, including Traditional or Simplified Chinese, answer in Traditional Chinese. If the language is unclear, answer in Japanese.",
    "The RESPONSE LANGUAGE line in the user input is mandatory and overrides the page language.",
    "Use the provided SOURCE CONTEXT first. Prefer FAQ records from osaka_faq_100.xlsx, then the Osaka Tourism Data Hub data_03 page context.",
    "Be concise, practical, and business-oriented.",
    "When citing numbers, only use numbers explicitly present in SOURCE CONTEXT. If a field contains placeholders like X or XX, say the exact number is not available in the local FAQ context instead of inventing it.",
    "Mention the relevant source name briefly, such as the FAQ record ID, the data source field, or the DataHub data_03 page.",
    "If SOURCE CONTEXT is insufficient for a numeric claim, say so and give a cautious qualitative answer."
  ].join(" ");
}
