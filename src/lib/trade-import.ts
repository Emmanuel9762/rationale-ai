import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { tradeImports } from "../db/schema";
import { previewTradeCsv, CsvPreviewError } from "./trade-csv-preview";
import { accountForUser } from "./trade-writes";

export type ImportReceipt = { id: string; count: number };
export type ImportState = { error?: string; receipt?: ImportReceipt };

export async function importOwnedCsv<Q extends PgQueryResultHKT>(
  database: Pick<PgDatabase<Q>, "select" | "insert" | "update" | "execute">,
  userId: string, data: FormData,
): Promise<ImportReceipt> {
  function field(name: string) {
    const values = data.getAll(name);
    if (values.length !== 1 || typeof values[0] !== "string") throw new CsvPreviewError(`Provide one ${name} field.`);
    return values[0];
  }
  if (field("confirmed") !== "yes") throw new CsvPreviewError("Confirm that you want to save this batch.");
  const preview = previewTradeCsv(field("csv"));
  if (preview.errors.length) throw new CsvPreviewError(`Fix all ${preview.errors.length} invalid records before importing. No trades saved.`);
  if (preview.rows.some(row => row.duplicateOf !== undefined) && field("allowRepeated") !== "yes") throw new CsvPreviewError("Confirm that repeated records are intentional.");
  // Stable versioned payload; metadata and spreadsheet column order do not affect retries.
  // Decimal strings are canonicalized without floating-point arithmetic.
  function decimal(value: string | null) {
    if (value === null) return null;
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const tail = fraction.replace(/0+$/, "");
    const magnitude = whole.replace(/^0+(?=\d)/, "") + (tail ? `.${tail}` : "");
    return value.startsWith("-") && magnitude !== "0" ? `-${magnitude}` : magnitude;
  }
  const rows = preview.rows.map(({trade, review}) => ({
    ...trade, entryPrice: decimal(trade.entryPrice), exitPrice: decimal(trade.exitPrice),
    quantity: decimal(trade.quantity), pnl: decimal(trade.pnl),
    planAdherence: review?.planAdherence ?? null, reviewWentWell: review?.reviewWentWell ?? null,
    reviewImprove: review?.reviewImprove ?? null,
  }));
  const payload = JSON.stringify(rows);
  const hash = createHash("sha256").update("rationale-csv-v1\n" + payload).digest("hex");
  const scope = and(eq(tradeImports.userId, userId), eq(tradeImports.payloadHash, hash));
  async function receipt() {
    const [saved] = await database.select({ id: tradeImports.id, count: tradeImports.rowCount }).from(tradeImports).where(scope).limit(1);
    return saved;
  }
  const previous = await receipt();
  if (previous) return previous;
  const accountId = await accountForUser(database, userId);
  // One SQL statement commits the receipt and all trades together. A competing
  // request cannot claim the same owner's payload, so its trade SELECT is empty.
  // Any trade insert failure rolls back the claimed receipt as well.
  await database.execute(sql`
    with claimed as (
      insert into trade_imports (user_id, account_id, payload_hash, row_count)
      values (${userId}::uuid, ${accountId}::uuid, ${hash}, ${rows.length})
      on conflict (user_id, payload_hash) do nothing returning id, account_id
    ), inserted as (
      insert into trades (account_id, symbol, direction, setup, rationale, notes,
        entry_price, exit_price, quantity, pnl, entry_time, exit_time,
        plan_adherence, review_went_well, review_improve, reviewed_at)
      select claimed.account_id, p.symbol, p.direction, p.setup, p.rationale, p.notes,
        p."entryPrice", p."exitPrice", p.quantity, p.pnl,
        p."entryTime"::timestamptz at time zone 'UTC', p."exitTime"::timestamptz at time zone 'UTC',
        p."planAdherence", p."reviewWentWell", p."reviewImprove",
        case when p."planAdherence" is not null then now() at time zone 'UTC' end
      from claimed cross join jsonb_to_recordset(${payload}::jsonb) as p(
        symbol text, direction text, setup text, rationale text, notes text,
        "entryPrice" numeric, "exitPrice" numeric, quantity numeric, pnl numeric,
        "entryTime" text, "exitTime" text, "planAdherence" text, "reviewWentWell" text, "reviewImprove" text)
      returning id
    ), linked as (
      insert into trade_import_rows (trade_id, import_id)
      select inserted.id, claimed.id from inserted cross join claimed
      returning trade_id
    ) select count(*) from linked
  `);
  // A separate read sees the winning receipt after an ON CONFLICT wait even
  // when the winner wasn't visible in the INSERT statement's snapshot.
  const saved = await receipt();
  if (!saved || saved.count !== rows.length) throw new Error("Unable to confirm batch receipt");
  return saved;
}
