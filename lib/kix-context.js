import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKET_ALIASES } from "./dashboard-context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kixPath = path.resolve(__dirname, "../data/osaka-kix.json");

let kixCache;

function loadKix() {
  if (!kixCache) {
    const raw = readFileSync(kixPath, "utf8").replace(/^﻿/, "");
    kixCache = JSON.parse(raw);
  }
  return kixCache;
}

// Dashboard uses 12 specific countries; KIX aggregates them into 9
// regional groups.  This map translates a dashboard market detection
// into the corresponding KIX market id.
const KIX_FROM_DASHBOARD = new Map([
  ["韓國", "korea"],
  ["中國", "china"],
  ["香港", "hk"],
  ["台灣", "taiwan"],
  ["泰國", "sea_other"],
  ["越南", "sea_other"],
  ["菲律賓", "philippines"],
  ["新加坡", "sea_other"],
  ["馬來西亞", "sea_other"],
  ["印尼", "sea_other"],
  ["美國", "north_america"],
  ["加拿大", "north_america"]
]);

// Additional aliases for KIX-only group markets that dashboard does not
// cover at the country level (EU, regional groupings).
const KIX_GROUP_ALIASES = new Map([
  ["europe", [
    "europe", "european", "ヨーロッパ", "歐洲", "欧洲", "eu",
    "england", "uk", "germany", "france", "italy", "spain",
    "イギリス", "ドイツ", "フランス", "イタリア", "スペイン",
    "英國", "英国", "德國", "德国", "法國", "法国",
    "義大利", "意大利", "西班牙", "歐美", "欧米"
  ]],
  ["north_america", [
    "north america", "northam", "北米", "北美", "北アメリカ"
  ]],
  ["sea_other", [
    "southeast asia", "東南亞", "东南亚", "東南アジア", "asean"
  ]],
  ["australia_nz", [
    "australia", "new zealand", "オーストラリア", "ニュージーランド",
    "豪洲", "澳洲", "紐西蘭", "纽西兰", "新西蘭", "新西兰",
    "anz", "aussie", "kiwi", "オセアニア", "大洋洲"
  ]]
]);

// Keywords that should pull the key_figures block (overall Osaka stats).
const KIX_KEYFIGURE_KEYWORDS = [
  "nps", "推奨度", "推奨", "推荐度", "推薦度", "ネットプロモーター",
  "満足度", "満足率", "满足度", "满意度", "滿足", "滿意",
  "平均滞在", "平均滞在期間", "滞在日数", "滞在日數",
  "府域", "府内", "市以外", "府域訪問", "府内訪問",
  "リピーター", "リピーター率", "再訪", "重複",
  "消費単価", "消費額", "消費單價", "客単価", "spending per person",
  "key figures", "主要指標", "全体傾向",
  "関空", "関西空港", "関西国際空港", "kix", "kanku", "出口調査"
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[，、。．・：:；;！？!?（）()[\]{}"“”'‘’`~|/\\<>@#$%^&*_+=-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Reuse dashboard's word-boundary matching for short Latin aliases.
function aliasMatches(alias, normalized) {
  const a = normalizeText(alias);
  if (!a) return false;
  if (a.length <= 3 && /^[a-z0-9]+$/.test(a)) {
    const boundary = new RegExp(`(^|[^a-z0-9])${a}([^a-z0-9]|$)`, "i");
    return boundary.test(normalized);
  }
  return normalized.includes(a);
}

function detectKixMarkets(normalized) {
  const hits = new Set();

  // (a) Map detected dashboard markets to KIX groups.
  for (const [market, aliases] of MARKET_ALIASES) {
    if (aliases.some((alias) => aliasMatches(alias, normalized))) {
      const kixId = KIX_FROM_DASHBOARD.get(market);
      if (kixId) hits.add(kixId);
    }
  }

  // (b) Direct KIX group aliases (Europe, ANZ, SEA, NA labels).
  for (const [kixId, aliases] of KIX_GROUP_ALIASES) {
    if (aliases.some((alias) => aliasMatches(alias, normalized))) {
      hits.add(kixId);
    }
  }

  return [...hits];
}

function detectKeyfigureKeyword(normalized) {
  return KIX_KEYFIGURE_KEYWORDS.some((kw) =>
    normalized.includes(normalizeText(kw))
  );
}

export function findRelevantKix(message) {
  const data = loadKix();
  const normalized = normalizeText(message);
  const marketIds = detectKixMarkets(normalized);
  const wantKeyFigures = detectKeyfigureKeyword(normalized);

  const markets = data.markets.filter((m) => marketIds.includes(m.id));
  const keyFigures = wantKeyFigures ? data.key_figures : [];

  return {
    marketIds,
    wantKeyFigures,
    markets,
    keyFigures,
    hasEvidence: markets.length > 0 || keyFigures.length > 0
  };
}

function formatMarket(m) {
  const lines = [
    `## ${m.name_ja} (${m.name_zh_hant} / ${m.name_en}) [id=${m.id}]`,
    `  概要: ${m.summary}`,
    `  年齢: ${m.age}`,
    `  同行者: ${Array.isArray(m.companion) ? m.companion.join(" / ") : m.companion}`,
    `  楽しんだこと: ${m.enjoyed.join(" / ")}`,
    `  訪問地: ${m.venues.join(" / ")}`,
    `  興味関心: ${m.interests.join(" / ")}`,
    `  一人当たり消費: ${m.spend}`,
    `  感情便益: ${m.emotion.join(" / ")}`,
    `  情報発信媒体: ${m.media.join(" / ")}`
  ];
  return lines.join("\n");
}

function formatKeyFigures(figures) {
  return figures.map((k) => `  - ${k.label}: ${k.value} (${k.context})`).join("\n");
}

export function buildKixEvidence(message) {
  const data = loadKix();
  const { marketIds, wantKeyFigures, markets, keyFigures } = findRelevantKix(message);

  const header = [
    "KIX 2024 EVIDENCE (allowed source: 関西空港出口調査 2024年度)",
    `Source: ${data.source_label}`,
    `Sample: N=${data.survey_meta.sample_size}, ${data.survey_meta.languages.join("/")}`,
    `Detected KIX markets: ${marketIds.join(" / ") || "(none)"}`,
    `Key-figure keyword detected: ${wantKeyFigures ? "yes" : "no"}`
  ];

  if (!markets.length && !keyFigures.length) {
    return {
      hasEvidence: false,
      block: [
        ...header,
        "",
        "Matched KIX content: NONE",
        "KIX 2024 survey does not cover this question."
      ].join("\n")
    };
  }

  const lines = [...header, ""];
  if (keyFigures.length) {
    lines.push("Key figures (use for headline claims about overall Osaka inbound):");
    lines.push(formatKeyFigures(keyFigures));
    lines.push("");
  }
  if (markets.length) {
    lines.push(`Matched market summaries (${markets.length}). Quote characteristics ONLY from this list:`);
    lines.push("");
    for (const m of markets) {
      lines.push(formatMarket(m));
      lines.push("");
    }
  }

  return { hasEvidence: true, block: lines.join("\n").trimEnd() };
}

export function kixSourceMeta() {
  const data = loadKix();
  return { source_label: data.source_label };
}
