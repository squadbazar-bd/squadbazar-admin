import { db, ref, set, update, push, onValue } from "./fb.js";
import { $, esc, num, safeImg, toast, ask } from "./ui.js";
import { uploadImage, shrink } from "./imgbb.js";

export async function mount(el, ctx) {
  let banners = [];
  el.innerHTML = `<h1>কনটেন্ট</h1>
    <div class="card"><h2>নোটিশ বার (হোম পেজ)</h2><div class="fld"><textarea id="nt" rows="2" placeholder="ফাঁকা রাখলে ডিফল্ট লেখা দেখাবে"></textarea></div><button class="btn primary" id="ns">নোটিশ সেভ</button></div>
    <div class="sep"></div>
    <div class="bar"><h2 style="margin:0">স্লাইডার ব্যানার</h2><span class="sp"></span><button class="btn primary" id="ab">+ নতুন ব্যানার</button></div><div class="list" id="bl"></div>`;
  function render() {
    $("#bl").innerHTML = banners.length ? banners.map(b => `<div class="item" data-id="${esc(b.id)}"><div class="thumbs" style="margin:0">${safeImg(b.image) ? `<img src="${esc(b.image)}" alt="">` : '<div class="av">B</div>'}</div>
      <div class="grow"><h3>${esc(b.title)}</h3><div class="meta">${esc(b.subtitle || "")} · ক্রম ${num(b.order)}</div>
      <div class="acts"><button class="btn sm" data-a="edit">এডিট</button><button class="btn sm danger" data-a="del">মুছুন</button></div></div></div>`).join("")
      : '<div class="empty">কোনো কাস্টম ব্যানার নেই, ডিফল্ট ব্যানার দেখাচ্ছে</div>';
  }
  $("#ns").onclick = async () => {
    const v = $("#nt").value.trim(), up = {}; up["settings/notice"] = v || null; ctx.addLog(up, "notice_save", v.slice(0, 100));
    try { await update(ref(db), up); toast("সেভ হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  };
  $("#ab").onclick = async () => {
    const f = await ask({ title: "নতুন ব্যানার", fields: [{ id: "title", label: "টাইটেল", required: true }, { id: "sub", label: "সাবটাইটেল" }, { id: "order", label: "ক্রম (ছোট আগে)", type: "number", value: banners.length + 1 }, { id: "img", label: "ছবি (ঐচ্ছিক, ১০:৪ মাপ ভালো)", type: "file" }] });
    if (!f) return;
    try {
      let image = ""; if (f.img) { toast("ছবি আপলোড হচ্ছে..."); image = await uploadImage(await shrink(f.img)); }
      const k = push(ref(db, "banners")).key, up = {};
      up["banners/" + k] = { title: f.title, subtitle: f.sub || "", image, order: f.order || 0 }; ctx.addLog(up, "banner_add", f.title);
      await update(ref(db), up); toast("যোগ হয়েছে");
    } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  };
  el.addEventListener("click", async e => {
    const a = e.target.closest("[data-a]"); if (!a) return;
    const b = banners.find(x => x.id === a.closest("[data-id]").dataset.id); if (!b) return;
    const up = {};
    if (a.dataset.a === "del") {
      if (!await ask({ title: "মুছবেন?", message: b.title, ok: "মুছুন", danger: true, fields: [] })) return;
      up["banners/" + b.id] = null; ctx.addLog(up, "banner_delete", b.title);
    } else {
      const f = await ask({ title: "এডিট", fields: [{ id: "title", label: "টাইটেল", value: b.title, required: true }, { id: "sub", label: "সাবটাইটেল", value: b.subtitle || "" }, { id: "order", label: "ক্রম", type: "number", value: num(b.order) }] });
      if (!f) return;
      up["banners/" + b.id + "/title"] = f.title; up["banners/" + b.id + "/subtitle"] = f.sub; up["banners/" + b.id + "/order"] = f.order || 0; ctx.addLog(up, "banner_edit", f.title);
    }
    try { await update(ref(db), up); toast("হয়েছে"); } catch (err) { toast("হয়নি: " + (err.code || err.message), true); }
  });
  const o1 = onValue(ref(db, "banners"), s => { banners = Object.entries(s.val() || {}).map(([id, v]) => ({ ...v, id })).sort((a, b) => num(a.order) - num(b.order)); render(); });
  let first = true;
  const o2 = onValue(ref(db, "settings/notice"), s => { if (first) { $("#nt").value = typeof s.val() === "string" ? s.val() : ""; first = false; } });
  return () => { o1(); o2(); };
}
