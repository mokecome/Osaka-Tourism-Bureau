import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.resolve(__dirname, "../data/osaka-dashboard.json");

let dashboardCache;

function loadDashboard() {
  if (!dashboardCache) {
    const raw = readFileSync(dashboardPath, "utf8").replace(/^﻿/, "");
    dashboardCache = JSON.parse(raw);
  }
  return dashboardCache;
}

// SMP §2 / §4: market and topic alias tables so structural filtering does
// not depend on a single spelling.  Keys are canonical labels used in the
// xlsx; values are alias substrings checked against the normalized query.
const MARKET_ALIASES = new Map([
  ["韓國", ["韓國", "韓国", "韩国", "korea", "south korea", "republic of korea", "kr"]],
  ["中國", ["中國", "中国", "china", "mainland china", "cn", "中国大陸", "中国大陆"]],
  ["香港", ["香港", "hong kong", "hongkong", "hk"]],
  ["台灣", ["台灣", "台湾", "台灣地區", "taiwan", "tw", "republic of china"]],
  ["泰國", ["泰國", "泰国", "thailand", "thai", "タイ", "th"]],
  ["越南", ["越南", "vietnam", "viet nam", "ベトナム", "vn"]],
  ["菲律賓", ["菲律賓", "菲律宾", "philippines", "philippine", "フィリピン", "ph"]],
  ["新加坡", ["新加坡", "singapore", "シンガポール", "sg"]],
  ["馬來西亞", ["馬來西亞", "马来西亚", "malaysia", "マレーシア", "my"]],
  ["印尼", ["印尼", "印度尼西亞", "印度尼西亚", "indonesia", "インドネシア", "id"]],
  ["美國", ["美國", "美国", "usa", "us", "america", "united states", "アメリカ", "米国"]],
  ["加拿大", ["加拿大", "canada", "カナダ", "ca"]]
]);

// SMP §5: sheet-level topic keywords boost the right table before
// per-item scoring.  Keeps small markets / generic queries on track.
const SHEET_TOPIC_KEYWORDS = new Map([
  ["01_交叉分析_性別", ["性別", "性别", "gender", "男性", "女性", "男", "女", "男女"]],
  [
    "02_旅行頻度_同行者",
    [
      "同行", "同伴", "同行者", "companion", "with whom", "travel partner",
      "夫婦", "パートナー", "家族", "ひとり", "一人", "友人", "朋友", "孩子",
      "頻度", "frequency"
    ]
  ],
  [
    "03_大阪認知_訪問経験",
    [
      "認知", "认知", "awareness", "awareness level", "知名度", "詳しい",
      "知っている", "訪問経験", "visit", "visited", "知道", "去過", "去过"
    ]
  ],
  [
    "04_旅遊意向",
    [
      "旅遊意向", "旅行意向", "気持ち", "気分", "feeling", "mood", "motivation",
      "リラックス", "楽しみ", "得たい", "希望", "relax", "refresh"
    ]
  ],
  [
    "05_目的地重視点",
    [
      "重視", "重视", "importance", "選ぶ", "選択", "選定基準", "選び方",
      "美術館", "ショッピング", "重視点", "shopping", "museum", "food",
      "destination", "what they look for"
    ]
  ],
  [
    "06_大阪目的地形象",
    [
      "形象", "image", "印象", "イメージ", "該当", "大阪是", "大阪像",
      "characteristics", "perception", "夜景", "night view", "ナイト",
      "ライトアップ"
    ]
  ],
  [
    "07_活動選定因素",
    [
      "活動選定", "選定因素", "選び方", "selection", "重視因素", "価格",
      "信頼", "アクセス", "予約", "price", "reliability", "booking"
    ]
  ],
  [
    "08_大阪活動意向",
    [
      "活動", "活动", "アクティビティ", "activity", "activities", "想做",
      "行いたい", "やりたい", "want to do", "体験", "experience", "夜景",
      "night view", "ライトアップ", "イルミネーション", "do in osaka"
    ]
  ],
  [
    "09_交通手段決定時期",
    [
      "交通", "transport", "transportation", "決定時期", "公共交通",
      "レンタカー", "いつ決める", "出発前"
    ]
  ],
  [
    "10_資訊收集來源",
    [
      "資訊", "情報", "資訊收集", "情報収集", "information", "source",
      "youtube", "sns", "口コミ", "情報源", "ホームページ", "アプリ",
      "親族", "知人", "tv", "テレビ", "新聞"
    ]
  ]
]);

