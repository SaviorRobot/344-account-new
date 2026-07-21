const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const dbPath = process.env.LEDGER_DB_PATH || path.join(root, "data", "ledger.db");
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || randomUUID();
const SESSION_COOKIE_NAME = "ledger_session";

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('income','expense')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), category TEXT NOT NULL,
  member TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
); CREATE INDEX IF NOT EXISTS idx_records_date ON records(date DESC); CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, expires INTEGER NOT NULL, created_at TEXT NOT NULL
);`);

const allowedCategories = new Set(["成员缴费", "公共进账", "买水", "空调", "其他"]);
const clients = new Set();
const nowIso = () => new Date().toISOString();

function seed() {
  if (db.prepare("SELECT COUNT(*) AS count FROM records").get().count) return;
  const entries = [
    ["2026-07-13","income",20000,"公共进账","","公账进账 200 元"],
    ["2026-07-13","expense",10000,"买水","","购买 10 桶水"],
    ["2026-07-14","expense",3720,"空调","","购买 3 个空调挡板"],
    ["2026-07-15","income",2000,"成员缴费","米源、张少琳","2 人缴费，每人 10 元"],
    ["2026-07-17","income",3000,"成员缴费","高展、董培涵、赵文娇","3 人缴费，每人 10 元"],
    ["2026-07-18","income",1000,"成员缴费","何梦婷","缴费 10 元"]
  ];
  const insert = db.prepare("INSERT INTO records(id,date,type,amount_cents,category,member,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)");
  db.exec("BEGIN"); try { entries.forEach(row => { const time=nowIso(); insert.run(randomUUID(),...row,time,time); }); db.exec("COMMIT"); } catch(error) { db.exec("ROLLBACK"); throw error; }
}
seed();

function createSessionCookie() {
  const sessionId = randomUUID();
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.prepare("INSERT INTO sessions(id,expires,created_at) VALUES(?,?,?)").run(sessionId, expires, nowIso());
  return {
    value: sessionId,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/"
    }
  };
}

function validateSession(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const sessionId = match[1];
  const session = db.prepare("SELECT expires FROM sessions WHERE id=?").get(sessionId);
  return session && session.expires > Date.now();
}

function invalidateSession(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (match) {
    db.prepare("DELETE FROM sessions WHERE id=?").run(match[1]);
  }
}

function setSessionCookie(res, session) {
  const opts = session.options;
  const parts = [`${SESSION_COOKIE_NAME}=${session.value}`, `Path=${opts.path}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=strict; Max-Age=0`);
}

function json(res, status, body) { const data=JSON.stringify(body); res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Content-Length":Buffer.byteLength(data),"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}); res.end(data); }
function readBody(req) { return new Promise((resolve,reject)=>{let body="";req.on("data",chunk=>{body+=chunk;if(body.length>1e6){reject(new Error("请求内容过大"));req.destroy();}});req.on("end",()=>{try{resolve(JSON.parse(body||"{}"))}catch{reject(new Error("JSON 格式错误"))}});req.on("error",reject);}); }
function serialize(row) { return { id:row.id,date:row.date,type:row.type,amountCents:row.amount_cents,category:row.category,member:row.member,note:row.note,createdAt:row.created_at,updatedAt:row.updated_at }; }
function validate(input) {
  const type=input.type; const amount=Number(input.amount); const amountCents=Math.round(amount*100); const category=String(input.category||""); const date=String(input.date||"");
  if(!["income","expense"].includes(type))throw new Error("请选择进账或支出"); if(!Number.isFinite(amount)||amountCents<=0||amountCents>100000000)throw new Error("金额不正确"); if(!allowedCategories.has(category))throw new Error("分类不正确"); if(type==="income"&&!["成员缴费","公共进账","其他"].includes(category))throw new Error("进账分类不正确"); if(type==="expense"&&!['买水','空调','其他'].includes(category))throw new Error("支出分类不正确"); if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`)))throw new Error("日期不正确");
  return {type,amountCents,category,date,member:String(input.member||"").trim().slice(0,80),note:String(input.note||"").trim().slice(0,100)};
}
function broadcast() { for(const res of clients)res.write(`event: records-changed\ndata: ${Date.now()}\n\n`); }
function serveStatic(req,res) { const url=new URL(req.url,"http://localhost"); const pathname=url.pathname==="/"?"/index.html":url.pathname; const allowed=new Set(["/index.html","/styles.css","/app.js"]); if(!allowed.has(pathname))return false; const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"}; const data=fs.readFileSync(path.join(root,pathname)); res.writeHead(200,{"Content-Type":types[path.extname(pathname)],"Content-Length":data.length,"Cache-Control":pathname==="/index.html"?"no-cache":"public, max-age=3600","X-Content-Type-Options":"nosniff"});res.end(data);return true; }

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  try {
    if(req.method==="GET"&&url.pathname==="/api/health")return json(res,200,{ok:true});

    if(req.method==="POST"&&url.pathname==="/api/auth"){
      const body=await readBody(req);
      if(!ACCESS_PASSWORD||body.password===ACCESS_PASSWORD){
        const session=createSessionCookie();
        setSessionCookie(res,session);
        return json(res,200,{ok:true});
      }
      return json(res,401,{error:"密码错误"});
    }

    if(req.method==="POST"&&url.pathname==="/api/logout"){
      invalidateSession(req);
      clearSessionCookie(res);
      return json(res,200,{ok:true});
    }

    if(!ACCESS_PASSWORD||validateSession(req)){
      if(req.method==="GET"&&url.pathname==="/api/events"){res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"});res.write(`event: connected\ndata: ${Date.now()}\n\n`);clients.add(res);req.on("close",()=>clients.delete(res));return;}
      if(req.method==="GET"&&url.pathname==="/api/records"){const rows=db.prepare("SELECT * FROM records ORDER BY date DESC, created_at DESC").all();return json(res,200,rows.map(serialize));}
      if(req.method==="POST"&&url.pathname==="/api/records"){const item=validate(await readBody(req));const id=randomUUID(),time=nowIso();db.prepare("INSERT INTO records(id,date,type,amount_cents,category,member,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,item.date,item.type,item.amountCents,item.category,item.member,item.note,time,time);broadcast();return json(res,201,serialize(db.prepare("SELECT * FROM records WHERE id=?").get(id)));}
      const match=url.pathname.match(/^\/api\/records\/([a-f0-9-]+)$/i);
      if(match&&req.method==="PUT"){if(!db.prepare("SELECT id FROM records WHERE id=?").get(match[1]))return json(res,404,{error:"记录不存在"});const item=validate(await readBody(req));db.prepare("UPDATE records SET date=?,type=?,amount_cents=?,category=?,member=?,note=?,updated_at=? WHERE id=?").run(item.date,item.type,item.amountCents,item.category,item.member,item.note,nowIso(),match[1]);broadcast();return json(res,200,serialize(db.prepare("SELECT * FROM records WHERE id=?").get(match[1])));}
      if(match&&req.method==="DELETE"){const result=db.prepare("DELETE FROM records WHERE id=?").run(match[1]);if(!result.changes)return json(res,404,{error:"记录不存在"});broadcast();res.writeHead(204);return res.end();}
      if(req.method==="GET"&&serveStatic(req,res))return;
    }

    if(req.method==="GET"&&(url.pathname==="/"||url.pathname==="/index.html")){
      if(ACCESS_PASSWORD&&!validateSession(req)){
        const data=fs.readFileSync(path.join(root,"login.html"));
        res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Length":data.length,"Cache-Control":"no-cache","X-Content-Type-Options":"nosniff"});
        return res.end(data);
      }
      if(serveStatic(req,res))return;
    }

    json(res,401,{error:"未授权访问"});
  } catch(error){json(res,400,{error:error.message||"请求失败"});}
});
const heartbeat=setInterval(()=>{for(const res of clients)res.write(": heartbeat\n\n")},25000); heartbeat.unref();
server.listen(port,"0.0.0.0",()=>console.log(`清风公账已启动：http://localhost:${port}`));
function shutdown(){clearInterval(heartbeat);for(const res of clients)res.end();db.close();server.close(()=>process.exit(0));} process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);