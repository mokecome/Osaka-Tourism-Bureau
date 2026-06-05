// Verify the 5 chatbot preset questions each (a) do NOT refuse and
// (b) hit the expected JNTO fact(s).  Run: node scripts/verify-presets.mjs
import { buildRefusalResponse } from "../lib/chat-context.js";
import { findRelevantJntoFacts } from "../lib/jnto-context.js";
import { findRelevantKix } from "../lib/kix-context.js";

const presets = [
  {
    tag: "① 都道府県トップ8",
    q: "2025年に訪日外国人が最も多く訪れた都道府県トップ8はどこですか？",
    expect: ["prefecture_visit_rate_2025"]
  },
  {
    tag: "② 中台韓 2026 パフォーマンス",
    q: "中国・台湾・韓国の3市場における2026年のパフォーマンスの違いは何ですか？",
    expect: ["market_2026_04_detail", "market_timeseries_china", "market_timeseries_taiwan", "market_timeseries_korea"]
  },
  {
    tag: "③ 台湾 2020→2025 回復",
    q: "台湾市場は2020年のコロナ禍の底から2025年にかけて、どのように回復しましたか？",
    expect: ["market_timeseries_taiwan"]
  },
  {
    tag: "④ 次回やりたい TOP5",
    q: "訪日外国人が「次回やりたいこと」のトップ5は何ですか？",
    expect: ["expectations_2024_2025"]
  },
  {
    tag: "⑤ 伸びる体験項目",
    q: "「次回やりたい」の比率が継続して上昇している体験項目はどれですか？",
    expect: ["expectations_2024_2025"]
  }
];

let allPass = true;

for (const { tag, q, expect } of presets) {
  const refusal = buildRefusalResponse(q);
  const jnto = findRelevantJntoFacts(q, 4).facts.map((f) => f.id);
  const kix = findRelevantKix(q);
  const kixIds = [
    ...kix.markets.map((m) => `kix:${m.id}`),
    ...(kix.keyFigures.length ? ["kix:key_figures"] : [])
  ];

  const hitExpected = expect.some((id) => jnto.includes(id));
  const pass = !refusal && hitExpected;
  allPass = allPass && pass;

  console.log("=".repeat(70));
  console.log(`${pass ? "PASS" : "FAIL"} | ${tag}`);
  console.log(`  Q: ${q}`);
  console.log(`  refusal: ${refusal ? "YES (BAD)" : "no"}`);
  console.log(`  JNTO facts: ${jnto.join(", ") || "(none)"}`);
  console.log(`  KIX: ${kixIds.join(", ") || "(none)"}`);
  console.log(`  expected one of: ${expect.join(", ")} -> ${hitExpected ? "hit" : "MISS"}`);
}

console.log("=".repeat(70));
console.log(allPass ? "ALL PRESETS PASS ✅" : "SOME PRESETS FAILED ❌");
process.exit(allPass ? 0 : 1);
