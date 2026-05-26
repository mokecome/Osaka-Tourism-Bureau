import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kbPath = path.resolve(__dirname, "../data/osaka-kb.json");

let kbCache;

function loadKb() {
  if (!kbCache) {
    const raw = readFileSync(kbPath, "utf8").replace(/^﻿/, "");
    kbCache = JSON.parse(raw);
  }
  return kbCache;
}

// Per-chapter tag vocabulary.  Used both to gate AND to score: when a
// question contains tags belonging to a chapter, that chapter scores.
// This is the most important index because the KB body text uses CJK
// without word boundaries, so plain token overlap is noisy.
const CHAPTER_TAGS = {
  "ch01": ["大阪", "基本", "概覽", "人口", "面積", "府", "都市", "天下廚房", "搞笑", "吉本", "introduction"],
  "ch02": ["地區", "区", "區", "北區", "kita", "南區", "minami", "灣區", "bay", "天王寺", "阿倍野", "大阪城區域", "北部", "東部", "南部", "梅田", "難波", "心齋橋", "道頓堀", "新世界", "districts"],
  "ch03": [
    "料理", "美食", "食物", "靈魂食物", "soul food",
    "章魚燒", "たこ焼", "takoyaki",
    "御好燒", "大阪燒", "お好み焼", "okonomiyaki", "煎餅",
    "炸串", "串かつ", "kushikatsu",
    "壽司", "押し寿司", "箱壽司", "sushi", "回轉壽司", "回転寿司",
    "蛋包飯", "オムライス", "omurice",
    "烏冬麵", "うどん", "udon",
    "豬肉包", "豚まん",
    "割烹", "kappo",
    "紙鍋",
    "烤肉", "焼肉", "yakiniku", "燒肉", "內臟", "ホルモン",
    "拉麵", "ラーメン", "ramen",
    "地下商場", "デパ地下",
    "咖喱", "カレー", "curry",
    "啤酒花園", "ビアガーデン", "beer garden"
  ],
  "ch04": [
    "景點", "景点", "attraction", "spot",
    "大阪城", "天守閣", "osaka castle",
    "任天堂", "nintendo", "super nintendo world",
    "通天閣", "tsutenkaku", "新世界",
    "海遊館", "kaiyukan", "水族館", "aquarium",
    "USJ", "環球影城", "universal studios",
    "梅田藍天大廈", "空中庭園",
    "空庭溫泉", "bay tower",
    "道頓堀水上", "聖瑪麗亞", "santa maria",
    "杯麵博物館", "cup noodle",
    "NIFREL",
    "御座船", "黃金和船",
    "四天王寺", "仁德天皇陵", "古墳",
    "難波大花月",
    "大阪城公園", "西之丸", "毛馬櫻之宮", "箕面公園", "金剛山", "天保山", "中之島"
  ],
  "ch05": ["行程", "路線", "itinerary", "route", "建議行程", "推薦行程", "一日遊", "範例"],
  "ch06": [
    "餐廳", "餐厅", "restaurant", "店家", "44 筆", "美食店家",
    "爐邊", "中国料理", "泰豊宮", "NELU", "高麗橋",
    "甜點天堂", "鐵板燒", "瀧見小路", "堂島", "北新地",
    "博多華味鳥", "Pivot BASE", "法善寺", "裡難波", "千日前道具",
    "Botejyu", "CHOJIRO", "MITSUYA", "金久右衛門", "大起水產",
    "冉冉小巷", "ジャンジャン", "壽喜燒", "松阪牛", "Ajibu",
    "宗右衛門", "中座食倒", "周防町", "KPG RIVER", "屋形船",
    "Gomoyon", "京橋 Coms", "TUGBOAT", "芭蕉庵", "園丁天芝",
    "Toretore", "奧河內", "泉佐野漁業", "Time Out Market"
  ],
  "ch07": [
    "購物", "shopping", "商店街",
    "心齋橋筋", "戎橋筋", "天神橋筋",
    "Grand Front", "LUCUA", "阪神梅田", "澱橋梅田", "Yodobashi",
    "EXPOCITY", "黑門市場", "大阪木津",
    "堂吉訶德", "Don Quijote", "Bic 相機", "Joshin",
    "KIX DUTY FREE", "免稅", "duty free",
    "永旺", "京阪百貨",
    "Amida", "粟米花", "巖花糖", "舞昆", "Ichibiri", "Naniwa",
    "Katashimo", "三國釀酒", "地酒", "日本酒", "sake"
  ],
  "ch08": [
    "票券", "ticket", "pass", "通行證",
    "樂遊券", "e-pass", "Premium Pass", "PREMIUM",
    "Enjoy Eco Card", "享受環保卡",
    "ICOCA", "IC卡", "IC 卡",
    "萬博公園通票"
  ],
  "ch09": [
    "交通", "transport", "transportation",
    "關西機場", "關西國際機場", "KIX",
    "伊丹", "伊丹機場", "大阪國際機場", "ITM",
    "新幹線", "shinkansen", "希望號", "のぞみ",
    "Osaka Metro", "地鐵", "metro", "御堂筋線", "谷町線", "四橋線", "中央線", "千日前線", "堺筋線", "長堀鶴見綠地", "南港",
    "大阪環狀線", "JR",
    "阪急", "阪神", "京阪", "近鐵", "南海", "阪堺", "叮叮電車",
    "單軌電車", "北大阪急行", "泉北高速",
    "城市巴士", "水上巴士", "渡船",
    "計程車", "taxi",
    "出租單車", "UMEGLE", "HUBchari", "rental bike"
  ],
  "ch10": [
    "Q&A", "常見問題", "faq",
    "古董", "antique", "跳蚤市場",
    "吸煙", "smoking",
    "天氣", "氣候", "weather",
    "兒童", "親子", "kids"
  ],
  "ch11": [
    "飲食文化", "天下廚房", "天下の台所", "食倒", "食い倒れ",
    "高湯", "だし",
    "道頓堀", "法善寺", "新世界", "黑門", "北新地", "宗右衛門",
    "庶民料理"
  ],
  "ch12": [
    "四季", "活動", "祭典", "祭", "events", "seasonal",
    "賞櫻", "桜", "cherry blossom", "毛馬", "西之丸",
    "天神祭", "煙火", "fireworks", "PL", "啤酒花園",
    "賞楓", "紅葉", "autumn leaves", "銀杏", "萬燈供養",
    "御堂筋彩燈", "彩燈", "illumination", "梅林", "賞梅", "初詣"
  ],
  "ch13": [
    "旅遊諮詢", "tourist information", "info center",
    "免費 Wi-Fi", "wifi", "wi-fi",
    "eSIM", "povo",
    "緊急", "emergency", "警察", "救護車", "消防",
    "電話", "phone"
  ],
  "ch14": [
    "體驗", "experience",
    "壽司製作", "茶道", "插畫", "漫畫教室", "egaco",
    "藝妓", "geisha",
    "日本傳統文化", "日本刀", "試斬",
    "食品樣品", "壽司卷",
    "巫女",
    "釀酒廠",
    "千利休", "茶道體驗",
    "ROAD BIKE", "落語家",
    "跆拳道"
  ],
  "ch15": [
    "官方網站", "official website", "official link", "URL",
    "osaka-info.jp", "e-pass.osaka-info", "osakametro.co.jp",
    "westjr.co.jp", "usj.co.jp", "kaiyukan.com", "osakacastle.net",
    "octb.osaka-info"
  ],
  "ch16": [
    "飲食文化", "美食家", "辻調", "辻廚師",
    "浪速", "なにわ", "魚庭",
    "橘子醋", "ポン酢", "河豚", "ふぐ", "てっちり",
    "堺刀", "包丁", "菜刀", "工匠",
    "B級美食",
    "大阪產", "素食", "vegan", "vegetarian"
  ],
  "ch17": [
    "流行文化", "pop culture",
    "日本橋", "Nipponbashi", "電子城",
    "動漫", "漫畫", "anime", "manga", "遊戲", "game",
    "女僕咖啡", "maid cafe",
    "cosplay", "扭蛋", "手辦", "模型",
    "Joshin", "JUMP SHOP", "口袋妖怪", "pokemon", "橡子共和國", "吉卜力", "ghibli",
    "kawaii",
    "忍者", "ninja", "武士", "samurai",
    "藝妓", "巫女",
    "日本刀",
    "電子競技", "esports", "e-sports",
    "京都漫畫", "手塚治蟲"
  ],
  "ch18": [
    "運動", "觀賽", "sports", "watching",
    "橄欖球", "rugby", "花園", "近鐵 Liners", "紅色颶風",
    "棒球", "baseball", "歐力士", "阪神虎", "京瓷巨蛋", "甲子園",
    "足球", "soccer", "football", "鋼巴", "Gamba", "櫻花", "Cerezo", "Panasonic Stadium", "Yanmar",
    "籃球", "basketball", "B 聯賽", "Evesa",
    "相撲", "sumo", "Edion Arena", "大相撲", "春場所",
    "排球", "volleyball", "V 聯賽"
  ],
  "ch19": [
    "全日本", "周遊", "day trip", "周邊",
    "京都", "kyoto", "金閣寺", "清水寺", "伏見稻荷", "嵐山",
    "神戶", "kobe", "異人館", "神戶牛", "有馬溫泉",
    "奈良", "nara", "東大寺", "大佛", "鹿群",
    "和歌山", "高野山", "熊野古道",
    "姬路", "himeji", "姬路城",
    "北海道", "札幌", "函館",
    "東北", "睡魔",
    "東京", "tokyo", "淺草寺", "東京鐵塔", "涉谷", "日光", "迪士尼",
    "中部", "名古屋", "白川鄉", "金澤", "福井",
    "廣島", "宮島", "嚴島", "瀨戶內",
    "九州", "福岡", "長崎", "別府", "鹿兒島",
    "沖繩", "沖縄"
  ],
  "ch20": [
    "便利服務", "Hands-Free", "空手觀光",
    "Call Center", "客服",
    "Wi-Fi", "OpenRoaming",
    "志願者", "volunteer",
    "醫療", "OHDr", "梅田國際", "HOTEL de DOCTOR",
    "TicketsToday", "當日票",
    "行李箱", "luggage", "修理",
    "Discover Osaka", "app"
  ],
  "ch21": [
    "注意事項", "notes", "tips",
    "吸煙", "smoking",
    "禮儀", "etiquette", "電車", "扶梯", "禁止邊走邊吃",
    "消費稅", "tax", "退稅", "免稅", "tax free",
    "緊急聯絡", "警察", "救護車",
    "信用卡", "credit card", "現金", "cash", "ATM"
  ],
  "ch22": [
    "近郊", "一日遊", "day trip",
    "京都", "神戶", "奈良", "高野山", "姬路", "伊賀", "忍者博物館"
  ]
};

