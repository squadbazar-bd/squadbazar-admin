import { db, ref, onValue, query, limitToLast } from "./fb.js";
import { $, esc, num, fmtDate } from "./ui.js";

export async function mount(el) {
  el.innerHTML = '<h1>অ্যাকশন লগ <span class="meta">(সর্বশেষ ১৫০টি)</span></h1><div class="card" style="overflow:auto"><table id="t"></table></div>';
  return onValue(query(ref(db, "logs"), limitToLast(150)), s => {
    const a = Object.values(s.val() || {}).sort((x, y) => num(y.at) - num(x.at));
    $("#t").innerHTML = a.length ? '<tr><th>সময়</th><th>কে</th><th>কাজ</th><th>বিবরণ</th></tr>' + a.map(l => `<tr><td>${fmtDate(l.at)}</td><td>${esc(l.byName)} <span class="role ${esc(l.role)}">${esc(l.role)}</span></td><td>${esc(l.action)}</td><td class="meta">${esc(l.details || "")}</td></tr>`).join("") : '<tr><td class="empty">কোনো লগ নেই</td></tr>';
  }, e => { $("#t").innerHTML = '<tr><td class="empty">পড়া যায়নি: ' + esc(e.code || e.message) + "</td></tr>"; });
}
