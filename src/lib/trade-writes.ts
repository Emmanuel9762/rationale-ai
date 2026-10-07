import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { trades, tradingAccounts } from "../db/schema";
import { isTradeId } from "./trade-repository";
import type { TradeInput } from "./trade-input";

import { checkRevision, TradeConflictError } from "./trade-version";

type Database<Q extends PgQueryResultHKT> = Pick<PgDatabase<Q>, "select" | "insert" | "update">;

// The caller supplies the identity resolved on the server.
export async function accountForUser<Q extends PgQueryResultHKT>(database: Database<Q>, userId: string) {
  const scope = and(eq(tradingAccounts.userId, userId), eq(tradingAccounts.isDefault, true));
  const [existing] = await database.select({ id: tradingAccounts.id }).from(tradingAccounts).where(scope).limit(1);
  if (existing) return existing.id;
  // The partial unique index arbitrates concurrent first saves. The losing
  // insert waits for the winner, then reads the same committed default account.
  await database.insert(tradingAccounts).values({ userId, name: "Default Account", balance: "0", isDefault: true })
    .onConflictDoNothing({ target: tradingAccounts.userId, where: sql`${tradingAccounts.isDefault} = true` });
  const [account] = await database.select({ id: tradingAccounts.id }).from(tradingAccounts).where(scope).limit(1);
  if (!account) throw new Error("Unable to resolve default trading account");
  return account.id;
}

export async function updateOwnedTrade<Q extends PgQueryResultHKT>(database: Database<Q>, userId: string, id: string, input: TradeInput, revision: number) {
  checkRevision(revision);
  if (!isTradeId(id)) return null;
  const accounts = database.select({ id: tradingAccounts.id }).from(tradingAccounts).where(eq(tradingAccounts.userId, userId));
  const owned = and(eq(trades.id, id), inArray(trades.accountId, accounts));
  const [updated] = await database.update(trades).set({ ...input, revision: sql`${trades.revision} + 1` })
    .where(and(owned, eq(trades.revision, revision))).returning({ id: trades.id });
  if (updated) return updated.id;
  const [existing] = await database.select({ id: trades.id }).from(trades).where(owned).limit(1);
  if (existing) throw new TradeConflictError();
  return null;
}
