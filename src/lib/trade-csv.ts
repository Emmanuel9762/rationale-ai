import type { trades } from "../db/schema";
type Trade = typeof trades.$inferSelect;

import { csvCell as cell } from "./csv-cell";

const columns: [string, (row: Trade) => string | null, boolean?][] = [
  ["trade_id", r=>r.id], ["account_id", r=>r.accountId], ["symbol",r=>r.symbol], ["direction",r=>r.direction],
  ["setup",r=>r.setup], ["rationale",r=>r.rationale], ["notes",r=>r.notes],
  ["entry_price",r=>r.entryPrice,false], ["exit_price",r=>r.exitPrice,false], ["quantity",r=>r.quantity,false], ["recorded_pnl",r=>r.pnl,false],
  ["entry_time_utc",r=>r.entryTime.toISOString()], ["exit_time_utc",r=>r.exitTime?.toISOString() ?? null],
  ["created_at_utc",r=>r.createdAt.toISOString()], ["plan_adherence",r=>r.planAdherence],
  ["review_went_well",r=>r.reviewWentWell], ["review_improve",r=>r.reviewImprove], ["reviewed_at_utc",r=>r.reviewedAt?.toISOString() ?? null],
];
export function tradesCsv(rows: Trade[]) {
  return "\uFEFF" + [columns.map(([name])=>cell(name)).join(","), ...rows.map(row=>columns.map(([,get,text])=>cell(get(row),text)).join(","))].join("\r\n") + "\r\n";
}
