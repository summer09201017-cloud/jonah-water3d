// verify-jonah.mjs —— Playwright 目視驗收:跑完約拿落海全階段、逐階段截圖、抓 pageerror。
// 用法:node scripts/verify-jonah.mjs [outDir] [url]   (需先 npm run build + vite preview)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || join(process.cwd(), "verify-shots");
const URL = process.argv[3] || "http://localhost:4173";
mkdirSync(OUT, { recursive: true });

const errors = [];
const shot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log("  📸", name);
};
const getPhase = (page) => page.evaluate(() => window.__jonah3d?.phase);
const waitPhase = async (page, target, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await getPhase(page)) === target) return true;
    await page.waitForTimeout(120);
  }
  return false;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "01-menu");

  // 選幼兒(最短風暴)並開始
  await page.selectOption("#difficultySelect", "kids").catch(() => {});
  await page.click("#startButton");
  await page.waitForTimeout(900);
  console.log("  phase after start:", await getPhase(page));

  // 風暴:按住舀水一下,讓浪長起來再截
  await page.evaluate(() => { if (window.__jonah3d) window.__jonah3d.controls.bailHeld = true; });
  await waitPhase(page, "storm", 6000);
  await page.waitForTimeout(1400);
  await shot(page, "02-storm");
  await page.evaluate(() => { window.__jonah3d.controls.bailHeld = false; });

  // 快轉風暴 → 掣籤
  await page.evaluate(() => { window.__jonah3d.stormT = 9999; });
  await waitPhase(page, "lots", 4000);
  await page.waitForTimeout(500);
  await shot(page, "03-lots");

  // 掣籤自動 → 認罪(actionPrompt 出現)
  await waitPhase(page, "confess", 6000);
  await page.waitForTimeout(400);
  await shot(page, "04-confess");
  const promptVisible = await page.isVisible("#actionPrompt");
  console.log("  actionPrompt visible:", promptVisible);

  // 拋約拿下海
  await page.evaluate(() => window.__jonah3d.triggerAction());
  await waitPhase(page, "water", 6000);
  await page.waitForTimeout(1200);
  await shot(page, "05-calm-water");

  // 快轉水中 → 大魚
  await page.evaluate(() => { window.__jonah3d.phaseT = 9999; });
  await waitPhase(page, "fish", 4000);
  await page.waitForTimeout(1400);
  await shot(page, "06-fish");

  // 大魚吞 → 結局
  await waitPhase(page, "done", 8000);
  await page.waitForTimeout(700);
  await shot(page, "07-done");
  const overlayVisible = await page.isVisible("#matchOverlay.visible");
  console.log("  ending overlay visible:", overlayVisible);

  console.log("\n=== RESULT ===");
  console.log("final phase:", await getPhase(page));
  console.log("pageerrors/console.errors:", errors.length);
  for (const e of errors) console.log("   🔴", e);
  console.log(errors.length === 0 ? "🟢 no runtime errors" : "🔴 errors found");
} catch (err) {
  console.error("VERIFY FAILED:", err.message);
  errors.push("script: " + err.message);
} finally {
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
