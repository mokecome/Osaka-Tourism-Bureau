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

// Tokens that indicate the user is asking about Osaka sweets / cafés /
// recommendations.  Per user directive (2026-05-26), generic shop / food /
// recommendation vocabulary also counts — the sweets page is the ONLY
// allowed external source for shop suggestions, so it should surface for
// any "where to eat" style question unless the question is clearly about
// a non-sweets food (see NON_SWEETS_FOOD_BLOCKLIST below).
const SWEETS_TOPIC_KEYWORDS = [
  // Dessert / sweet / café specific
  "甜點", "甜点", "甜品", "點心", "点心", "甜食", "甜的",
  "蛋糕", "芭菲", "聖代", "雪糕", "冰淇淋", "冰激凌", "冰沙", "冰品",
  "棉花糖", "棉質糖果", "薄餅", "薄烤餅", "鬆餅", "華夫餅", "格子餅",
  "可麗餅", "甜筒", "霜淇淋", "金箔", "蘋果", "巧克力", "覆盆子",
  "咖啡廳", "咖啡店", "カフェ", "cafe", "café", "下午茶", "甜甜圈",
  "instagram", "ig 拍照", "拍照", "打卡", "網紅", "网红",
  // Japanese dessert / café
  "スイーツ", "ケーキ", "パフェ", "アイス", "ジェラート",
  "スムージー", "パンケーキ", "クレープ", "わたあめ", "綿あめ",
  // English dessert / café
  "sweet", "sweets", "dessert", "desserts", "cake", "ice cream",
  "smoothie", "pancake", "candy", "cotton candy", "parfait",
  "instagrammable", "instagram-worthy",
  // Generic shop / restaurant / recommendation (loosened gating)
  "店", "餐廳", "餐厅", "食店", "小店", "店家",
  "好吃", "美食", "美味", "好喝", "必吃", "必訪", "必去", "必嘗",
  "推薦", "推荐", "推介", "介紹", "介绍", "嚐", "嘗",
  "午餐", "晚餐", "早餐", "早午餐", "下午茶", "宵夜", "brunch",
  "逛街", "探店", "探訪",
  "お店", "店舗", "グルメ", "レストラン", "食事", "ランチ", "ディナー",
  "モーニング", "おすすめ", "行きたい",
  "restaurant", "eatery", "food", "foodie", "where to eat",
  "where to go", "recommend", "recommendation", "best", "must-try",
  "must-visit", "lunch", "dinner", "breakfast", "eat", "meal"
];

// Non-Osaka cities/regions.  If the user explicitly asks about a city
// outside Osaka, the sweets page (which only lists Osaka shops) is NOT
// the answer — even if the question also contains 「推薦」 or 「飯店」.
// Guards against 「沖繩飯店推薦」, 「京都甜點」, etc.
const NON_OSAKA_LOCATION_BLOCKLIST = [
  "沖繩", "沖縄", "okinawa",
  "京都", "kyoto",
  "東京", "東京都", "tokyo",
  "北海道", "札幌", "hokkaido", "sapporo",
  "福岡", "fukuoka", "博多",
  "名古屋", "nagoya", "愛知",
  "横浜", "横濱", "yokohama",
  "神戸", "神戶", "kobe",
  "奈良", "nara",
  "広島", "廣島", "hiroshima",
  "長崎", "nagasaki",
  "鹿児島", "鹿兒島", "kagoshima",
  "仙台", "sendai",
  "金沢", "kanazawa",
  "沖縄県"
];

// Non-sweets food intents.  If the user explicitly asks about ramen,
// sushi, okonomiyaki, etc., the sweets page is NOT the answer — even if
// the question also contains 「推薦」 or 「店」.  This guards against
// 「推薦大阪一蘭拉麵分店」 leaking the dessert list.
const NON_SWEETS_FOOD_BLOCKLIST = [
  // Japanese cuisine that isn't on the sweets page
  "拉麵", "拉面", "ラーメン", "ramen",
  "壽司", "寿司", "鮨", "sushi", "刺身", "sashimi",
  "燒肉", "烧肉", "焼肉", "yakiniku", "燒烤", "烧烤",
  "大阪燒", "御好燒", "御好烧", "お好み焼", "okonomiyaki",
  "章魚燒", "章鱼烧", "たこ焼", "tako", "takoyaki",
  "烏龍麵", "うどん", "udon",
  "蕎麥", "そば", "soba",
  "天婦羅", "天ぷら", "tempura",
  "串燒", "串焼", "串烧", "串炸", "串カツ", "kushikatsu",
  "居酒屋", "izakaya",
  "牛丼", "gyudon", "親子丼", "海鮮丼",
  "鰻", "うなぎ", "unagi", "鰻魚",
  "河豚", "ふぐ", "fugu",
  "鉄板焼", "鐵板燒", "teppanyaki", "鉄板",
  "餃子", "gyoza", "煎餃",
  "炸雞", "唐揚げ", "karaage",
  "懐石", "懷石", "kaiseki", "割烹",
  "燒鳥", "焼き鳥", "yakitori"
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

function isBlockedFoodIntent(normalized) {
  return NON_SWEETS_FOOD_BLOCKLIST.some((kw) =>
    normalized.includes(normalizeText(kw))
  );
}

function isBlockedByLocation(normalized) {
  return NON_OSAKA_LOCATION_BLOCKLIST.some((kw) =>
    normalized.includes(normalizeText(kw))
  );
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

// Returns matched items from the sweets page.  Two gates:
//   1. Topic gate: the question must contain a sweets / café / shop /
//      recommendation keyword.  Without this, generic Osaka place names
//      in shop addresses would let unrelated questions leak the list.
//   2. Blocklist gate: even when (1) matches, if the question explicitly
//      asks about a non-sweets food (ramen, sushi, okonomiyaki, ...) we
//      bail — the sweets page is not the right source.
export function findRelevantSweets(message, limit = 11) {
  const sweets = loadSweets();
  const normalized = normalizeText(message);
  const tokens = tokenize(message);
  const topicMatched = isOnTopic(normalized);
  const blockedByFood = isBlockedFoodIntent(normalized);
  const blockedByLocation = isBlockedByLocation(normalized);
  const osakaScoped = isOsakaScope(normalized);
  const parsed = { tokens, normalized };

  if (!topicMatched || blockedByFood || blockedByLocation) {
    return {
      parsed,
      topicMatched,
      osakaScoped,
      blockedByFood,
      blockedByLocation,
      items: []
    };
  }

  const scored = [];
  for (const item of sweets.items) {
    const score = scoreItem(item, parsed, topicMatched);
    if (score < MIN_ITEM_SCORE) continue;
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // For a broad ask that produced no specific ranking ("推薦大阪甜點店",
  // "梅田美食"), fall back to the full curated list so the bot can pick.
  let items = scored.slice(0, limit).map((entry) => ({ ...entry.item, score: entry.score }));
  if (!items.length) {
    items = sweets.items.slice(0, limit).map((item) => ({ ...item, score: 6 }));
  }

  return { parsed, topicMatched, osakaScoped, blockedByFood, items };
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
