import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lgbtqPath = path.resolve(__dirname, "../data/osaka-lgbtq.json");

let lgbtqCache;

function loadLgbtq() {
  if (!lgbtqCache) {
    const raw = readFileSync(lgbtqPath, "utf8").replace(/^﻿/, "");
    lgbtqCache = JSON.parse(raw);
  }
  return lgbtqCache;
}

// HARD gate: this module ONLY contributes when the user explicitly asks
// about LGBTQ+ tourism.  The dataset is a niche subset (Eagle Osaka
// patrons) and would be misleading if surfaced for generic Osaka questions.
const LGBTQ_TOPIC_KEYWORDS = [
  "lgbtq", "lgbt", "gay", "lesbian", "queer", "trans", "bisexual",
  "non-binary", "nonbinary", "pride",
  "ゲイ", "レズビアン", "クイア", "トランスジェンダー", "ノンバイナリー",
  "バイセクシャル", "性自認", "性的指向", "セクシュアリティ",
  "同性愛", "同志", "彩虹", "レインボー",
  "eagle osaka", "visit gay osaka",
  "ホモ", "二丁目", "堂山町", "lgbtq+",
  "lgbtq旅客", "lgbtq遊客", "lgbtq觀光", "性少數", "性少数"
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
  return LGBTQ_TOPIC_KEYWORDS.some((kw) => normalized.includes(normalizeText(kw)));
}

function scoreFact(fact, parsed) {
  const topic = normalizeText(fact.topic);
  let score = 0;
  for (const token of parsed.tokens) {
    if (!token) continue;
    if (topic.includes(token)) score += 8;
  }
  // Always reward the most foundational facts when LGBTQ topic is on.
  if (["nps_breakdown", "satisfaction", "residence_country"].includes(fact.id)) {
    score += 3;
  }
  return score;
}

const MIN_FACT_SCORE = 3;

export function findRelevantLgbtqFacts(message, limit = 6) {
  const data = loadLgbtq();
  const normalized = normalizeText(message);
  const tokens = tokenize(message);
  const topicMatched = isOnTopic(normalized);
  const parsed = { tokens, normalized };

  if (!topicMatched) {
    return { parsed, topicMatched, keyFigures: [], facts: [] };
  }

  const scored = [];
  for (const fact of data.facts) {
    const score = scoreFact(fact, parsed);
    if (score < MIN_FACT_SCORE) continue;
    scored.push({ fact, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // When topic is matched but no specific tokens fire on facts, surface
  // the top high-signal facts (NPS, residence, satisfaction, importance).
  let facts = scored.slice(0, limit).map((e) => ({ ...e.fact, score: e.score }));
  if (!facts.length) {
    const defaults = ["nps_breakdown", "satisfaction", "residence_country", "importance", "spending"];
    facts = data.facts
      .filter((f) => defaults.includes(f.id))
      .slice(0, limit)
      .map((f) => ({ ...f, score: 3 }));
  }

  return {
    parsed,
    topicMatched,
    keyFigures: data.key_figures,
    facts
  };
}

function formatRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return rows
    .slice(0, 12)
    .map((row) =>
      "    " +
      Object.entries(row)
        .map(([k, v]) => `${k}=${v}`)
        .join(" / ")
    )
    .join("\n");
}

function formatFact(fact) {
  const lines = [`#${fact.id} [${fact.topic}${fact.n ? ` / N=${fact.n}` : ""}]`];
  if (fact.score_value || fact.score) {
    // not used; placeholder
  }
  if (fact.rate) lines.push(`  集計: ${fact.rate}`);
  if (fact.interest_rate) lines.push(`  関心率: ${fact.interest_rate}`);
  if (fact.rows && fact.rows.length) {
    lines.push("  rows:");
    lines.push(formatRows(fact.rows));
  }
  if (fact.awareness) {
    lines.push("  awareness:");
    lines.push(formatRows(fact.awareness));
  }
  if (fact.experience) {
    lines.push("  experience:");
    lines.push(formatRows(fact.experience));
  }
  if (fact.comparison_western_male) {
    lines.push("  比較（西洋圏男性）:");
    if (Array.isArray(fact.comparison_western_male)) {
      lines.push(formatRows(fact.comparison_western_male));
    } else {
      for (const [group, vals] of Object.entries(fact.comparison_western_male)) {
        lines.push(`    ${group}: ${Object.entries(vals).map(([k, v]) => `${k}=${v}`).join(" / ")}`);
      }
    }
  }
  if (fact.note) lines.push(`  備考: ${fact.note}`);
  return lines.join("\n");
}

export function buildLgbtqEvidence(message) {
  const data = loadLgbtq();
  const { facts, topicMatched, keyFigures } = findRelevantLgbtqFacts(message);

  const header = [
    "LGBTQ+ SURVEY EVIDENCE (allowed source: Eagle Osaka 2025 LGBTQ+ Travel Survey)",
    `Source: ${data.source_label}`,
    `Sample: N=${data.sample.n}, ${data.sample.questions}Q, ${data.sample.period} @ ${data.sample.location}`,
    `Bias: ${data.sample.bias_note}`,
    `Topic matched (LGBTQ+ keyword detected): ${topicMatched ? "yes" : "no"}`
  ];

  if (!facts.length) {
    return {
      hasEvidence: false,
      block: [
        ...header,
        "",
        "Matched facts: NONE",
        "LGBTQ+ survey does not cover this question (or the question is not LGBTQ+ specific)."
      ].join("\n")
    };
  }

  const kfLines = keyFigures.map(
    (k) => `  - ${k.label}: ${k.value} (${k.context})`
  );

  return {
    hasEvidence: true,
    block: [
      ...header,
      "",
      "Key figures (use for headline claims):",
      ...kfLines,
      "",
      `Matched facts (${facts.length}). Quote numbers ONLY from this list:`,
      ...facts.map((f) => formatFact(f))
    ].join("\n")
  };
}

export function lgbtqSourceMeta() {
  const data = loadLgbtq();
  return { source_label: data.source_label };
}
