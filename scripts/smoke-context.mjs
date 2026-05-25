import {
  buildChatContext,
  buildInstructions,
  detectResponseLanguage
} from "../lib/chat-context.js";
import {
  findRelevantCells,
  parseQuestion,
  dashboardRefusalText
} from "../lib/dashboard-context.js";

const cases = [
  "台灣旅客在大阪最想做的活動是什麼？",
  "韓国市場の男女比を教えてください",
  "美国游客获取大阪旅游信息的主要渠道",
  "Which markets are most interested in night views in Osaka?",
  "請問大阪燒的歷史是什麼？", // off-topic, expect refusal
  "新加坡旅客選擇活動時最重視什麼因素？"
];

for (const q of cases) {
  console.log("=".repeat(80));
  console.log("Q:", q);
  const parsed = parseQuestion(q);
  console.log("language:", detectResponseLanguage(q), "| markets:", parsed.markets, "| sheets:", parsed.sheets);
  const { cells } = findRelevantCells(q, 6);
  console.log(`top ${cells.length} cells:`);
  for (const c of cells) {
    console.log(`  [${c.sheet_id}] ${c.item} / ${c.market} = ${c.display} (score=${c.score})`);
  }
  const ctx = buildChatContext(q);
  const status = ctx.match(/EVIDENCE STATUS: (.+)/)?.[1];
  console.log("evidence status:", status);
  if (status === "hasEvidence=false") {
    console.log("refusal would be:", dashboardRefusalText(detectResponseLanguage(q)));
  }
}

console.log("=".repeat(80));
console.log("INSTRUCTIONS LENGTH:", buildInstructions().length);
