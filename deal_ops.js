import { db, ref, get, set, update, push, runTransaction, serverTimestamp } from "./fb.js";

/* status ek jaygay theke arek jaygay jaoa: ekbar-i hobe (double click / duijon admin e double kaj hobe na) */
async function claim(path, froms, to) {
  const r = await runTransaction(ref(db, path), cur => cur === null ? to : (froms.includes(cur) ? to : undefined));
  return r.committed && r.snapshot.val() === to;
}
const addMsg = (up, ctx, id, type, text) => {
  const k = push(ref(db, "deal_chats/" + id + "/messages")).key;
  up["deal_chats/" + id + "/messages/" + k] = { from: ctx.uid, role: "staff", name: ctx.name.slice(0, 60), type, text: String(text).slice(0, 1500), at: serverTimestamp() };
};
const addTx = (up, uid, type, amount, note, dealId) => {
  const k = push(ref(db, "transactions/" + uid)).key;
  up["transactions/" + uid + "/" + k] = { type, amount, note: String(note).slice(0, 200), ref: dealId, at: serverTimestamp() };
};
export async function postMessage(ctx, id, text) { const up = {}; addMsg(up, ctx, id, "msg", text); await update(ref(db), up); }

/* requested -> held : ketar balance theke taka atkano, listing reserved */
export async function acceptDeal(ctx, d, hours, siblings = []) {
  const st = (await get(ref(db, "listings/" + d.listingId + "/status"))).val();
  if (st !== "approved") throw new Error("আইডিটি এখন Available নেই");
  if (!await claim("deals/" + d.id + "/status", ["requested"], "held")) throw new Error("আগেই প্রসেস হয়েছে");
  const back = async () => { await set(ref(db, "deals/" + d.id + "/status"), "requested").catch(() => {}); };
  let t;
  try { t = await runTransaction(ref(db, "users/" + d.buyerId + "/balance"), cur => cur === null ? 0 : (cur >= d.price ? cur - d.price : undefined)); }
  catch (e) { await back(); throw e; }
  if (!t.committed) { await back(); throw new Error("ক্রেতার ব্যালেন্স যথেষ্ট নেই"); }
  const up = {}, b = "deals/" + d.id + "/";
  up[b + "heldAt"] = serverTimestamp(); up[b + "deadline"] = Date.now() + hours * 3600000;
  up["listings/" + d.listingId + "/status"] = "reserved";
  up["user_listings/" + d.sellerId + "/" + d.listingId + "/status"] = "reserved";
  const ud = { role: "seller", title: d.listingTitle, price: d.price, createdAt: serverTimestamp() };
  if (d.listingImage) ud.image = d.listingImage;
  up["user_deals/" + d.sellerId + "/" + d.id] = ud;
  siblings.filter(o => o.id !== d.id && o.listingId === d.listingId && o.status === "requested").forEach(o => { up["deals/" + o.id + "/status"] = "cancelled"; up["deals/" + o.id + "/reason"] = "অন্য ক্রেতার ডিল শুরু হয়েছে"; });
  addTx(up, d.buyerId, "deal_purchase", -d.price, d.listingTitle, d.id);
  addMsg(up, ctx, d.id, "system", "টাকা আটকানো হয়েছে। বিক্রেতাকে " + hours + " ঘণ্টার মধ্যে সাড়া দিতে হবে, না হলে ডিল বাতিল হয়ে টাকা ফেরত যাবে।");
  ctx.addLog(up, "deal_accept", d.listingTitle + " " + d.price + " [" + d.id + "]");
  try { await update(ref(db), up); }
  catch (e) { await runTransaction(ref(db, "users/" + d.buyerId + "/balance"), cur => (cur || 0) + d.price).catch(() => {}); await back(); throw e; }
}

export async function cancelRequest(ctx, d, reason) {
  if (!await claim("deals/" + d.id + "/status", ["requested"], "cancelled")) throw new Error("আগেই প্রসেস হয়েছে");
  const up = {}; up["deals/" + d.id + "/reason"] = String(reason).slice(0, 300);
  addMsg(up, ctx, d.id, "system", "অনুরোধ বাতিল: " + reason);
  ctx.addLog(up, "deal_cancel", d.listingTitle + " [" + d.id + "]: " + reason); await update(ref(db), up);
}

