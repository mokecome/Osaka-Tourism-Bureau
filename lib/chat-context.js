import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDashboardEvidence,
  dashboardRefusalText,
  primarySheetMeta
} from "./dashboard-context.js";

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

const STAGE_TITLES_JA = new Map([
  ["1", "市場規模の分析"],
  ["2", "ターゲット客層の選定"],
  ["3", "出店エリアの判断"],
  ["4", "業態設計"],
  ["5", "マーケティングチャネル"],
  ["6", "価格戦略"],
  ["7", "運営サービス"],
  ["8", "競合分析"],
  ["9", "リスクとタイミング"],
  ["10", "クロス分析"]
]);

const SOURCE_LABELS_JA = [
  [/來阪外國人旅遊者數推計/g, "来阪外国人旅行者数推計"],
  [/訪日外國人關西國際空港出口調查/g, "訪日外国人関西国際空港出口調査"],
  [/訪日外國人關西空港出口調查/g, "訪日外国人関西空港出口調査"],
  [/訪日旅客消費調查/g, "訪日旅行者消費調査"],
  [/旅客滿意度抱怨項/g, "旅行者満足度・不満項目"],
  [/來阪外國人時序\+市場/g, "来阪外国人旅行者数推計（時系列・市場別）"],
  [/時序/g, "時系列"],
  [/品類/g, "品目別"],
  [/實數/g, "実数"]
];

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
  const evidence = buildDashboardEvidence(message);
  const matches = findRelevantFaq(message, 3);
  const faqContext = matches.length
    ? matches.map((record, index) => `FAQ hint ${index + 1}\n${formatFaqRecord(record)}`).join("\n\n")
    : "No FAQ hint matched. Rely on DASHBOARD EVIDENCE only.";

  return [
    "SOURCE CONTEXT",
    "Priority order: (1) DASHBOARD EVIDENCE is the ONLY allowed source of numbers and",
    "    factual statements about market behaviour. (2) FAQ hints below are background",
    "    context only — do NOT quote numbers from them. (3) DataHub page is for general",
    "    framing only.",
    "",
    evidence.block,
    "",
    `EVIDENCE STATUS: ${evidence.hasEvidence ? "hasEvidence=true" : "hasEvidence=false"}`,
    "",
    "DATAHUB PAGE CONTEXT",
    `DataHub page: ${DATAHUB_CONTEXT.title}`,
    `URL: ${DATAHUB_CONTEXT.url}`,
    `Summary: ${DATAHUB_CONTEXT.summary}`,
    `Available analysis sections: ${DATAHUB_CONTEXT.sections.join(" / ")}`,
    `DataHub note: ${DATAHUB_CONTEXT.note}`,
    "",
    `FAQ hints source: ${path.basename(faqPath)} / ${loadFaq().length} records (background only)`,
    faqContext
  ].join("\n");
}

export function detectResponseLanguage(message) {
  const raw = String(message || "");
  const text = raw.toLowerCase();
  if (/\b(english|in english|reply in english)\b/.test(text)) return "English";
  if (/(用|使用|請用|请用).{0,4}(中文|繁體|繁体|简体|簡體|chinese)/.test(raw)) return "Chinese";
  const hasKana = /[぀-ヿ]/.test(raw);
  const hasHan = /[\p{Script=Han}]/u.test(raw);
  if (hasHan && !hasKana) return "Chinese";
  return "Japanese";
}

