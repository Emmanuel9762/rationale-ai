import { csvCell } from "./csv-cell";
import { CSV_REQUIRED_COLUMNS, CsvPreviewError, previewTradeCsv, readCsvRecords } from "./trade-csv-preview";

export const PAPER_FIELDS = [
  ...CSV_REQUIRED_COLUMNS, "exit_price", "exit_time_utc", "recorded_pnl", "setup", "rationale", "notes",
] as const;
export type PaperField = typeof PAPER_FIELDS[number];
export const PAPER_LABELS: Record<PaperField, string> = {
  symbol:"Symbol", direction:"Direction", entry_price:"Entry price", quantity:"Quantity",
  entry_time_utc:"Entry time (UTC)", exit_price:"Exit price", exit_time_utc:"Exit time (UTC)",
  recorded_pnl:"Recorded P&L", setup:"Setup", rationale:"Rationale", notes:"Notes",
};
export type PaperMapping = Partial<Record<PaperField, number>>;
const numbers = new Set<PaperField>(["entry_price", "quantity", "exit_price", "recorded_pnl"]);

export function inspectPaperCsv(source: string) {
  const [header, ...rows] = readCsvRecords(source);
  if (!header || !rows.length) throw new CsvPreviewError("Include a header and at least one trade.");
  const headers = header.cells.map(value => value.trim());
  if (headers.some(value => !value || value.length > 100)) throw new CsvPreviewError("Use non-empty column names of at most 100 characters.");
  if (new Set(headers).size !== headers.length) throw new CsvPreviewError("Column names must not repeat.");
  return { headers, rows };
}

export function mapPaperCsv(source: string, mapping: PaperMapping, directionFormat: "long-short" | "buy-sell", acknowledged: boolean) {
  if (!acknowledged) throw new CsvPreviewError("Confirm that each row is one journal trade and amounts use your account currency.");
  if (!["long-short", "buy-sell"].includes(directionFormat)) throw new CsvPreviewError("Choose a supported direction format.");
  const { headers, rows } = inspectPaperCsv(source);
  for (const field of CSV_REQUIRED_COLUMNS) if (mapping[field] === undefined) throw new CsvPreviewError(`Map the required field: ${PAPER_LABELS[field]}.`);
  const selected = Object.entries(mapping);
  if (selected.some(([field,index]) => !(PAPER_FIELDS as readonly string[]).includes(field) || !Number.isInteger(index) || index! < 0 || index! >= headers.length)) throw new CsvPreviewError("Choose an existing source column for each mapped field.");
  if (new Set(selected.map(([,index])=>index)).size !== selected.length) throw new CsvPreviewError("Map each source column only once.");
  // Reject shape errors before conversion; never silently drop extra cells.
  for (const row of rows) if (row.cells.length !== headers.length) throw new CsvPreviewError(`Record ${row.record}: expected ${headers.length} fields, found ${row.cells.length}.`);
  const fields = PAPER_FIELDS.filter(field => mapping[field] !== undefined);
  const csv = [
    fields.map(field => csvCell(field)).join(","),
    ...rows.map(row => fields.map(field => {
      let value = row.cells[mapping[field]!];
      if (field === "direction") {
        value = value.trim().toUpperCase();
        if (directionFormat === "buy-sell") value = value === "BUY" ? "LONG" : value === "SELL" ? "SHORT" : "INVALID";
      }
      // Text is spreadsheet-safe in both the preview and the downloaded file.
      return csvCell(value, !numbers.has(field));
    }).join(",")),
  ].join("\r\n") + "\r\n";
  const preview = previewTradeCsv(csv);
  const originalRecord = (record: number) => rows[record - 2].record;
  return {
    csv,
    preview: {...preview,
      rows: preview.rows.map(row => ({...row,record:originalRecord(row.record),duplicateOf:row.duplicateOf === undefined ? undefined : originalRecord(row.duplicateOf)})),
      errors: preview.errors.map(error => ({...error,record:originalRecord(error.record)})),
    },
    ignoredHeaders: headers.filter((_,index)=>!selected.some(([,selectedIndex])=>selectedIndex===index)),
  };
}
