// Open Podium at a PRECISE viewport size, arrange your score/layout/tools by hand,
// then trigger a lossless PNG screenshot. The capture is exactly the viewport
// size in pixels (deviceScaleFactor 1), independent of the OS window/toolbar.
//
// Prereq: dev server running -> (in podium/)  python3 serve.py
// Run (in YOUR OWN terminal, so it can read Enter):
//     NODE_PATH=../test/node_modules node screenshot-podium.js [width] [height] [scale]
//   e.g.
//     NODE_PATH=../test/node_modules node screenshot-podium.js 1920 1080
//
// Triggering a shot:
//   * press Enter in this terminal, OR
//   * from anywhere (e.g. a compositor hotkey):  kill -USR1 <pid printed below>
// Quit: type q + Enter (or Ctrl-C).

const { chromium } = require("playwright");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const URL    = "https://localhost:9876/pod.html";
const WIDTH  = parseInt(process.argv[2], 10) || 1920;
const HEIGHT = parseInt(process.argv[3], 10) || 1080;
const SCALE  = parseFloat(process.argv[4]) || 1;   // 1 => PNG is exactly WIDTHxHEIGHT px; 2 => 2x (sharper, bigger)
const OUTDIR = path.join(__dirname, "shots");

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },  // exact render size
    deviceScaleFactor: SCALE,
    ignoreHTTPSErrors: true,                      // self-signed dev cert
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  let n = 0;
  const shoot = async () => {
    const file = path.join(OUTDIR, `podium-${String(++n).padStart(3, "0")}.png`);
    try {
      await page.screenshot({ path: file }); // PNG (lossless), default type
      console.log("saved " + file);
    } catch (e) {
      console.log("screenshot failed: " + e.message);
    }
  };

  console.log(`\nPodium open at ${WIDTH}x${HEIGHT}, scale ${SCALE} -> PNG is ${WIDTH * SCALE}x${HEIGHT * SCALE}px.`);
  console.log(`PID ${process.pid}  (kill -USR1 ${process.pid} to shoot from a hotkey)`);
  console.log("Arrange the score, then press Enter to save a shot. Type 'q' + Enter to quit.\n");

  process.on("SIGUSR1", shoot);

  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    if (line.trim().toLowerCase() === "q") return rl.close();
    console.log("Waiting 6 seconds...");
    await new Promise(resolve => setTimeout(resolve, 6000));
    await shoot();
  });
  rl.on("close", async () => { await browser.close(); process.exit(0); });
})();
