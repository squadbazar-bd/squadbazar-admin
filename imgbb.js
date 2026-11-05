import { ref, get, db } from "./fb.js";

let cache = null;
export function resetKeys() { cache = null; }
export async function loadKeys() {
  if (cache) return cache;
  const s = await get(ref(db, "settings/imgbbKeys"));
  cache = Object.values(s.val() || {}).filter(k => k && k.key && k.active !== false).map(k => k.key);
  return cache;
}
export async function uploadWithKey(blob, key) {
  const fd = new FormData(); fd.append("image", blob, "x.jpg");
  const r = await fetch("https://api.imgbb.com/1/upload?key=" + encodeURIComponent(key), { method: "POST", body: fd });
  const j = await r.json();
  if (j && j.success && j.data && j.data.url) return j.data.url;
  throw new Error((j && j.error && j.error.message) || "upload failed");
}
export async function uploadImage(blob) {
  const keys = await loadKeys();
  if (!keys.length) throw new Error("সেটিংস > imgbb কী থেকে অন্তত একটি সক্রিয় কী যোগ করুন");
  let last;
  for (const k of [...keys].sort(() => Math.random() - 0.5)) {
    try { return await uploadWithKey(blob, k); } catch (e) { last = e; }
  }
  throw last;
}
export async function shrink(file, max = 1280) {
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise(r => c.toBlob(r, "image/jpeg", 0.82))) || file;
  } catch (e) { return file; }
}
