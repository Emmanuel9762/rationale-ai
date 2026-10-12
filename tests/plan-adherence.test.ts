import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { users, tradingAccounts, trades } from "../src/db/schema";
import { tradeBreakdown } from "../src/lib/trade-metrics";
import { tradeRepository } from "../src/lib/trade-repository";
import { breakdownJournalHref, parseJournalFilters } from "../src/lib/journal-filters";
import { saveOwnedReview } from "../src/lib/trade-review";

test("adherence groups preserve outcomes, dates, ownership and journal membership as reviews change", async () => {
  const client=new PGlite(), db=drizzle(client);
  try {
    await migrate(db,{migrationsFolder:"./drizzle"});
    const owners=await db.insert(users).values([{email:"adherence@test.local"},{email:"private-adherence@test.local"}]).returning();
    const accounts=await db.insert(tradingAccounts).values(owners.map(u=>({userId:u.id,name:"Test",balance:"0"}))).returning();
    const base={accountId:accounts[0].id,symbol:"EURUSD",setup:"Breakout",direction:"LONG",entryPrice:"1",quantity:"1",entryTime:new Date("2026-01-02T12:00Z")};
    const closed={exitPrice:"2",exitTime:new Date("2026-02-01T12:00Z")};
    const review={reviewedAt:new Date("2026-03-01T12:00Z"),planAdherence:"followed"};
    assert.deepEqual(await tradeBreakdown(db,owners[0].id,"adherence"),[]);
    await db.insert(trades).values(Array.from({length:26},(_,i)=>({...base,...closed,...review,pnl:i%2?"0.10":"-0.10"})));
    const extra=await db.insert(trades).values([
      {...base,...review}, {...base,...closed,...review},
      ...["2.00","-1.00","0.00"].map(pnl=>({...base,...closed,...review,planAdherence:"partly",pnl})),
      {...base,...closed,...review,planAdherence:"not_followed",pnl:"-4.00"},
      {...base,...closed,pnl:"3.00"}, {...base,planAdherence:"followed"},
      ...[null,"","legacy"].map(planAdherence=>({...base,...review,planAdherence})),
      {...base,...closed,...review,pnl:"999.00",entryTime:new Date("2026-01-03T00:00Z")},
      {...base,...closed,...review,pnl:"999.00",accountId:accounts[1].id},
    ]).returning();
    const period={from:"2026-01-02",to:"2026-01-02"}, repo=tradeRepository(db);
    const groups=await tradeBreakdown(db,owners[0].id,"adherence",period);
    assert.equal(groups.length,5);
    const followed=groups.find(g=>g.group==="followed")!;
    assert.equal(followed.total,28);assert.equal(followed.measured,26);
    assert.equal(followed.open,1);assert.equal(followed.missingPnl,1);
    assert.equal(followed.pnl,"0.00");assert.equal(followed.winRate,"50.0%");
    assert.equal(followed.averagePnl,"0.00");assert.equal(followed.profitFactor,"1.00");
    const partly=groups.find(g=>g.group==="partly")!;
    assert.equal(partly.total,3);assert.equal(partly.averagePnl,"0.33");assert.equal(partly.profitFactor,"2.00");
    assert.equal(groups.find(g=>g.group==="not_followed")?.pnl,"-4.00");
    assert.equal(groups.find(g=>g.group==="unreviewed")?.total,2);
    assert.equal(groups.find(g=>g.group==="unspecified")?.total,3);
    for(const group of groups) {
      const url=new URL(breakdownJournalHref("adherence",group.group,period),"https://example.test");
      const {filters,errors}=parseJournalFilters(Object.fromEntries(url.searchParams));
      assert.deepEqual(errors,[]);
      const exported=await repo.exportRows(owners[0].id,filters);
      assert.equal(exported.length,group.total);assert.ok(exported.every(t=>t.accountId===accounts[0].id));
      const first=await repo.list(owners[0].id,1,filters),second=await repo.list(owners[0].id,2,filters);
      assert.deepEqual([...first.trades,...second.trades].map(t=>t.id),exported.map(t=>t.id));
    }
    assert.equal((await repo.exportRows(owners[0].id,{...period,adherence:"followed",setup:"Breakout",status:"closed",review:"reviewed"})).length,27);
    assert.deepEqual(await tradeBreakdown(db,owners[0].id,"adherence",{from:"2027-01-01"}),[]);
    assert.equal((await tradeBreakdown(db,owners[1].id,"adherence",period))[0].pnl,"999.00");
    const unreviewed=extra[6];
    await saveOwnedReview(db,owners[0].id,unreviewed.id,{planAdherence:"partly",reviewWentWell:"Reviewed later",reviewImprove:null},0);
    const updated=await tradeBreakdown(db,owners[0].id,"adherence",period);
    assert.equal(updated.find(g=>g.group==="unreviewed")?.total,1);
    assert.equal(updated.find(g=>g.group==="partly")?.total,4);
    assert.equal(updated.find(g=>g.group==="partly")?.pnl,"4.00");
    assert.equal((await repo.find(owners[0].id,unreviewed.id))?.pnl,"3.00");
  } finally {await client.close();}
});
