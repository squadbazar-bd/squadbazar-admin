import { db, ref, get, onValue } from "./fb.js";
import { acceptDeal, cancelRequest, deliverDeal, releaseDeal, refundDeal, postMessage } from "./deal_ops.js";
import { $, esc, num, money, fmtDate, toast, copy, ask, modal, lightbox } from "./ui.js";

const ST = { requested: "অনুরোধ", held: "টাকা আটকানো", delivered: "ডেলিভারি হয়েছে", confirmed: "ক্রেতা Confirm করেছে", disputed: "বিরোধ", completed: "সম্পন্ন", refunded: "রিফান্ড", cancelled: "বাতিল" };
const ACTIVE = ["requested", "held", "delivered", "confirmed", "disputed"];
const hm = ms => { const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000); return h + "ঘ " + m + "মি"; };

export async function mount(el, ctx) {
  let deals = [], tab = "active", q = "", hours = 24, pct = 10;
  const isAdmin = ctx.role === "admin";
  if (isAdmin) {
    try { const h = (await get(ref(db, "settings/dealHours"))).val(); if (h) hours = Number(h) || 24; } catch (e) {}
    try { const c = (await get(ref(db, "settings/commission"))).val(); if (c !== null) pct = Number(c) || 0; } catch (e) {}
  }
  el.innerHTML = `<h1>ডিল</h1><div class="bar"><div class="tabs" id="tf" style="margin:0"><button class="btn on" data-f="active">চলমান</button><button class="btn" data-f="done">ইতিহাস</button></div>
    <input id="q" placeholder="আইডি / ক্রেতা / বিক্রেতা খুঁজুন"></div><div class="list" id="l"></div>`;

  const overdue = d => d.status === "held" && !d.sellerRespondedAt && d.deadline && Date.now() > d.deadline;
  const prio = d => d.status === "disputed" ? 0 : (overdue(d) || d.refundRequested) ? 1 : d.status === "requested" ? 2 : d.status === "confirmed" ? 3 : 4;
  function render() {
    let a = deals.filter(d => tab === "active" ? ACTIVE.includes(d.status) : !ACTIVE.includes(d.status));
    if (q) { const s = q.toLowerCase(); a = a.filter(d => [d.listingTitle, d.buyerName, d.sellerName].some(x => String(x || "").toLowerCase().includes(s))); }
    a.sort((x, y) => tab === "active" ? (prio(x) - prio(y) || num(x.createdAt) - num(y.createdAt)) : num(y.createdAt) - num(x.createdAt));
    $("#l").innerHTML = a.length ? a.map((d, i) => `<div class="item" data-id="${esc(d.id)}" style="cursor:pointer;animation-delay:${Math.min(i, 8) * 30}ms"><div class="grow">
      <h3>${esc(d.listingTitle)} — ${money(d.price)} <span class="pill ${esc(d.status)}">${esc(ST[d.status] || d.status)}</span></h3>
      <div class="meta">ক্রেতা: ${esc(d.buyerName)} → বিক্রেতা: ${esc(d.sellerName || "-")} · ${fmtDate(d.createdAt)}</div>
      <div class="chips">${overdue(d) ? '<span class="chip r">২৪ঘ শেষ, রিফান্ড বাকি</span>' : ""}${d.refundRequested ? '<span class="chip r">ক্রেতা রিফান্ড চেয়েছে</span>' : ""}
      ${d.status === "held" && !d.sellerRespondedAt && !overdue(d) && d.deadline ? `<span class="chip a">সাড়ার সময় বাকি ${hm(d.deadline - Date.now())}</span>` : ""}
      ${d.status === "held" && d.sellerRespondedAt ? '<span class="chip g">বিক্রেতা সাড়া দিয়েছে</span>' : ""}${d.status === "requested" ? '<span class="chip a">Accept বাকি</span>' : ""}</div></div></div>`).join("") : '<div class="empty">কোনো ডিল নেই</div>';
  }

  function openDeal(id) {
    let d = deals.find(x => x.id === id), msgs = [], phone = null, bal = null, offs = [];
    const m = modal("ডিল", '<div id="top"></div><h2 style="margin-top:14px">চ্যাট</h2><div class="thread" id="th"></div><div class="fld" style="margin-top:8px"><div class="acts" id="qk" style="margin:0 0 6px"></div><textarea id="rp" rows="2" placeholder="স্টাফ হিসেবে মেসেজ লিখুন"></textarea></div><button class="btn primary" id="sn">পাঠান</button>', [], () => offs.forEach(o => o && o()));
    m.ov.querySelector(".dlg").classList.add("wide");
    const $$ = s => m.ov.querySelector(s);

    async function act(fn, ok) { try { await fn(); toast(ok || "হয়েছে"); } catch (e) { toast(e.message || (e.code || "হয়নি"), true); } }
    function top() {
      if (!d) { $$("#top").innerHTML = '<div class="empty">ডিল পাওয়া যায়নি</div>'; return; }
      const ph = String(phone || "").replace(/\D/g, ""), intl = ph.startsWith("88") ? ph : "88" + ph;
      const left = d.deadline ? d.deadline - Date.now() : 0;
      const btns = [];
      if (d.status === "requested") {
        if (isAdmin) btns.push(["good", "Accept (টাকা আটকান)", "accept"]); else btns.push(["", "Accept শুধু অ্যাডমিন করতে পারে", "none"]);
        if (isAdmin) btns.push(["danger", "অনুরোধ বাতিল", "cancel"]);
      }
      if (d.status === "held") { btns.push(["good", "ডেলিভারি দিন (আইডির তথ্য পাঠান)", "deliver"]); if (isAdmin) btns.push(["danger", "রিফান্ড / ডিল বন্ধ", "refund"]); }
      if (isAdmin && ["delivered", "confirmed", "disputed"].includes(d.status)) { btns.push(["good", "Release (বিক্রেতাকে টাকা)", "release"]); btns.push(["danger", "রিফান্ড (ক্রেতাকে ফেরত)", "refund"]); }
      $$("#top").innerHTML = `<dl class="kv"><dt>আইডি</dt><dd><b>${esc(d.listingTitle)}</b>${d.konamiUsername ? " · @" + esc(d.konamiUsername) : ""}</dd>
        <dt>দাম</dt><dd><b>${money(d.price)}</b> ${isAdmin ? `<span class="meta">(কমিশন ${pct}% = ${money(Math.round(d.price * pct / 100))})</span>` : ""}</dd>
        <dt>ক্রেতা</dt><dd>${esc(d.buyerName)}${bal !== null ? ` · ব্যালেন্স ${money(bal)}` : ""}</dd><dt>বিক্রেতা</dt><dd>${esc(d.sellerName || "-")}</dd>
        <dt>অবস্থা</dt><dd><span class="pill ${esc(d.status)}">${esc(ST[d.status] || d.status)}</span> ${d.reason ? `<span class="meta">${esc(d.reason)}</span>` : ""}</dd>
        ${d.status === "held" ? `<dt>সাড়ার সময়</dt><dd>${d.sellerRespondedAt ? `✅ বিক্রেতা সাড়া দিয়েছে (${fmtDate(d.sellerRespondedAt)})` : left > 0 ? `<span class="timer">${hm(left)}</span> বাকি` : '<b style="color:var(--danger)">সময় শেষ, রিফান্ড হবে</b>'}</dd>` : ""}</dl>
        <div class="paybox2"><div class="meta">📞 বিক্রেতার ফোন (শুধু স্টাফ দেখছে)</div><div class="phone">${phone ? esc(phone) : "নম্বর পাওয়া যায়নি"}</div>
        ${phone ? `<div class="acts"><a class="btn sm good" href="tel:${esc(phone)}">📞 কল</a><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${esc(intl)}">WhatsApp</a><button class="btn sm" id="cpph">কপি</button></div>` : ""}</div>
        <div class="acts" id="ab" style="margin-top:12px">${btns.map(b => `<button class="btn ${b[0]}" data-do="${b[2]}" ${b[2] === "none" ? "disabled" : ""}>${esc(b[1])}</button>`).join("")}</div>`;
      const cp = $$("#cpph"); if (cp) cp.onclick = () => copy(phone);
      $$("#ab").onclick = async e => {
        const b = e.target.closest("[data-do]"); if (!b) return; const k = b.dataset.do;
        if (k === "accept") { const f = await ask({ title: "Accept করবেন?", message: money(d.price) + " ক্রেতার ব্যালেন্স থেকে আটকানো হবে। বিক্রেতার সাড়ার সময় " + hours + " ঘণ্টা। আগে বিক্রেতাকে ফোন করুন।", ok: "Accept", fields: [] }); if (f) act(() => acceptDeal(ctx, d, hours, deals), "টাকা আটকানো হয়েছে"); }
        else if (k === "cancel") { const f = await ask({ title: "অনুরোধ বাতিল", ok: "বাতিল করুন", danger: true, fields: [{ id: "why", label: "কারণ", required: true }] }); if (f) act(() => cancelRequest(ctx, d, f.why)); }
        else if (k === "deliver") { const f = await ask({ title: "ডেলিভারি তথ্য", message: "বিক্রেতার কাছ থেকে নেওয়া আইডির তথ্য লিখুন। শুধু ক্রেতা, বিক্রেতা ও স্টাফ চ্যাটে দেখবে।", ok: "পাঠান", fields: [{ id: "info", label: "আইডির তথ্য (ইমেইল/পাসওয়ার্ড/কোড ইত্যাদি)", type: "textarea", required: true }] }); if (f) act(() => deliverDeal(ctx, d, f.info), "ডেলিভারি পাঠানো হয়েছে"); }
        else if (k === "release") { const f = await ask({ title: "Release করবেন?", message: "বিক্রেতা পাবে " + money(d.price - Math.round(d.price * pct / 100)) + " (কমিশন " + pct + "%)। আইডি Sold হবে।", ok: "Release", fields: [] }); if (f) act(() => releaseDeal(ctx, d, pct), "টাকা ছাড়া হয়েছে"); }
        else if (k === "refund") { const f = await ask({ title: "রিফান্ড", message: money(d.price) + " ক্রেতাকে ফেরত যাবে, আইডি আবার Available হবে।", ok: "রিফান্ড", danger: true, fields: [{ id: "why", label: "কারণ (চ্যাটে দেখাবে)", required: true }] }); if (f) act(() => refundDeal(ctx, d, f.why), "রিফান্ড হয়েছে"); }
      };
    }
    function thread() {
      const th = $$("#th"); if (!th) return;
      const near = th.scrollHeight - th.scrollTop - th.clientHeight < 80;
      th.innerHTML = msgs.length ? msgs.map(x => {
        if (x.type === "system") return `<div class="msgb sys">${esc(x.text)}</div>`;
        const rl = { buyer: "ক্রেতা", seller: "বিক্রেতা", staff: "স্টাফ" }[x.role] || x.role;
        const img = typeof x.image === "string" && x.image.startsWith("https://") ? `<img src="${esc(x.image)}" data-zoom="${esc(x.image)}" alt="">` : "";
        return `<div class="msgb ${x.type === "delivery" ? "delivery" : esc(x.role)}"><small>${esc(x.name)} · ${esc(rl)} · ${fmtDate(x.at)}</small>${x.type === "delivery" ? "🔐 " : ""}${esc(x.text)}${img}</div>`;
      }).join("") : '<div class="empty">কোনো মেসেজ নেই</div>';
      if (near) th.scrollTop = th.scrollHeight;
      th.querySelectorAll("[data-zoom]").forEach(i => i.onclick = () => lightbox(i.dataset.zoom));
    }
    $$("#qk").innerHTML = ["বিক্রেতাকে ফোন করা হচ্ছে", "আইডি যাচাই চলছে, একটু অপেক্ষা করুন", "ডেলিভারি দেওয়া হয়েছে, গেমে ঢুকে যাচাই করুন"].map(x => `<button class="btn sm" type="button">${esc(x)}</button>`).join("");
    $$("#qk").onclick = e => { const b = e.target.closest("button"); if (b) { $$("#rp").value = b.textContent; $$("#rp").focus(); } };
    $$("#sn").onclick = async () => { const t = $$("#rp").value.trim(); if (!t) return; try { await postMessage(ctx, id, t); $$("#rp").value = ""; } catch (e) { toast("হয়নি: " + (e.code || e.message), true); } };
    top(); thread();
    offs.push(onValue(ref(db, "deals/" + id), s => { d = s.val() ? { ...s.val(), id } : null; top(); }));
    offs.push(onValue(ref(db, "deal_chats/" + id + "/messages"), s => { msgs = Object.values(s.val() || {}).sort((a, b) => num(a.at) - num(b.at)); thread(); }, () => {}));
    if (d) {
      get(ref(db, "listing_private/" + d.listingId)).then(s => { phone = s.val() && s.val().phone || null; top(); }).catch(() => {});
      get(ref(db, "users/" + d.buyerId + "/balance")).then(s => { bal = s.val() || 0; top(); }).catch(() => {});
    }
    const iv = setInterval(() => d && top(), 30000); offs.push(() => clearInterval(iv));
  }

  $("#tf").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { tab = b.dataset.f; document.querySelectorAll("#tf .btn").forEach(x => x.classList.toggle("on", x === b)); render(); } };
  $("#q").oninput = e => { q = e.target.value.trim(); render(); };
  el.addEventListener("click", e => { const r = e.target.closest(".item[data-id]"); if (r) openDeal(r.dataset.id); });
  const off = onValue(ref(db, "deals"), s => { deals = Object.entries(s.val() || {}).map(([id, v]) => ({ ...v, id })); render(); },
    e => { $("#l").innerHTML = '<div class="empty">পড়া যায়নি: ' + esc(e.code || e.message) + "</div>"; });
  const iv = setInterval(render, 60000);
  return () => { off(); clearInterval(iv); };
}
