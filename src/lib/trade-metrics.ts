import { eq, sql } from "drizzle-orm";
import type { db } from "../db";
import { trades, tradingAccounts } from "../db/schema";

export async function tradeMetrics(database: Pick<typeof db, "select">, userId: string) {
  const closed = sql`${trades.exitTime} is not null and ${trades.exitPrice} is not null`;
  const measured = sql`${closed} and ${trades.pnl} is not null`;
  const [result] = await database.select({
    total: sql<number>`count(*)::int`,
    closed: sql<number>`count(*) filter (where ${closed})::int`,
    measured: sql<number>`count(*) filter (where ${measured})::int`,
    wins: sql<number>`count(*) filter (where ${measured} and ${trades.pnl} > 0)::int`,
    pnl: sql<string>`coalesce(sum(${trades.pnl}) filter (where ${measured}), 0)::text`,
    grossProfit: sql<string>`coalesce(sum(${trades.pnl}) filter (where ${measured} and ${trades.pnl} > 0), 0)::text`,
    grossLoss: sql<string>`coalesce(-sum(${trades.pnl}) filter (where ${measured} and ${trades.pnl} < 0), 0)::text`,
  }).from(trades).innerJoin(tradingAccounts, eq(trades.accountId, tradingAccounts.id)).where(eq(tradingAccounts.userId, userId));
  return {
    ...result,
    open: result.total - result.closed,
    missingPnl: result.closed - result.measured,
    winRate: result.measured ? `${(result.wins / result.measured * 100).toFixed(1)}%` : "—",
    profitFactor: Number(result.grossLoss) > 0 ? (Number(result.grossProfit) / Number(result.grossLoss)).toFixed(2)
      : Number(result.grossProfit) > 0 ? "∞" : "—",
  };
}

// Preserve PostgreSQL decimal precision rather than converting totals to floats.
export function formatPnl(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
