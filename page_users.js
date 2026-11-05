import { db, ref, get, update, push, onValue, runTransaction, serverTimestamp } from "./fb.js";
import { $, esc, num, money, safeImg, fmtDate, toast, copy, ask, modal } from "./ui.js";

export async function mount(el, ctx) {
  let users = [], q = "", f = "all";
  el.innerHTML = `<h1>ইউজার <span class="meta" id="cnt"></span></h1>
    <div class="bar"><input id="q" placeholder="নাম বা ইমেইল খুঁজুন"><select id="f"><option value="all">সবাই</option><option value="banned">ব্যান</option></select></div><div class="list" id="l"></div>`;
  function render() {
    let a = users.slice().sort((x, y) => num(y.createdAt) - num(x.createdAt));
    if (f === "banned") a = a.filter(u => u.banned);
    if (q) { const s = q.toLowerCase(); a = a.filter(u => (u.name || "").toLowerCase().includes(s) || (u.email || "").toLowerCase().includes(s)); }
    $("#cnt").textContent = "(" + a.length + "/" + users.length + ")";
    $("#l").innerHTML = a.length ? a.slice(0, 200).map((u, i) => `<div class="item" data-id="${esc(u.id)}" style="cursor:pointer;align-items:center;animation-delay:${Math.min(i, 8) * 30}ms">
      <div class="av">${safeImg(u.photo) ? `<img src="${esc(u.photo)}" alt="">` : esc((u.name || "?").charAt(0).toUpperCase())}</div>
      <div class="grow"><h3>${esc(u.name || "-")} ${u.banned ? '<span class="pill banned">ব্যান</span>' : ""}</h3><div class="meta">${esc(u.email)} · ${fmtDate(u.createdAt)}</div></div>
      <b>${money(u.balance)}</b></div>`).join("") : '<div class="empty">কেউ নেই</div>';
  }
  async function history(u) {
    try {
      const v = (await get(ref(db, "transactions/" + u.id))).val() || {};
      const a = Object.values(v).sort((x, y) => num(y.at) - num(x.at)).slice(0, 30);
      modal("লেনদেন: " + (u.name || u.email), a.length ? `<table>${a.map(t => `<tr><td>${fmtDate(t.at)}</td><td>${esc(t.type)}</td><td><b style="color:var(--${t.amount < 0 ? "danger" : "success"})">${t.amount > 0 ? "+" : ""}${num(t.amount)}</b></td><td class="meta">${esc(t.note || "")}</td></tr>`).join("")}</table>` : '<div class="empty">কোনো লেনদেন নেই</div>', [{ label: "বন্ধ", cls: "primary", onClick: c => c() }]);
    } catch (e) { toast("পড়া যায়নি: " + (e.code || e.message), true); }
  }
  async function adjust(u) {
    const r = await ask({ title: "ব্যালেন্স পরিবর্তন: " + (u.name || u.email), message: "+ যোগ, - বিয়োগ। বর্তমান: " + money(u.balance), fields: [
      { id: "amt", label: "পরিমাণ (যেমন 500 বা -200)", type: "number", required: true }, { id: "note", label: "কারণ", required: true }] });
    if (!r) return;
    if (!r.amt || !Number.isInteger(r.amt)) return toast("পূর্ণ সংখ্যা দিন", true);
    try {
      const t = await runTransaction(ref(db, "users/" + u.id + "/balance"), cur => { const v = (cur === null ? 0 : cur) + r.amt; return v < 0 ? undefined : v; });
      if (!t.committed) return toast("ব্যালেন্স ঋণাত্মক হয়ে যাবে, বাতিল", true);
      const up = {}, k = push(ref(db, "transactions/" + u.id)).key;
      up["transactions/" + u.id + "/" + k] = { type: "admin_adjust", amount: r.amt, note: r.note.slice(0, 200), at: serverTimestamp() };
      ctx.addLog(up, "balance_adjust", (u.email || u.id) + " " + r.amt + " : " + r.note);
      await update(ref(db), up); toast("ব্যালেন্স আপডেট হয়েছে");
    } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  async function toggleBan(u) {
    const f2 = await ask({ title: u.banned ? "আনব্যান করবেন?" : "ব্যান করবেন?", message: (u.name || "") + " · " + (u.email || ""), ok: u.banned ? "আনব্যান" : "ব্যান", danger: !u.banned, fields: [] });
    if (!f2) return;
    const up = {}; up["users/" + u.id + "/banned"] = !u.banned;
    ctx.addLog(up, u.banned ? "user_unban" : "user_ban", u.email || u.id);
    try { await update(ref(db), up); toast("হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  function detail(u) {
    const canBan = ["admin", "moderator"].includes(ctx.role), isAdmin = ctx.role === "admin";
    const m = modal(u.name || "ইউজার", `<dl class="kv"><dt>ইমেইল</dt><dd>${esc(u.email)}</dd><dt>UID</dt><dd>${esc(u.id)}</dd><dt>ব্যালেন্স</dt><dd><b>${money(u.balance)}</b></dd><dt>যোগ দিয়েছেন</dt><dd>${fmtDate(u.createdAt)}</dd><dt>অবস্থা</dt><dd>${u.banned ? "ব্যান" : "সক্রিয়"}</dd></dl>`,
      [{ label: "UID কপি", onClick: () => copy(u.id) },
       ...(isAdmin ? [{ label: "লেনদেন", onClick: () => history(u) }, { label: "ব্যালেন্স", onClick: c => { c(); adjust(u); } }] : []),
       ...(canBan ? [{ label: u.banned ? "আনব্যান" : "ব্যান", cls: u.banned ? "good" : "danger", onClick: c => { c(); toggleBan(u); } }] : [])]);
  }
  $("#q").oninput = e => { q = e.target.value.trim(); render(); };
  $("#f").onchange = e => { f = e.target.value; render(); };
  el.addEventListener("click", e => { const r = e.target.closest("[data-id]"); if (r) { const u = users.find(x => x.id === r.dataset.id); if (u) detail(u); } });
  const off = onValue(ref(db, "users"), s => { users = Object.entries(s.val() || {}).map(([id, v]) => ({ ...v, id })); render(); },
    e => { $("#l").innerHTML = '<div class="empty">পড়া যায়নি: ' + esc(e.code || e.message) + "</div>"; });
  return off;
}
