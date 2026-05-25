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

const cases = [
  // dashboard hits
  "台灣旅客在大阪最想做的活動是什麼？",
  "韓国市場の男女比を教えてください",
  "美国游客获取大阪旅游信息的主要渠道",
  "Which markets are most interested in night views in Osaka?",
  "新加坡旅客選擇活動時最重視什麼因素？",
  // sweets page hits
  "大阪有什麼好的甜點店?",
  "推薦大阪 Instagram 拍照的甜點",
  "金箔雪糕在哪裡吃?",
  "心齋橋有什麼甜點?",
  "棉花糖店在哪",
  // off-topic, must refuse via combined hasEvidence=false
  "請問大阪燒的歷史是什麼？",
  "推薦大阪一蘭拉麵分店",
  "從關西機場到難波怎麼走?",
  "韓國旅客喜歡哪些甜點店?", // crosses sources but neither has the answer
  "USJ 門票多少錢?"
];

for (const q of cases) {
  console.log("=".repeat(80));
  console.log("Q:", q);
  const parsed = parseQuestion(q);
  console.log("language:", detectResponseLanguage(q), "| markets:", parsed.markets, "| sheets:", parsed.sheets);
  const { cells } = findRelevantCells(q, 4);
  console.log(`dashboard cells: ${cells.length}`);
  for (const c of cells) {
    console.log(`  [${c.sheet_id}] ${c.item} / ${c.market} = ${c.display}`);
  }
  const { items, topicMatched, osakaScoped } = findRelevantSweets(q, 4);
  console.log(`sweets items: ${items.length} (topic=${topicMatched}, osaka=${osakaScoped})`);
  for (const it of items) {
    console.log(`  #${it.id} ${it.name} / ${it.shop} @ ${it.area || it.address}`);
  }
  const refusal = buildRefusalResponse(q);
  console.log("server refusal:", refusal ? `YES -> ${refusal.answer}` : "no (LLM will be called)");
}

console.log("=".repeat(80));
console.log("INSTRUCTIONS LENGTH:", buildInstructions().length);
