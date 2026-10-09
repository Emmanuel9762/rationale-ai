import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { trades, users, tradingAccounts } from "../src/db/schema";
import { tradeRepository, EXPORT_LIMIT, ExportLimitError } from "../src/lib/trade-repository";

test("export includes all filtered pages, scopes owners and refuses rather than truncates excess matches", async () => {
  const client=new PGlite(), db=drizzle(client);
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    const owners=await db.insert(users).values([{email:"export@local.test"},{email:"otherexport@local.test"}]).returning();
    const accounts=await db.insert(tradingAccounts).values(owners.map(u=>({userId:u.id,name:"Test",balance:"0"}))).returning();
    const base={accountId:accounts[0].id,symbol:"EURUSD",direction:"LONG",entryPrice:"1",quantity:"1",entryTime:new Date("2026-01-01")};
    await db.insert(trades).values(Array.from({length:26},()=>base));
    await db.insert(trades).values({...base,accountId:accounts[1].id,notes:"Other owner"});
    const repo=tradeRepository(db);assert.equal((await repo.exportRows(owners[0].id,{review:"unreviewed"})).length,26);
    assert.equal((await repo.exportRows(owners[1].id)).length,1);assert.deepEqual(await repo.exportRows(owners[0].id,{symbol:"MISSING"}),[]);
    await client.query("insert into trades(account_id,symbol,direction,entry_price,quantity,entry_time) select $1,'OTHER','LONG',1,1,'2026-01-01'::timestamp from generate_series(1,$2)",[accounts[0].id,EXPORT_LIMIT-26]);
    assert.equal((await repo.exportRows(owners[0].id)).length,EXPORT_LIMIT);
    await db.insert(trades).values({...base,symbol:"OTHER"});
    await assert.rejects(repo.exportRows(owners[0].id),ExportLimitError);
    assert.equal((await repo.exportRows(owners[0].id,{symbol:"EURUSD"})).length,26);
  } finally {await client.close();}
});
