export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const num = v => Number(v) || 0;
export const money = n => "৳ " + num(n).toLocaleString("en-US");
export const safeImg = u => (typeof u === "string" && u.startsWith("https://")) ? u : "";
export const toArr = v => Array.isArray(v) ? v : Object.values(v || {});
export function fmtDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
export function ageText(m) {
  m = num(m); if (!m) return "-";
  return [Math.floor(m / 12) ? Math.floor(m / 12) + " বছর" : "", m % 12 ? (m % 12) + " মাস" : ""].filter(Boolean).join(" ");
}

let tt;
export function toast(m, bad) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = m; el.classList.toggle("bad", !!bad); el.classList.add("show");
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove("show"), bad ? 4200 : 2200);
}
export async function copy(text) {
  try { await navigator.clipboard.writeText(String(text)); toast("কপি হয়েছে"); } catch (e) { toast("কপি করা যায়নি", true); }
}

export function modal(title, bodyHTML, buttons = [], onClose) {
  const ov = document.createElement("div"); ov.className = "ov";
  ov.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><div class="dh"><b>${esc(title)}</b><button class="x" aria-label="বন্ধ">×</button></div><div class="db">${bodyHTML}</div><div class="df"></div></div>`;
  let closed = false;
  const close = () => { if (closed) return; closed = true; ov.remove(); document.removeEventListener("keydown", kd); if (onClose) onClose(); };
  const kd = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", kd);
  ov.addEventListener("mousedown", e => { if (e.target === ov) close(); });
  ov.querySelector(".x").onclick = close;
  const df = ov.querySelector(".df");
  buttons.forEach(b => {
    const el = document.createElement("button"); el.className = "btn " + (b.cls || ""); el.textContent = b.label;
    el.onclick = () => b.onClick(close, el); df.appendChild(el);
  });
  if (!buttons.length) df.remove();
  document.body.appendChild(ov);
  return { ov, close };
}

function fieldHTML(f) {
  const id = "f_" + f.id, v = f.value ?? "";
  const lab = `<label for="${id}">${esc(f.label)}${f.required ? " *" : ""}</label>`;
  if (f.type === "textarea") return `<div class="fld">${lab}<textarea id="${id}" rows="3" placeholder="${esc(f.placeholder || "")}">${esc(v)}</textarea></div>`;
  if (f.type === "select") return `<div class="fld">${lab}<select id="${id}">${f.options.map(o => `<option value="${esc(o.v)}" ${o.v === v ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select></div>`;
  if (f.type === "checkbox") return `<label class="chk"><input type="checkbox" id="${id}" ${v ? "checked" : ""}> <span>${esc(f.label)}</span></label>`;
  if (f.type === "file") return `<div class="fld">${lab}<input type="file" id="${id}" accept="image/*"></div>`;
  return `<div class="fld">${lab}<input id="${id}" type="${f.type || "text"}" value="${esc(v)}" placeholder="${esc(f.placeholder || "")}" ${f.type === "number" ? 'inputmode="decimal" step="any"' : ""}></div>`;
}
/* form dialog: Promise -> {field: value} ba null (batil) */
export function ask({ title, message = "", fields = [], ok = "সেভ", cancel = "বাতিল", danger = false }) {
  return new Promise(res => {
    let done = false;
    const finish = v => { if (!done) { done = true; res(v); } };
    const html = (message ? `<p class="msg">${esc(message)}</p>` : "") + fields.map(fieldHTML).join("") + '<div class="ferr" id="askErr"></div>';
    const m = modal(title, html, [
      { label: cancel, onClick: close => close() },
      { label: ok, cls: danger ? "danger" : "primary", onClick: close => {
        const out = {};
        for (const f of fields) {
          const el = m.ov.querySelector("#f_" + f.id);
          let v;
          if (f.type === "checkbox") v = el.checked;
          else if (f.type === "file") v = el.files[0] || null;
          else if (f.type === "number") v = el.value.trim() === "" ? null : Number(el.value);
          else v = el.value.trim();
          if (f.required && (v === "" || v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)))) {
            m.ov.querySelector("#askErr").textContent = "\"" + f.label + "\" দিতে হবে"; return;
          }
          out[f.id] = v;
        }
        finish(out); close();
      } }
    ], () => finish(null));
    const first = m.ov.querySelector("input,textarea,select"); if (first) first.focus();
  });
}
export function lightbox(url) {
  const lb = document.createElement("div"); lb.className = "lightbox";
  lb.innerHTML = `<img src="${esc(url)}" alt="">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb);
}
