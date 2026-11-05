import { db, ref, get, set, update, push, onValue, query, orderByChild, limitToLast, runTransaction, serverTimestamp } from "./fb.js";
import { $, esc, num, money, fmtDate, toast, copy, ask } from "./ui.js";

const M = { bkash: "bKash", nagad: "Nagad", rocket: "Rocket" };
/* status ekbar badle nei: from -> to (ekjon duibar approve korte parbe na) */
async function claim(path, from, to) {
  const r = await runTransaction(ref(db, path), cur => cur === null ? to : (cur === from ? to : undefined));
  return r.committed && r.snapshot.val() === to;
}

export async function mount(el, ctx) {
  let tab = "dep", sub = "pending", dep = [], wd = [], users = {};
  el.innerHTML = `<h1>টাকা</h1>
    <div class="tabs" id="tt"><button class="btn on" data-tab="dep">ডিপোজিট <b id="dc"></b></button><button class="btn" data-tab="wd">উইথড্র <b id="wc"></b></button></div>
    <div class="tabs" id="ts"><button class="btn on" data-sub="pending">Pending</button><button class="btn" data-sub="done">ইতিহাস</button></div><div id="body"></div>`;
  const body = $("#body");
  const uname = r => users[r.uid] ? (users[r.uid].name || users[r.uid].email) : (r.userName || r.uid);

  function render() {
    const pd = dep.filter(d => d.status === "pending").length, pw = wd.filter(d => d.status === "pending").length;
    $("#dc").textContent = pd ? "(" + pd + ")" : ""; $("#wc").textContent = pw ? "(" + pw + ")" : "";
    const rows = (tab === "dep" ? dep : wd).filter(r => sub === "pending" ? r.status === "pending" : r.status !== "pending");
    if (!rows.length) { body.innerHTML = '<div class="empty">কিছু নেই</div>'; return; }
    const seen = {}; dep.forEach(d => seen[d.trxId] = (seen[d.trxId] || 0) + 1);
    body.innerHTML = `<div class="list">${rows.map((r, i) => {
      const isDep = tab === "dep", bal = users[r.uid] ? num(users[r.uid].balance) : null;
      return `<div class="item" style="animation-delay:${Math.min(i, 8) * 30}ms"><div class="grow">
        <h3>${esc(uname(r))} — ${money(r.amount)} <span class="pill ${esc(r.status)}">${esc(r.status)}</span></h3>
        <div class="meta">${esc(M[r.method] || r.method)} · ${fmtDate(r.createdAt)}${isDep ? " · TrxID: <b>" + esc(r.trxId) + "</b>" : " · নম্বর: <b>" + esc(r.number) + "</b>"}${bal !== null ? " · ব্যালেন্স: " + money(bal) : ""}</div>
        ${isDep && seen[r.trxId] > 1 ? '<div class="chips"><span class="chip r">একই TrxID একাধিকবার</span></div>' : ""}
        ${!isDep && r.status === "pending" && bal !== null && bal < r.amount ? '<div class="chips"><span class="chip r">ব্যালেন্স কম</span></div>' : ""}
        ${r.reason ? `<div class="meta">কারণ: ${esc(r.reason)}</div>` : ""}
        ${r.status === "pending" ? `<div class="acts" data-id="${esc(r.id)}"><button class="btn sm" data-a="copy">${isDep ? "TrxID" : "নম্বর"} কপি</button>
          <button class="btn sm good" data-a="ok">${isDep ? "Approve" : "Paid (টাকা পাঠিয়েছি)"}</button><button class="btn sm danger" data-a="no">Reject</button></div>` : ""}
      </div></div>`; }).join("")}</div>`;
  }

  async function depOk(r) {
    const f = await ask({ title: "ডিপোজিট অনুমোদন", message: uname(r) + " · " + money(r.amount) + " · " + r.trxId + "\nbKash/Nagad অ্যাপে টাকা এসেছে কিনা মিলিয়ে নিন।", ok: "Approve", fields: [] });
    if (!f) return;
    if (!await claim("deposits/" + r.id + "/status", "pending", "approved")) return toast("আগেই প্রসেস হয়েছে", true);
    try {
      const t = await runTransaction(ref(db, "users/" + r.uid + "/balance"), cur => (cur === null ? 0 : cur) + r.amount);
      if (!t.committed) throw new Error("balance");
      const up = {}, k = push(ref(db, "transactions/" + r.uid)).key;
      up["transactions/" + r.uid + "/" + k] = { type: "deposit", amount: r.amount, note: (M[r.method] || r.method) + " " + r.trxId, ref: r.id, at: serverTimestamp() };
      up["deposits/" + r.id + "/processedBy"] = ctx.uid; up["deposits/" + r.id + "/processedAt"] = serverTimestamp();
      ctx.addLog(up, "deposit_approve", uname(r) + " " + r.amount + " " + r.trxId);
      await update(ref(db), up); toast("ব্যালেন্স যোগ হয়েছে");
    } catch (e) { await set(ref(db, "deposits/" + r.id + "/status"), "pending").catch(() => {}); toast("হয়নি, আবার চেষ্টা করুন: " + (e.code || e.message), true); }
  }
  async function reject(r, isDep) {
    const f = await ask({ title: "Reject", ok: "Reject", danger: true, fields: [{ id: "why", label: "কারণ (ইউজার দেখবে)", required: true }] });
    if (!f) return;
    const path = (isDep ? "deposits/" : "withdrawals/") + r.id + "/status";
    if (!await claim(path, "pending", "rejected")) return toast("আগেই প্রসেস হয়েছে", true);
    const up = {}, b = (isDep ? "deposits/" : "withdrawals/") + r.id + "/";
    up[b + "reason"] = f.why.slice(0, 200); up[b + "processedBy"] = ctx.uid; up[b + "processedAt"] = serverTimestamp();
    if (isDep) up["trx_used/" + r.trxId] = null;
    ctx.addLog(up, isDep ? "deposit_reject" : "withdraw_reject", uname(r) + " " + r.amount + ": " + f.why);
    try { await update(ref(db), up); toast("বাতিল হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  async function wdPaid(r) {
    const f = await ask({ title: "উইথড্র Paid", message: uname(r) + "\n" + (M[r.method] || r.method) + " " + r.number + " — " + money(r.amount) + "\nআগে টাকা পাঠান, তারপর Paid চাপুন। চাপলে ইউজারের ব্যালেন্স থেকে কাটা হবে।", ok: "Paid", fields: [] });
    if (!f) return;
    if (!await claim("withdrawals/" + r.id + "/status", "pending", "paid")) return toast("আগেই প্রসেস হয়েছে", true);
    try {
      const t = await runTransaction(ref(db, "users/" + r.uid + "/balance"), cur => cur === null ? 0 : (cur >= r.amount ? cur - r.amount : undefined));
      if (!t.committed) { await set(ref(db, "withdrawals/" + r.id + "/status"), "pending"); return toast("ব্যালেন্স কম, উইথড্র আগের অবস্থায় ফেরানো হয়েছে", true); }
      const up = {}, k = push(ref(db, "transactions/" + r.uid)).key;
      up["transactions/" + r.uid + "/" + k] = { type: "withdraw", amount: -r.amount, note: (M[r.method] || r.method) + " " + r.number, ref: r.id, at: serverTimestamp() };
      up["withdrawals/" + r.id + "/processedBy"] = ctx.uid; up["withdrawals/" + r.id + "/processedAt"] = serverTimestamp();
      ctx.addLog(up, "withdraw_paid", uname(r) + " " + r.amount + " " + r.number);
      await update(ref(db), up); toast("Paid হিসেবে চিহ্নিত");
    } catch (e) { await set(ref(db, "withdrawals/" + r.id + "/status"), "pending").catch(() => {}); toast("হয়নি: " + (e.code || e.message), true); }
  }

  el.addEventListener("click", e => {
    const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; document.querySelectorAll("#tt .btn").forEach(b => b.classList.toggle("on", b === t)); return render(); }
    const s = e.target.closest("[data-sub]"); if (s) { sub = s.dataset.sub; document.querySelectorAll("#ts .btn").forEach(b => b.classList.toggle("on", b === s)); return render(); }
    const a = e.target.closest("[data-a]"); if (!a) return;
    const id = a.closest("[data-id]").dataset.id, isDep = tab === "dep", r = (isDep ? dep : wd).find(x => x.id === id); if (!r) return;
    if (a.dataset.a === "copy") copy(isDep ? r.trxId : r.number);
    else if (a.dataset.a === "ok") isDep ? depOk(r) : wdPaid(r);
    else reject(r, isDep);
  });
  const lst = (p, set_) => onValue(query(ref(db, p), orderByChild("createdAt"), limitToLast(200)), s => {
    set_(Object.entries(s.val() || {}).map(([id, v]) => ({ ...v, id })).sort((a, b) => num(b.createdAt) - num(a.createdAt))); render();
  }, e => { body.innerHTML = '<div class="empty">পড়া যায়নি: ' + esc(e.code || e.message) + "</div>"; });
  const o1 = lst("deposits", v => dep = v), o2 = lst("withdrawals", v => wd = v);
  const o3 = onValue(ref(db, "users"), s => { users = s.val() || {}; render(); }, () => {});
  return () => { o1(); o2(); o3(); };
}
