export type JournalSearchParams = Record<string, string | string[] | undefined>;
export type JournalFilters = {
  symbol?: string;
  direction?: "LONG" | "SHORT";
  status?: "open" | "closed";
  from?: string;
  to?: string;
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseJournalFilters(params: JournalSearchParams) {
  const errors: string[] = [];
  const value = (key: string) => {
    const raw = params[key];
    if (Array.isArray(raw)) { errors.push(`Use only one ${key} value.`); return ""; }
    return raw?.trim() ?? "";
  };
  const filters: JournalFilters = {};
  const symbol = value("symbol").toUpperCase();
  if (symbol.length > 20) errors.push("Symbol must be 20 characters or fewer.");
  else if (symbol) filters.symbol = symbol;
  const direction = value("direction");
  if (direction === "LONG" || direction === "SHORT") filters.direction = direction;
  else if (direction) errors.push("Choose Long, Short, or all directions.");
  const status = value("status");
  if (status === "open" || status === "closed") filters.status = status;
  else if (status) errors.push("Choose Open / incomplete, Closed, or all statuses.");
  for (const key of ["from", "to"] as const) {
    const date = value(key);
    if (date && !validDate(date)) errors.push(`Enter a valid ${key} date (YYYY-MM-DD).`);
    else if (date) filters[key] = date;
  }
  if (filters.from && filters.to && filters.from > filters.to) errors.push("The from date must not be after the to date.");
  const rawPage = value("page");
  const page = /^\d+$/.test(rawPage) ? Math.min(100000, Math.max(1, Number(rawPage))) : 1;
  return { filters, page, errors };
}

export function journalHref(filters: JournalFilters, page = 1) {
  const params = new URLSearchParams();
  for (const key of ["symbol", "direction", "status", "from", "to"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/trades${query ? `?${query}` : ""}`;
}
