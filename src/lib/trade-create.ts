import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { trades } from "../db/schema";
import { accountForUser } from "./trade-writes";
import { isTradeId } from "./trade-repository";
import { TradeInputError, type TradeInput } from "./trade-input";

export function parseSubmissionKey(data: FormData) {
  const values = data.getAll("submissionKey");
  if (values.length !== 1 || typeof values[0] !== "string" || !isTradeId(values[0])) {
    throw new TradeInputError("This form is missing a valid submission key. Check trade history before opening a new form.");
  }
  return values[0].toLowerCase();
}

function fingerprint(input: TradeInput) {
  // Equivalent decimal spellings have the same fingerprint, without float conversion.
  function decimal(value: string | null) {
    if (value === null) return null;
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const number = `${whole.replace(/^0+(?=\d)/, "")}${fraction.replace(/0+$/, "") ? `.${fraction.replace(/0+$/, "")}` : ""}`;
    return negative && number !== "0" ? `-${number}` : number;
  }
  // Fixed field order; only the validated creation payload participates.
  return createHash("sha256").update(JSON.stringify([
    input.symbol, input.direction, decimal(input.entryPrice), decimal(input.quantity),
    input.entryTime.toISOString(), decimal(input.exitPrice), input.exitTime?.toISOString() ?? null,
    decimal(input.pnl), input.setup, input.rationale, input.notes,
  ])).digest("hex");
}

export async function createOwnedTrade<Q extends PgQueryResultHKT>(
  database: Pick<PgDatabase<Q>, "select" | "insert" | "update">,
  userId: string, submissionKey: string, input: TradeInput,
) {
  if (!isTradeId(submissionKey)) throw new TradeInputError("Invalid submission key.");
  const accountId = await accountForUser(database, userId);
  const submissionHash = fingerprint(input);
  // PostgreSQL arbitrates competing inserts. Never update a trade on replay.
  const [created] = await database.insert(trades).values({ ...input, accountId, submissionKey, submissionHash })
    .onConflictDoNothing({ target: [trades.accountId, trades.submissionKey] }).returning({ id: trades.id });
  if (created) return created.id;
  const [original] = await database.select({ id: trades.id, hash: trades.submissionHash }).from(trades)
    .where(and(eq(trades.accountId, accountId), eq(trades.submissionKey, submissionKey))).limit(1);
  if (!original) throw new Error("Unable to confirm original submission");
  if (original.hash !== submissionHash) throw new TradeInputError("This submission already saved a trade with different details. Check trade history and edit that trade, or open a new form for a separate trade.");
  return original.id;
}
