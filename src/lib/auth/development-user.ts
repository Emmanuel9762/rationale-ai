import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users } from "../../db/schema";

const DEVELOPMENT_EMAIL = "dev@rationale-ai.local";

// Temporary local-only identity. Never treat this as a production session.
export async function resolveDevelopmentUser<Q extends PgQueryResultHKT>(
  database: Pick<PgDatabase<Q>, "select" | "insert">,
  environment: string | undefined,
): Promise<{ id: string; mode: "development" } | null> {
  if (environment !== "development") return null;
  const [existing] = await database.select({ id: users.id }).from(users)
    .where(eq(users.email, DEVELOPMENT_EMAIL)).limit(1);
  if (existing) return { id: existing.id, mode: "development" };
  await database.insert(users).values({ email: DEVELOPMENT_EMAIL })
    .onConflictDoNothing({ target: users.email });
  const [user] = await database.select({ id: users.id }).from(users)
    .where(eq(users.email, DEVELOPMENT_EMAIL)).limit(1);
  if (!user) throw new Error("Unable to resolve development user");
  return { id: user.id, mode: "development" };
}
