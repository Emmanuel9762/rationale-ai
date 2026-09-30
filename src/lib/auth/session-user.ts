import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users } from "../../db/schema";

// Identity comes ONLY from a server-validated session. Never link by email.
export async function resolveSessionUser<Q extends PgQueryResultHKT>(
  database: Pick<PgDatabase<Q>, "select" | "insert">,
  identity: { subject: string; issuer: string; email: string },
) {
  if (!identity.subject || identity.subject.length > 255 || !identity.issuer || identity.issuer.length > 512 || !identity.email || identity.email.length > 255) {
    throw new Error("Invalid session identity");
  }
  const scope = and(eq(users.authSubject, identity.subject), eq(users.authIssuer, identity.issuer));
  const [existing] = await database.select({ id: users.id }).from(users).where(scope).limit(1);
  if (existing) return existing;
  await database.insert(users).values({ email: identity.email.toLowerCase(), authSubject: identity.subject, authIssuer: identity.issuer }).onConflictDoNothing();
  const [user] = await database.select({ id: users.id }).from(users).where(scope).limit(1);
  // An existing email is not evidence that this provider identity owns its records.
  return user ?? null;
}
