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
const JNTO_TOPIC_KEYWORDS = [
  // Inbound / outbound counts
  "訪日外客", "訪日人數", "訪日人数", "外客数", "外客數", "訪日數",
  "出國日本", "出国日本", "出國日本人", "出国日本人",
  "出入國", "出入国", "入境", "出境", "出國數",
  "inbound", "outbound", "visitor count", "japan arrivals",
  // Visit frequency
  "訪日回數", "訪日回数", "リピーター", "repeat visit", "first time visit",
  "回目", "幾次來", "幾次去",
  // Travel form
  "旅行形態", "旅行形态", "個別手配", "個人手配", "團體ツアー", "団体ツアー",
  "團體旅行", "团体旅行", "個人旅行", "fit", "個人 vs 團體",
  // Stay duration
  "滯在日數", "滞在日数", "平均滯在", "平均滞在", "停留日數", "停留天數",
  "滞在期間", "滞在", "stay duration", "average stay", "length of stay",
  // Period markers (used in combination with above)
  "全国", "全國", "全日本", "japan-wide", "累計",
  // Yearly time series cues
  "2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019",
  "2020", "2021", "2022", "2023", "2024", "2025", "2026",
  "年別", "年別推移", "年度推移", "yearly trend",
  "4月", "april",
  // JNTO source brand
  "jnto", "観光庁", "観光廳", "インバウンド消費動向"
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

function scoreFact(fact, parsed) {
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

  let facts = scored.slice(0, limit).map((e) => ({ ...e.fact, score: e.score }));
  // Broad ask ("日本全国訪日") with topic match but no specific token hit →
  // fall back to all facts so the bot can pick what's relevant.
  if (!facts.length) {
    facts = data.facts.slice(0, limit).map((f) => ({ ...f, score: 5 }));
  }
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
