import test from "node:test";
import assert from "node:assert/strict";
import { migrationHistoryStatus } from "../src/lib/migration-history";

test("migration audit distinguishes pending work from conflicting or unknown history", () => {
  const expected=[{hash:"first",folderMillis:100},{hash:"second",folderMillis:200}];
  assert.deepEqual(migrationHistoryStatus(expected,[]),{applied:0,pending:2});
  assert.deepEqual(migrationHistoryStatus(expected,[{hash:"first",created_at:"100"}]),{applied:1,pending:1});
  assert.deepEqual(migrationHistoryStatus(expected,[{hash:"first",created_at:100},{hash:"second",created_at:200}]),{applied:2,pending:0});
  for (const applied of [
    [{hash:"modified",created_at:100}],
    [{hash:"first",created_at:101}],
    [{hash:"second",created_at:200}],
    [{hash:"first",created_at:100},{hash:"second",created_at:200},{hash:"unknown",created_at:300}],
  ]) assert.throws(()=>migrationHistoryStatus(expected,applied));
});
