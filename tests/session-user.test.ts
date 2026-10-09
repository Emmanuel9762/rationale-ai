import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";
import { resolveSessionUser } from "../src/lib/auth/session-user";
import { legacyLinkSql } from "../src/lib/auth/legacy-link";
import { safeErrorCodes } from "../src/lib/safe-error";

const issuer = "https://test.neon.tech/auth";
const subject = "00000000-0000-4000-8000-000000000001";
test("session identity is stable, issuer scoped, and never claims an email match", async () => {
  const client=new PGlite(); const db=drizzle(client);
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    const [legacy]=await db.insert(users).values({email:"dev@rationale-ai.local"}).returning();
    assert.equal(await resolveSessionUser(db,{subject,issuer,email:legacy.email}),null);
    const identity={subject,issuer,email:"new@example.test"};
    const resolved=await Promise.all(Array.from({length:4},()=>resolveSessionUser(db,identity)));
    assert.equal(new Set(resolved.map(u=>u?.id)).size,1);
    assert.ok(resolved[0]);
    assert.notEqual(resolved[0].id,legacy.id);
    assert.deepEqual(await resolveSessionUser(db,{...identity,email:"changed@example.test"}),resolved[0]);
    assert.equal(await resolveSessionUser(db,{...identity,issuer:"https://other.neon.tech/auth"}),null);
    assert.equal(await resolveSessionUser(db,{...identity,subject:"different"}),null);
  } finally {await client.close();}
});

test("explicit operator link preserves legacy rows and refuses identity takeover", async () => {
  const client=new PGlite(); const db=drizzle(client);
  async function link(who: string) {
    await client.transaction(async tx=>{
      await tx.query("SELECT set_config('rationale.auth_subject',$1,true),set_config('rationale.auth_issuer',$2,true)",[who,issuer]);
      await tx.exec(legacyLinkSql);
    });
  }
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    await client.exec('CREATE SCHEMA neon_auth; CREATE TABLE neon_auth."user" (id uuid primary key, banned boolean)');
    const second="00000000-0000-4000-8000-000000000002";
    await client.query('INSERT INTO neon_auth."user" VALUES ($1,false),($2,false)',[subject,second]);
    const [legacy]=await db.insert(users).values({email:"dev@rationale-ai.local"}).returning();
    const [account]=await db.insert(tradingAccounts).values({userId:legacy.id,name:"Legacy",balance:"42.10",isDefault:true}).returning();
    await db.insert(trades).values({accountId:account.id,symbol:"EURUSD",direction:"LONG",entryPrice:"1",quantity:"1",entryTime:new Date()});
    const before=await db.select().from(trades);
    const fresh=await resolveSessionUser(db,{subject,issuer,email:"new@example.test"});
    assert.notEqual(fresh?.id,legacy.id);
    await assert.rejects(link("00000000-0000-4000-8000-000000000003"));
    const occupied = await resolveSessionUser(db,{subject:second,issuer,email:"occupied@example.test"});
    const [occupiedAccount] = await db.insert(tradingAccounts).values({userId:occupied!.id,name:"Existing journal",balance:"3"}).returning();
    await assert.rejects(link(second), /New identity already owns accounts/);
    await link(subject);
    await link(subject); // Safe repeat.
    await assert.rejects(link(second));
    assert.deepEqual(await resolveSessionUser(db,{subject,issuer,email:"new@example.test"}),{id:legacy.id});
    assert.deepEqual(await db.select().from(trades),before);
    assert.deepEqual((await db.select().from(tradingAccounts)).sort((a,b)=>a.id.localeCompare(b.id)),[account,occupiedAccount].sort((a,b)=>a.id.localeCompare(b.id)));
  } finally {await client.close();}
});
test("migration diagnostics expose codes without credential-bearing error messages",()=>{
  const error={message:"postgresql://secret",code:"42P07",cause:{code:"ECONNREFUSED",message:"password"}};
  assert.deepEqual(safeErrorCodes(error),["42P07","ECONNREFUSED"]);
  assert.deepEqual(safeErrorCodes({code:"postgresql://secret"}),[]);
});
