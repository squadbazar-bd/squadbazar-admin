import { db, ref, update, push, onValue } from "./fb.js";
import { $, esc, num, money, fmtDate, toast, ask } from "./ui.js";

export async function mount(el, ctx) {
  let ads = [], listings = {}, users = {}, tab = "on";
  el.innerHTML = `<h1>প্রচার (Ads)</h1><div class="grid" id="st" style="margin-bottom:14px"></div>
    <div class="bar"><div class="tabs" id="tf" style="margin:0"><button class="btn on" data-f="on">চলমান</button><button class="btn" data-f="off">শেষ / বন্ধ</button></div><span class="sp"></span><button class="btn primary" id="free">+ ফ্রি প্রচার দিন</button></div>
    <div class="list" id="l"></div>`;
  const active = a => !a.stopped && a.endAt > Date.now();
  const title = a => (listings[a.listingId] && listings[a.listingId].title) || "(মুছে ফেলা আইডি)";
  const seller = a => users[a.sellerId] ? (users[a.sellerId].name || users[a.sellerId].email) : a.sellerId;
  function render() {
    const paid = ads.filter(a => a.by === "seller"), day = 86400000, now = Date.now();
    const sum = f => paid.filter(f).reduce((s, a) => s + num(a.cost), 0);
    $("#st").innerHTML = `<div class="stat"><span>চলমান প্রচার</span><b>${ads.filter(active).length}</b></div>
      <div class="stat"><span>আজকের আয়</span><b>${money(sum(a => now - num(a.startAt) < day))}</b></div>
      <div class="stat"><span>গত ৩০ দিনের আয়</span><b>${money(sum(a => now - num(a.startAt) < 30 * day))}</b></div>
      <div class="stat"><span>মোট আয়</span><b>${money(sum(() => true))}</b></div>`;
    const rows = ads.filter(a => tab === "on" ? active(a) : !active(a)).sort((x, y) => num(y.startAt) - num(x.startAt));
    $("#l").innerHTML = rows.length ? rows.map((a, i) => `<div class="item" data-id="${esc(a.id)}" style="align-items:center;animation-delay:${Math.min(i, 8) * 30}ms"><div class="grow">
      <h3>${esc(title(a))} <span class="chip ${a.type === "urgent" ? "r" : ""}">${a.type === "urgent" ? "🔥 Urgent" : "Boost"}</span> ${a.stopped ? '<span class="pill banned">বন্ধ</span>' : ""} ${a.by === "admin" ? '<span class="chip g">ফ্রি</span>' : ""}</h3>
      <div class="meta">${esc(seller(a))} · ${num(a.days)} দিন · ${money(a.cost)} · শেষ ${fmtDate(a.endAt)}</div></div>
      <div class="acts" style="margin:0"><button class="btn sm" data-a="ext">+ দিন</button><button class="btn sm ${a.stopped ? "good" : "danger"}" data-a="stop">${a.stopped ? "আবার চালু" : "বন্ধ করুন"}</button></div></div>`).join("") : '<div class="empty">কিছু নেই</div>';
  }
  async function save(up, action, details, ok) {
    ctx.addLog(up, action, details);
    try { await update(ref(db), up); toast(ok || "হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  el.addEventListener("click", async e => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = ads.find(x => x.id === b.closest("[data-id]").dataset.id); if (!a) return;
    if (b.dataset.a === "stop") {
      const up = {}; up["ads/" + a.id + "/stopped"] = !a.stopped; save(up, a.stopped ? "ad_resume" : "ad_stop", title(a) + " [" + a.id + "]");
    } else {
      const f = await ask({ title: "প্রচারের মেয়াদ বাড়ান", message: title(a) + " · এখন " + num(a.days) + " দিন", fields: [{ id: "d", label: "কত দিন যোগ হবে", type: "number", value: 1, required: true }] });
      if (!f) return;
      const nd = num(a.days) + Math.round(f.d);
      if (!(f.d >= 1) || nd > 90) return toast("মোট ৯০ দিনের বেশি হতে পারে না", true);
      const up = {}; up["ads/" + a.id + "/days"] = nd; up["ads/" + a.id + "/endAt"] = num(a.startAt) + nd * 86400000;
      save(up, "ad_extend", title(a) + " +" + f.d + "d [" + a.id + "]", "মেয়াদ বাড়ানো হয়েছে");
    }
  });
  $("#tf").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { tab = b.dataset.f; document.querySelectorAll("#tf .btn").forEach(x => x.classList.toggle("on", x === b)); render(); } };
  $("#free").onclick = async () => {
    const opts = Object.entries(listings).filter(([, l]) => l.status === "approved").map(([id, l]) => ({ v: id, l: (l.title || id) + " — ৳" + num(l.price) }));
    if (!opts.length) return toast("Available কোনো লিস্টিং নেই", true);
    const f = await ask({ title: "ফ্রি প্রচার", message: "বিক্রেতার ব্যালেন্স থেকে কিছু কাটা হবে না।", fields: [
      { id: "lid", label: "লিস্টিং", type: "select", options: opts, value: opts[0].v },
      { id: "type", label: "ধরন", type: "select", value: "boost", options: [{ v: "boost", l: "Boost (Sponsored)" }, { v: "urgent", l: "Urgent (জরুরি বিক্রি)" }] },
      { id: "days", label: "কত দিন", type: "number", value: 3, required: true }] });
    if (!f) return;
    if (!(f.days >= 1 && f.days <= 90)) return toast("১ থেকে ৯০ দিন দিন", true);
    const id = push(ref(db, "ads")).key, st = Date.now(), up = {};
    up["ads/" + id] = { listingId: f.lid, sellerId: listings[f.lid].sellerId || "admin", type: f.type, days: Math.round(f.days), cost: 0, startAt: st, endAt: st + Math.round(f.days) * 86400000, by: "admin" };
    save(up, "ad_free", (listings[f.lid].title || f.lid) + " " + f.type + " " + f.days + "d", "প্রচার শুরু হয়েছে");
  };
  const o1 = onValue(ref(db, "ads"), s => { ads = Object.entries(s.val() || {}).map(([id, v]) => ({ ...v, id })); render(); }, e => { $("#l").innerHTML = '<div class="empty">পড়া যায়নি: ' + esc(e.code || e.message) + "</div>"; });
  const o2 = onValue(ref(db, "listings"), s => { listings = s.val() || {}; render(); });
  const o3 = onValue(ref(db, "users"), s => { users = s.val() || {}; render(); }, () => {});
  return () => { o1(); o2(); o3(); };
}