/* held -> delivered (moderator-o parbe) */
export async function deliverDeal(ctx, d, info) {
  if (!await claim("deals/" + d.id + "/status", ["held"], "delivered")) throw new Error("এখন ডেলিভারি দেওয়া যাবে না");
  const up = {}; up["deals/" + d.id + "/deliveredAt"] = serverTimestamp();
  addMsg(up, ctx, d.id, "delivery", info);
  ctx.addLog(up, "deal_deliver", d.listingTitle + " [" + d.id + "]"); await update(ref(db), up);
}

/* confirmed/delivered/disputed -> completed : bikretar balance e taka (commission baad) */
export async function releaseDeal(ctx, d, pct, auto = false) {
  const froms = ["confirmed", "delivered", "disputed"];
  if (!await claim("deals/" + d.id + "/status", froms, "completed")) throw new Error("আগেই প্রসেস হয়েছে");
  const commission = Math.round(d.price * (Number(pct) || 0) / 100), amount = d.price - commission;
  const back = async () => { await set(ref(db, "deals/" + d.id + "/status"), d.status).catch(() => {}); };
  let t;
  try { t = await runTransaction(ref(db, "users/" + d.sellerId + "/balance"), cur => (cur === null ? 0 : cur) + amount); }
  catch (e) { await back(); throw e; }
  if (!t.committed) { await back(); throw new Error("বিক্রেতার ব্যালেন্স আপডেট হয়নি"); }
  const up = {}, b = "deals/" + d.id + "/";
  up[b + "completedAt"] = serverTimestamp(); up[b + "commission"] = commission; up[b + "sellerAmount"] = amount;
  up["listings/" + d.listingId + "/status"] = "sold"; up["user_listings/" + d.sellerId + "/" + d.listingId + "/status"] = "sold";
  addTx(up, d.sellerId, "deal_sale", amount, d.listingTitle + " (কমিশন " + commission + ")", d.id);
  addMsg(up, ctx, d.id, "system", "ডিল সম্পন্ন। বিক্রেতার ব্যালেন্সে ৳ " + amount + " যোগ হয়েছে।");
  ctx.addLog(up, auto ? "deal_auto_release" : "deal_release", d.listingTitle + " " + amount + " [" + d.id + "]");
  await update(ref(db), up);
}

/* held/delivered/confirmed/disputed -> refunded : ketar taka ferot, listing abar Available */
export async function refundDeal(ctx, d, reason, auto = false) {
  if (!await claim("deals/" + d.id + "/status", ["held", "delivered", "confirmed", "disputed"], "refunded")) throw new Error("আগেই প্রসেস হয়েছে");
  const back = async () => { await set(ref(db, "deals/" + d.id + "/status"), d.status).catch(() => {}); };
  let t;
  try { t = await runTransaction(ref(db, "users/" + d.buyerId + "/balance"), cur => (cur === null ? 0 : cur) + d.price); }
  catch (e) { await back(); throw e; }
  if (!t.committed) { await back(); throw new Error("রিফান্ড হয়নি"); }
  const up = {}, b = "deals/" + d.id + "/";
  up[b + "completedAt"] = serverTimestamp(); up[b + "reason"] = String(reason).slice(0, 300);
  const ls = (await get(ref(db, "listings/" + d.listingId + "/status")).catch(() => null));
  if (ls && ls.val() === "reserved") { up["listings/" + d.listingId + "/status"] = "approved"; up["user_listings/" + d.sellerId + "/" + d.listingId + "/status"] = "approved"; }
  addTx(up, d.buyerId, "deal_refund", d.price, d.listingTitle, d.id);
  addMsg(up, ctx, d.id, "system", "রিফান্ড: " + reason + "। ক্রেতার ব্যালেন্সে ৳ " + d.price + " ফেরত গেছে।");
  ctx.addLog(up, auto ? "deal_auto_refund" : "deal_refund", d.listingTitle + " " + d.price + ": " + reason + " [" + d.id + "]");
  await update(ref(db), up);
}
