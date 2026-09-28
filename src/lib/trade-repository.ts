import { and, desc, eq } from "drizzle-orm";
import type { db } from "../db";
import { trades, tradingAccounts, users } from "../db/schema";

export const DEVELOPMENT_EMAIL = "dev@rationale-ai.local";
export const PAGE_SIZE = 25;
export function isTradeId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function tradeRepository(database: Pick<typeof db, "select">) {
  function scoped() {
    return database.select({ trade: trades }).from(trades)
      .innerJoin(tradingAccounts, eq(trades.accountId, tradingAccounts.id))
      .innerJoin(users, eq(tradingAccounts.userId, users.id));
  }
  return {
    async list(email: string, page = 1) {
      const rows = await scoped().where(eq(users.email, email))
        .orderBy(desc(trades.entryTime), desc(trades.id))
        .limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
      return { trades: rows.slice(0, PAGE_SIZE).map(row => row.trade), hasNext: rows.length > PAGE_SIZE };
    },
    async find(email: string, id: string) {
      if (!isTradeId(id)) return null;
      const [row] = await scoped().where(and(eq(users.email, email), eq(trades.id, id))).limit(1);
      return row?.trade ?? null;
    },
  };
}
