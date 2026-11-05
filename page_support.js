import { db, ref, update, push, onValue, serverTimestamp } from "./fb.js";
import { $, esc, num, fmtDate, toast, modal } from "./ui.js";

export async function mount(el, ctx) {
  let tickets = [], f = "open", q = "";
  el.innerHTML = `<h1>সাপোর্ট</h1><div class="bar"><div class="tabs" id="tf" style="margin:0"><button class="btn on" data-f="open">খোলা</button><button class="btn" data-f="closed">বন্ধ</button></div>
    <input id="q" placeholder="ইউজার বা বিষয় খুঁজুন"></div><div class="list" id="l"></div>`;
  function render() {
    let a = tickets.filter(t => t.status === f).sort((x, y) => num(y.updatedAt || y.createdAt) - num(x.updatedAt || x.createdAt));
    if (q) { const s = q.toLowerCase(); a = a.filter(t => (t.userName || "").toLowerCase().includes(s) || (t.subject || "").toLowerCase().includes(s)); }
    $("#l").innerHTML = a.length ? a.map((t, i) => `<div class="item" data-id="${esc(t.id)}" style="cursor:pointer;animation-delay:${Math.min(i, 8) * 30}ms"><div class="grow">
      <h3>${esc(t.subject)} ${t.lastFrom === "user" && t.status === "open" ? '<span class="chip r">উত্তর বাকি</span>' : ""}</h3>
      <div class="meta">${esc(t.userName)} · ${fmtDate(t.updatedAt || t.createdAt)}</div></div><span class="pill ${esc(t.status)}">${t.status === "open" ? "খোলা" : "বন্ধ"}</span></div>`).join("") : '<div class="empty">কোনো টিকিট নেই</div>';
  }
  function open(id) {
    let off = null;
    const m = modal("টিকিট", `<div id="th" class="thread"></div><div class="fld" style="margin-top:10px"><textarea id="rp" rows="3" placeholder="উত্তর লিখুন"></textarea></div>`, [
      { label: "বন্ধ/খুলুন", onClick: async () => {
          const t = tickets.find(x => x.id === id); if (!t) return;
          const up = {}; up["tickets/" + id + "/status"] = t.status === "open" ? "closed" : "open"; ctx.addLog(up, "ticket_" + up["tickets/" + id + "/status"], t.subject);
          try { await update(ref(db), up); toast("হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); } } },
      { label: "পাঠান", cls: "primary", onClick: async () => {
          const text = $("#rp", m.ov).value.trim(); if (!text) return;
          const k = push(ref(db, "tickets/" + id + "/messages")).key, up = {};
          up["tickets/" + id + "/messages/" + k] = { from: "staff", name: ctx.name.slice(0, 60), text: text.slice(0, 1000), at: serverTimestamp() };
          up["tickets/" + id + "/updatedAt"] = serverTimestamp(); up["tickets/" + id + "/lastFrom"] = "staff";
          try { await update(ref(db), up); $("#rp", m.ov).value = ""; } catch (e) { toast("হয়নি: " + (e.code || e.message), true); } } }
    ], () => off && off());
    off = onValue(ref(db, "tickets/" + id), s => {
      const t = s.val(); if (!t) return;
      m.ov.querySelector(".dh b").textContent = t.subject + " — " + t.userName;
      const th = $("#th", m.ov); if (!th) return;
      th.innerHTML = Object.values(t.messages || {}).sort((a, b) => num(a.at) - num(b.at)).map(x => `<div class="msgb ${x.from === "staff" ? "staff" : ""}"><small>${esc(x.name)} · ${fmtDate(x.at)}</small>${esc(x.text)}</div>`).join("") || '<div class="empty">কোনো মেসেজ নেই</div>';
      th.scrollTop = th.scrollHeight;
    });
  }
  $("#tf").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { f = b.dataset.f; document.querySelectorAll("#tf .btn").forEach(x => x.classList.toggle("on", x === b)); render(); } };
  $("#q").oninput = e => { q = e.target.value.trim(); render(); };
  el.addEventListener("click", e => { const r = e.target.closest(".item[data-id]"); if (r) open(r.dataset.id); });
  const o = onValue(ref(db, "tickets"), s => { tickets = Object.entries(s.val() || {}).map(([id, v]) => ({ ...v, id })); render(); },
    e => { $("#l").innerHTML = '<div class="empty">পড়া যায়নি: ' + esc(e.code || e.message) + "</div>"; });
  return o;
}
