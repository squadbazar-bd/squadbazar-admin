import { db, ref, update, onValue } from "./fb.js";
import { $, esc, toast, ask } from "./ui.js";

const R = { admin: "অ্যাডমিন", moderator: "মডারেটর", support: "সাপোর্ট" };
export async function mount(el, ctx) {
  let staff = {}, users = {};
  el.innerHTML = `<h1>স্টাফ</h1>
    <div class="card"><h2>ভূমিকা ও অনুমতি</h2>
      <table><tr><th></th><th>অ্যাডমিন</th><th>মডারেটর</th><th>সাপোর্ট</th></tr>
      <tr><td>লিস্টিং অনুমোদন/এডিট</td><td>✓</td><td>✓</td><td>—</td></tr>
      <tr><td>ইউজার ব্যান</td><td>✓</td><td>✓</td><td>—</td></tr>
      <tr><td>ইউজার দেখা</td><td>✓</td><td>✓</td><td>✓</td></tr>
      <tr><td>সাপোর্ট টিকিট</td><td>✓</td><td>✓</td><td>✓</td></tr>
      <tr><td>ডিপোজিট/উইথড্র, ব্যালেন্স</td><td>✓</td><td>—</td><td>—</td></tr>
      <tr><td>কনটেন্ট, সেটিংস, imgbb, স্টাফ, লগ</td><td>✓</td><td>—</td><td>—</td></tr></table>
      <p class="meta" style="margin-top:8px">এই অনুমতিগুলো Firebase Rules দিয়ে সার্ভারেও বাধ্য করা আছে, শুধু বাটন লুকানো নয়।</p></div>
    <div class="sep"></div>
    <div class="bar"><h2 style="margin:0">স্টাফ তালিকা</h2><span class="sp"></span><button class="btn primary" id="ad">+ স্টাফ যোগ</button></div><div class="list" id="l"></div>`;
  function render() {
    const rows = Object.entries(staff);
    $("#l").innerHTML = rows.map(([uid, role]) => { const u = users[uid] || {}; return `<div class="item" data-id="${esc(uid)}" style="align-items:center">
      <div class="grow"><h3>${esc(u.name || "অজানা")} <span class="role ${esc(role)}">${esc(R[role] || role)}</span> ${uid === ctx.uid ? '<span class="chip">আপনি</span>' : ""}</h3><div class="meta">${esc(u.email || uid)}</div></div>
      ${uid === ctx.uid ? "" : `<div class="acts" style="margin:0"><button class="btn sm" data-a="role">ভূমিকা বদলান</button><button class="btn sm danger" data-a="rm">সরান</button></div>`}</div>`; }).join("") || '<div class="empty">কেউ নেই</div>';
  }
  async function setRole(uid, role, action) {
    const up = {}; up["admins/" + uid] = role; ctx.addLog(up, action, (users[uid] ? users[uid].email : uid) + " → " + (role || "removed"));
    try { await update(ref(db), up); toast("হয়েছে"); } catch (e) { toast("হয়নি: " + (e.code || e.message), true); }
  }
  $("#ad").onclick = async () => {
    const f = await ask({ title: "স্টাফ যোগ", message: "ওই ব্যক্তিকে আগে একবার সাইটে Google লগইন করতে হবে, না হলে ইমেইল খুঁজে পাওয়া যাবে না।", fields: [
      { id: "email", label: "ইমেইল", type: "email", required: true },
      { id: "role", label: "ভূমিকা", type: "select", value: "support", options: [{ v: "support", l: "সাপোর্ট" }, { v: "moderator", l: "মডারেটর" }, { v: "admin", l: "অ্যাডমিন (সব অনুমতি)" }] }] });
    if (!f) return;
    const hit = Object.entries(users).find(([, u]) => (u.email || "").toLowerCase() === f.email.toLowerCase());
    if (!hit) return toast("এই ইমেইলে কোনো ইউজার নেই। আগে সাইটে লগইন করতে বলুন।", true);
    if (f.role === "admin" && !await ask({ title: "সতর্কতা", message: "অ্যাডমিন টাকা ও ব্যালেন্স সহ সবকিছু নিয়ন্ত্রণ করতে পারে। নিশ্চিত?", ok: "হ্যাঁ, অ্যাডমিন করুন", danger: true, fields: [] })) return;
    setRole(hit[0], f.role, "staff_add");
  };
  el.addEventListener("click", async e => {
    const a = e.target.closest("[data-a]"); if (!a) return;
    const uid = a.closest("[data-id]").dataset.id;
    if (a.dataset.a === "rm") { if (await ask({ title: "স্টাফ থেকে সরাবেন?", message: (users[uid] && users[uid].email) || uid, ok: "সরান", danger: true, fields: [] })) setRole(uid, null, "staff_remove"); }
    else {
      const f = await ask({ title: "ভূমিকা বদলান", fields: [{ id: "role", label: "নতুন ভূমিকা", type: "select", value: staff[uid], options: [{ v: "support", l: "সাপোর্ট" }, { v: "moderator", l: "মডারেটর" }, { v: "admin", l: "অ্যাডমিন" }] }] });
      if (f && f.role !== staff[uid]) setRole(uid, f.role, "staff_role");
    }
  });
  const o1 = onValue(ref(db, "admins"), s => { staff = s.val() || {}; render(); });
  const o2 = onValue(ref(db, "users"), s => { users = s.val() || {}; render(); }, () => {});
  return () => { o1(); o2(); };
}
