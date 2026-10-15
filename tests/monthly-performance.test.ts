import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";
import { monthEntryPeriod } from "../src/lib/entry-period";
import { tradeBreakdown } from "../src/lib/trade-metrics";
import { tradeRepository } from "../src/lib/trade-repository";
import { breakdownJournalHref, parseJournalFilters } from "../src/lib/journal-filters";

test("month drill-downs intersect selected dates and handle leap years and year boundaries", () => {
  assert.deepEqual(monthEntryPeriod("2024-02"),{from:"2024-02-01",to:"2024-02-29"});
  assert.deepEqual(monthEntryPeriod("2023-02"),{from:"2023-02-01",to:"2023-02-28"});
  assert.deepEqual(monthEntryPeriod("2026-12"),{from:"2026-12-01",to:"2026-12-31"});
  assert.deepEqual(monthEntryPeriod("2024-02",{from:"2024-02-10",to:"2024-03-05"}),{from:"2024-02-10",to:"2024-02-29"});
  assert.deepEqual(monthEntryPeriod("2024-03",{from:"2024-02-10",to:"2024-03-05"}),{from:"2024-03-01",to:"2024-03-05"});
  assert.deepEqual(monthEntryPeriod("0001-01"),{from:"0001-01-01",to:"0001-01-31"});
  for(const month of [null,"2024-13","0000-01","2024-2","2024-02-01"]) assert.throws(()=>monthEntryPeriod(month));
  assert.throws(()=>monthEntryPeriod("2024-02",{from:"2024-03-01"}));
});

test("monthly aggregates use UTC entries, omit empty months and match partial-period journal subsets", async () => {
  const client=new PGlite(), db=drizzle(client);
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    const owners=await db.insert(users).values([{email:"monthly@local.test"},{email:"other-monthly@local.test"}]).returning();
    const accounts=await db.insert(tradingAccounts).values(owners.map(u=>({userId:u.id,name:"Test",balance:"0"}))).returning();
    const base={accountId:accounts[0].id,symbol:"MONTH",direction:"LONG",entryPrice:"1",quantity:"1",exitPrice:"2",exitTime:new Date("2024-04-01T00:00Z")};
    await db.insert(trades).values([
      {...base,entryTime:new Date("2023-12-31T23:59:59.999Z"),pnl:"100"},
      {...base,entryTime:new Date("2024-02-01T00:00Z"),pnl:"100"},
      {...base,entryTime:new Date("2024-02-29T23:59:59.999Z"),pnl:"0.10"},
      {...base,entryTime:new Date("2024-03-01T00:00Z"),pnl:"-0.20"},
      {...base,entryTime:new Date("2024-03-05T23:59:59.999Z"),pnl:"0"},
      {...base,entryTime:new Date("2024-03-06T00:00Z"),pnl:"200"},
      {...base,entryTime:new Date("2024-03-01T01:00Z"),exitPrice:null,exitTime:null},
      {...base,accountId:accounts[1].id,entryTime:new Date("2024-03-01T00:00Z"),pnl:"999"},
    ]);
    const all=await tradeBreakdown(db,owners[0].id,"month");
    assert.deepEqual(all.map(r=>r.group),["2023-12","2024-02","2024-03"]);
    const period={from:"2024-02-10",to:"2024-03-05"};
    const rows=await tradeBreakdown(db,owners[0].id,"month",period);
    assert.deepEqual(rows.map(r=>[r.group,r.total,r.measured,r.pnl]),[["2024-02",1,1,"0.10"],["2024-03",3,2,"-0.20"]]);
    const repo=tradeRepository(db);
    for(const row of rows) for(const sample of ["total","open","missingPnl","measured","wins","losses","breakeven"] as const) {
      const url=new URL(breakdownJournalHref("month",row.group,period,sample),"https://example.test");
      const parsed=parseJournalFilters(Object.fromEntries(url.searchParams));
      assert.deepEqual(parsed.errors,[]);
      assert.equal(await repo.count(owners[0].id,parsed.filters),row[sample]);
      assert.equal((await repo.exportRows(owners[0].id,parsed.filters)).length,row[sample]);
    }
    assert.deepEqual(await tradeBreakdown(db,owners[0].id,"month",{from:"2024-01-01",to:"2024-01-31"}),[]);
    assert.equal((await tradeBreakdown(db,owners[1].id,"month",period))[0].pnl,"999.00");
  } finally {await client.close();}
});
