import { asc, eq, sql } from "drizzle-orm";
import type { db } from "../db";
import { trades, tradingAccounts } from "../db/schema";

function metricColumns() {
  const closed = sql`${trades.exitTime} is not null and ${trades.exitPrice} is not null`;
  const measured = sql`${closed} and ${trades.pnl} is not null`;
  return {
    total: sql<number>`count(*)::int`,
    closed: sql<number>`count(*) filter (where ${closed})::int`,
    measured: sql<number>`count(*) filter (where ${measured})::int`,
    wins: sql<number>`count(*) filter (where ${measured} and ${trades.pnl} > 0)::int`,
    pnl: sql<string>`coalesce(sum(${trades.pnl}) filter (where ${measured}), 0)::text`,
    grossProfit: sql<string>`coalesce(sum(${trades.pnl}) filter (where ${measured} and ${trades.pnl} > 0), 0)::text`,
    grossLoss: sql<string>`coalesce(-sum(${trades.pnl}) filter (where ${measured} and ${trades.pnl} < 0), 0)::text`,
  };
}

type MetricRow = { total: number; closed: number; measured: number; wins: number; pnl: string; grossProfit: string; grossLoss: string };
function summarize(result: MetricRow) {
  return {
    ...result,
    open: result.total - result.closed,
    missingPnl: result.closed - result.measured,
    winRate: result.measured ? `${(result.wins / result.measured * 100).toFixed(1)}%` : "—",
    profitFactor: Number(result.grossLoss) > 0 ? (Number(result.grossProfit) / Number(result.grossLoss)).toFixed(2)
      : Number(result.grossProfit) > 0 ? "∞" : "—",
  };
}

export async function tradeMetrics(database: Pick<typeof db, "select">, userId: string) {
  const [result] = await database.select(metricColumns()).from(trades)
    .innerJoin(tradingAccounts, eq(trades.accountId, tradingAccounts.id))
    .where(eq(tradingAccounts.userId, userId));
  return summarize(result);
}

export async function tradeBreakdown(database: Pick<typeof db, "select">, userId: string, by: "setup" | "symbol") {
  // Keep missing values as NULL so a literal setup named "No setup" stays distinct.
  // Symbols ignore case; setup labels retain their author's capitalization.
  const group = by === "symbol"
    ? sql<string | null>`nullif(upper(btrim(${trades.symbol})), '')`
    : sql<string | null>`nullif(btrim(${trades.setup}), '')`;
  const rows = await database.select({ group, ...metricColumns() }).from(trades)
    .innerJoin(tradingAccounts, eq(trades.accountId, tradingAccounts.id))
    .where(eq(tradingAccounts.userId, userId))
    .groupBy(group).orderBy(asc(group));
  return rows.map(row => ({ group: row.group, ...summarize(row) }));
}

// Preserve PostgreSQL decimal precision rather than converting totals to floats.
export function formatPnl(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
