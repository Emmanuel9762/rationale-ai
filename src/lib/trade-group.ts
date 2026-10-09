import { sql } from "drizzle-orm";
import { trades } from "../db/schema";

// Aggregation and drill-down must use the same label normalization.
// Missing labels stay NULL, distinct from a literal "Not specified" label.
export function tradeGroup(by: "setup" | "symbol") {
  return by === "symbol"
    ? sql<string | null>`nullif(upper(btrim(${trades.symbol})), '')`
    : sql<string | null>`nullif(btrim(${trades.setup}), '')`;
}
