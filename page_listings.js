import { db, ref, get, update, onValue, serverTimestamp } from "./fb.js";
import { $, esc, num, money, safeImg, toArr, fmtDate, ageText, toast, copy, ask, modal, lightbox } from "./ui.js";

export async function mount(el, ctx) {
  let tab = "pending", pend = [], live = [], sel = new Set(), q = "", stf = "all";
  el.innerHTML = `<h1>লিস্টিং</h1>
    <div class="tabs" id="tb"><button class="btn on" data-t="pending">অপেক্ষমান <b id="pc"></b></button><button class="btn" data-t="live">চালু লিস্টিং</button></div>
    <div id="body"></div>`;
  const body = $("#body");

  const disc = l => l.discountPrice > 0 && l.discountPrice < l.price;
  const stPill = s => `<span class="pill ${esc(s)}">${esc({ pending: "Pending", approved: "Available", reserved: "Reserved", sold: "Sold", rejected: "Rejected" }[s] || s)}</span>`;
  const chips = l => `<div class="chips"><span class="chip">${num(l.totalPlayers)} Players</span><span class="chip v">${num(l.epicPlayers)} Epic</span><span class="chip g">${num(l.totalManagers)} Mgr</span><span class="chip a">Std ${num(l.standardPlayers)}</span><span class="chip">Str ${num(l.collectiveStrength)}</span><span class="chip">${esc(ageText(l.idAgeMonths))}</span></div>`;

  const uk = x => String(x.konamiUsername || "").trim().toLowerCase();
  const dupCount = p => uk(p) ? [...pend, ...live].filter(x => x.id !== p.id && uk(x) === uk(p)).length : 0;
  /* ---------- pending ---------- */
  function renderPending() {
    $("#pc").textContent = pend.length ? "(" + pend.length + ")" : "";
    if (tab !== "pending") return;
    if (!pend.length) { body.innerHTML = '<div class="empty">কোনো অপেক্ষমান লিস্টিং নেই</div>'; return; }
    body.innerHTML = `<div class="list">${pend.map((p, i) => `<div class="item" style="animation-delay:${Math.min(i, 8) * 40}ms"><div class="grow">
      <h3>${esc(p.title)} — ${money(p.price)}</h3>
      <div class="meta">বিক্রেতা: ${esc(p.sellerName)} · ${fmtDate(p.createdAt)} · ইউজারনেম: <b>${esc(p.konamiUsername || p.maskedUsername || "-")}</b></div>
      ${dupCount(p) ? `<div class="chips"><span class="chip r">এই ইউজারনেমে আরও ${dupCount(p)}টি লিস্টিং আছে</span></div>` : ""}
      ${chips(p)}
      <div class="thumbs">${toArr(p.images).map(safeImg).filter(Boolean).map(u => `<img src="${esc(u)}" data-zoom="${esc(u)}" alt="" loading="lazy">`).join("")}</div>
      ${p.description ? `<div class="meta" style="white-space:pre-wrap">${esc(p.description)}</div>` : ""}
      <div class="acts" data-id="${esc(p.id)}"><button class="btn sm" data-a="priv">বিক্রেতার ফোন</button><button class="btn sm good" data-a="approve">Approve</button><button class="btn sm danger" data-a="reject">Reject</button></div>
    </div></div>`).join("")}</div>`;
  }
  async function showPrivate(p) {
    try {
      const v = (await get(ref(db, "listing_private/" + p.id))).val();
      if (!v) return toast("তথ্য পাওয়া যায়নি", true);
      const ph = String(v.phone || "").replace(/\D/g, ""), intl = ph.startsWith("88") ? ph : "88" + ph;
      modal("বিক্রেতার ফোন", `<dl class="kv"><dt>ইউজারনেম</dt><dd>${esc(p.konamiUsername || p.maskedUsername || "-")}</dd></dl>
        <div class="paybox2"><div class="meta">ফোন নম্বর</div><div class="phone">${esc(v.phone || v.konamiId || "-")}</div>
        <div class="acts"><a class="btn sm good" href="tel:${esc(v.phone || "")}">📞 কল</a><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${esc(intl)}">WhatsApp</a></div></div>
        <p class="msg" style="margin-top:12px">স্ক্রিনশটের সাথে ইউজারনেম মিলিয়ে দেখুন। এই নম্বর কাউকে দেবেন না।</p>`,
        [{ label: "নম্বর কপি", onClick: () => copy(v.phone || "") }, { label: "বন্ধ", cls: "primary", onClick: c => c() }]);
    } catch (e) { toast("পড়া যায়নি: " + (e.code || e.message), true); }
  }
  async function approve(p) {
    const f = await ask({ title: "অনুমোদন: " + p.title, ok: "Approve", fields: [
      { id: "disc", label: "ছাড়ের দাম (ঐচ্ছিক, মূল দাম " + p.price + ")", type: "number", value: "" },
      { id: "feat", label: "Featured করুন", type: "checkbox" },
      { id: "ver", label: "Verified seller ব্যাজ দিন", type: "checkbox" }] });
    if (!f) return;
    if (f.disc !== null && !(f.disc > 0 && f.disc < p.price)) return toast("ছাড়ের দাম মূল দামের কম হতে হবে", true);
    const { id, ...rest } = p;
    const l = { ...rest, status: "approved", featured: !!f.feat, sellerVerified: !!f.ver, approvedAt: serverTimestamp(), approvedBy: ctx.uid };
    if (f.disc) l.discountPrice = f.disc;
    const up = {};
    up["listings/" + id] = l; up["pending_listings/" + id] = null; up["user_listings/" + p.sellerId + "/" + id + "/status"] = "approved";
    ctx.addLog(up, "listing_approve", p.title + " [" + id + "]");
    try { await update(ref(db), up); toast("অনুমোদিত হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  async function reject(p) {
    const f = await ask({ title: "বাতিল: " + p.title, ok: "Reject", danger: true, fields: [{ id: "why", label: "কারণ (বিক্রেতা দেখবে)", required: true, placeholder: "যেমন: স্ক্রিনশট অস্পষ্ট" }] });
    if (!f) return;
    const up = {};
    up["pending_listings/" + p.id] = null; up["listing_private/" + p.id] = null;
    up["user_listings/" + p.sellerId + "/" + p.id + "/status"] = "rejected";
    up["user_listings/" + p.sellerId + "/" + p.id + "/reason"] = f.why.slice(0, 200);
    ctx.addLog(up, "listing_reject", p.title + " [" + p.id + "]: " + f.why);
    try { await update(ref(db), up); toast("বাতিল করা হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }

  /* ---------- live ---------- */
  function liveFiltered() {
    let a = live.slice().sort((x, y) => num(y.createdAt) - num(x.createdAt));
    if (stf !== "all") a = a.filter(l => l.status === stf);
    if (q) a = a.filter(l => (l.title || "").toLowerCase().includes(q.toLowerCase()));
    return a;
  }
  function renderLiveList() {
    const a = liveFiltered(), box = $("#ll"); if (!box) return;
    $("#selc").textContent = sel.size;
    document.querySelectorAll("[data-bulk]").forEach(b => b.disabled = !sel.size);
    box.innerHTML = a.length ? a.map((l, i) => `<label class="item" style="animation-delay:${Math.min(i, 8) * 30}ms;align-items:center"><input type="checkbox" style="width:18px;height:18px" data-sel="${esc(l.id)}" ${sel.has(l.id) ? "checked" : ""}>
      <div class="grow"><h3>${esc(l.title)} ${stPill(l.status)} ${l.featured ? '<span class="chip v">Featured</span>' : ""} ${l.sellerVerified ? '<span class="chip g">Verified</span>' : ""}</h3>
      <div class="meta">${disc(l) ? `<s>${money(l.price)}</s> <b>${money(l.discountPrice)}</b>` : `<b>${money(l.price)}</b>`} · ${esc(l.sellerName || "-")} · ${num(l.epicPlayers)} Epic · Str ${num(l.collectiveStrength)}</div></div>
      <div class="acts" style="margin:0" data-id="${esc(l.id)}"><button type="button" class="btn sm" data-a="edit">এডিট</button><button type="button" class="btn sm danger" data-a="del">মুছুন</button></div></label>`).join("")
      : '<div class="empty">কিছু পাওয়া যায়নি</div>';
  }
  function renderLive() {
    body.innerHTML = `<div class="bar"><input id="lq" placeholder="টাইটেল খুঁজুন" value="${esc(q)}"><select id="lf"><option value="all">সব অবস্থা</option><option value="approved">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select>
      <span class="sp"></span><span class="meta">নির্বাচিত: <b id="selc">0</b></span>
      <button class="btn sm" data-bulk="disc">ছাড় দিন %</button><button class="btn sm" data-bulk="nodisc">ছাড় সরান</button><button class="btn sm" data-bulk="feat">Featured</button><button class="btn sm" data-bulk="unfeat">Featured সরান</button></div>
      <div class="list" id="ll"></div>`;
    $("#lf").value = stf;
    $("#lq").oninput = e => { q = e.target.value.trim(); renderLiveList(); };
    $("#lf").onchange = e => { stf = e.target.value; renderLiveList(); };
    renderLiveList();
  }
  async function editLive(l) {
    const f = await ask({ title: "এডিট: " + l.title, fields: [
      { id: "title", label: "টাইটেল", value: l.title, required: true },
      { id: "price", label: "দাম", type: "number", value: l.price, required: true },
      { id: "disc", label: "ছাড়ের দাম (ফাঁকা = ছাড় নেই)", type: "number", value: l.discountPrice || "" },
      { id: "status", label: "অবস্থা", type: "select", value: l.status, options: [{ v: "approved", l: "Available" }, { v: "reserved", l: "Reserved" }, { v: "sold", l: "Sold" }] },
      { id: "feat", label: "Featured", type: "checkbox", value: !!l.featured },
      { id: "ver", label: "Verified seller", type: "checkbox", value: !!l.sellerVerified }] });
    if (!f) return;
    if (f.title.length < 3 || f.price < 50) return toast("টাইটেল (৩+ অক্ষর) বা দাম (৫০+) ঠিক নেই", true);
    const b = "listings/" + l.id + "/", up = {};
    up[b + "title"] = f.title.slice(0, 80); up[b + "price"] = f.price;
    up[b + "discountPrice"] = (f.disc && f.disc < f.price) ? f.disc : null;
    up[b + "status"] = f.status; up[b + "featured"] = f.feat; up[b + "sellerVerified"] = f.ver;
    if (l.sellerId) { const u = "user_listings/" + l.sellerId + "/" + l.id + "/"; up[u + "status"] = f.status; up[u + "price"] = f.price; up[u + "title"] = f.title.slice(0, 80); }
    ctx.addLog(up, "listing_edit", f.title + " [" + l.id + "]");
    try { await update(ref(db), up); toast("সেভ হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  async function delLive(l) {
    const f = await ask({ title: "মুছে ফেলবেন?", message: l.title, ok: "মুছুন", danger: true, fields: [] });
    if (!f) return;
    const up = {}; up["listings/" + l.id] = null;
    if (l.sellerId) { up["user_listings/" + l.sellerId + "/" + l.id + "/status"] = "rejected"; up["user_listings/" + l.sellerId + "/" + l.id + "/reason"] = "অ্যাডমিন সরিয়েছেন"; }
    ctx.addLog(up, "listing_delete", l.title + " [" + l.id + "]");
    try { await update(ref(db), up); toast("মুছে ফেলা হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  async function bulk(kind) {
    const ids = [...sel]; if (!ids.length) return;
    const up = {};
    if (kind === "disc") {
      const f = await ask({ title: ids.length + "টি আইডিতে ছাড়", fields: [{ id: "pct", label: "ছাড় (১ থেকে ৯০ %)", type: "number", required: true }] });
      if (!f) return; if (!(f.pct >= 1 && f.pct <= 90)) return toast("১ থেকে ৯০ এর মধ্যে দিন", true);
      ids.forEach(id => { const l = live.find(x => x.id === id); if (l) up["listings/" + id + "/discountPrice"] = Math.round(l.price * (100 - f.pct) / 100); });
      ctx.addLog(up, "bulk_discount", ids.length + " listings, " + f.pct + "%");
    } else if (kind === "nodisc") {
      ids.forEach(id => up["listings/" + id + "/discountPrice"] = null); ctx.addLog(up, "bulk_discount_clear", ids.length + " listings");
    } else {
      ids.forEach(id => up["listings/" + id + "/featured"] = kind === "feat"); ctx.addLog(up, "bulk_featured", kind + " " + ids.length);
    }
    try { await update(ref(db), up); sel.clear(); toast("হয়েছে"); renderLiveList(); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }

  /* ---------- events ---------- */
  el.addEventListener("click", e => {
    const t = e.target.closest("[data-t]"); if (t) { tab = t.dataset.t; document.querySelectorAll("#tb .btn").forEach(b => b.classList.toggle("on", b === t)); tab === "pending" ? renderPending() : renderLive(); return; }
    const z = e.target.closest("[data-zoom]"); if (z) return lightbox(z.dataset.zoom);
    const bk = e.target.closest("[data-bulk]"); if (bk) return bulk(bk.dataset.bulk);
    const a = e.target.closest("[data-a]"); if (!a) return;
    e.preventDefault();
    const id = a.closest("[data-id]").dataset.id;
    if (tab === "pending") { const p = pend.find(x => x.id === id); if (!p) return; ({ priv: showPrivate, approve, reject })[a.dataset.a](p); }
    else { const l = live.find(x => x.id === id); if (!l) return; ({ edit: editLive, del: delLive })[a.dataset.a](l); }
  });
  el.addEventListener("change", e => {
    const s = e.target.closest("[data-sel]"); if (!s) return;
    s.checked ? sel.add(s.dataset.sel) : sel.delete(s.dataset.sel); renderLiveList();
  });

  const o1 = onValue(ref(db, "pending_listings"), s => {
    pend = Object.entries(s.val() || {}).map(([id, v]) => ({ ...v, id })).sort((a, b) => num(a.createdAt) - num(b.createdAt)); renderPending();
  }, e => { body.innerHTML = '<div class="empty">পড়া যায়নি: ' + esc(e.code || e.message) + "</div>"; });
  const o2 = onValue(ref(db, "listings"), s => {
    live = Object.entries(s.val() || {}).map(([id, v]) => ({ ...v, id })); sel = new Set([...sel].filter(id => live.some(l => l.id === id)));
    if (tab === "live") renderLiveList(); else renderPending();
  });
  return () => { o1(); o2(); };
}
