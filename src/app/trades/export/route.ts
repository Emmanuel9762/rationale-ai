import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJournalFilters, type JournalSearchParams } from "@/lib/journal-filters";
import { ExportLimitError, tradeRepository } from "@/lib/trade-repository";
import { tradesCsv } from "@/lib/trade-csv";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await requireCurrentUser();
  const url = new URL(request.url), params: JournalSearchParams = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key); params[key] = values.length === 1 ? values[0] : values;
  }
  const { filters, errors } = parseJournalFilters(params);
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (errors.length) return new Response(errors.join("\n"), {status:400,headers});
  try {
    const rows = await tradeRepository(db).exportRows(user.id,filters);
    return new Response(tradesCsv(rows), {headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="rationale-trades.csv"'}});
  } catch (error) {
    return new Response(error instanceof ExportLimitError ? error.message : "Export unavailable. Please try again.", {status:error instanceof ExportLimitError ? 422 : 503,headers});
  }
}
