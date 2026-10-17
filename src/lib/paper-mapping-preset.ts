import { CSV_REQUIRED_COLUMNS } from "./trade-csv-preview";
import { PAPER_FIELDS, type PaperMapping } from "./paper-csv";

export const PRESET_MAX_BYTES = 16 * 1024;
type Direction = "long-short" | "buy-sell";

// Persist names rather than positions: an exporter may reorder its columns.
export function readMappingPreset(text: string, headers: string[]): { mapping: PaperMapping; direction: Direction } {
  if (new TextEncoder().encode(text).length > PRESET_MAX_BYTES) throw new Error("Mapping files must be no larger than 16 KiB.");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("Choose a valid mapping JSON file."); }
  if (!value || value.version !== 1 || !["long-short", "buy-sell"].includes(value.direction) ||
      !value.fields || typeof value.fields !== "object" || Array.isArray(value.fields) ||
      Object.keys(value).some(key => !["version", "direction", "fields"].includes(key))) {
    throw new Error("Unsupported mapping file. Use a version 1 Rationale mapping.");
  }
  const mapping: PaperMapping = {};
  const selected = new Set<string>();
  for (const [field, header] of Object.entries(value.fields)) {
    if (!(PAPER_FIELDS as readonly string[]).includes(field) || typeof header !== "string" ||
        !header || header.length > 100 || selected.has(header)) throw new Error("Mapping fields must use distinct, supported column names.");
    if (headers.filter(name => name === header).length !== 1) throw new Error(`Source column missing or ambiguous: ${header}. Review this file's columns.`);
    selected.add(header);
    mapping[field as keyof PaperMapping] = headers.indexOf(header);
  }
  if (CSV_REQUIRED_COLUMNS.some(field => mapping[field] === undefined)) throw new Error("Mapping file must include every required journal field.");
  return { mapping, direction: value.direction };
}

export function writeMappingPreset(headers: string[], mapping: PaperMapping, direction: Direction): string {
  const fields = Object.fromEntries(Object.entries(mapping).map(([field, index]) => {
    if (!Number.isInteger(index) || index! < 0 || index! >= headers.length) throw new Error("Choose an existing source column.");
    return [field, headers[index!]];
  }));
  const text = JSON.stringify({ version: 1, direction, fields }, null, 2) + "\n";
  readMappingPreset(text, headers);
  return text;
}
