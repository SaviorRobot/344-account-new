const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = 32119;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qingfeng-ledger-"));
const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
  env: { ...process.env, PORT: String(port), LEDGER_DB_PATH: path.join(tempDir, "test.db") },
  stdio: ["ignore", "pipe", "pipe"]
});
const base = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("测试服务器未能启动");
}

test.before(waitForServer);
test.after(() => new Promise(resolve => {
  child.once("exit", () => { fs.rmSync(tempDir, { recursive: true, force: true }); resolve(); });
  child.kill("SIGTERM");
}));

test("初始账目金额正确", async () => {
  const response = await fetch(`${base}/api/records`);
  assert.equal(response.status, 200);
  const records = await response.json();
  assert.equal(records.length, 6);
  assert.equal(records.filter(r => r.type === "income").reduce((s,r) => s+r.amountCents, 0), 26000);
  assert.equal(records.filter(r => r.type === "expense").reduce((s,r) => s+r.amountCents, 0), 13720);
});

test("可以新增、修改和删除账目", async () => {
  const createdResponse = await fetch(`${base}/api/records`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "expense", amount: 25.5, category: "买水", date: "2026-07-20", member: "测试成员", note: "测试买水" })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.amountCents, 2550);

  const updatedResponse = await fetch(`${base}/api/records/${created.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "expense", amount: 30.2, category: "空调", date: "2026-07-20", member: "测试成员", note: "修改成功" })
  });
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json()).amountCents, 3020);
  assert.equal((await fetch(`${base}/api/records/${created.id}`, { method: "DELETE" })).status, 204);
});

test("拒绝错误金额和不匹配分类", async () => {
  const response = await fetch(`${base}/api/records`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "income", amount: -1, category: "买水", date: "2026-07-20" })
  });
  assert.equal(response.status, 400);
});
