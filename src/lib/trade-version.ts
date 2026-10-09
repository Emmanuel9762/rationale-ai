import { TradeInputError } from "./trade-input";

export class TradeConflictError extends Error {
  constructor() { super("This trade or its review changed after you opened the form. Your changes were not saved. Copy anything you want to keep, then load the latest saved version and apply your changes again."); }
}
export function checkRevision(revision: number) {
  if (!Number.isInteger(revision) || revision < 0 || revision >= 2147483647) throw new TradeInputError("Invalid form revision. Reload the trade before saving.");
  return revision;
}
export function parseRevision(data: FormData) {
  const values = data.getAll("revision");
  if (values.length !== 1 || typeof values[0] !== "string" || !/^(0|[1-9]\d{0,9})$/.test(values[0])) throw new TradeInputError("Invalid form revision. Reload the trade before saving.");
  return checkRevision(Number(values[0]));
}
// Carry only editable text fields back through a full-page form response.
export function draftValues(data: FormData, fields: string[]) {
  return Object.fromEntries(fields.map(name => [name, typeof data.get(name) === "string" ? String(data.get(name)).slice(0, 4000) : ""]));
}
