# 約拿落海 Jonah Overboard 3D 🐋

約拿書 1 的 3D 聖經遊戲。耶和華使海中起大風——撐過狂風大浪、掣籤、認罪、把約拿拋入海中,**海就平靜了(拿1:15)**;神卻安排一條大魚吞了約拿(拿1:17)。單人、可離線、手機/平板/投影皆可玩,**永遠不會輸**。

適合主日學/兒主:一段可以慢慢體會的聖經故事。

## 怎麼玩
- **A / D** 或 **← / →**:左右穩舵(配重,別讓船側翻進水)
- **空白鍵按住**:舀水(把船艙的水舀出去)
- **V**:切換視角(電影/高空/貼近水面)
- 劇情提示「拋約拿下海」出現時:**Enter 或點按** 推進
- 手機:右下角 ◀舵 / 舵▶ / 舀水(按住式)、⛶ 全螢幕、直向會提示轉橫

## 開發
```bash
npm install
npm run dev        # 本機開發(localhost 不註冊 SW)
npm run build      # 產出 dist/
npx vite preview   # 預覽 dist
node scripts/gen-voice.mjs      # 烤和合本人聲(曉臻)+旁白(雲哲)mp3
node scripts/verify-jonah.mjs   # Playwright 全階段截圖驗收
```

## 技術
- Three.js;零相依、可離線 PWA(service worker + manifest)。
- 水環境收割自 **water-kit**(`src/water.js` 一字不改;調 `WATER.waves` 振幅=泳池變風暴海)。
- 經文和合本,逐句經 cuv MCP 查驗;人聲預烤 mp3(絕不 Web Speech 機器聲)。

榮耀歸神。
