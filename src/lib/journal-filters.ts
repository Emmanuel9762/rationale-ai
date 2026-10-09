import { isPlanAdherenceGroup, type PlanAdherenceGroup } from "./plan-adherence";
import type { TradeGroupDimension } from "./trade-group";

export type JournalSearchParams = Record<string, string | string[] | undefined>;
export type JournalFilters = {
  symbol?: string;
  setup?: string;
  missing?: "setup" | "symbol";
  direction?: "LONG" | "SHORT";
  status?: "open" | "closed";
  review?: "reviewed" | "unreviewed";
  adherence?: PlanAdherenceGroup;
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
  const value = (key: string, label = false) => {
    const raw = params[key];
    if (Array.isArray(raw)) { errors.push(`Use only one ${key} value.`); return ""; }
    // Label keys mirror PostgreSQL btrim, which removes ordinary spaces only.
    return raw === undefined ? "" : label ? raw.replace(/^ +| +$/g, "") : raw.trim();
  };
  const filters: JournalFilters = {};
  const symbol = value("symbol", true).toUpperCase();
  if (symbol.length > 20) errors.push("Symbol must be 20 characters or fewer.");
  else if (symbol) filters.symbol = symbol;
  const setup = value("setup", true);
  if (setup.length > 100) errors.push("Setup must be 100 characters or fewer.");
  else if (setup) filters.setup = setup;
  const missing = value("missing");
  if (missing === "setup" || missing === "symbol") filters.missing = missing;
  else if (missing) errors.push("Choose a missing setup, missing symbol, or no missing-label filter.");
  if ((missing === "setup" && setup) || (missing === "symbol" && symbol)) errors.push("Remove the exact label before filtering for that missing label.");
  const direction = value("direction");
  if (direction === "LONG" || direction === "SHORT") filters.direction = direction;
  else if (direction) errors.push("Choose Long, Short, or all directions.");
  const status = value("status");
  if (status === "open" || status === "closed") filters.status = status;
  else if (status) errors.push("Choose Open / incomplete, Closed, or all statuses.");
  const review = value("review");
  if (review === "reviewed" || review === "unreviewed") filters.review = review;
  else if (review) errors.push("Choose Reviewed, Unreviewed, or all reviews.");
  const adherence = value("adherence");
  if (isPlanAdherenceGroup(adherence)) filters.adherence = adherence;
  else if (adherence) errors.push("Choose a valid plan adherence group.");
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
  for (const key of ["symbol", "setup", "missing", "direction", "status", "review", "adherence", "from", "to"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/trades${query ? `?${query}` : ""}`;
}

export function breakdownJournalHref(by: TradeGroupDimension, group: string | null, period: Pick<JournalFilters, "from" | "to">) {
  if (by === "adherence") {
    if (!isPlanAdherenceGroup(group)) throw new Error("Invalid plan adherence group.");
    return journalHref({ from: period.from, to: period.to, adherence: group });
  }
  return journalHref({ from: period.from, to: period.to, ...(group === null ? { missing: by } : { [by]: group }) });
}
