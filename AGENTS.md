# 光格突圍

- 先讀 README.md、docs/TEST-RESULTS.md。GitHub `lphky/light-grid-escape`，main 根目錄 Pages，公開網站 https://lphky.github.io/light-grid-escape/ 。
- 純前端、無建置、無外部依賴；進度只存玩家瀏覽器（localStorage key `light-grid-escape`，version 1）。不加帳戶、後端或追蹤。
- 原創作品：不得使用 Activate 或其他品牌名稱、標誌、素材及關卡。
- 公平性規則不可破壞：綠格永久安全、紅格前必有預警（標準≥0.8 秒，第1–4關≥1 秒）、能量格及剛收集格不變紅、出生安全、第十二關段間安全並預覽下一段。
- 改引擎或關卡後執行 `node --test tests/*.test.mjs`；solver 必須證明每關無傷可完成，且機械人時間不超過三星時間一半。
