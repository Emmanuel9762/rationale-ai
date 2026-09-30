import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { authConfig } from "../src/lib/auth/config";
import { legacyLinkSql } from "../src/lib/auth/legacy-link";
dotenv.config({ path: ".env.local", quiet: true });
async function main() {
  const subject = process.argv[2];
  if (!subject || !/^[0-9a-f-]{36}$/i.test(subject)) throw new Error("Usage: npm run auth:link-legacy -- <account-reference>");
  const { baseUrl } = authConfig();
  const { db } = await import("../src/db/index");
  // Neon HTTP batch is one transaction; both settings expire on commit/rollback.
  await db.batch([
    db.execute(sql`select set_config('rationale.auth_subject', ${subject}, true), set_config('rationale.auth_issuer', ${baseUrl}, true)`),
    db.execute(sql.raw(legacyLinkSql)),
  ]);
  console.log("Legacy journal linked. Refresh the app; existing accounts and trades were not moved or deleted.");
}
main().catch(() => {
  console.error("Link refused. Check the branch, account reference, and whether either identity already owns a journal. No partial link was committed.");
  process.exitCode=1;
});
