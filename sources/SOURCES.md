# 資料來源（原始檔）

此資料夾存放 6 個許可資料源的**原始檔**，僅作為存證與重建依據。
**執行時（dev-server / Vercel）只讀 `data/*.json`，不讀本資料夾。**

| # | 原始檔 | → 結構化 JSON | 檢索模組 | 重建方式 |
|---|---|---|---|---|
| A | `大阪海外市場調查_dashboard.xlsx` | `data/osaka-dashboard.json` | `lib/dashboard-context.js` | `python scripts/build_dashboard_json.py` |
| B | （無原始檔，網頁快照）`https://osaka-info.jp/zh-Hant-TW/special/features-sweets-1/` | `data/osaka-sweets-page.json` | `lib/sweets-context.js` | 手動維護 JSON |
| C | `JNTO_訪日観光統計_完全版.pdf` + 4 個 `1._訪日外客数…(2)(3)(4).txt` | `data/osaka-jnto.json` | `lib/jnto-context.js` | `python scripts/build_jnto_json.py`（PDF 部分）；4 個 txt 為靜態 facts |
| D | `kixcyousa2024_全文テキスト.md` | `data/osaka-kix.json` | `lib/kix-context.js` | 手動萃取（主要指標 + 9 市場摘要）|
| E | `LGBTQ_Travel_Survey_2025_問答整理.md` | `data/osaka-lgbtq.json` | `lib/lgbtq-context.js` | 手動轉 JSON |
| F | `大阪觀光AI機器人知識庫.md.pdf` | `data/osaka-kb.json` | `lib/kb-context.js` | 手動萃取（22 章節）|

## 編排

`lib/chat-context.js` 把 6 個來源組成 prompt，`buildRefusalResponse` 在
全部 `hasEvidence=false` 時短路 OpenAI 並回固定日文拒答。
本地煙霧測試：`node scripts/smoke-context.mjs`。

## 已移除的重複檔

- `1._訪日外客数…(1.md)`（2026年4月速報）— 已被
  `JNTO_訪日観光統計_完全版.pdf` 第一章涵蓋且更完整，於 commit `daacb0f` 移除。
