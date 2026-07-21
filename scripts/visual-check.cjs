const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qingfeng-visual-"));
  const port = 32120;
  const server = spawn(process.execPath, [path.resolve(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), LEDGER_DB_PATH: path.join(tempDir, "visual.db") }, stdio: "ignore"
  });
  for (let i=0;i<40;i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch {} await new Promise(r=>setTimeout(r,50)); }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const desktop = await desktopContext.newPage();
  const mobile = await mobileContext.newPage();
  await Promise.all([desktop.goto(`http://127.0.0.1:${port}`), mobile.goto(`http://127.0.0.1:${port}`)]);
  await desktop.waitForSelector("#recentList .record-row");
  await desktop.click("#addButton"); await desktop.fill("#amountInput", "25.50"); await desktop.selectOption("#categoryInput", "成员缴费"); await desktop.fill("#memberInput", "验收成员"); await desktop.fill("#noteInput", "实时同步测试"); await desktop.click(".submit-button");
  await mobile.waitForSelector("text=实时同步测试");
  await desktop.waitForTimeout(400); await mobile.waitForTimeout(400);
  await desktop.screenshot({ path: path.resolve(__dirname,"..","preview-desktop.png"), fullPage:true });
  await mobile.screenshot({ path: path.resolve(__dirname,"..","preview-mobile.png"), fullPage:true });
  await browser.close(); server.kill("SIGTERM"); await new Promise(r=>server.once("exit",r)); fs.rmSync(tempDir,{recursive:true,force:true});
  console.log("shared-realtime-visual-check-ok");
})().catch(error=>{console.error(error);process.exit(1)});
