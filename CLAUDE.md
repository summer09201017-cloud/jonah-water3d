# CLAUDE.md — 約拿落海 Jonah Overboard 3D(維護守則)

約拿書 1 的 3D 聖經遊戲。**water-kit 的第一個聖經皮**(2026-07-18,agape250 機,`/new-water3d` 首跑)。
底座=`waterpolo3d`(水地基);核心收割=`src/water.js`(一字不改)。

## 這是什麼
單人敘事水上體驗,忠於拿 1、**永不會輸**、投影兒童友善。狀態機一條龍:
`menu → intro → storm(舀水+穩舵撐船耐力)→ lots(掣籤)→ confess(約拿認罪)→ overboard(拋下海)→ water(海立平靜+約拿掙扎下沉)→ fish(大魚吞)→ done(反思)`。

## ⛪ 神學鐵則(改玩法前必讀)
- **海的平靜是神蹟(拿1:15),固定觸發**——玩家把約拿拋下海就發生,與手感好壞無關;張力放在此前的「撐船耐力」(舀水/穩舵)。撐船**不能**平息風暴(人的努力止不住神差來的風),只有順服(約拿下海)能。
- **大魚是神的安排與憐憫(拿1:17),非玩家掙來的**——約拿在水裡終究下沉,大魚固定出現拯救。
- 經文一律 `mcp__cuv__lookup` 逐字查驗和合本;`src/voicePhrases.js` 的 `SCRIPTURES` 六句皆已驗(拿1:3/4/7/12/15/17)。

## 架構(3d-game-kit 三件套)
- `src/game.js` — `JonahGame` class:場景+狀態機+風暴+動畫,不碰 DOM;`window.__jonah3d` dev hook。
- `src/main.js` — UI 接線、鍵盤/觸控、字幕+人聲、SW 註冊、play-stats beacon。
- `src/water.js` — **水地基,一字不改**。風暴=每幀把 `WATER.waves[i].ax` 乘 `waveScale`(1→wavePeak);平靜=lerp 到 ~0.18。
- 人聲鐵律:預烤 mp3(`SCRIPTURES`→曉臻女聲、`PHRASES`→雲哲男聲),**絕不 Web Speech**。缺檔=只出字幕。

## 量值可調(鐵則)
玩法數字全集中 `DIFFICULTY_PRESETS`(game.js):`stormSeconds`/`floodRate`/`bailPower`/`wavePeak`。五檔 kids~hard,寧可偏簡單。

## 操作
A/D 或 ←/→ 穩舵 ・ 空白鍵按住舀水 ・ V 視角(三檔)・ 劇情提示出現時 Enter/點按=拋約拿下海。觸控:◀舵/舵▶/舀水(按住式)。

## 常用指令
- `npm run dev` 開發(localhost 不註冊 SW,3d-game-kit SW 快取雷)
- `npm run build` 產 dist
- `node scripts/gen-voice.mjs` 烤人聲(需網路;累加式,已有檔跳過;產物進 git 離線可玩)
- `node scripts/verify-jonah.mjs [outDir] [url]` Playwright 全階段截圖+抓 pageerror(需先 build + `vite preview`)

## 換皮/收尾鐵則
- 改 `public/sw.js` 的 `CACHE_NAME`(`jonah-water3d-nf1` → nf2…)每次部署都要 bump。
- 上架(GitHub public repo / Netlify prod / 大廳或奧運頁卡)**要使用者逐字點名**才做;完成後同步 `~/.claude/gamefleet/sites.json`。
- 相關 skill:[[water-kit]]、[[3d-game-kit]]、[[baked-voice-commentary]]、[[cuv-scripture-mcp]]、[[bible-game-studio]]、`/new-water3d`。

榮耀歸神。
