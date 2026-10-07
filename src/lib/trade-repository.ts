import { and, desc, eq, gte, lt, isNull, isNotNull, or, sql } from "drizzle-orm";
import type { db } from "../db";
import { trades, tradingAccounts } from "../db/schema";

import type { JournalFilters } from "./journal-filters";

export const PAGE_SIZE = 25;
export function isTradeId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function tradeRepository(database: Pick<typeof db, "select">) {
  function scoped() {
    return database.select({ trade: trades }).from(trades)
      .innerJoin(tradingAccounts, eq(trades.accountId, tradingAccounts.id));
  }
  return {
    async list(userId: string, page = 1, filters: JournalFilters = {}) {
      // Apply ownership and all filters before LIMIT/OFFSET.
      const through = filters.to ? new Date(`${filters.to}T00:00:00.000Z`) : undefined;
      if (through) through.setUTCDate(through.getUTCDate() + 1);
      const rows = await scoped().where(and(
        eq(tradingAccounts.userId, userId),
        filters.symbol ? sql`upper(${trades.symbol}) = ${filters.symbol.toUpperCase()}` : undefined,
        filters.direction ? eq(trades.direction, filters.direction) : undefined,
        filters.status === "closed" ? and(isNotNull(trades.exitTime), isNotNull(trades.exitPrice)) : undefined,
        filters.status === "open" ? or(isNull(trades.exitTime), isNull(trades.exitPrice)) : undefined,
        filters.review === "reviewed" ? isNotNull(trades.reviewedAt) : undefined,
        filters.review === "unreviewed" ? isNull(trades.reviewedAt) : undefined,
        filters.from ? gte(trades.entryTime, new Date(`${filters.from}T00:00:00.000Z`)) : undefined,
        through ? lt(trades.entryTime, through) : undefined,
      ))
        .orderBy(desc(trades.entryTime), desc(trades.id))
        .limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
      return { trades: rows.slice(0, PAGE_SIZE).map(row => row.trade), hasNext: rows.length > PAGE_SIZE };
    },
    async find(userId: string, id: string) {
      if (!isTradeId(id)) return null;
      const [row] = await scoped().where(and(eq(tradingAccounts.userId, userId), eq(trades.id, id))).limit(1);
      return row?.trade ?? null;
    },
  };
}