function truncateText(value, maxLength = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function splitStatements(value) {
  return String(value || "")
    .split(/[。!?！？；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLikelyChineseProse(value) {
  const text = String(value || "");
  const hanCount = (text.match(/[\p{Script=Han}]/gu) || []).length;
  const hasKana = /[\u3040-\u30ff]/.test(text);
  const hasChineseOnlyTerms =
    /(?:這|該|會|與|為|於|較|將|們|至|對應|發現|選擇|規劃|進場|總體|趨勢|資料|數據|客源|接待|超過)/.test(text);
  return hasChineseOnlyTerms || (hanCount >= 6 && !hasKana);
}

function displayStatements(value) {
  return splitStatements(value)
    .map((statement) => localizeDisplayText(statement))
    .filter((statement) => statement && !isLikelyChineseProse(statement));
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
    const label = cleanMarketLabel(match[1]);
    if (/約|回復|恢復|復甦|水準|年度|疫前|疫情前|合計|超過/.test(label)) continue;
    if (label.length > 8) continue;
    marketMatches.push(`${localizeDisplayText(label)} ${match[2]}`);
  }

  if (marketMatches.length >= 3) {
    marketCard = {
      label: "上位3市場",
      value: marketMatches.slice(0, 3).join(" / "),
      note: ""
    };
    for (const item of marketMatches.slice(0, 3)) seen.add(item.match(/[\d.]+[%％]/)?.[0] || item);
  }

  for (const statement of splitStatements(value)) {
    for (const metricMatch of statement.matchAll(metricPattern)) {
      const metric = metricMatch[0];
      const startsInsideDecimal =
        /[%％]/.test(metric) &&
        metricMatch.index > 0 &&
        /[\d.]/.test(statement[metricMatch.index - 1]);
      if (startsInsideDecimal) continue;

      const normalizedMetric = normalizeMetricValue(metric);
      if (seen.has(normalizedMetric)) continue;
      seen.add(normalizedMetric);

      let label = statement
        .replace(metric, "")
        .replace(/[:：,，、]+$/g, "")
        .replace(/^\s*[-・]+\s*/g, "")
        .trim();

      if (/万人/.test(normalizedMetric) && /旅客|旅行者|インバウンド|観光|visitor/i.test(statement)) {
        label = "外国人旅行者数";
      } else if (/[%％]/.test(normalizedMetric) && /回復|恢復|復甦|recovery/i.test(statement)) {
        label = "コロナ前比の回復率";
      } else if (/[%％]/.test(normalizedMetric) && /亞洲|アジア|Asia/i.test(statement)) {
        label = "アジア市場合計";
      } else if (/[%％]/.test(normalizedMetric)) {
        const before = statement.slice(0, statement.indexOf(metric));
        const near = before.split(/[,:：，、\s（）()]+/).filter(Boolean).pop();
        if (near && near.length <= 8) label = near;
      }

      cards.push({
        label: truncateText(localizeDisplayText(label || "主要指標"), 28),
        value: normalizedMetric,
        note: ""
      });

      if (cards.length >= limit) return finalizeCards();
    }
  }

  return finalizeCards();
}

function cleanMarketLabel(value) {
  return String(value || "")
    .replace(/^[、，:：\s]+|[、，:：\s]+$/g, "")
    .replace(/^.*(?:市場|客源|上位|トップ|首位|1位|2位|3位)[はが:：]?/u, "")
    .replace(/^[はが、，:：\s]+|[はが、，:：\s]+$/g, "");
}

function normalizeMetricValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/萬人次/g, "万人")
    .replace(/万人次/g, "万人")
    .replace(/萬人/g, "万人")
    .replace(/晚/g, "泊")
    .trim();
}

function localizeDisplayText(value) {
  let text = String(value || "");
  for (const [pattern, replacement] of SOURCE_LABELS_JA) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/萬人次/g, "万人")
    .replace(/万人次/g, "万人")
    .replace(/萬人/g, "万人")
    .replace(/晚/g, "泊")
    .replace(/外國/g, "外国")
    .replace(/旅客/g, "旅行者")
    .replace(/觀光/g, "観光")
    .replace(/國內/g, "国内")
    .replace(/韓國/g, "韓国")
    .replace(/中國/g, "中国")
    .replace(/台灣/g, "台湾")
    .replace(/歐美/g, "欧米")
    .replace(/東南亞/g, "東南アジア")
    .replace(/亞洲/g, "アジア")
    .replace(/復甦/g, "回復")
    .replace(/恢復/g, "回復")
    .replace(/總/g, "総")
    .replace(/實/g, "実")
    .replace(/判斷/g, "判断")
    .replace(/選擇/g, "選定")
    .replace(/行銷/g, "マーケティング")
    .replace(/營運/g, "運営")
    .replace(/進階/g, "詳細")
    .replace(/競合分析/g, "競合分析")
    .replace(/風險/g, "リスク")
    .replace(/時機/g, "タイミング")
    .trim();
}