const SUPERLATIVE_HINTS = [
  "最高", "最多", "最大", "最強", "最も", "top", "highest", "largest",
  "ranking", "ランキング", "首位", "上位", "排名"
];

// SMP §4: cross-language item synonym groups. If the query matches ANY
// member of a group, the other members become synthetic query tokens so a
// English ask like "night view" can still score Japanese items containing
// 夜景 / ライトアップ / イルミネーション.
const ITEM_SYNONYM_GROUPS = [
  ["night view", "夜景", "ライトアップ", "イルミネーション", "ナイト", "夜景觀光"],
  ["shopping", "ショッピング", "購物", "デパート", "ショッピングモール", "百貨"],
  ["museum", "美術館", "博物館", "ミュージアム"],
  ["food", "グルメ", "レストラン", "美食", "高級レストラン", "美食體驗"],
  ["theme park", "テーマパーク", "遊園地", "主題公園", "アトラクション"],
  ["traditional", "伝統", "伝統工芸", "工芸", "傳統", "職人"],
  ["sns", "social media", "instagram", "facebook", "x ", "twitter", "tiktok"],
  ["youtube", "動画", "video site", "影片", "動画サイト"],
  ["family", "家族", "親族", "子ども", "孩子"],
  ["couple", "夫婦", "パートナー", "恋人", "情侶", "夫妇"],
  ["solo", "ひとり", "一人", "獨自", "独自", "self alone"],
  ["friends", "友人", "朋友", "同僚"],
  ["price", "価格", "費用", "コスト", "價格", "便宜"],
  ["transport", "transportation", "交通", "公共交通", "レンタカー", "rental car"],
  ["art", "芸術", "アート", "藝術", "現代文化"]
];

