import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { trades, users, tradingAccounts } from "../src/db/schema";
import { tradeRepository } from "../src/lib/trade-repository";
import { saveOwnedReview } from "../src/lib/trade-review";

test("review queue filters before pagination, excludes open/other-owner trades and removes saved reviews", async () => {
  const client = new PGlite(), db = drizzle(client);
  try {
    await migrate(db, {migrationsFolder:"./drizzle"});
    const owners = await db.insert(users).values([{email:"queue@local.test"},{email:"otherqueue@local.test"}]).returning();
    const accounts = await db.insert(tradingAccounts).values(owners.map(u=>({userId:u.id,name:"Test",balance:"0"}))).returning();
    const base = {accountId:accounts[0].id,symbol:"EURUSD",direction:"LONG",quantity:"1",entryPrice:"1",entryTime:new Date("2026-01-01"),exitPrice:"2",exitTime:new Date("2026-01-02")};
    await db.insert(trades).values(Array.from({length:26},()=>base));
    await db.insert(trades).values([{...base,reviewedAt:new Date()}, {...base,exitPrice:null,exitTime:null}, {...base,exitTime:null}, {...base,accountId:accounts[1].id}]);
    const repo=tradeRepository(db), filter={status:"closed",review:"unreviewed"} as const;
    const page1=await repo.list(owners[0].id,1,filter),page2=await repo.list(owners[0].id,2,filter);
    assert.equal(page1.trades.length,25);assert.equal(page1.hasNext,true);assert.equal(page2.trades.length,1);
    assert.equal(new Set([...page1.trades,...page2.trades].map(t=>t.id)).size,26);
    assert.equal((await repo.list(owners[1].id,1,filter)).trades.length,1);
    await saveOwnedReview(db,owners[0].id,page1.trades[0].id,{planAdherence:"partly",reviewWentWell:"Patience",reviewImprove:null},0);
    const updated=await repo.list(owners[0].id,1,filter);assert.equal(updated.trades.length,25);assert.equal(updated.hasNext,false);
    assert.ok(!updated.trades.some(t=>t.id===page1.trades[0].id));
    assert.equal((await repo.list(owners[0].id,1,{review:"reviewed"})).trades.length,2);
    assert.equal((await repo.list(owners[0].id,1,{status:"open",review:"unreviewed"})).trades.length,2);
    assert.equal((await repo.list(owners[0].id,1,{...filter,symbol:"MISSING"})).trades.length,0);
  } finally {await client.close();}
});
