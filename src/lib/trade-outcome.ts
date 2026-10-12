import { sql } from "drizzle-orm";
import { trades } from "../db/schema";

import type { TradeOutcome } from "./outcome-labels";

// A numeric P&L on an incomplete legacy row is not a measured result.
export function outcomeCondition(outcome: TradeOutcome) {
  const closed = sql`${trades.exitTime} is not null and ${trades.exitPrice} is not null`;
  switch (outcome) {
    case "win": return sql`${closed} and ${trades.pnl} > 0`;
    case "loss": return sql`${closed} and ${trades.pnl} < 0`;
    case "breakeven": return sql`${closed} and ${trades.pnl} = 0`;
    case "measured": return sql`${closed} and ${trades.pnl} is not null`;
    case "missing": return sql`${closed} and ${trades.pnl} is null`;
  }
}
