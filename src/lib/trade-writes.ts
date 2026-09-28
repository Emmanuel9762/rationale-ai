import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { trades, tradingAccounts } from "../db/schema";
import { isTradeId } from "./trade-repository";
import type { TradeInput } from "./trade-input";

type Database<Q extends PgQueryResultHKT> = Pick<PgDatabase<Q>, "select" | "insert" | "update">;

// The caller supplies the identity resolved on the server.
export async function accountForUser<Q extends PgQueryResultHKT>(database: Database<Q>, userId: string) {
  const [existing] = await database.select().from(tradingAccounts).where(eq(tradingAccounts.userId, userId))
    .orderBy(asc(tradingAccounts.createdAt), asc(tradingAccounts.id)).limit(1);
  if (existing) return existing.id;
  const [account] = await database.insert(tradingAccounts).values({ userId: userId, name: "Development Account", balance: "0" }).returning({ id: tradingAccounts.id });
  return account.id;
}

export async function updateOwnedTrade<Q extends PgQueryResultHKT>(database: Database<Q>, userId: string, id: string, input: TradeInput) {
  if (!isTradeId(id)) return null;
  const accounts = database.select({ id: tradingAccounts.id }).from(tradingAccounts).where(eq(tradingAccounts.userId, userId));
  const [updated] = await database.update(trades).set(input)
    .where(and(eq(trades.id, id), inArray(trades.accountId, accounts))).returning({ id: trades.id });
  return updated?.id ?? null;
}
