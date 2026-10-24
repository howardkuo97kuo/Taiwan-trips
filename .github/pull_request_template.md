## 這個 PR 做了什麼

<!-- 一兩句話：改了什麼、為什麼 -->

## 檢查

- [ ] 只改了自己模組的檔案（歸屬表見 `CLAUDE.md`）；要改契約檔（`docs/SPEC.md`、`firebase-rules.json`、`scripts/validate.mjs`、`data/regions.json`）已先回報總管
- [ ] `node scripts/validate.mjs` 與 `node --check` 都通過
- [ ] 若結構有變（新增或改名檔案、路由、store 鍵、Firebase 路徑、workflow、金鑰位置、模組狀態），已在這個 PR 更新 `ARCHITECTURE.md`；沒有變就不用
- [ ] 沒有電話、訂位代號、金鑰或個人資訊
