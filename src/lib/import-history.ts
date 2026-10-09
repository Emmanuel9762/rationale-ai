import { and, desc, eq, sql } from "drizzle-orm";
import type { db } from "../db";
import { tradeImports, tradingAccounts } from "../db/schema";

export const IMPORT_PAGE_SIZE = 25;
export function importHistoryHref(page = 1) {
  return `/trades/imports${page > 1 ? `?page=${page}` : ""}`;
}

export async function importHistory(database: Pick<typeof db, "select">, userId: string, page = 1) {
  const rows = await database.select({
    id: tradeImports.id, createdAt: tradeImports.createdAt, originalCount: tradeImports.rowCount,
    accountName: tradingAccounts.name,
    linkedCount: sql<number>`(select count(*)::int from trade_import_rows r
      inner join trades t on t.id = r.trade_id
      where r.import_id = ${tradeImports.id} and t.account_id = ${tradeImports.accountId})`,
  }).from(tradeImports).innerJoin(tradingAccounts, eq(tradingAccounts.id, tradeImports.accountId))
    .where(and(eq(tradeImports.userId, userId), eq(tradingAccounts.userId, userId)))
    .orderBy(desc(tradeImports.createdAt), desc(tradeImports.id))
    .limit(IMPORT_PAGE_SIZE + 1).offset((page - 1) * IMPORT_PAGE_SIZE);
  return { imports: rows.slice(0, IMPORT_PAGE_SIZE), hasNext: rows.length > IMPORT_PAGE_SIZE };
}
