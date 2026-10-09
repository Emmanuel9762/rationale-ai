import { sql } from "drizzle-orm";
import { trades } from "../db/schema";

export type TradeGroupDimension = "setup" | "symbol" | "adherence";

// Aggregation and drill-down must use the same label normalization.
// Missing labels stay NULL, distinct from a literal "Not specified" label.
export function tradeGroup(by: TradeGroupDimension) {
  if (by === "adherence") return sql<string | null>`case
    when ${trades.reviewedAt} is null then 'unreviewed'
    when ${trades.planAdherence} in ('followed', 'partly', 'not_followed') then ${trades.planAdherence}
    else 'unspecified' end`;
  return by === "symbol"
    ? sql<string | null>`nullif(upper(btrim(${trades.symbol})), '')`
    : sql<string | null>`nullif(btrim(${trades.setup}), '')`;
}
