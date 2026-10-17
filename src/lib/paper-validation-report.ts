import { csvCell } from "./csv-cell";
import type { mapPaperCsv } from "./paper-csv";

// A diagnostic file, deliberately separate from the importable trade CSV.
export function paperValidationReport(preview: ReturnType<typeof mapPaperCsv>["preview"]): string {
  const records = [
    ...preview.rows.map(row => ({record:row.record,
      status:row.duplicateOf === undefined ? "valid" : "repeated",
      duplicateOf:row.duplicateOf === undefined ? "" : String(row.duplicateOf),
      message:row.duplicateOf === undefined ? "Validated; not imported." : "Matches an earlier valid record in this file; retained, not imported."})),
    ...preview.errors.map(row => ({record:row.record, status:"invalid", duplicateOf:"", message:row.message})),
  ].sort((a,b) => a.record - b.record);
  return [
    ["source_record", "status", "duplicate_of", "message"],
    ...records.map(row => [String(row.record), row.status, row.duplicateOf, row.message]),
  ].map(row => row.map(value => csvCell(value)).join(",")).join("\r\n") + "\r\n";
}
