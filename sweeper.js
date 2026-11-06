import { db, ref, get, onValue } from "./fb.js";
import { releaseDeal, refundDeal } from "./deal_ops.js";

/* Admin panel khola thakle protimin ek minute por por:
   - 24 ghontar moddhe seller sara na dile deal bondho + taka ferot
   - ketar Confirm er por nije nije seller ke taka chhere deya */
let deals = {}, busy = new Set(), pct = 10, timer = null, off = null;
export function startSweeper(ctx) {
  if (ctx.role !== "admin" || timer) return;
  off = onValue(ref(db, "deals"), s => { deals = s.val() || {}; run(ctx); }, () => {});
  get(ref(db, "settings/commission")).then(s => { if (s.val() !== null) pct = Number(s.val()) || 0; }).catch(() => {});
  timer = setInterval(() => run(ctx), 60000);
}
async function run(ctx) {
  for (const [id, v] of Object.entries(deals)) {
    const d = { ...v, id };
    if (busy.has(id)) continue;
    const expired = d.status === "held" && !d.sellerRespondedAt && d.deadline && Date.now() > d.deadline;
    if (!expired && d.status !== "confirmed") continue;
    busy.add(id);
    try {
      if (expired) await refundDeal(ctx, d, "বিক্রেতা সময়মতো সাড়া দেয়নি", true);
      else await releaseDeal(ctx, d, pct, true);
    } catch (e) { console.warn("sweeper", id, e.message); }
    busy.delete(id);
  }
}
