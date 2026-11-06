import { db, ref, onValue, query, orderByChild, equalTo } from "./fb.js";
import { esc, money, num } from "./ui.js";

const count = s => s.exists() ? Object.keys(s.val()).length : 0;
export async function mount(el, ctx) {
  const q = (p, st) => query(ref(db, p), orderByChild("status"), equalTo(st));
  const defs = [
    { id: "pl", label: "অপেক্ষমান লিস্টিং", href: "listings", src: ref(db, "pending_listings"), fn: count, alert: true, roles: ["admin", "moderator"] },
    { id: "lv", label: "চালু লিস্টিং", href: "listings", src: ref(db, "listings"), fn: s => Object.values(s.val() || {}).filter(l => l.status === "approved").length, roles: ["admin", "moderator"] },
    { id: "us", label: "মোট ইউজার", href: "users", src: ref(db, "users"), fn: count, roles: ["admin", "moderator", "support"] },
    { id: "ub", label: "ইউজারদের মোট ব্যালেন্স", href: "users", src: ref(db, "users"), fn: s => money(Object.values(s.val() || {}).reduce((a, u) => a + num(u.balance), 0)), roles: ["admin"] },
    { id: "dr", label: "নতুন ডিল অনুরোধ", href: "deals", src: ref(db, "deals"), fn: s => Object.values(s.val() || {}).filter(x => x.status === "requested").length, alert: true, roles: ["admin", "moderator"] },
    { id: "da", label: "চলমান ডিল", href: "deals", src: ref(db, "deals"), fn: s => Object.values(s.val() || {}).filter(x => ["held", "delivered", "confirmed"].includes(x.status)).length, roles: ["admin", "moderator"] },
    { id: "dd", label: "বিরোধ / রিফান্ড চাওয়া", href: "deals", src: ref(db, "deals"), fn: s => Object.values(s.val() || {}).filter(x => x.status === "disputed" || (x.status === "held" && x.refundRequested)).length, alert: true, roles: ["admin", "moderator"] },
    { id: "dp", label: "Pending ডিপোজিট", href: "money", src: q("deposits", "pending"), fn: count, alert: true, roles: ["admin"] },
    { id: "wd", label: "Pending উইথড্র", href: "money", src: q("withdrawals", "pending"), fn: count, alert: true, roles: ["admin"] },
    { id: "tk", label: "খোলা টিকিট", href: "support", src: q("tickets", "open"), fn: count, alert: true, roles: ["admin", "moderator", "support"] }
  ].filter(d => d.roles.includes(ctx.role));
  el.innerHTML = `<h1>ড্যাশবোর্ড</h1><div class="grid">${defs.map(d => `<a class="stat" href="#${d.href}"><span>${esc(d.label)}</span><b id="s_${d.id}">…</b></a>`).join("")}</div>
    <p class="meta" style="margin-top:14px">আপনি লগইন করেছেন <b>${esc(ctx.name)}</b> হিসেবে। ভূমিকা: ${ctx.role === "admin" ? "অ্যাডমিন (সব অনুমতি)" : ctx.role === "moderator" ? "মডারেটর (লিস্টিং, ইউজার, সাপোর্ট)" : "সাপোর্ট (টিকিট ও ইউজার দেখা)"}</p>`;
  const offs = defs.map(d => onValue(d.src, s => {
    const e = document.getElementById("s_" + d.id); if (!e) return;
    const v = d.fn(s); e.textContent = v;
    if (d.alert) e.closest(".stat").classList.toggle("alert", v > 0);
  }, () => { const e = document.getElementById("s_" + d.id); if (e) e.textContent = "—"; }));
  return () => offs.forEach(o => o && o());
}
