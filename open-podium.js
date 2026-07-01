// Open Podium in a 1920x1200 (chrome-included) Playwright window.
// Prereq: dev server running -> (in podium/)  python3 serve.py
// Run:    NODE_PATH=../test/node_modules node open-podium.js
//   (Playwright lives in studiop5/test/node_modules, not here.)

const { chromium } = require("playwright");

const URL = "https://localhost:9876/pod.html";
const WIDTH = 1920;
const HEIGHT = 1200;

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [`--window-size=${WIDTH},${HEIGHT}`], // outer window incl. toolbar
  });

  const context = await browser.newContext({
    viewport: null,            // let the page fill the window (not Playwright's 1280x720 default)
    ignoreHTTPSErrors: true,   // self-signed dev cert
  });

  const page = await context.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // Window stays open; Ctrl-C this script to close it.
})();
