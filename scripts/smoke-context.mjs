import {
  buildChatContext,
  buildInstructions,
  buildRefusalResponse,
  detectResponseLanguage
} from "../lib/chat-context.js";
import {
  findRelevantCells,
  parseQuestion,
  dashboardRefusalText
} from "../lib/dashboard-context.js";
import { findRelevantSweets } from "../lib/sweets-context.js";
import { findRelevantJntoFacts } from "../lib/jnto-context.js";
import { findRelevantKix } from "../lib/kix-context.js";
import { findRelevantLgbtqFacts } from "../lib/lgbtq-context.js";

const cases = [
  // dashboard hits
  "台灣旅客在大阪最想做的活動是什麼？",
  "韓国市場の男女比を教えてください",
  "美国游客获取大阪旅游信息的主要渠道",
  "Which markets are most interested in night views in Osaka?",
  "新加坡旅客選擇活動時最重視什麼因素？",
  // sweets page hits (specific dessert terms)
  "大阪有什麼好的甜點店?",
  "推薦大阪 Instagram 拍照的甜點",
  "金箔雪糕在哪裡吃?",
  "心齋橋有什麼甜點?",
  "棉花糖店在哪",
  // sweets page hits (loosened: generic shop/recommendation)
  "心齋橋有什麼好吃的?",
  "梅田美食推薦",
  "大阪有什麼推薦的店?",
  "心齋橋有什麼餐廳?",
  "難波想吃下午茶",
  // JNTO macro hits
  "2026年4月の訪日外客数は？",
  "出国日本人数の最新数値",
  "日本の平均滞在日数の推移",
  "2025年の訪日回数別の内訳",
  // KIX hits
  "大阪のNPSはいくつ？",
  "関空調査の中国旅客の特徴",
  "中國旅客一人當たり消費單價",
  "ヨーロッパからの訪問者の年齢層",
  "オーストラリア旅客の興味関心",
  // LGBTQ hits
  "LGBTQ+旅客的居住國前三名",
  "大阪LGBTQ+滿足度",
  "ゲイホテルへの関心度",
  // off-topic, must refuse
  "請問大阪燒的歷史是什麼？",
  "推薦大阪一蘭拉麵分店",
  "大阪壽司推薦",
  "梅田燒肉店推薦",
  "從關西機場到難波怎麼走?",
  "韓國旅客喜歡哪些甜點店?",
  "USJ 門票多少錢?",
  "京都的櫻花季什麼時候開始?",
  "沖繩飯店推薦"
];

for (const q of cases) {
  console.log("=".repeat(80));
  console.log("Q:", q);
  const parsed = parseQuestion(q);
  console.log("language:", detectResponseLanguage(q), "| markets:", parsed.markets, "| sheets:", parsed.sheets);

  const { cells } = findRelevantCells(q, 3);
  console.log(`dashboard cells: ${cells.length}`);
  for (const c of cells) console.log(`  [${c.sheet_id}] ${c.item} / ${c.market} = ${c.display}`);

  const sweets = findRelevantSweets(q, 3);
  console.log(`sweets items: ${sweets.items.length} (topic=${sweets.topicMatched})`);
  for (const it of sweets.items) console.log(`  #${it.id} ${it.name} / ${it.shop}`);

  const jnto = findRelevantJntoFacts(q, 3);
  console.log(`JNTO facts: ${jnto.facts.length} (topic=${jnto.topicMatched})`);
  for (const f of jnto.facts) console.log(`  [${f.id}] ${f.topic} / ${f.period}`);

  const kix = findRelevantKix(q);
  console.log(`KIX markets: ${kix.markets.length} (${kix.marketIds.join(",") || "-"}) | keyFigures: ${kix.keyFigures.length} (kw=${kix.wantKeyFigures})`);
  for (const m of kix.markets) console.log(`  [${m.id}] ${m.name_ja}`);

  const lgbtq = findRelevantLgbtqFacts(q, 3);
  console.log(`LGBTQ facts: ${lgbtq.facts.length} (topic=${lgbtq.topicMatched})`);
  for (const f of lgbtq.facts) console.log(`  [${f.id}] ${f.topic}`);

  const refusal = buildRefusalResponse(q);
  console.log("server refusal:", refusal ? `YES -> ${refusal.answer}` : "no (LLM will be called)");
}

console.log("=".repeat(80));
console.log("INSTRUCTIONS LENGTH:", buildInstructions().length);
