import { parseTradeInput, type TradeInput } from "./trade-input";
import { parseReviewInput, type ReviewInput } from "./review-input";

export const CSV_MAX_BYTES = 256 * 1024;
export const CSV_MAX_ROWS = 500;
export const CSV_REQUIRED_COLUMNS = ["symbol", "direction", "entry_price", "quantity", "entry_time_utc"] as const;
export const CSV_OPTIONAL_COLUMNS = ["setup", "rationale", "notes", "exit_price", "recorded_pnl", "exit_time_utc", "plan_adherence", "review_went_well", "review_improve"] as const;
// These export fields are metadata, never identity or ownership instructions.
export const CSV_METADATA_COLUMNS = ["trade_id", "account_id", "created_at_utc", "reviewed_at_utc"] as const;
const allowedColumns = new Set<string>([...CSV_REQUIRED_COLUMNS, ...CSV_OPTIONAL_COLUMNS, ...CSV_METADATA_COLUMNS]);
export class CsvPreviewError extends Error {}
export type CsvPreviewRow = { record: number; trade: TradeInput; review: ReviewInput | null; duplicateOf?: number };
export type CsvPreview = { rows: CsvPreviewRow[]; errors: { record: number; message: string }[]; ignoredColumns: string[]; total: number };

// A small bounded RFC-style reader: quotes may contain commas/newlines and
// doubled quotes. Malformed structure rejects the file; values get row errors.
function records(source: string) {
  const rows: { record: number; cells: string[] }[] = [];
  let cells: string[] = [], value = "", state: "start" | "plain" | "quoted" | "closed" = "start", record = 1;
  function field() { cells.push(value); value = ""; state = "start"; }
  function row() {
    field();
    if (cells.some(cell => cell !== "") || cells.length > 1) rows.push({ record, cells });
    cells = []; record++;
    if (rows.length > CSV_MAX_ROWS + 1) throw new CsvPreviewError(`Use at most ${CSV_MAX_ROWS} data records.`);
  }
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (state === "quoted") {
      if (char === '"') {
        if (source[i + 1] === '"') { value += '"'; i++; } else state = "closed";
      } else value += char;
    } else if (char === ",") {
      field();
      if (cells.length >= allowedColumns.size) throw new CsvPreviewError(`Too many columns in record ${record}.`);
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row();
    } else if (char === '"' && state === "start") state = "quoted";
    else if (char === '"' || state === "closed") throw new CsvPreviewError(`Malformed CSV quoting in record ${record}.`);
    else { value += char; state = "plain"; }
  }
  if (state === "quoted") throw new CsvPreviewError(`Unclosed quote in record ${record}.`);
  if (cells.length || value || state !== "start") row();
  return rows;
}

export function previewTradeCsv(source: string): CsvPreview {
  if (new TextEncoder().encode(source).length > CSV_MAX_BYTES) throw new CsvPreviewError("Use a CSV no larger than 256 KiB.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(source)) throw new CsvPreviewError("Use a UTF-8 text CSV without binary or invalid characters.");
  const [header, ...data] = records(source.replace(/^\uFEFF/, ""));
  if (!header) throw new CsvPreviewError("The CSV is empty. Include a header and at least one trade.");
  const names = header.cells.map(name => name.trim());
  if (new Set(names).size !== names.length) throw new CsvPreviewError("Column names must not repeat.");
  const unknown = names.filter(name => !allowedColumns.has(name));
  if (unknown.length) throw new CsvPreviewError(`Unknown columns: ${unknown.map(name => name.slice(0, 40)).join(", ")}. Use the documented RationaleAI headers.`);
  const missing = CSV_REQUIRED_COLUMNS.filter(name => !names.includes(name));
  if (missing.length) throw new CsvPreviewError(`Missing required columns: ${missing.join(", ")}.`);
  if (!data.length) throw new CsvPreviewError("Include at least one trade after the header.");
  const result: CsvPreview = { rows: [], errors: [], total: data.length, ignoredColumns: names.filter(name => (CSV_METADATA_COLUMNS as readonly string[]).includes(name)) };
  const seen = new Map<string, number>();
  for (const { record, cells } of data) {
    try {
      if (cells.length !== names.length) throw new CsvPreviewError(`Expected ${names.length} fields, found ${cells.length}.`);
      const values = Object.fromEntries(names.map((name, index) => [name, cells[index]]));
      const form = new FormData();
      for (const [csv, field] of Object.entries({ symbol: "symbol", direction: "direction", setup: "setup", rationale: "rationale", notes: "notes", entry_price: "entryPrice", exit_price: "exitPrice", quantity: "quantity", recorded_pnl: "pnl", entry_time_utc: "entryTime", exit_time_utc: "exitTime" })) form.set(field, values[csv] ?? "");
      const trade = parseTradeInput(form, "utc-iso");
      const reviewForm = new FormData();
      for (const [csv, field] of Object.entries({ plan_adherence: "planAdherence", review_went_well: "reviewWentWell", review_improve: "reviewImprove" })) reviewForm.set(field, values[csv] ?? "");
      const review = [...reviewForm.values()].some(value => String(value).trim()) ? parseReviewInput(reviewForm) : null;
      const key = JSON.stringify({ trade, review });
      const duplicateOf = seen.get(key);
      if (duplicateOf === undefined) seen.set(key, record);
      result.rows.push({ record, trade, review, duplicateOf });
    } catch (error) {
      result.errors.push({ record, message: error instanceof Error ? error.message : "Invalid trade." });
    }
  }
  return result;
}
