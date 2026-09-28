import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users } from "../src/db/schema";
import { resolveDevelopmentUser } from "../src/lib/auth/development-user";

test("development identity reuses the legacy owner and never provisions outside development", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    for (const environment of ["production", "test", "preview", undefined]) {
      assert.equal(await resolveDevelopmentUser(db, environment), null);
    }
    assert.equal((await db.select().from(users)).length, 0);
    const [legacy] = await db.insert(users).values({ email: "dev@rationale-ai.local" }).returning();
    const identities = await Promise.all(Array.from({ length: 4 }, () => resolveDevelopmentUser(db, "development")));
    assert.ok(identities.every(identity => identity?.id === legacy.id));
    assert.equal((await db.select().from(users)).length, 1);
  } finally { await client.close(); }
});
