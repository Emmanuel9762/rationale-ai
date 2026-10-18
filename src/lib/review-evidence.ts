import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { db } from "../db";
import { trades, tradingAccounts } from "../db/schema";
import { parseJournalFilters, type JournalSearchParams } from "./journal-filters";

export const EVIDENCE_LIMIT = 100;
export const EVIDENCE_TEXT_LIMIT = 500;
const evidenceColumns = {
  id: trades.id, revision: trades.revision, symbol: trades.symbol, direction: trades.direction,
  setup: trades.setup, entryTime: trades.entryTime, exitTime: trades.exitTime,
  entryPrice: trades.entryPrice, exitPrice: trades.exitPrice, quantity: trades.quantity,
  pnl: trades.pnl, rationale: trades.rationale, notes: trades.notes,
  reviewedAt: trades.reviewedAt, planAdherence: trades.planAdherence,
  reviewWentWell: trades.reviewWentWell, reviewImprove: trades.reviewImprove,
};
type EvidenceRow = Pick<typeof trades.$inferSelect, keyof typeof evidenceColumns>;
type EvidenceTextField = "rationale" | "notes" | "reviewWentWell" | "reviewImprove";

function cents(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Invalid recorded P&L precision.");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2,"0"))) * (value.startsWith("-") ? -BigInt(1) : BigInt(1));
}
function money(value: bigint): string {
  const absolute = value < BigInt(0) ? -value : value;
  return `${value < BigInt(0) ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2,"0")}`;
}

// Accept only scoped, ordered query results. Never spread a database row into output.
export function buildReviewEvidence(rows: EvidenceRow[], period: {from?: string; to?: string}) {
  const included = rows.slice(0,EVIDENCE_LIMIT);
  let sum = BigInt(0);
  const coverage = {included:included.length, open:0, measured:0, missingPnl:0,
    reviewed:0, missingRationale:0, missingSetup:0, missingReviewText:0, truncatedTextFields:0};
  const entries = included.map(row => {
    const closed = row.exitPrice !== null && row.exitTime !== null;
    if (!closed) coverage.open++;
    else if (row.pnl === null) coverage.missingPnl++;
    else { coverage.measured++; sum += cents(row.pnl); }
    if (row.reviewedAt) coverage.reviewed++;
    if (!row.rationale?.trim()) coverage.missingRationale++;
    if (!row.setup?.trim()) coverage.missingSetup++;
    if (!row.reviewWentWell?.trim() && !row.reviewImprove?.trim()) coverage.missingReviewText++;
    const truncatedFields: string[] = [];
    const text = (field: EvidenceTextField) => {
      const value = row[field]?.trim() || null;
      if (value && Array.from(value).length > EVIDENCE_TEXT_LIMIT) {
        truncatedFields.push(field); coverage.truncatedTextFields++;
        return Array.from(value).slice(0,EVIDENCE_TEXT_LIMIT).join("");
      }
      return value;
    };
    return {id:row.id, revision:row.revision, symbol:row.symbol, direction:row.direction,
      setup:row.setup?.trim() || null, entryTime:row.entryTime.toISOString(),
      exitTime:row.exitTime?.toISOString() ?? null, entryPrice:row.entryPrice,
      exitPrice:row.exitPrice, quantity:row.quantity, recordedPnl:closed ? row.pnl : null,
      status:closed ? "closed" : "open", reviewedAt:row.reviewedAt?.toISOString() ?? null,
      planAdherence:row.reviewedAt ? row.planAdherence : null,
      rationale:text("rationale"), notes:text("notes"),
      reviewWentWell:text("reviewWentWell"), reviewImprove:text("reviewImprove"), truncatedFields};
  });
  return {version:1, period:{from:period.from ?? null,to:period.to ?? null},
    selection:"Newest entry time, then trade ID descending", limit:EVIDENCE_LIMIT,
    hasMore:rows.length > EVIDENCE_LIMIT, coverage,
    recordedPnl:coverage.measured ? money(sum) : null, entries};
}

export async function reviewEvidence(database: Pick<typeof db,"select">, userId: string, params: JournalSearchParams = {}) {
  const {filters:period,errors} = parseJournalFilters({from:params.from,to:params.to});
  if (errors.length) throw new Error(errors.join(" "));
  const through = period.to ? new Date(`${period.to}T00:00:00.000Z`) : undefined;
  if (through) through.setUTCDate(through.getUTCDate()+1);
  const rows = await database.select(evidenceColumns).from(trades)
    .innerJoin(tradingAccounts,eq(trades.accountId,tradingAccounts.id))
    .where(and(eq(tradingAccounts.userId,userId),
      period.from ? gte(trades.entryTime,new Date(`${period.from}T00:00:00.000Z`)) : undefined,
      through ? lt(trades.entryTime,through) : undefined))
    .orderBy(desc(trades.entryTime),desc(trades.id)).limit(EVIDENCE_LIMIT+1);
  return buildReviewEvidence(rows,period);
}
