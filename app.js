const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const incomeCategories = ["成员缴费", "公共进账", "其他"];
const expenseCategories = ["买水", "空调", "其他"];
const categoryMeta = {
  "成员缴费": { label: "缴", color: "#20b982", soft: "#e6f8f1" },
  "公共进账": { label: "收", color: "#246bfd", soft: "#edf3ff" },
  "买水": { label: "水", color: "#32a7c2", soft: "#e9f8fb" },
  "空调": { label: "风", color: "#7968db", soft: "#f0edff" },
  "其他": { label: "其", color: "#8290a8", soft: "#f0f2f6" }
};
let records = [];
let currentPage = "overview";
const today = new Date();
const isoDate = value => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
const money = cents => `¥${(Number(cents || 0) / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = value => { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; };
const total = (items, type, category) => items.filter(item => (!type || item.type === type) && (!category || item.category === category)).reduce((sum,item) => sum + item.amountCents, 0);

function toast(text) { const el=$("#toast"); el.textContent=text; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),2200); }
function setSync(status, title, text) { $("#syncLight").className=`sync-light ${status}`; $("#syncTitle").textContent=title; $("#syncText").textContent=text; }

async function checkAuth() {
  try {
    const response = await fetch("/api/records", { 
      cache: "no-store",
      credentials: "include"
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return false;
    }
    if (!response.ok) throw new Error("认证失败");
    return true;
  } catch {
    window.location.href = "/login.html";
    return false;
  }
}

async function loadRecords(showToast=false) {
  try {
    const response = await fetch("/api/records", { 
      cache: "no-store",
      credentials: "include"
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!response.ok) throw new Error("读取失败");
    records = await response.json();
    render();
    if(showToast) toast("已刷新到最新账目");
  } catch (error) {
    setSync("error", "连接失败", "请检查网络或服务器");
    if(showToast) toast("暂时无法连接共享账本");
  }
}

function render() {
  const income=total(records,"income"), expense=total(records,"expense"), balance=income-expense;
  $("#recordCount").textContent=records.length; $("#balanceValue").textContent=`${balance<0?"-":""}${money(Math.abs(balance))}`;
  $("#incomeValue").textContent=money(income); $("#expenseValue").textContent=money(expense); $("#waterValue").textContent=money(total(records,"expense","买水")); $("#airValue").textContent=money(total(records,"expense","空调"));
  $("#balanceStatus").textContent=balance>=0?`公账还有结余，共记录 ${records.length} 笔`:`公账已欠款 ${money(Math.abs(balance))}，需要及时补充`;
  const sorted=[...records].sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0));
  renderList($("#recentList"), sorted.slice(0,6)); renderFilteredList(); renderMembers();
}

function recordHtml(item) {
  const meta=categoryMeta[item.category]||categoryMeta["其他"]; const sign=item.type==="income"?"+":"-"; const detail=[item.category,item.member,item.note].filter(Boolean).join(" · ");
  return `<div class="record-row"><span class="record-icon" style="color:${meta.color};background:${meta.soft}">${meta.label}</span><div class="record-info"><strong>${escapeHtml(item.note||item.category)}</strong><small>${escapeHtml(detail)} · ${formatDate(item.date)}</small></div><span class="record-amount ${item.type}">${sign}${money(item.amountCents)}</span><div class="row-actions"><button class="icon-button" data-edit="${item.id}" title="修改"><svg><use href="#i-edit"/></svg></button><button class="icon-button danger" data-delete="${item.id}" title="删除"><svg><use href="#i-trash"/></svg></button></div></div>`;
}
function formatDate(date) { const [y,m,d]=date.split("-").map(Number); const day=new Date(y,m-1,d); return `${m}月${d}日 · ${["周日","周一","周二","周三","周四","周五","周六"][day.getDay()]}`; }
function renderList(target, items) { target.innerHTML=items.length?items.map(recordHtml).join(""):`<div class="empty">还没有账目，点击“记一笔”开始记录</div>`; }
function renderFilteredList() { const q=$("#searchInput").value.trim().toLowerCase(), type=$("#typeFilter").value, category=$("#categoryFilter").value; const filtered=[...records].filter(item=>(type==="all"||item.type===type)&&(category==="all"||item.category===category)&&(!q||`${item.category}${item.member}${item.note}`.toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0)); renderList($("#allRecords"),filtered); }

function memberData() {
  const map=new Map();
  records.filter(r=>r.type==="income"&&r.category==="成员缴费"&&r.member).forEach(record=>{
    const names=record.member.split(/[、,，\s]+/).map(v=>v.trim()).filter(Boolean); const share=Math.round(record.amountCents/Math.max(1,names.length));
    names.forEach(name=>{ const current=map.get(name)||{name,amountCents:0,count:0,lastDate:""}; current.amountCents+=share; current.count+=1; if(record.date>current.lastDate)current.lastDate=record.date; map.set(name,current); });
  });
  return [...map.values()].sort((a,b)=>b.amountCents-a.amountCents||a.name.localeCompare(b.name,"zh-CN"));
}
function renderMembers() {
  const members=memberData(); const preview=members.slice(0,7).map(m=>`<div class="member-item"><span class="member-avatar">${escapeHtml(m.name.slice(0,1))}</span><div><strong>${escapeHtml(m.name)}</strong><small>${m.count} 次缴费 · 最近 ${formatDate(m.lastDate)}</small></div><strong>${money(m.amountCents)}</strong></div>`).join("");
  $("#memberPreview").innerHTML=preview||`<div class="empty">还没有成员缴费记录</div>`;
  $("#memberSummary").innerHTML=members.map(m=>`<article class="member-card"><div class="member-card-top"><span class="member-avatar">${escapeHtml(m.name.slice(0,1))}</span><span class="paid-badge">已缴费</span></div><h3>${escapeHtml(m.name)}</h3><p>共 ${m.count} 次 · 最近 ${formatDate(m.lastDate)}</p><strong>${money(m.amountCents)}</strong></article>`).join("")||`<article class="panel empty">还没有成员缴费记录</article>`;
}

function setPage(page) { currentPage=page; $$(".page").forEach(el=>el.classList.toggle("active",el.id===`page-${page}`)); $$(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page===page)); const titles={overview:"大家的每一笔，都清清楚楚",records:"公账流水，随时可查",members:"谁交了钱，一目了然"}; $("#pageTitle").textContent=titles[page]; $("#sidebar").classList.remove("open"); }
function updateCategories(type, selected) { const list=type==="income"?incomeCategories:expenseCategories; $("#categoryInput").innerHTML=list.map(v=>`<option ${v===selected?"selected":""}>${v}</option>`).join(""); }
function openModal(record) {
  $("#recordForm").reset(); $("#recordId").value=record?.id||""; $("#modalTitle").textContent=record?"修改这笔账":"记一笔公账";
  const type=record?.type||"income"; $(`input[name="type"][value="${type}"]`).checked=true; updateCategories(type,record?.category); $("#amountInput").value=record?record.amountCents/100:""; $("#dateInput").value=record?.date||isoDate(today); $("#memberInput").value=record?.member||""; $("#noteInput").value=record?.note||""; $("#recordModal").hidden=false; setTimeout(()=>$("#amountInput").focus(),40);
}
function closeModal() { $("#recordModal").hidden=true; }
async function saveRecord(event) {
  event.preventDefault(); const id=$("#recordId").value; const amount=Number($("#amountInput").value); if(!Number.isFinite(amount)||amount<=0)return toast("请输入正确金额");
  const payload={type:$("input[name='type']:checked").value,amount,category:$("#categoryInput").value,date:$("#dateInput").value,member:$("#memberInput").value.trim(),note:$("#noteInput").value.trim()};
  try { 
    const response=await fetch(id?`/api/records/${id}`:"/api/records",{
      method:id?"PUT":"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      credentials:"include"
    }); 
    if(response.status===401){ window.location.href="/login.html"; return; }
    if(!response.ok)throw new Error((await response.json()).error); 
    closeModal(); await loadRecords(); toast(id?"账目已修改":"已保存到共享账本"); 
  } catch(error){toast(error.message||"保存失败，请重试");}
}
async function deleteRecord(id) { if(!confirm("确定删除这笔账吗？所有人都会同步看到。"))return; try{const response=await fetch(`/api/records/${id}`,{method:"DELETE",credentials:"include"});if(response.status===401){window.location.href="/login.html";return;}if(!response.ok)throw new Error();await loadRecords();toast("账目已删除");}catch{toast("删除失败，请重试");} }
function exportCsv() { const rows=[["日期","收支","金额","分类","相关成员","备注"],...records.map(r=>[r.date,r.type==="income"?"进账":"支出",(r.amountCents/100).toFixed(2),r.category,r.member,r.note])]; const csv="\ufeff"+rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\r\n"); const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const link=document.createElement("a"); link.href=url; link.download=`清风公账-${isoDate(today)}.csv`;link.click();URL.revokeObjectURL(url);toast("账目已导出");}
async function logout() { try { await fetch("/api/logout", { method: "POST", credentials: "include" }); window.location.href = "/login.html"; } catch { toast("退出失败"); } }

$$('.nav-item').forEach(el=>el.addEventListener("click",()=>setPage(el.dataset.page))); $$('[data-jump]').forEach(el=>el.addEventListener("click",()=>setPage(el.dataset.jump)));
$("#menuButton").addEventListener("click",()=>$("#sidebar").classList.toggle("open")); $("#addButton").addEventListener("click",()=>openModal()); $("#closeModal").addEventListener("click",closeModal); $("#recordModal").addEventListener("click",e=>{if(e.target===$("#recordModal"))closeModal()});
$$('input[name="type"]').forEach(el=>el.addEventListener("change",()=>updateCategories(el.value))); $("#recordForm").addEventListener("submit",saveRecord); $("#searchInput").addEventListener("input",renderFilteredList); $("#typeFilter").addEventListener("change",renderFilteredList); $("#categoryFilter").addEventListener("change",renderFilteredList); $("#refreshButton").addEventListener("click",()=>loadRecords(true)); $("#exportButton").addEventListener("click",exportCsv); $("#logoutButton").addEventListener("click",logout);
document.addEventListener("click",event=>{const edit=event.target.closest("[data-edit]"),del=event.target.closest("[data-delete]");if(edit)openModal(records.find(r=>r.id===edit.dataset.edit));if(del)deleteRecord(del.dataset.delete)}); document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
$("#todayText").textContent=`${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日 · ${["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][today.getDay()]}`;

checkAuth().then(authenticated => {
  if (authenticated) {
    loadRecords();
  }
});