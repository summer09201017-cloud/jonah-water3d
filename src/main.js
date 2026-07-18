import "./styles.css";
// 約拿落海(拿1)main.js —— UI 接線+字幕播報+預烤人聲(絕不 Web Speech)+鍵盤/觸控
// 操作:A/D 或 ←/→ 穩舵、空白鍵(按住)舀水、視角 V;劇情提示出現時 Enter/點按=拋約拿下海。
import { JonahGame, DIFFICULTY_PRESETS } from "./game.js";
import { AudioManager } from "./audio.js";
import { loadSettings, saveSettings } from "./storage.js";
import { speakLine, setVoiceEnabled } from "./voice.js";

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $("gameCanvas"),
  phaseLabel: $("phaseLabel"),
  stormPanel: $("stormPanel"), stormFill: $("stormFill"),
  floodPanel: $("floodPanel"), floodFill: $("floodFill"), floodLabel: $("floodLabel"),
  trimPanel: $("trimPanel"), trimDot: $("trimDot"),
  statusMessage: $("statusMessage"), commentaryBar: $("commentaryBar"),
  actionPrompt: $("actionPrompt"),
  controlsPanel: $("controlsPanel"), controlsHint: $("controlsHint"),
  touchBail: $("touchBail"), touchLeft: $("touchLeft"), touchRight: $("touchRight"),
  menuButton: $("menuButton"), audioButton: $("audioButton"), cameraButton: $("cameraButton"),
  fullscreenButton: $("fullscreenButton"),
  matchOverlay: $("matchOverlay"), overlayEyebrow: $("overlayEyebrow"),
  overlayTitle: $("overlayTitle"), overlayText: $("overlayText"),
  overlayMenuButton: $("overlayMenuButton"), overlayReplayButton: $("overlayReplayButton"),
  homeScreen: $("homeScreen"),
  difficultySelect: $("difficultySelect"), audioSelect: $("audioSelect"),
  startButton: $("startButton"),
};

const settings = loadSettings();
let selectedDifficulty = DIFFICULTY_PRESETS[settings.difficulty] ? settings.difficulty : "easy";
let audioEnabled = settings.audioEnabled !== false;

const audio = new AudioManager();
audio.setEnabled(audioEnabled);
setVoiceEnabled(audioEnabled);

const game = new JonahGame({ canvas: ui.canvas });
window.__jonah3d = game; // dev hook:Playwright 驗證用(3d-game-kit 慣例)

const PHASE_LABELS = {
  menu: "選單", intro: "風暴將至", storm: "風暴・撐船", lots: "掣籤",
  confess: "約拿認罪", overboard: "拋入海中", water: "海立平靜", fish: "大魚", done: "魚腹三日",
};

// 字幕條 pop + 預烤人聲(有 mp3 才出聲,缺檔=只出字幕)
function pushCommentary(text, tone = "info") {
  const bar = ui.commentaryBar;
  if (!bar || !text) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = text;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
}

game.onEvent = (event) => {
  switch (event.type) {
    case "intro":
      audio.startWind();
      speakLine("約拿卻起來,逃往他施去躲避耶和華。");
      pushCommentary("約拿卻起來,逃往他施去躲避耶和華。(拿1:3)");
      break;
    case "storm-start":
      speakLine("然而耶和華使海中起大風,海就狂風大作,甚至船幾乎破壞。");
      pushCommentary("然而耶和華使海中起大風,海就狂風大作,甚至船幾乎破壞。(拿1:4)", "cool");
      break;
    case "thunder":
      audio.thunder(event.strength || 0.6);
      break;
    case "near-capsize":
      audio.thunder(1);
      speakLine("船幾乎破壞了,撐住!");
      pushCommentary("船幾乎破壞了——快舀水!", "cool");
      break;
    case "lots":
      speakLine("於是他們掣籤,掣出約拿來。");
      pushCommentary("水手說:來掣籤,看這災是因誰的緣故。(拿1:7)");
      break;
    case "confess":
      speakLine("你們將我抬起來,拋在海中,海就平靜了;我知道你們遭這大風是因我的緣故。");
      pushCommentary("約拿說:將我拋在海中,海就平靜了。(拿1:12)", "hot");
      break;
    case "overboard":
      audio.splash(1);
      speakLine("他們把約拿拋進海裡。");
      pushCommentary("他們遂將約拿抬起,拋在海中……");
      break;
    case "calm":
      audio.stopWind();
      audio.splash(1);
      speakLine("他們遂將約拿抬起,拋在海中,海的狂浪就平息了。");
      pushCommentary("海的狂浪就平息了。(拿1:15)", "hot");
      break;
    case "fish":
      audio.horn();
      pushCommentary("看哪——神安排了一條大魚!", "hot");
      break;
    case "finish":
      audio.stopWind();
      speakLine("耶和華安排一條大魚吞了約拿,他在魚腹中三日三夜。");
      ui.matchOverlay.classList.add("visible");
      ui.overlayEyebrow.textContent = "約拿書 1:17";
      ui.overlayTitle.textContent = event.title || "神安排了一條大魚";
      ui.overlayText.textContent = event.text || "";
      break;
    default:
      break;
  }
};

