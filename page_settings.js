import { db, ref, set, update, push, onValue } from "./fb.js";
import { $, esc, num, toast, ask } from "./ui.js";
import { uploadWithKey, resetKeys } from "./imgbb.js";

export async function mount(el, ctx) {
  let S = {}, rendered = false;
  const mask = k => k.length > 10 ? k.slice(0, 4) + "…" + k.slice(-4) : "••••";
  const val = (p, d = "") => { let v = S; for (const k of p.split("/")) v = v && v[k]; return v ?? d; };

  function render() {
    const keys = Object.entries(S.imgbbKeys || {}).map(([id, v]) => ({ ...v, id }));
    el.innerHTML = `<h1>সেটিংস</h1>
      <div class="card"><h2>সাধারণ</h2>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
          <div class="fld"><label>কমিশন (%)</label><input id="s_comm" type="number" min="0" max="50" step="0.5" value="${esc(val("commission"))}"></div>
          <div class="fld"><label>বিক্রেতার সাড়া দেওয়ার সময় (ঘণ্টা)</label><input id="s_dh" type="number" min="1" max="168" value="${esc(val("dealHours", 24))}"></div>
          <div class="fld"><label>সর্বনিম্ন ডিপোজিট (৳)</label><input id="s_mind" type="number" min="0" value="${esc(val("limits/minDeposit"))}"></div>
          <div class="fld"><label>সর্বনিম্ন উইথড্র (৳)</label><input id="s_minw" type="number" min="0" value="${esc(val("limits/minWithdraw"))}"></div>
          <div class="fld"><label>WhatsApp লিংক</label><input id="s_wa" value="${esc(val("support/whatsapp"))}" placeholder="https://wa.me/8801..."></div>
          <div class="fld"><label>Telegram লিংক</label><input id="s_tg" value="${esc(val("support/telegram"))}" placeholder="https://t.me/..."></div>
        </div>
        <label class="chk"><input type="checkbox" id="s_mon" ${val("maintenance/on", false) ? "checked" : ""}> <span>মেইনটেন্যান্স মোড (চালু করলে ইউজার সাইট ব্যবহার করতে পারবে না)</span></label>
        <div class="fld"><label>মেইনটেন্যান্স বার্তা</label><input id="s_mmsg" value="${esc(val("maintenance/message"))}"></div>
        <button class="btn primary" id="sv1">সাধারণ সেটিংস সেভ</button></div>
      <div class="sep"></div>
      <div class="card"><h2>পেমেন্ট নম্বর (ডিপোজিট পেজে ইউজার এটা দেখবে)</h2>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
          <div class="fld"><label>bKash</label><input id="p_bk" value="${esc(val("payment/bkash"))}"></div>
          <div class="fld"><label>Nagad</label><input id="p_ng" value="${esc(val("payment/nagad"))}"></div>
          <div class="fld"><label>Rocket</label><input id="p_rk" value="${esc(val("payment/rocket"))}"></div></div>
        <button class="btn primary" id="sv2">নম্বর সেভ</button></div>
      <div class="sep"></div>
      <div class="card"><div class="bar"><h2 style="margin:0">imgbb API কী (একাধিক)</h2><span class="sp"></span><button class="btn primary" id="ak">+ কী যোগ</button></div>
        <p class="msg">আপলোডের সময় সক্রিয় কী-গুলো থেকে এলোমেলোভাবে একটা নেয়, ব্যর্থ হলে পরেরটা চেষ্টা করে। কী যত বেশি, লিমিটের চাপ তত কম।</p>
        <div class="list">${keys.length ? keys.map(k => `<div class="item" data-id="${esc(k.id)}" style="align-items:center"><div class="grow"><h3>${esc(k.label || "কী")} <span class="pill ${k.active === false ? "rejected" : "approved"}">${k.active === false ? "বন্ধ" : "সক্রিয়"}</span></h3><div class="meta">${esc(mask(k.key || ""))}</div></div>
          <div class="acts" style="margin:0"><button class="btn sm" data-a="test">টেস্ট</button><button class="btn sm" data-a="tog">${k.active === false ? "চালু" : "বন্ধ"}</button><button class="btn sm danger" data-a="del">মুছুন</button></div></div>`).join("") : '<div class="empty">কোনো কী নেই। ছবি আপলোড কাজ করবে না।</div>'}</div></div>`;
    rendered = true;
    $("#sv1").onclick = () => save({ "commission": numOrNull("#s_comm"), "dealHours": numOrNull("#s_dh") || 24, "limits/minDeposit": numOrNull("#s_mind"), "limits/minWithdraw": numOrNull("#s_minw"),
      "support/whatsapp": $("#s_wa").value.trim() || null, "support/telegram": $("#s_tg").value.trim() || null,
      "maintenance": { on: $("#s_mon").checked, message: $("#s_mmsg").value.trim().slice(0, 200) } }, "settings_general");
    $("#sv2").onclick = () => save({ "payment/bkash": $("#p_bk").value.trim() || null, "payment/nagad": $("#p_ng").value.trim() || null, "payment/rocket": $("#p_rk").value.trim() || null }, "settings_payment");
    $("#ak").onclick = addKey;
  }
  const numOrNull = s => { const v = $(s).value.trim(); return v === "" ? null : Number(v); };
  async function save(obj, action) {
    const up = {}; for (const [k, v] of Object.entries(obj)) up["settings/" + k] = v;
    ctx.addLog(up, action, Object.keys(obj).join(","));
    try { await update(ref(db), up); toast("সেভ হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  async function addKey() {
    const f = await ask({ title: "imgbb কী যোগ", fields: [{ id: "label", label: "নাম (যেমন Key 2)", required: true }, { id: "key", label: "API key", required: true }] });
    if (!f) return;
    const k = push(ref(db, "settings/imgbbKeys")).key, up = {};
    up["settings/imgbbKeys/" + k] = { label: f.label.slice(0, 30), key: f.key, active: true, addedAt: Date.now() };
    ctx.addLog(up, "imgbb_key_add", f.label);
    try { await update(ref(db), up); resetKeys(); toast("যোগ হয়েছে। টেস্ট করে দেখুন"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  async function testKey(k) {
    toast("টেস্ট হচ্ছে...");
    try {
      const c = document.createElement("canvas"); c.width = c.height = 4; c.getContext("2d").fillRect(0, 0, 4, 4);
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      await uploadWithKey(blob, k.key); toast("কী ঠিকমতো কাজ করছে ✓");
    } catch (e) { toast("এই কী কাজ করছে না: " + e.message, true); }
  }
  el.addEventListener("click", async e => {
    const a = e.target.closest("[data-a]"); if (!a) return;
    const k = (S.imgbbKeys || {})[a.closest("[data-id]").dataset.id]; if (!k) return;
    const id = a.closest("[data-id]").dataset.id;
    if (a.dataset.a === "test") return testKey(k);
    const up = {};
    if (a.dataset.a === "tog") { up["settings/imgbbKeys/" + id + "/active"] = k.active === false; ctx.addLog(up, "imgbb_key_toggle", k.label); }
    else { if (!await ask({ title: "কী মুছবেন?", message: k.label, ok: "মুছুন", danger: true, fields: [] })) return; up["settings/imgbbKeys/" + id] = null; ctx.addLog(up, "imgbb_key_delete", k.label); }
    try { await update(ref(db), up); resetKeys(); } catch (err) { toast("হয়নি: " + (err.code || err.message), true); }
  });
  /* form field gulo nijer edit nashto na korte: prothombar ar kuno key bodlale tobei abar render */
  let lastKeys = null;
  const off = onValue(ref(db, "settings"), s => {
    S = s.val() || {};
    const sig = JSON.stringify(S.imgbbKeys || {});
    if (!rendered || sig !== lastKeys) { lastKeys = sig; if (!rendered) render(); else renderKeysOnly(); }
  }, e => { el.innerHTML = '<div class="empty">পড়া যায়নি: ' + esc(e.code || e.message) + "</div>"; });
  function renderKeysOnly() { const keep = collect(); render(); restore(keep); }
  function collect() { return ["s_comm", "s_dh", "s_mind", "s_minw", "s_wa", "s_tg", "s_mmsg", "p_bk", "p_ng", "p_rk"].map(i => $("#" + i).value).concat($("#s_mon").checked); }
  function restore(v) { ["s_comm", "s_dh", "s_mind", "s_minw", "s_wa", "s_tg", "s_mmsg", "p_bk", "p_ng", "p_rk"].forEach((i, n) => $("#" + i).value = v[n]); $("#s_mon").checked = v[10]; }
  return off;
}
