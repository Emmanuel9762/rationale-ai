import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { trades, tradingAccounts, users } from "../db/schema";
import { DEVELOPMENT_EMAIL, isTradeId } from "./trade-repository";
import type { TradeInput } from "./trade-input";

type Database<Q extends PgQueryResultHKT> = Pick<PgDatabase<Q>, "select" | "insert" | "update">;

// Temporary single-user identity. Replace with authenticated identity before release.
export async function developmentAccount<Q extends PgQueryResultHKT>(database: Database<Q>) {
  await database.insert(users).values({ email: DEVELOPMENT_EMAIL }).onConflictDoNothing({ target: users.email });
  const [user] = await database.select().from(users).where(eq(users.email, DEVELOPMENT_EMAIL)).limit(1);
  if (!user) throw new Error("Unable to resolve development user");
  const [existing] = await database.select().from(tradingAccounts).where(eq(tradingAccounts.userId, user.id))
    .orderBy(asc(tradingAccounts.createdAt), asc(tradingAccounts.id)).limit(1);
  if (existing) return existing.id;
  const [account] = await database.insert(tradingAccounts).values({ userId: user.id, name: "Development Account", balance: "0" }).returning({ id: tradingAccounts.id });
  return account.id;
}

export async function updateOwnedTrade<Q extends PgQueryResultHKT>(database: Database<Q>, email: string, id: string, input: TradeInput) {
  if (!isTradeId(id)) return null;
  const accounts = database.select({ id: tradingAccounts.id }).from(tradingAccounts)
    .innerJoin(users, eq(tradingAccounts.userId, users.id)).where(eq(users.email, email));
  const [updated] = await database.update(trades).set(input)
    .where(and(eq(trades.id, id), inArray(trades.accountId, accounts))).returning({ id: trades.id });
  return updated?.id ?? null;
}
