// Local dev tool (not a GitHub Action): screenshot the running app on a phone
// viewport so layout work can be checked without a phone.
//
//   npm run dev                       # in another terminal, :3000
//   node scripts/screenshot-mobile.mjs [outDir] [url]
//
// Writes phone-00.png, phone-01.png, … (one per screen height, top to bottom),
// then fixtures.png, more.png and stats.png from the bottom tab bar. Prints the
// page height and scrollWidth: a scrollWidth above 390 means sideways overflow.
//
// This repo has no Playwright dependency. It borrows playwright-core from the
// V&V testing harness on this machine; set PLAYWRIGHT_FROM to any other
// package.json that has playwright-core installed.
import { createRequire } from "module";
import { mkdirSync } from "fs";

const from =
  process.env.PLAYWRIGHT_FROM ||
  "C:/Users/verbe/OneDrive - Ambiorix Labs/codeprojects/V&V testing/Arta_VnV_Playwright/package.json";
const { chromium, devices } = createRequire(from)("playwright-core");

const out = process.argv[2] || "phone-shots";
const url = process.argv[3] || "http://localhost:3000/";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const { height, width } = await page.evaluate(() => ({
  height: document.documentElement.scrollHeight,
  width: document.documentElement.scrollWidth,
}));
console.log(`page height ${height}px, scrollWidth ${width}px`);

const vh = page.viewportSize().height;
for (let i = 0, y = 0; y < height && i < 12; i++, y += vh) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/phone-${String(i).padStart(2, "0")}.png` });
}

const tabbar = page.locator(".mobile-tabbar");
await tabbar.getByRole("button", { name: "Fixtures" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/fixtures.png` });
await tabbar.getByRole("button", { name: "More" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/more.png` });
await page.keyboard.press("Escape");
await tabbar.getByRole("button", { name: "Stats" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/stats.png` });

await browser.close();
