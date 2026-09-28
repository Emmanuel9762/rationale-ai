export class TradeInputError extends Error {}

export function parseTradeInput(formData: FormData) {
  function text(name: string, max: number, required = false) {
    const raw = formData.get(name);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (required && !value) throw new TradeInputError(`${name} is required`);
    if (value.length > max) throw new TradeInputError(`${name} must be ${max} characters or fewer`);
    return value || null;
  }
  function decimal(name: string, scale: number, required = false, positive = false) {
    const value = text(name, 40, required);
    if (value === null) return null;
    const pattern = new RegExp(`^-?\\d{1,${14 - scale}}(?:\\.\\d{1,${scale}})?$`);
    if (!pattern.test(value)) throw new TradeInputError(`${name} must be a decimal with at most ${14 - scale} integer digits and ${scale} decimal places`);
    if (positive && Number(value) <= 0) throw new TradeInputError(`${name} must be greater than zero`);
    return value;
  }
  function date(name: string, required = false) {
    const value = text(name, 16, required);
    if (!value) return null;
    const date = new Date(`${value}:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== value) {
      throw new TradeInputError(`${name} must be a valid UTC date and time`);
    }
    return date;
  }
  const symbol = text("symbol", 20, true)!.toUpperCase();
  const direction = text("direction", 5, true)!;
  if (!["LONG", "SHORT"].includes(direction)) throw new TradeInputError("direction must be LONG or SHORT");
  const entryPrice = decimal("entryPrice", 6, true, true)!;
  const quantity = decimal("quantity", 6, true, true)!;
  const exitPrice = decimal("exitPrice", 6, false, true);
  const pnl = decimal("pnl", 2);
  const entryTime = date("entryTime", true)!;
  const exitTime = date("exitTime");
  if ((exitPrice === null) !== (exitTime === null)) throw new TradeInputError("Provide both exit price and exit time to close a trade");
  if (exitTime && exitTime < entryTime) throw new TradeInputError("exitTime cannot be before entryTime");
  if (!exitTime && pnl !== null) throw new TradeInputError("P&L can only be recorded for a closed trade");
  return { symbol, direction, entryPrice, quantity, exitPrice, pnl, entryTime, exitTime,
    setup: text("setup", 100), rationale: text("rationale", 2000), notes: text("notes", 2000) };
}
export type TradeInput = ReturnType<typeof parseTradeInput>;
export type TradeFormState = { error: string };
