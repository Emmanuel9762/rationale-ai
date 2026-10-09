import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { db } from "../db";
import { trades, tradingAccounts } from "../db/schema";
import type { JournalFilters } from "./journal-filters";

function metricColumns() {
  const closed = sql`${trades.exitTime} is not null and ${trades.exitPrice} is not null`;
  const measured = sql`${closed} and ${trades.pnl} is not null`;
  const winning = sql`${measured} and ${trades.pnl} > 0`;
  const losing = sql`${measured} and ${trades.pnl} < 0`;
  const grossProfit = sql`coalesce(sum(${trades.pnl}) filter (where ${winning}), 0)`;
  const grossLoss = sql`coalesce(-sum(${trades.pnl}) filter (where ${losing}), 0)`;
  return {
    total: sql<number>`count(*)::int`,
    closed: sql<number>`count(*) filter (where ${closed})::int`,
    measured: sql<number>`count(*) filter (where ${measured})::int`,
    wins: sql<number>`count(*) filter (where ${winning})::int`,
    pnl: sql<string>`coalesce(sum(${trades.pnl}) filter (where ${measured}), 0)::text`,
    grossProfit: sql<string>`${grossProfit}::text`,
    grossLoss: sql<string>`${grossLoss}::text`,
    // Round numeric values in PostgreSQL, then retain strings through rendering.
    // NULL distinguishes no applicable sample from a measured zero.
    averagePnl: sql<string | null>`round(avg(${trades.pnl}) filter (where ${measured}), 2)::text`,
    averageWin: sql<string | null>`round(avg(${trades.pnl}) filter (where ${winning}), 2)::text`,
    averageLoss: sql<string | null>`round(avg(-${trades.pnl}) filter (where ${losing}), 2)::text`,
    profitFactorValue: sql<string | null>`round(${grossProfit} / nullif(${grossLoss}, 0), 2)::text`,
  };
}

type MetricRow = {
  total: number; closed: number; measured: number; wins: number;
  pnl: string; grossProfit: string; grossLoss: string;
  averagePnl: string | null; averageWin: string | null; averageLoss: string | null;
  profitFactorValue: string | null;
};
function summarize(result: MetricRow) {
  const { profitFactorValue, ...metrics } = result;
  return {
    ...metrics,
    open: result.total - result.closed,
    missingPnl: result.closed - result.measured,
    winRate: result.measured ? `${(result.wins / result.measured * 100).toFixed(1)}%` : "—",
    profitFactor: profitFactorValue ?? (result.wins > 0 ? "∞" : "—"),
  };
}

export async function tradeMetrics(database: Pick<typeof db, "select">, userId: string) {
  const [result] = await database.select(metricColumns()).from(trades)
    .innerJoin(tradingAccounts, eq(trades.accountId, tradingAccounts.id))
    .where(eq(tradingAccounts.userId, userId));
  return summarize(result);
}

export async function tradeBreakdown(database: Pick<typeof db, "select">, userId: string, by: "setup" | "symbol", period: Pick<JournalFilters, "from" | "to"> = {}) {
  const until = period.to ? new Date(`${period.to}T00:00:00.000Z`) : undefined;
  if (until) until.setUTCDate(until.getUTCDate() + 1);
  // Keep missing values as NULL so a literal setup named "No setup" stays distinct.
  // Symbols ignore case; setup labels retain their author's capitalization.
  const group = by === "symbol"
    ? sql<string | null>`nullif(upper(btrim(${trades.symbol})), '')`
    : sql<string | null>`nullif(btrim(${trades.setup}), '')`;
  const rows = await database.select({ group, ...metricColumns() }).from(trades)
    .innerJoin(tradingAccounts, eq(trades.accountId, tradingAccounts.id))
    .where(and(
      eq(tradingAccounts.userId, userId),
      period.from ? gte(trades.entryTime, new Date(`${period.from}T00:00:00.000Z`)) : undefined,
      until ? lt(trades.entryTime, until) : undefined,
    ))
    .groupBy(group).orderBy(asc(group));
  return rows.map(row => ({ group: row.group, ...summarize(row) }));
}

// Preserve PostgreSQL decimal precision rather than converting totals to floats.
export function formatPnl(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
