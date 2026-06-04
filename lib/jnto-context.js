import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jntoPath = path.resolve(__dirname, "../data/osaka-jnto.json");

let jntoCache;

function loadJnto() {
  if (!jntoCache) {
    const raw = readFileSync(jntoPath, "utf8").replace(/^﻿/, "");
    jntoCache = JSON.parse(raw);
  }
  return jntoCache;
}

// JNTO data is Japan-wide macro stats — no per-Osaka-market dimension.
// Hard-gate behind macro-stat keywords so questions like 「韓國旅客喜歡
// 什麼活動」(which is dashboard/KIX territory) don't pull JNTO into the
// prompt.
// Only keywords that are *specific to JNTO macro statistics*.  Bare place
// names (東京 / 北海道), market names (韓国 / 台湾), and bare activity
// words (温泉 / 日本食) are deliberately NOT here — those would over-fire
// and pull macro stats into unrelated questions.  Per-market time-series
// facts surface via the "訪日外客数 / 人数 / 推移" cues below plus the
// market gating in scoreFact().
const JNTO_TOPIC_KEYWORDS = [
  // Inbound / outbound counts
  "訪日外客", "訪日人數", "訪日人数", "外客数", "外客數", "訪日數", "訪日客数",
  "訪日者数", "訪日旅客數", "何人来", "何人來",
  "出國日本", "出国日本", "出國日本人", "出国日本人",
  "出入國", "出入国", "入境人數", "出境人數",
  "inbound", "outbound", "visitor count", "visitor arrivals", "japan arrivals",
  // Visit frequency
  "訪日回數", "訪日回数", "リピーター率", "repeat visit", "first time visit",
  "回目", "幾次來日", "幾次去日本",
  // Travel form
  "旅行形態", "旅行形态", "個別手配", "個人手配", "團體ツアー", "団体ツアー",
  "團體旅行", "团体旅行", "fit",
  // Stay duration
  "滯在日數", "滞在日数", "平均滯在", "平均滞在", "停留日數", "停留天數",
  "滞在期間", "stay duration", "average stay", "length of stay",
  // Yearly macro time series cues (need an explicit trend word)
  "年別推移", "年度推移", "yearly trend", "歷年", "历年", "逐年", "毎年訪日",
  // Region / market share of inbound counts
  "地域別構成", "地区别构成", "構成比", "构成比", "市場別訪日", "市场别访日",
  // Prefecture visit rate
  "都道府県別", "都道府縣別", "訪問率", "访问率", "visit rate",
  "訪問率ランキング", "訪問先ランキング",
  // Overnight stays (macro)
  "延べ宿泊", "宿泊者数", "宿泊者數", "人泊", "overnight stays",
  // Expectations framework (JNTO-specific phrasing)
  "次回やりたい", "次回意向", "リピート意向", "訪日前に期待", "訪日中に実施",
  "訪日旅行で期待",
  // JNTO source brand
  "jnto", "観光庁", "観光廳", "インバウンド消費動向", "訪日観光統計"
];

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
  const chunks = normalized.match(
    /[a-z0-9]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu
  ) || [];
  const tokens = new Set();

  for (const chunk of chunks) {
    if (chunk.length <= 3) {
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

  return [...tokens].filter((t) => t.length > 1);
}

function isOnTopic(normalized) {
  return JNTO_TOPIC_KEYWORDS.some((kw) => normalized.includes(normalizeText(kw)));
}

// Aliases for the 6 per-market time-series facts.  A market-specific
// fact (e.g., 台湾の年別推移, 37 rows) should ONLY surface when the user
// names that market — otherwise a generic "2026年4月の訪日外客数" query
// would be buried under all 6 country series.
const MARKET_NAME_ALIASES = new Map([
  ["韓国", ["韓国", "韓國", "韩国", "korea", "한국"]],
  ["中国", ["中国", "中國", "china", "mainland"]],
  ["台湾", ["台湾", "台灣", "taiwan"]],
  ["香港", ["香港", "hong kong", "hongkong", "hk"]],
  ["米国", ["米国", "米國", "美国", "美國", "usa", "united states", "america", "アメリカ"]],
  ["英国", ["英国", "英國", "uk", "british", "england", "イギリス"]]
]);

function queryMentionsMarket(market, normalized) {
  const aliases = MARKET_NAME_ALIASES.get(market) || [market];
  return aliases.some((a) => normalized.includes(normalizeText(a)));
}

function scoreFact(fact, parsed) {
  // Market-gated facts: drop unless the query names the market.
  if (fact.market) {
    if (!queryMentionsMarket(fact.market, parsed.normalized)) return -1;
  }

  const topic = normalizeText(fact.topic);
  const period = normalizeText(fact.period);
  const metric = normalizeText(fact.metric);

  let score = 0;
  for (const token of parsed.tokens) {
    if (!token) continue;
    if (topic.includes(token)) score += 8;
    if (period.includes(token)) score += 6;
    if (metric.includes(token)) score += 5;
  }
  // Strong bonus when the query explicitly names this fact's market.
  if (fact.market && queryMentionsMarket(fact.market, parsed.normalized)) {
    score += 30;
  }
  return score;
}

const MIN_FACT_SCORE = 5;

export function findRelevantJntoFacts(message, limit = 4) {
  const data = loadJnto();
  const normalized = normalizeText(message);
  const tokens = tokenize(message);
  const topicMatched = isOnTopic(normalized);
  const parsed = { tokens, normalized };

  if (!topicMatched) {
    return { parsed, topicMatched, facts: [] };
  }

  const scored = [];
  for (const fact of data.facts) {
    const score = scoreFact(fact, parsed);
    if (score < MIN_FACT_SCORE) continue;
    scored.push({ fact, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // No fallback: if a JNTO topic word fired but no fact actually matched,
  // return nothing so the question can refuse or fall to another source.
  const facts = scored.slice(0, limit).map((e) => ({ ...e.fact, score: e.score }));
  return { parsed, topicMatched, facts };
}

function formatFactRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return rows
    .map((row) =>
      "    " +
      Object.entries(row)
        .map(([k, v]) => `${k}=${v}`)
        .join(" / ")
    )
    .join("\n");
}

function formatFact(fact) {
  const lines = [`#${fact.id} [${fact.topic} / ${fact.period}]`];
  if (fact.metric) lines.push(`  指標: ${fact.metric}`);
  if (fact.value) lines.push(`  値: ${fact.value}`);
  if (fact.yoy) lines.push(`  前年同月比: ${fact.yoy}`);
  if (fact.cumulative) lines.push(`  累計: ${fact.cumulative}`);
  if (fact.rows && fact.rows.length) {
    lines.push("  rows:");
    lines.push(formatFactRows(fact.rows));
  }
  if (fact.note) lines.push(`  備考: ${fact.note}`);
  if (fact.source_note) lines.push(`  出典: ${fact.source_note}`);
  return lines.join("\n");
}

export function buildJntoEvidence(message) {
  const data = loadJnto();
  const { facts, topicMatched } = findRelevantJntoFacts(message);

  const header = [
    "JNTO MACRO EVIDENCE (allowed source: Japan-wide visitor statistics)",
    `Source: ${data.source_label}`,
    `Fetched at: ${data.fetched_at}`,
    `Topic matched (macro/JNTO keyword detected): ${topicMatched ? "yes" : "no"}`
  ];

  if (!facts.length) {
    return {
      hasEvidence: false,
      block: [
        ...header,
        "",
        "Matched facts: NONE",
        "JNTO macro stats do not cover this question (no Osaka-specific or market-specific data here)."
      ].join("\n")
    };
  }

  return {
    hasEvidence: true,
    block: [
      ...header,
      "",
      `Matched facts (${facts.length}). Quote numbers ONLY from this list:`,
      ...facts.map((f) => formatFact(f))
    ].join("\n")
  };
}

export function jntoSourceMeta() {
  const data = loadJnto();
  return { source_label: data.source_label };
}
