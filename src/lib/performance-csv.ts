import { csvCell } from "./csv-cell";
import type { tradeBreakdown } from "./trade-metrics";
import type { TradeGroupDimension } from "./trade-group";
import type { JournalFilters } from "./journal-filters";

export const PERFORMANCE_EXPORT_LIMIT = 2000;
export class PerformanceExportLimitError extends Error {}
export type PerformanceExportGroup = { by: TradeGroupDimension; rows: Awaited<ReturnType<typeof tradeBreakdown>> };
export function performanceCsv(groups: PerformanceExportGroup[], period: Pick<JournalFilters, "from" | "to">) {
  if (groups.reduce((sum, group) => sum + group.rows.length, 0) > PERFORMANCE_EXPORT_LIMIT) {
    throw new PerformanceExportLimitError(`More than ${PERFORMANCE_EXPORT_LIMIT} performance groups match. Narrow the dates before exporting.`);
  }
  const header = ["dimension", "group", "missing_label", "entry_from_utc", "entry_through_utc", "total_trades", "open_incomplete", "closed_without_pnl", "measured_trades", "wins", "losses", "break_even", "win_rate", "recorded_pnl", "average_pnl", "average_win", "average_loss", "profit_factor"];
  const rows = groups.flatMap(({by, rows}) => rows.map(row => [
    ...[by, row.group, row.group === null ? "true" : "false", period.from ?? null, period.to ?? null].map(value => csvCell(value)),
    ...[row.total, row.open, row.missingPnl, row.measured, row.wins, row.losses, row.breakeven].map(value => csvCell(String(value), false)),
    ...[row.winRate === "—" ? null : row.winRate, row.measured ? row.pnl : null, row.averagePnl, row.averageWin, row.averageLoss, row.profitFactor === "—" ? null : row.profitFactor].map(value => csvCell(value, false)),
  ].join(",")));
  return "\uFEFF" + [header.map(value => csvCell(value)).join(","), ...rows].join("\r\n") + "\r\n";
}
