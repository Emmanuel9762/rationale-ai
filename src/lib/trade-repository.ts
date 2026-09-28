import { and, desc, eq } from "drizzle-orm";
import type { db } from "../db";
import { trades, tradingAccounts } from "../db/schema";

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
    async list(userId: string, page = 1) {
      const rows = await scoped().where(eq(tradingAccounts.userId, userId))
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
