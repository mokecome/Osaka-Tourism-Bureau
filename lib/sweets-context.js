import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sweetsPath = path.resolve(__dirname, "../data/osaka-sweets-page.json");

let sweetsCache;

function loadSweets() {
  if (!sweetsCache) {
    const raw = readFileSync(sweetsPath, "utf8").replace(/^﻿/, "");
    sweetsCache = JSON.parse(raw);
  }
  return sweetsCache;
}

// Tokens that indicate the user is asking about Osaka sweets/desserts.
// Used both for query gating (decide if the sweets page is relevant at
// all) and as synthetic tokens during per-item scoring.
const SWEETS_TOPIC_KEYWORDS = [
  // CJK
  "甜點", "甜点", "甜品", "點心", "点心", "甜食", "甜的",
  "蛋糕", "芭菲", "聖代", "雪糕", "冰淇淋", "冰激凌", "冰沙", "冰品",
  "棉花糖", "棉質糖果", "薄餅", "薄烤餅", "鬆餅", "華夫餅", "格子餅",
  "可麗餅", "甜筒", "霜淇淋", "金箔", "蘋果", "巧克力", "覆盆子",
  "咖啡廳", "咖啡店", "カフェ", "cafe", "café", "下午茶", "甜甜圈",
  "instagram", "ig 拍照", "拍照", "打卡", "網紅", "网红",
  // Japanese
  "スイーツ", "ケーキ", "パフェ", "アイス", "ジェラート",
  "スムージー", "パンケーキ", "クレープ", "わたあめ", "綿あめ",
  // English
  "sweet", "sweets", "dessert", "desserts", "cake", "ice cream",
  "smoothie", "pancake", "candy", "cotton candy", "parfait",
  "instagrammable", "instagram-worthy"
];

const OSAKA_AREA_HINTS = [
  "大阪", "osaka", "梅田", "難波", "心齋橋", "心斎橋", "天滿", "天满",
  "京橋", "京桥", "都島", "都岛", "穀町", "谷町", "大阪城", "namba",
  "shinsaibashi", "umeda"
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

  return [...tokens].filter((token) => token.length > 1);
}

function isOnTopic(normalized) {
  return SWEETS_TOPIC_KEYWORDS.some((kw) => normalized.includes(normalizeText(kw)));
}

function isOsakaScope(normalized) {
  return OSAKA_AREA_HINTS.some((kw) => normalized.includes(normalizeText(kw)));
}

function scoreItem(item, parsed, topicMatched) {
  const name = normalizeText(item.name);
  const shop = normalizeText(item.shop);
  const desc = normalizeText(item.description);
  const addr = normalizeText(item.address);
  const area = normalizeText(item.area);

  let score = 0;
  if (topicMatched) score += 6; // page-level topic relevance
  for (const token of parsed.tokens) {
    if (!token) continue;
    if (name.includes(token)) score += 8;
    if (shop.includes(token)) score += 6;
    if (desc.includes(token)) score += 4;
    if (area.includes(token)) score += 5;
    if (addr.includes(token)) score += 3;
  }
  return score;
}

const MIN_ITEM_SCORE = 6;

// Returns matched items from the sweets page.  HARD gate: unless the
// question contains an actual sweets / dessert / café keyword
// (topicMatched), this module returns nothing — otherwise common Osaka
// place names (大阪 / 難波 / 心齋橋) embedded in shop addresses would let
// completely unrelated questions like 「大阪燒的歷史」 or 「一蘭拉麵」 leak
// the sweets list into the prompt.
export function findRelevantSweets(message, limit = 11) {
  const sweets = loadSweets();
  const normalized = normalizeText(message);
  const tokens = tokenize(message);
  const topicMatched = isOnTopic(normalized);
  const osakaScoped = isOsakaScope(normalized);
  const parsed = { tokens, normalized };

  if (!topicMatched) {
    return { parsed, topicMatched, osakaScoped, items: [] };
  }

  const scored = [];
  for (const item of sweets.items) {
    const score = scoreItem(item, parsed, topicMatched);
    if (score < MIN_ITEM_SCORE) continue;
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // For a broad sweets ask ("推薦大阪甜點店") that produced no specific
  // ranking, fall back to the full curated list so the bot can recommend.
  let items = scored.slice(0, limit).map((entry) => ({ ...entry.item, score: entry.score }));
  if (!items.length) {
    items = sweets.items.slice(0, limit).map((item) => ({ ...item, score: 6 }));
  }

  return { parsed, topicMatched, osakaScoped, items };
}

function formatItemLine(item) {
  const parts = [
    `#${item.id} ${item.name} / ${item.shop}`,
    `  描述：${item.description}`,
    `  地址：${item.address}`
  ];
  if (item.hours) parts.push(`  營業時間：${item.hours}`);
  if (item.phone) parts.push(`  電話：${item.phone}`);
  if (item.area) parts.push(`  區域：${item.area}`);
  return parts.join("\n");
}

export function buildSweetsEvidence(message) {
  const sweets = loadSweets();
  const { items, topicMatched } = findRelevantSweets(message);

  const header = [
    "SWEETS PAGE EVIDENCE (only allowed external source)",
    `Source URL: ${sweets.source_url}`,
    `Page title: ${sweets.page_title}`,
    `Fetched at: ${sweets.fetched_at}`,
    `Topic matched (sweets/dessert detected): ${topicMatched ? "yes" : "no"}`
  ];

  if (!items.length) {
    return {
      hasEvidence: false,
      block: [
        ...header,
        "",
        "Matched items: NONE",
        "The sweets page does not list anything matching this question."
      ].join("\n")
    };
  }

  return {
    hasEvidence: true,
    block: [
      ...header,
      "",
      `Matched items (${items.length}). Quote shop names, addresses, hours, and phone numbers ONLY from this list:`,
      ...items.map((item) => formatItemLine(item))
    ].join("\n")
  };
}

export function sweetsSourceMeta() {
  const sweets = loadSweets();
  return {
    source_url: sweets.source_url,
    page_title: sweets.page_title
  };
}
