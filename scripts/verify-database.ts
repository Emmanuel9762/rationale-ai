import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrationHistoryStatus, type AppliedMigration } from "../src/lib/migration-history";
import { safeErrorCodes } from "../src/lib/safe-error";

dotenv.config({ path: ".env.local", quiet: true });
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Missing database configuration.");
  const { db } = await import("../src/db/index");
  const history = await db.execute(sql`select hash, created_at from drizzle.__drizzle_migrations order by id`);
  const expected = readMigrationFiles({migrationsFolder:"./drizzle"});
  let status;
  try { status = migrationHistoryStatus(expected, history.rows as AppliedMigration[]); }
  catch (error) {
    // Only our own history-comparison errors reach this block, never driver errors.
    console.error(error instanceof Error ? error.message : "Migration history mismatch.");
    process.exitCode=1; return;
  }
  console.log(`Migration history: ${status.applied} verified, ${status.pending} pending.`);
  if (status.pending) { console.error("Apply pending migrations on a disposable branch first; see MIGRATIONS.md."); process.exitCode=1; return; }
  const result = await db.execute(sql`
    select
      (select count(*)=6 from information_schema.columns where table_schema='public' and table_name='trade_imports' and is_nullable='NO' and ((column_name in ('id','user_id','account_id') and data_type='uuid') or (column_name='payload_hash' and data_type='character varying' and character_maximum_length=64) or (column_name='row_count' and data_type='integer') or (column_name='created_at' and data_type='timestamp without time zone'))) as import_columns_ok,
      exists(select 1 from pg_index where indexrelid=to_regclass('public.trade_imports_owner_payload_unique') and indrelid=to_regclass('public.trade_imports') and indisvalid and indisunique and indpred is null and pg_get_indexdef(indexrelid) like '%(user_id, payload_hash)%') as import_index_ok,
      (select count(*)=2 from pg_constraint where conrelid=to_regclass('public.trade_imports') and contype='f' and convalidated and conname in ('trade_imports_user_id_users_id_fk','trade_imports_account_id_trading_accounts_id_fk')) as import_foreign_keys_ok,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='trades' and column_name='revision' and data_type='integer' and is_nullable='NO' and column_default='0') as revision_ok,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='trades' and column_name='submission_key' and data_type='uuid' and is_nullable='YES') as submission_key_ok,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='trades' and column_name='submission_hash' and data_type='character varying' and character_maximum_length=64 and is_nullable='YES') as submission_hash_ok,
      exists(select 1 from pg_index where indexrelid=to_regclass('public.trades_account_submission_unique') and indrelid='public.trades'::regclass and indisvalid and indisunique and indpred is null and pg_get_indexdef(indexrelid) like '%(account_id, submission_key)%') as submission_index_ok,
      (select count(*)=3 from information_schema.columns where table_schema='public' and table_name='trades' and is_nullable='YES' and data_type='character varying' and ((column_name='plan_adherence' and character_maximum_length=20) or (column_name in ('review_went_well','review_improve') and character_maximum_length=2000))) as review_text_ok,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='trades' and column_name='reviewed_at' and data_type='timestamp without time zone' and is_nullable='YES') as review_time_ok,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='auth_subject' and data_type='character varying' and character_maximum_length=255) as subject_ok,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='auth_issuer' and data_type='character varying' and character_maximum_length=512) as issuer_ok,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='trading_accounts' and column_name='is_default' and data_type='boolean' and is_nullable='NO') as default_ok,
      exists(select 1 from pg_index where indexrelid=to_regclass('public.users_auth_identity_unique') and indrelid='public.users'::regclass and indisvalid and indisunique and pg_get_indexdef(indexrelid) like '%(auth_issuer, auth_subject)%') as identity_index_ok,
      exists(select 1 from pg_index where indexrelid=to_regclass('public.trading_accounts_one_default_per_user') and indrelid='public.trading_accounts'::regclass and indisvalid and indisunique and pg_get_indexdef(indexrelid) like '%(user_id)%' and pg_get_expr(indpred,indrelid)='(is_default = true)') as default_index_ok
  `);
  if (!Object.values(result.rows[0]).every(value => value === true)) {
    console.error("Required identity/default-account/review/submission/revision/import schema checks failed. Compare the schema before changing anything.");
    process.exitCode=1; return;
  }
  console.log("Required identity/default-account/review/submission/revision/import columns and unique indexes verified. No database writes performed.");
}
main().catch(error => {
  console.error("Database verification failed. Check target branch, connectivity and migration history; do not reset or manufacture ledger entries.");
  const codes=safeErrorCodes(error); if(codes.length)console.error("Diagnostic codes:",codes.join(", "));
  process.exitCode=1;
});
