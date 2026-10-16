import { db } from "@/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJournalFilters, type JournalSearchParams } from "@/lib/journal-filters";
import { tradeBreakdown } from "@/lib/trade-metrics";
import { performanceCsv, PERFORMANCE_EXPORT_LIMIT, PerformanceExportLimitError } from "@/lib/performance-csv";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await requireCurrentUser();
  const url = new URL(request.url), params: JournalSearchParams = {};
  // Match the Performance page: only UTC entry dates select this report.
  for (const key of ["from", "to"]) {
    const values = url.searchParams.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  const { filters: period, errors } = parseJournalFilters(params);
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (errors.length) return new Response(errors.join("\n"), {status:400,headers});
  try {
    const groups = await Promise.all((["setup", "symbol", "adherence"] as const).map(async by => ({
      by, rows: await tradeBreakdown(db, user.id, by, period, PERFORMANCE_EXPORT_LIMIT + 1),
    })));
    return new Response(performanceCsv(groups, period), {headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="rationale-performance.csv"'}});
  } catch (error) {
    return new Response(error instanceof PerformanceExportLimitError ? error.message : "Performance export unavailable. Please try again.", {status:error instanceof PerformanceExportLimitError ? 422 : 503,headers});
  }
}
