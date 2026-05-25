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

function truncateText(value, maxLength = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function splitStatements(value) {
  return String(value || "")
    .split(/[。.!?！？；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractMetricCards(value, limit = 4) {
  const metricPattern = /(?:約\s*)?[\d,]+(?:\.\d+)?\s*(?:萬人次|万人次|萬人|万人|%|％|億円|兆円|万円|円|泊|晚|日)/g;
  const cards = [];
  const seen = new Set();
  const marketMatches = [];
  let marketCard = null;

  const finalizeCards = () => {
    if (marketCard && !cards.some((card) => card.label === marketCard.label)) {
      cards.splice(Math.min(2, cards.length), 0, marketCard);
    }
    return cards.slice(0, limit);
  };

  for (const match of String(value || "").matchAll(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]{1,12})\s*[（(]?(?:佔|占)?\s*([\d.]+[%％])[）)]?/gu)) {
    const label = match[1].replace(/^[、，:：\s]+|[、，:：\s]+$/g, "");
    if (/約|回復|恢復|復甦|水準|年度|疫前|疫情前|合計|超過/.test(label)) continue;
    if (label.length > 8) continue;
    marketMatches.push(`${label} ${match[2]}`);
  }

  if (marketMatches.length >= 3) {
    marketCard = {
      label: "前三大市場",
      value: marketMatches.slice(0, 3).join(" / "),
      note: ""
    };
    for (const item of marketMatches.slice(0, 3)) seen.add(item.match(/[\d.]+[%％]/)?.[0] || item);
  }

  for (const statement of splitStatements(value)) {
    const metrics = statement.match(metricPattern) || [];
    for (const metric of metrics) {
      const normalizedMetric = metric.replace(/\s+/g, " ");
      if (seen.has(normalizedMetric)) continue;
      seen.add(normalizedMetric);

      let label = statement
        .replace(metric, "")
        .replace(/[:：,，、]+$/g, "")
        .replace(/^\s*[-・]+\s*/g, "")
        .trim();

      if (/萬人次|万人次|萬人|万人/.test(normalizedMetric) && /旅客|觀光|観光|visitor/i.test(statement)) {
        label = "外國旅客總量";
      } else if (/[%％]/.test(normalizedMetric) && /回復|恢復|復甦|recovery/i.test(statement)) {
        label = "疫前恢復率";
      } else if (/[%％]/.test(normalizedMetric) && /亞洲|アジア|Asia/i.test(statement)) {
        label = "亞洲市場合計";
      } else if (/[%％]/.test(normalizedMetric)) {
        const before = statement.slice(0, statement.indexOf(metric));
        const near = before.split(/[,:：，、\s（）()]+/).filter(Boolean).pop();
        if (near && near.length <= 8) label = near;
      }

      cards.push({
        label: truncateText(label || "Key metric", 28),
        value: normalizedMetric,
        note: ""
      });

      if (cards.length >= limit) return finalizeCards();
    }
  }

  return finalizeCards();
}

function buildInsightBullets(record, answer) {
  const bullets = [];
  if (record?.key_data_points) {
    bullets.push(`判斷重點：${record.key_data_points}`);
  }
  if (record?.business_value) {
    bullets.push(`商業用途：${record.business_value}`);
  }

  for (const statement of splitStatements(answer)) {
    if (bullets.length >= 3) break;
    if (statement.length < 14) continue;
    bullets.push(statement);
  }

  return bullets.slice(0, 3).map((item) => truncateText(item, 110));
}

export function buildAnswerDisplay(message, answer) {
  const record = findRelevantFaq(message, 1)[0] || null;
  const language = detectResponseLanguage(message);
  const sourceName =
    record?.data_source_primary ||
    record?.data_source_secondary ||
    "Osaka Tourism Data Hub data_03";
  const source = record
    ? `${sourceName} / FAQ ${record.id}`
    : "Osaka Tourism Data Hub data_03";
  const summarySource = answer || record?.answer_direction || "";
  const summary =
    splitStatements(summarySource)[0] ||
    "The available source context was used to prepare this answer.";
  const metricSource = [record?.answer_direction, answer].filter(Boolean).join(" ");
  const kpis = extractMetricCards(metricSource);

  return {
    context: source,
    title: truncateText(String(message || record?.question_jp || record?.question || "AI analysis"), 90),
    level: record?.stage_no ? `Lv.${record.stage_no}` : "Lv.1",
    sectionTitle:
      record?.stage_name ||
      (language === "Traditional Chinese" ? "AI 分析摘要" : "AI分析サマリー"),
    summary: truncateText(summary, 180),
    kpis,
    insights: buildInsightBullets(record, answer),
    source,
    sourceUrl: "https://www.datahub.osaka-info.jp/data_03/"
  };
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
