import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";
import { tradeBreakdown, tradeMetrics, formatPnl } from "../src/lib/trade-metrics";

test("performance groups preserve ownership, lifecycle exclusions, sample sizes and exact totals", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, {migrationsFolder:"./drizzle"});
    const [owner, other] = await db.insert(users).values([{email:"breakdown@test.local"},{email:"private@test.local"}]).returning();
    for (const by of ["setup","symbol"] as const) assert.deepEqual(await tradeBreakdown(db,owner.id,by),[]);
    const accounts = await db.insert(tradingAccounts).values([
      {userId:owner.id,name:"First",balance:"0"},
      {userId:owner.id,name:"Second",balance:"0"},
      {userId:other.id,name:"Private",balance:"0"},
    ]).returning();
    const base = {accountId:accounts[0].id,symbol:"EURUSD",setup:"Breakout",direction:"LONG",entryPrice:"1",quantity:"1",entryTime:new Date("2026-01-01T12:00:00Z")};
    const close = {exitPrice:"2",exitTime:new Date("2026-01-01T13:00:00Z")};
    await db.insert(trades).values([
      {...base,...close,pnl:"0.10"},
      {...base,...close,accountId:accounts[1].id,symbol:"eurusd",setup:" Breakout ",pnl:"0.20"},
      {...base,...close,pnl:"-0.10"},
      {...base,...close,pnl:"0.00"},
      {...base,...close},
      {...base,pnl:"999"},
      {...base,exitPrice:"2",pnl:"999"},
      {...base,exitTime:close.exitTime,pnl:"999"},
      {...base,symbol:"GBPUSD",setup:null},
      {...base,symbol:"GBPUSD",setup:"   "},
      {...base,symbol:"GBPUSD",setup:"Not specified"},
      {...base,...close,accountId:accounts[2].id,pnl:"50000"},
      {...base,...close,accountId:accounts[2].id,setup:"SECRET_SETUP",symbol:"SECRET",pnl:"80000"},
    ]);
    const setups = await tradeBreakdown(db,owner.id,"setup");
    const breakout = setups.find(row=>row.group==="Breakout")!;
    assert.equal(breakout.total,8);assert.equal(breakout.closed,5);
    assert.equal(breakout.open,3);assert.equal(breakout.missingPnl,1);
    assert.equal(breakout.measured,4);assert.equal(breakout.wins,2);
    assert.equal(breakout.winRate,"50.0%");assert.equal(breakout.pnl,"0.20");
    assert.equal(setups.find(row=>row.group===null)?.total,2);
    assert.equal(setups.find(row=>row.group==="Not specified")?.total,1);
    const symbols = await tradeBreakdown(db,owner.id,"symbol");
    assert.equal(symbols.length,2);
    assert.deepEqual(symbols.find(row=>row.group==="EURUSD"),{...breakout,group:"EURUSD"});
    const unmeasured = symbols.find(row=>row.group==="GBPUSD")!;
    assert.equal(unmeasured.measured,0);assert.equal(unmeasured.winRate,"—");
    for(const rows of [setups,symbols]) {
      assert.ok(!rows.some(row=>row.group?.includes("SECRET")));
      const overall = await tradeMetrics(db,owner.id);
      for(const field of ["total","closed","open","measured","missingPnl","wins"] as const) {
        assert.equal(rows.reduce((sum,row)=>sum+row[field],0),overall[field]);
      }
    }
    assert.equal((await tradeBreakdown(db,other.id,"setup")).find(row=>row.group==="Breakout")?.pnl,"50000.00");
    // PostgreSQL must sum decimals before formatting, even beyond safe JS cents.
    await db.insert(trades).values(Array.from({length:101},()=>({...base,...close,setup:"Precision",symbol:"BIG",pnl:"999999999999.99"})));
    const large = (await tradeBreakdown(db,owner.id,"setup")).find(row=>row.group==="Precision")!;
    assert.equal(large.pnl,"100999999999998.99");
    assert.equal(formatPnl(large.pnl),"100,999,999,999,998.99");
    assert.equal(large.measured,101);assert.equal(large.winRate,"100.0%");
  } finally { await client.close(); }
});


test("performance periods use inclusive UTC entry dates before aggregation and retain owner scope", async () => {
  const client = new PGlite(); const db = drizzle(client);
  try {
    await migrate(db, {migrationsFolder:"./drizzle"});
    const owners = await db.insert(users).values([{email:"period@test.local"},{email:"period-other@test.local"}]).returning();
    const accounts = await db.insert(tradingAccounts).values(owners.map(owner=>({userId:owner.id,name:"Test",balance:"0"}))).returning();
    const base = {accountId:accounts[0].id,symbol:"EURUSD",setup:"Range",direction:"LONG",entryPrice:"1",quantity:"1",exitPrice:"2",exitTime:new Date("2026-03-02T00:00:00Z")};
    await db.insert(trades).values([
      {...base,entryTime:new Date("2026-02-27T23:59:59.999Z"),pnl:"100"},
      {...base,entryTime:new Date("2026-02-28T00:00:00Z"),pnl:"0.10"},
      {...base,entryTime:new Date("2026-02-28T23:59:59.999Z"),pnl:"-0.20"},
      {...base,entryTime:new Date("2026-03-01T00:00:00Z"),pnl:"200"},
      {...base,accountId:accounts[1].id,entryTime:new Date("2026-02-28T12:00:00Z"),pnl:"999"},
      {...base,entryTime:new Date("2026-02-28T12:00:00Z"),exitPrice:null,exitTime:null,pnl:null},
    ]);
    for (const by of ["setup","symbol"] as const) {
      const [row] = await tradeBreakdown(db,owners[0].id,by,{from:"2026-02-28",to:"2026-02-28"});
      assert.equal(row.total,3);assert.equal(row.measured,2);assert.equal(row.open,1);
      assert.equal(row.pnl,"-0.10");assert.equal(row.winRate,"50.0%");
      assert.equal((await tradeBreakdown(db,owners[0].id,by,{from:"2026-03-01"}))[0].total,1);
      assert.equal((await tradeBreakdown(db,owners[0].id,by,{to:"2026-02-27"}))[0].total,1);
      assert.deepEqual(await tradeBreakdown(db,owners[0].id,by,{from:"2027-01-01"}),[]);
      assert.equal((await tradeBreakdown(db,owners[0].id,by))[0].total,5);
    }
  } finally {await client.close();}
});
