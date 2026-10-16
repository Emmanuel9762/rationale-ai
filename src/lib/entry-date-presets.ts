export function entryDatePresets(now: Date) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const daysAgo = (days: number) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - days);
    return iso(date);
  };
  const monthStart = new Date(today);
  monthStart.setUTCDate(1);
  const previousEnd = new Date(monthStart);
  previousEnd.setUTCDate(0);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(1);
  return [
    { label: "Last 7 days", from: daysAgo(6), to: iso(today) },
    { label: "Last 30 days", from: daysAgo(29), to: iso(today) },
    { label: "This month", from: iso(monthStart), to: iso(today) },
    { label: "Last month", from: iso(previousStart), to: iso(previousEnd) },
  ];
}
