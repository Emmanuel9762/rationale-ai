import { journalHref, parseJournalFilters, type JournalSearchParams } from "./journal-filters";

// Rebuild a journal-only destination. Never pass a supplied URL to redirect/Link.
export function journalReturnHref(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2048 || !/^\/trades(?:\?|$)/.test(raw) || /[#\r\n\\]/.test(raw)) return "/trades";
  const query = new URLSearchParams(raw.slice("/trades".length));
  const params: JournalSearchParams = Object.create(null);
  for (const key of new Set(query.keys())) {
    const values = query.getAll(key);
    params[key] = values.length === 1 ? values[0] : values;
  }
  const { filters, page, errors } = parseJournalFilters(params);
  return errors.length ? "/trades" : journalHref(filters, page);
}

export function tradeContextHref(id: string, returnTo?: unknown, edit = false) {
  const destination = journalReturnHref(returnTo);
  const query = destination === "/trades" ? "" : `?${new URLSearchParams({returnTo: destination})}`;
  return `/trades/${encodeURIComponent(id)}${edit ? "/edit" : ""}${query}`;
}
