export type EntryPeriod = { from?: string; to?: string };

export function monthEntryPeriod(month: string | null, period: EntryPeriod = {}): Required<EntryPeriod> {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000")) throw new Error("Invalid entry month.");
  const start = `${month}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const last = end.toISOString().slice(0,10);
  const from = period.from && period.from > start ? period.from : start;
  const to = period.to && period.to < last ? period.to : last;
  if (from > to) throw new Error("Entry month is outside the selected period.");
  return {from,to};
}
