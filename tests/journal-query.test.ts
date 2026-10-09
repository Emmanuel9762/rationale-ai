import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";
import { tradeRepository } from "../src/lib/trade-repository";

test("journal combines filters before pagination and preserves ownership and UTC day boundaries", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    const owners = await db.insert(users).values([{email:"filter@test.local"},{email:"other-filter@test.local"}]).returning();
    const accounts = await db.insert(tradingAccounts).values(owners.map(u=>({userId:u.id,name:"Test",balance:"0"}))).returning();
    const base = {accountId:accounts[0].id,symbol:"EURUSD",direction:"LONG",entryPrice:"1",quantity:"1",entryTime:new Date("2026-01-02T12:00:00Z")};
    const matches = await db.insert(trades).values(Array.from({length:26},(_,i)=>({...base,symbol:i%2?"eurusd":"EURUSD"}))).returning();
    const extra = await db.insert(trades).values([
      {...base,symbol:"OTHER"},
      {...base,direction:"SHORT"},
      {...base,exitPrice:"2",exitTime:new Date("2026-01-03T00:00:00Z")},
      {...base,entryTime:new Date("2026-01-01T23:59:59.999Z")},
      {...base,entryTime:new Date("2026-01-03T00:00:00Z")},
      {...base,accountId:accounts[1].id},
      {...base,symbol:"INCOMPLETE",exitPrice:"2"},
      {...base,symbol:"INCOMPLETE",exitTime:new Date("2026-01-03T00:00:00Z")},
      {...base,symbol:"%_"},
      {...base,symbol:"BOUNDARY",entryTime:new Date("2026-01-02T00:00:00Z")},
      {...base,symbol:"BOUNDARY",entryTime:new Date("2026-01-02T23:59:59.999Z")},
    ]).returning();
    const repo=tradeRepository(db), owner=owners[0].id;
    const filters={symbol:"EURUSD",direction:"LONG",status:"open",from:"2026-01-02",to:"2026-01-02"} as const;
    const first=await repo.list(owner,1,filters), second=await repo.list(owner,2,filters);
    assert.equal(first.trades.length,25);assert.equal(first.hasNext,true);
    assert.equal(second.trades.length,1);assert.equal(second.hasNext,false);
    assert.deepEqual([...first.trades,...second.trades].map(t=>t.id),matches.map(t=>t.id).sort().reverse());
    assert.equal((await repo.list(owners[1].id,1,filters)).trades.length,1);
    assert.deepEqual((await repo.list(owner,1,{status:"closed"})).trades.map(t=>t.id),[extra[2].id]);
    assert.equal((await repo.list(owner,1,{symbol:"INCOMPLETE",status:"open"})).trades.length,2);
    assert.equal((await repo.list(owner,1,{symbol:"INCOMPLETE",status:"closed"})).trades.length,0);
    assert.deepEqual((await repo.list(owner,1,{direction:"SHORT"})).trades.map(t=>t.id),[extra[1].id]);
    assert.equal((await repo.list(owner,1,{symbol:"BOUNDARY",from:"2026-01-02",to:"2026-01-02"})).trades.length,2);
    assert.deepEqual((await repo.list(owner,1,{symbol:"%_"})).trades.map(t=>t.id),[extra[8].id],"symbol is literal, not a wildcard pattern");
    assert.deepEqual(await repo.list(owner,1,{symbol:"' OR 1=1 --"}),{trades:[],hasNext:false});
    assert.equal((await repo.list(owner,1,{to:"2026-01-01"})).trades.length,1);
    assert.equal((await repo.list(owner,1,{from:"2026-01-03"})).trades.length,1);
  } finally { await client.close(); }
});