const RECOGNIZED_TOPIC_TOKENS = new Set();
for (const aliases of SHEET_TOPIC_KEYWORDS.values()) {
  for (const alias of aliases) RECOGNIZED_TOPIC_TOKENS.add(normalizeText(alias));
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

// SMP §4: parse question into structured fields before retrieval.
export function parseQuestion(message) {
  const normalized = normalizeText(message);
  const baseTokens = tokenize(message);

  const markets = [];
  for (const [market, aliases] of MARKET_ALIASES) {
    if (aliases.some((alias) => normalized.includes(normalizeText(alias)))) {
      markets.push(market);
    }
  }

  const sheets = [];
  for (const [sheetId, keywords] of SHEET_TOPIC_KEYWORDS) {
    if (keywords.some((kw) => normalized.includes(normalizeText(kw)))) {
      sheets.push(sheetId);
    }
  }

  // Expand tokens with cross-language synonyms (SMP §4 alias table).
  const expanded = new Set(baseTokens);
  for (const group of ITEM_SYNONYM_GROUPS) {
    const hit = group.some((member) =>
      normalized.includes(normalizeText(member))
    );
    if (!hit) continue;
    for (const member of group) {
      for (const token of tokenize(member)) expanded.add(token);
    }
  }

  const wantsRanking = SUPERLATIVE_HINTS.some((hint) =>
    normalized.includes(normalizeText(hint))
  );

  return {
    normalized,
    tokens: [...expanded],
    markets,
    sheets,
    wantsRanking
  };
}

function scoreCell(cell, parsed) {
  let score = 0;

  if (parsed.markets.length) {
    if (parsed.markets.includes(cell.market)) score += 40;
    else score -= 30; // hard penalty so wrong-market rows fall below threshold
  }

  if (parsed.sheets.length) {
    if (parsed.sheets.includes(cell.sheet_id)) score += 18;
    else score -= 4;
  }

  const itemText = normalizeText(cell.item);
  const sheetText = normalizeText(cell.sheet_title);

  for (const token of parsed.tokens) {
    if (!token) continue;
    if (itemText.includes(token)) score += 8;
    if (sheetText.includes(token)) score += 2;
  }

  return score;
}

// Minimum score required for a cell to count as evidence.  Tuned so that:
//   - market match alone (+40) clearly passes
//   - sheet match alone (+18) passes
//   - a coincidental 2-char token like 「市場」 or 「大阪」 contributing only
//     +8 does NOT pass, which prevents off-topic questions from leaking
//     unrelated cells into the prompt.
const MIN_EVIDENCE_SCORE = 14;

// SMP §5 / §6: window candidates by structural filters first, then rank by
// token overlap.  Returns cells with explicit evidence metadata so the LLM
// cannot hallucinate values it never saw.
export function findRelevantCells(message, limit = 40) {
  const dashboard = loadDashboard();
  const parsed = parseQuestion(message);

  const scored = [];
  for (const cell of dashboard.cells) {
    const score = scoreCell(cell, parsed);
    if (score < MIN_EVIDENCE_SCORE) continue;
    scored.push({ cell, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    parsed,
    cells: scored.slice(0, limit).map((entry) => ({ ...entry.cell, score: entry.score }))
  };
}

function formatEvidenceLine(cell) {
  return `[${cell.sheet_id} | ${cell.value_type}] ${cell.item} / ${cell.market} = ${cell.display}`;
}

function describeMatchedSheets(cells) {
  const seen = new Set();
  const titles = [];
  for (const cell of cells) {
    if (seen.has(cell.sheet_id)) continue;
    seen.add(cell.sheet_id);
    titles.push(`${cell.sheet_id} — ${cell.sheet_title} (${cell.value_type})`);
  }
  return titles;
}

export function buildDashboardEvidence(message) {
  const dashboard = loadDashboard();
  const { parsed, cells } = findRelevantCells(message);

  const header = [
    "DASHBOARD EVIDENCE (大阪海外市場調查_dashboard.xlsx)",
    `Source file: ${dashboard.source_file}`,
    `Markets known to this dataset: ${dashboard.markets.join(" / ")}`,
    `Sheets in this dataset: ${dashboard.sheets
      .map((s) => `${s.sheet_id}(${s.value_type})`)
      .join(" , ")}`,
    `Detected markets in question: ${parsed.markets.join(" / ") || "(none)"}`,
    `Detected topic sheets: ${parsed.sheets.join(" / ") || "(none)"}`,
    "Value format: 百分比 already shown as XX.X%; 評分 already shown as 0-10 scale."
  ];

  if (!cells.length) {
    return {
      hasEvidence: false,
      block: [
        ...header,
        "",
        "Matched cells: NONE",
        "The dashboard does not contain a row that matches this question."
      ].join("\n")
    };
  }

  const matchedSheets = describeMatchedSheets(cells);
  const lines = cells.map(formatEvidenceLine);

  return {
    hasEvidence: true,
    block: [
      ...header,
      "",
      `Matched sheets (${matchedSheets.length}):`,
      ...matchedSheets.map((line) => `  - ${line}`),
      "",
      `Evidence cells (${cells.length}). Quote numbers only from this list:`,
      ...lines.map((line) => `  ${line}`)
    ].join("\n")
  };
}

export function dashboardRefusalText(responseLanguage) {
  if (responseLanguage === "Chinese" || responseLanguage === "TraditionalChinese") {
    return "目前無相關數據";
  }
  if (responseLanguage === "English") {
    return "No relevant data available in the Osaka overseas market survey dashboard.";
  }
  return "大阪海外市場調査ダッシュボードに該当するデータがありません。";
}

// Used by buildAnswerDisplay so the answer card surfaces the same sheet
// the evidence came from.
export function primarySheetMeta(message) {
  const { cells } = findRelevantCells(message, 1);
  if (!cells.length) return null;
  const [top] = cells;
  return {
    sheet_id: top.sheet_id,
    sheet_title: top.sheet_title,
    value_type: top.value_type,
    market: top.market,
    item: top.item,
    display: top.display
  };
}
