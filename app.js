import { auth, db, ref, get, push, serverTimestamp, login, logout, watch } from "./fb.js";
import { $, esc, toast, copy } from "./ui.js";

const ROLES = { admin: "অ্যাডমিন", moderator: "মডারেটর", support: "সাপোর্ট" };
const NAV = [
  ["dashboard", "ড্যাশবোর্ড", ["admin", "moderator", "support"]],
  ["listings", "লিস্টিং", ["admin", "moderator"]],
  ["deals", "ডিল", ["admin", "moderator"]],
  ["users", "ইউজার", ["admin", "moderator", "support"]],
  ["money", "টাকা", ["admin"]],
  ["support", "সাপোর্ট", ["admin", "moderator", "support"]],
  ["content", "কনটেন্ট", ["admin"]],
  ["settings", "সেটিংস", ["admin"]],
  ["staff", "স্টাফ", ["admin"]],
  ["logs", "লগ", ["admin"]]
];
const root = $("#root");
let ctx = null, cleanup = null;

(() => { let t = null; try { t = localStorage.getItem("theme"); } catch (e) {}
  document.documentElement.dataset.theme = t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); })();
function toggleTheme() {
  const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = n; try { localStorage.setItem("theme", n); } catch (e) {}
}
const logos = '<img class="lg-light" src="logo-h.png" alt="SquadBazar"><img class="lg-dark" src="logo-h-dark.png" alt="SquadBazar">';

function screenLogin() {
  root.innerHTML = `<div class="card center">${logos}<h1>Admin Panel</h1><p class="msg">স্টাফ অ্যাকাউন্ট দিয়ে লগইন করুন।</p>
    <button class="btn primary" id="gl" style="width:100%;padding:12px">Google দিয়ে লগইন</button><div class="ferr" id="le"></div></div>`;
  $("#gl").onclick = async () => { try { await login(); } catch (e) { $("#le").textContent = e.code || e.message; } };
}
function screenDenied(u) {
  root.innerHTML = `<div class="card center">${logos}<h1>অনুমতি নেই</h1>
    <p class="msg">এই অ্যাকাউন্ট স্টাফ তালিকায় নেই। অ্যাডমিনকে নিচের UID পাঠান।</p>
    <div class="uid" id="uid">${esc(u.uid)}</div>
    <div style="display:flex;gap:8px;justify-content:center"><button class="btn" id="cp">UID কপি</button><button class="btn" id="lo">লগআউট</button></div></div>`;
  $("#cp").onclick = () => copy(u.uid); $("#lo").onclick = () => logout();
}

function startApp(u, role) {
  const name = u.displayName || (u.email || "").split("@")[0] || "Staff";
  ctx = {
    uid: u.uid, name, role, email: u.email,
    addLog(updates, action, details = "") {
      const k = push(ref(db, "logs")).key;
      updates["logs/" + k] = { by: u.uid, byName: name.slice(0, 60), role, action, details: String(details).slice(0, 300), at: serverTimestamp() };
    }
  };
  const items = NAV.filter(n => n[2].includes(role));
  root.innerHTML = `<header class="hdr">${logos}<span class="sp"></span>
      <div class="me">${esc(name)}<br><span class="role ${role}">${ROLES[role]}</span></div>
      <button class="btn sm" id="th">থিম</button><button class="btn sm" id="lo">লগআউট</button></header>
    <nav class="nav" id="nav">${items.map(n => `<a href="#${n[0]}" data-p="${n[0]}">${n[1]}</a>`).join("")}</nav>
    <main id="main"></main>`;
  $("#th").onclick = toggleTheme; $("#lo").onclick = () => logout();
  const route = async () => {
    let id = (location.hash || "#dashboard").slice(1);
    if (!items.some(n => n[0] === id)) id = "dashboard";
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.p === id));
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    const main = $("#main"); main.innerHTML = '<div class="empty">লোড হচ্ছে...</div>';
    try {
      const mod = await import("./page_" + id + ".js");
      main.innerHTML = "";
      const box = document.createElement("div");   // protita page nijer notun box pay, tai purono click handler jome na
      main.appendChild(box);
      cleanup = await mod.mount(box, ctx);
    } catch (e) { console.error(e); main.innerHTML = `<div class="empty">পেজ লোড হয়নি: ${esc(e.message)}</div>`; }
  };
  window.onhashchange = route; route();
  import("./sweeper.js").then(m => m.startSweeper(ctx)).catch(() => {});
}

watch(async u => {
  if (!u) { screenLogin(); return; }
  let role = null;
  try { role = (await get(ref(db, "admins/" + u.uid))).val(); } catch (e) {}
  if (!ROLES[role]) { screenDenied(u); return; }
  startApp(u, role);
});
