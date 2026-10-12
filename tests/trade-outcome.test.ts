import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { trades, users, tradingAccounts, tradeImports, tradeImportRows } from "../src/db/schema";
import { tradeRepository } from "../src/lib/trade-repository";
import { tradeMetrics } from "../src/lib/trade-metrics";
import type { TradeOutcome } from "../src/lib/outcome-labels";

test("outcome filters agree with metrics, exclude incomplete results and scope pagination, exports and batches", async () => {
  const client=new PGlite(), db=drizzle(client);
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    const owners=await db.insert(users).values([{email:"outcome@fixture.test"},{email:"other-outcome@fixture.test"}]).returning();
    const accounts=await db.insert(tradingAccounts).values(owners.map(u=>({userId:u.id,name:"Test",balance:"0"}))).returning();
    const base={accountId:accounts[0].id,symbol:"EURUSD",setup:"Breakout",direction:"LONG",entryPrice:"1",quantity:"1",entryTime:new Date("2026-01-01T12:00:00Z"),exitPrice:"2",exitTime:new Date("2026-01-02T12:00:00Z")};
    const wins=await db.insert(trades).values(Array.from({length:26},()=>({...base,pnl:"0.01"}))).returning();
    const extra=await db.insert(trades).values([
      {...base,pnl:"-0.01"}, {...base,pnl:"0"}, {...base,pnl:null},
      {...base,pnl:"100",exitPrice:null}, {...base,pnl:"-100",exitTime:null},
      {...base,pnl:"0",exitTime:null,exitPrice:null},
      {...base,pnl:"200",accountId:accounts[1].id},
    ]).returning();
    const expected:Record<TradeOutcome,string[]>={win:wins.map(t=>t.id),loss:[extra[0].id],breakeven:[extra[1].id],missing:[extra[2].id],measured:[...wins.map(t=>t.id),extra[0].id,extra[1].id]};
    const repo=tradeRepository(db);
    for(const outcome of Object.keys(expected) as TradeOutcome[]) {
      const filters={outcome,setup:"Breakout",from:"2026-01-01",to:"2026-01-01"};
      const exported=await repo.exportRows(owners[0].id,filters);
      assert.deepEqual(exported.map(t=>t.id).sort(),expected[outcome].sort());
      const first=await repo.list(owners[0].id,1,filters),second=await repo.list(owners[0].id,2,filters);
      assert.deepEqual([...first.trades,...second.trades].map(t=>t.id),exported.map(t=>t.id));
      assert.equal(first.hasNext,expected[outcome].length>25);
      assert.deepEqual(await repo.exportRows(owners[0].id,{outcome,to:"2025-12-31"}),[]);
    }
    const metrics=await tradeMetrics(db,owners[0].id);
    assert.equal(metrics.wins,expected.win.length);assert.equal(metrics.measured,expected.measured.length);assert.equal(metrics.missingPnl,expected.missing.length);assert.equal(metrics.open,3);
    assert.equal((await repo.exportRows(owners[1].id,{outcome:"win"})).length,1);
    const [batch]=await db.insert(tradeImports).values({userId:owners[0].id,accountId:accounts[0].id,payloadHash:"a".repeat(64),rowCount:2}).returning();
    await db.insert(tradeImportRows).values([{importId:batch.id,tradeId:wins[0].id},{importId:batch.id,tradeId:extra[0].id}]);
    assert.deepEqual((await repo.exportRows(owners[0].id,{import:batch.id,outcome:"win"})).map(t=>t.id),[wins[0].id]);
    assert.deepEqual(await repo.exportRows(owners[1].id,{import:batch.id,outcome:"win"}),[]);
  } finally {await client.close();}
});