// Build flat list of all KB tags for fast topic-gating check.
const KB_TOPIC_KEYWORDS = new Set();
for (const tags of Object.values(CHAPTER_TAGS)) {
  for (const t of tags) KB_TOPIC_KEYWORDS.add(t);
}
// Always-on Osaka identity tokens — having any of these in the question
// confirms the user is asking about Osaka.  Without one of these, KB
// returns nothing even if a chapter matches (e.g., chapter 19 lists
// Okinawa as a day trip — we don't want "沖繩飯店" to surface that).
const ALWAYS_ON_OSAKA_TOKENS = [
  // Core
  "大阪", "osaka", "osaka-info",
  // Major districts
  "梅田", "難波", "なんば", "心齋橋", "心斎橋", "道頓堀",
  "新世界", "天王寺", "阿倍野", "あべの", "北新地",
  "京橋", "都島", "灣區", "灣岸", "湾岸",
  "中之島", "法善寺", "黑門", "宗右衛門", "穀町", "谷町",
  // Famous landmarks (almost always Osaka-specific in tourism context)
  "大阪城", "通天閣", "USJ", "ユニバーサル", "環球影城", "universal studios",
  "海遊館", "kaiyukan", "あべのハルカス", "ハルカス", "harukas",
  "萬博", "万博", "EXPOCITY", "expocity", "NIFREL", "nifrel",
  "杯麵博物館", "cup noodle museum",
  "天神祭", "御堂筋", "御堂筋彩燈",
  "甲子園", "京瓷巨蛋", "edion arena",
  "黒門", "鶴橋", "新今宮", "日本橋", "Nipponbashi",
  // Surrounding cities still in 大阪府
  "堺市", "岸和田", "東大阪", "箕面", "豊中", "吹田", "千里",
  // Brand-name pass / metro
  "osaka metro", "御堂筋線", "谷町線", "四橋線", "堺筋線",
  "樂遊券", "e-pass", "enjoy eco card", "icoca"
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[，、。．・：:；;！？!?（）()[\]{}"“”'‘’`~|/\\<>@#$%^&*_+=-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isOsakaScope(normalized) {
  return ALWAYS_ON_OSAKA_TOKENS.some((t) => normalized.includes(normalizeText(t)));
}

function tagScore(chapterId, normalized) {
  const tags = CHAPTER_TAGS[chapterId] || [];
  let score = 0;
  for (const tag of tags) {
    const t = normalizeText(tag);
    if (!t) continue;
    if (normalized.includes(t)) score += 8;
  }
  return score;
}

const MIN_CHAPTER_SCORE = 8;

export function findRelevantKbChapters(message, limit = 3) {
  const data = loadKb();
  const normalized = normalizeText(message);
  const osakaScoped = isOsakaScope(normalized);

  // HARD gate: the KB is the Osaka knowledge base — without an Osaka
  // identity token, return nothing.  Otherwise questions like
  // 「沖繩飯店推薦」 / 「東京迪士尼門票」 would surface ch19's day-trip
  // section (which mentions those cities) when they should refuse.
  if (!osakaScoped) {
    return { chapters: [], osakaScoped };
  }

  const scored = [];
  for (const ch of data.chapters) {
    const score = tagScore(ch.id, normalized);
    if (score < MIN_CHAPTER_SCORE) continue;
    scored.push({ chapter: ch, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const chapters = scored
    .slice(0, limit)
    .map((e) => ({ ...e.chapter, score: e.score }));

  return { chapters, osakaScoped };
}

function truncateBody(body, max = 1200) {
  if (body.length <= max) return body;
  return body.slice(0, max - 1).trim() + "…";
}

function formatChapter(ch) {
  return [
    `## 第${ch.number_zh}章 ${ch.title} [id=${ch.id}]`,
    truncateBody(ch.body)
  ].join("\n");
}

export function buildKbEvidence(message) {
  const data = loadKb();
  const { chapters, osakaScoped } = findRelevantKbChapters(message);

  const header = [
    "OSAKA KB EVIDENCE (allowed source: 大阪觀光AI機器人知識庫)",
    `Source: ${data.source_label}`,
    `Fetched at: ${data.fetched_at}`,
    `Detected Osaka scope: ${osakaScoped ? "yes" : "no"}`,
    `Matched chapters: ${chapters.length ? chapters.map((c) => `第${c.number_zh}章 ${c.title}`).join(" / ") : "(none)"}`
  ];

  if (!chapters.length) {
    return {
      hasEvidence: false,
      block: [
        ...header,
        "",
        "Matched content: NONE",
        "The Osaka KB does not contain a chapter that matches this question."
      ].join("\n")
    };
  }

  return {
    hasEvidence: true,
    block: [
      ...header,
      "",
      "Use these chapter texts verbatim as the source of facts:",
      ...chapters.map(formatChapter)
    ].join("\n\n")
  };
}

export function kbSourceMeta() {
  const data = loadKb();
  return { source_label: data.source_label, chapters: data.chapters.length };
}
