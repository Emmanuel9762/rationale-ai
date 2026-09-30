import { safeErrorCodes } from "../src/lib/safe-error";
import dotenv from "dotenv";
import { migrate } from "drizzle-orm/neon-http/migrator";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  // Dynamic import ensures environment loading precedes connection creation.
  // Reuse the application's verified IPv4 HTTP transport.
  const { db } = await import("../src/db/index");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied successfully.");
}

main().catch((error: unknown) => {
  const codes = safeErrorCodes(error);
  if (codes.length) console.error("Diagnostic codes:", codes.join(", "));
  // Driver errors can contain connection details. Keep credentials out of logs.
  console.error("Migration failed. Check connectivity and migration history before retrying; do not reset the database.");
  process.exitCode = 1;
});
