export type ExpectedMigration = { hash: string; folderMillis: number };
export type AppliedMigration = { hash: string; created_at: string | number };

// A matching prefix may be safely followed by new migrations; any other history
// needs investigation. Never create ledger rows to silence a mismatch.
export function migrationHistoryStatus(expected: ExpectedMigration[], applied: AppliedMigration[]) {
  if (applied.length > expected.length) throw new Error("Database contains migrations absent from this checkout.");
  for (let i = 0; i < applied.length; i++) {
    if (applied[i].hash !== expected[i].hash || Number(applied[i].created_at) !== expected[i].folderMillis) {
      throw new Error(`Migration history mismatch at entry ${i + 1}.`);
    }
  }
  return { applied: applied.length, pending: expected.length - applied.length };
}