let lastActionPrompt = null;
game.onHud = (s) => {
  ui.phaseLabel.textContent = PHASE_LABELS[s.phase] || "";
  ui.statusMessage.textContent = s.message || "";

  // 撐過風暴進度(只在風暴相關階段顯示)
  const showStorm = ["intro", "storm"].includes(s.phase);
  ui.stormPanel.hidden = !showStorm;
  if (showStorm) ui.stormFill.style.transform = `scaleX(${Math.min(1, s.stormProgress)})`;

  // 進水表 + 穩舵(只在風暴時)
  ui.floodPanel.hidden = !s.meterActive;
  ui.trimPanel.hidden = !s.meterActive;
  if (s.meterActive) {
    ui.floodFill.style.transform = `scaleX(${Math.min(1, s.flood)})`;
    ui.floodFill.dataset.high = s.flood > 0.7 ? "1" : "0";
    ui.trimDot.style.left = `${50 + (s.trim || 0) * 42}%`;
  }

  // 劇情按鍵提示(拋約拿下海)
  if (s.actionPrompt !== lastActionPrompt) {
    lastActionPrompt = s.actionPrompt;
    if (s.actionPrompt) {
      ui.actionPrompt.hidden = false;
      ui.actionPrompt.textContent = `▶ ${s.actionPrompt}`;
    } else {
      ui.actionPrompt.hidden = true;
    }
  }
};

// ── 鍵盤 ──
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (["Space", "ArrowLeft", "ArrowRight", "Enter"].includes(e.code)) e.preventDefault();
  if (game.phase === "menu") return;
  audio.unlock();
  // 劇情提示出現時,Enter / 空白 = 推進劇情(拋約拿下海)
  if (game.actionPrompt && (e.code === "Enter" || e.code === "Space") && !e.repeat) {
    game.triggerAction();
    return;
  }
  if (e.code === "KeyA" || e.code === "ArrowLeft") game.controls.left = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") game.controls.right = true;
  if (e.code === "Space") game.controls.bailHeld = true;
  if (e.code === "KeyV" && !e.repeat) game.cycleCameraView();
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyA" || e.code === "ArrowLeft") game.controls.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") game.controls.right = false;
  if (e.code === "Space") game.controls.bailHeld = false;
});
window.addEventListener("blur", () => {
  game.controls.left = game.controls.right = game.controls.bailHeld = false;
});

// ── 觸控(按住式) ──
const holdBtn = (el, key) => {
  if (!el) return;
  const on = (e) => { e.preventDefault(); audio.unlock(); game.controls[key] = true; };
  const off = (e) => { e.preventDefault(); game.controls[key] = false; };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointerleave", off);
  el.addEventListener("pointercancel", off);
};
holdBtn(ui.touchBail, "bailHeld");
holdBtn(ui.touchLeft, "left");
holdBtn(ui.touchRight, "right");
ui.actionPrompt.addEventListener("click", () => { audio.unlock(); game.triggerAction(); });

// ── HUD 鈕 ──
ui.cameraButton.addEventListener("click", () => { audio.uiTap(); game.cycleCameraView(); });
ui.fullscreenButton.addEventListener("click", () => {
  audio.uiTap();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});
ui.menuButton.addEventListener("click", () => {
  audio.uiTap();
  audio.stopWind();
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
  ui.matchOverlay.classList.remove("visible");
  ui.actionPrompt.hidden = true;
});
const applyAudio = () => {
  audio.setEnabled(audioEnabled);
  setVoiceEnabled(audioEnabled);
  ui.audioButton.textContent = audioEnabled ? "音效開啟" : "音效靜音";
  if (!audioEnabled) audio.stopWind();
  persist();
};
ui.audioButton.addEventListener("click", () => { audioEnabled = !audioEnabled; applyAudio(); });
ui.audioSelect.addEventListener("change", (e) => { audioEnabled = e.target.value === "on"; applyAudio(); });

// ── 主選單 ──
function persist() {
  saveSettings({ difficulty: selectedDifficulty, audioEnabled });
}
function syncMenu() {
  ui.difficultySelect.value = selectedDifficulty;
  ui.audioSelect.value = audioEnabled ? "on" : "off";
  ui.audioButton.textContent = audioEnabled ? "音效開啟" : "音效靜音";
}
ui.difficultySelect.addEventListener("change", (e) => { selectedDifficulty = e.target.value; persist(); });

function beginRun() {
  audio.unlock(); audio.uiTap();
  persist();
  game.applyPresentation({ difficulty: selectedDifficulty });
  ui.homeScreen.classList.remove("visible");
  ui.matchOverlay.classList.remove("visible");
  ui.controlsPanel.hidden = false;
  game.start();
}
ui.startButton.addEventListener("click", beginRun);
ui.overlayReplayButton.addEventListener("click", () => { audio.uiTap(); ui.matchOverlay.classList.remove("visible"); beginRun(); });
ui.overlayMenuButton.addEventListener("click", () => {
  audio.uiTap();
  ui.matchOverlay.classList.remove("visible");
  game.phase = "menu";
  ui.homeScreen.classList.add("visible");
});

syncMenu();

// dev(localhost)不註冊 SW——SW 快取會讓每次改動都吃到「上一版」(3d-game-kit SW 地雷)
if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