function buildStageTitle(record) {
  return STAGE_TITLES_JA.get(String(record?.stage_no || "")) || "AI分析サマリー";
}

function buildSourceLabel(record) {
  const sourceName =
    record?.data_source_primary ||
    record?.data_source_secondary ||
    "Osaka Tourism Data Hub data_03";
  const source = localizeDisplayText(sourceName);
  return record ? `${source} / FAQ ${record.id}` : "Osaka Tourism Data Hub data_03";
}

function buildInsightBullets(record, answer) {
  const bullets = [];

  for (const statement of displayStatements(answer)) {
    if (bullets.length >= 3) break;
    if (statement.length < 14) continue;
    if (/出典|source|osaka_faq|FAQ/i.test(statement)) continue;
    bullets.push(statement);
  }

  if (bullets.length < 2 && record?.question_jp) {
    bullets.push(`関連FAQ：${record.question_jp}`);
  }

  return bullets.slice(0, 3).map((item) => truncateText(item, 110));
}

export function buildAnswerDisplay(message, answer) {
  const sheetMeta = primarySheetMeta(message);
  const record = findRelevantFaq(message, 1)[0] || null;
  const source = sheetMeta
    ? `大阪海外市場調査ダッシュボード / ${sheetMeta.sheet_id}`
    : buildSourceLabel(record);
  const statements = displayStatements(answer);
  const summary = statements[0] || "大阪海外市場調査ダッシュボードの該当セルに基づく分析です。";
  const metricSource = answer || "";
  const kpis = extractMetricCards(metricSource);

  const titleSource = sheetMeta?.sheet_title || record?.question_jp || message || "AI分析";
  const sectionTitle = sheetMeta?.sheet_title || buildStageTitle(record);

  return {
    context: source,
    title: truncateText(String(titleSource), 90),
    level: sheetMeta?.sheet_id ? sheetMeta.sheet_id.split("_")[0] : (record?.stage_no ? `Lv.${record.stage_no}` : "Lv.1"),
    sectionTitle,
    summary: truncateText(localizeDisplayText(summary), 180),
    kpis,
    insights: buildInsightBullets(record, answer),
    source,
    sourceUrl: "https://www.datahub.osaka-info.jp/data_03/"
  };
}

export function buildInstructions() {
  return [
    "You are the Osaka Tourism Bureau AI analyst.",
    "ABSOLUTE RULE 1: Numbers, percentages, scores, and market comparisons MUST come only from cells listed in the DASHBOARD EVIDENCE block. Never invent or recall numbers from training data. Never quote numbers from FAQ hints.",
    "ABSOLUTE RULE 2: If the EVIDENCE STATUS line says hasEvidence=false, your entire reply MUST be exactly the refusal sentence appropriate to the RESPONSE LANGUAGE: Chinese -> '目前無相關數據'; Japanese -> '大阪海外市場調査ダッシュボードに該当するデータがありません。'; English -> 'No relevant data available in the Osaka overseas market survey dashboard.' Do not add any extra sentence, disclaimer, or suggestion.",
    "ABSOLUTE RULE 3: When you do have evidence, every numeric claim must be followed by an inline citation in the form [sheet_id / 項目 / 市場], copied verbatim from the evidence line you used.",
    "ABSOLUTE RULE 4: Do not change units. 百分比 cells are already shown as XX.X%. 評分 cells are 0-10 scale (do not multiply by 100). Do not re-compute percentages by hand; if the user asks for a derivation, list the underlying cells instead.",
    "Language: answer in the RESPONSE LANGUAGE specified in the user input. Default is Japanese. Translate any Traditional Chinese labels in the evidence (e.g. 市場 names like 韓國) into the response language naturally; keep the original label inside the [citation] tag.",
    "Style: concise, business-oriented, ranked bullets when comparing markets or items. Do NOT mention FAQ hints, DataHub page, or internal source file names in the user-visible answer unless explicitly asked."
  ].join(" ");
}
