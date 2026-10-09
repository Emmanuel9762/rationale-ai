import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { users, trades, tradeImports, tradeImportRows, tradingAccounts } from "../src/db/schema";
import { importOwnedCsv } from "../src/lib/trade-import";
import { readFileSync } from "node:fs";

const header = 'symbol,direction,entry_price,quantity,entry_time_utc,exit_price,exit_time_utc,recorded_pnl,plan_adherence,review_went_well';
const row = 'IMPORT,LONG,1.10,2,2026-01-01T00:00:00.123Z,1.2,2026-01-01T00:00:00.456Z,-0.01,partly,"Patient, mostly"';
const csv = header+'\n'+row+'\n'+row.replace('IMPORT','OPEN').replace(',1.2,2026-01-01T00:00:00.456Z,-0.01,partly,"Patient, mostly"',',,,,,');
function form(text=csv,confirmed='yes',allowRepeated='yes') {
  const data=new FormData();data.set('csv',text);data.set('confirmed',confirmed);data.set('allowRepeated',allowRepeated);
  return data;
}

test('CSV imports are atomic, owner-scoped, replayable after edits, and preserve decimal/time/review values', async()=>{
  const client=new PGlite(),db=drizzle(client);
  try {
    await migrate(db,{migrationsFolder:'./drizzle'});
    const [a,b]=await db.insert(users).values([{email:'import-a@test.local'},{email:'import-b@test.local'}]).returning();
    for (const bad of [form(csv,'no'),form(readFileSync('public/samples/rationaleai-mock-trades.csv','utf8')),form(header+'\n'+row+'\n'+row,'yes','no')]) await assert.rejects(importOwnedCsv(db,a.id,bad));
    const repeated=form();repeated.append('csv',csv);await assert.rejects(importOwnedCsv(db,a.id,repeated));
    assert.equal((await db.select().from(tradingAccounts)).length,0,'validation precedes all writes');
    const attempts=await Promise.all(Array.from({length:6},()=>importOwnedCsv(db,a.id,form())));
    assert.equal(new Set(attempts.map(r=>r.id)).size,1);assert.equal(attempts[0].count,2);
    const saved=await db.select().from(trades);
    assert.equal(saved.length,2);
    const closed=saved.find(r=>r.symbol==='IMPORT')!;
    assert.equal(closed.pnl,'-0.01');assert.equal(closed.entryTime.toISOString(),'2026-01-01T00:00:00.123Z');
    assert.equal(closed.exitTime?.toISOString(),'2026-01-01T00:00:00.456Z');
    assert.equal(closed.reviewWentWell,'Patient, mostly');assert.ok(closed.reviewedAt);
    const open=saved.find(r=>r.symbol==='OPEN')!;assert.equal(open.pnl,null);assert.equal(open.exitTime,null);assert.equal(open.reviewedAt,null);
    await db.update(trades).set({notes:'Edited later',revision:1}).where(eq(trades.id,closed.id));
    assert.deepEqual(await importOwnedCsv(db,a.id,form(csv.replaceAll('1.10','01.100000'))),attempts[0]);
    assert.equal((await db.select().from(trades).where(eq(trades.id,closed.id)))[0].notes,'Edited later');
    const forged=form();forged.set('accountId',closed.accountId);forged.set('userId',a.id);
    const other=await importOwnedCsv(db,b.id,forged);assert.notEqual(other.id,attempts[0].id);
    const accountB=(await db.select().from(tradingAccounts).where(eq(tradingAccounts.userId,b.id)))[0];
    assert.equal((await db.select().from(trades).where(eq(trades.accountId,accountB.id))).length,2);
    assert.equal(accountB.balance,'0.00');
    const repeats=await importOwnedCsv(db,a.id,form(header+'\n'+row+'\n'+row));assert.equal(repeats.count,2);
    assert.equal((await db.select().from(trades)).length,6);
    assert.equal((await db.select().from(tradeImports)).length,3);
    await assert.rejects(db.insert(tradeImports).values({userId:a.id,accountId:closed.accountId,payloadHash:(await db.select().from(tradeImports).where(eq(tradeImports.id,attempts[0].id)))[0].payloadHash,rowCount:2}));
  } finally {await client.close();}
});

test('a mid-batch database failure rolls back every trade and its receipt; a lost response safely replays',async()=>{
  const client=new PGlite(),db=drizzle(client);
  try {
    await migrate(db,{migrationsFolder:'./drizzle'});
    const [owner]=await db.insert(users).values({email:'rollback@test.local'}).returning();
    await client.exec("create function reject_open_import() returns trigger language plpgsql as $$ begin if NEW.symbol='OPEN' then raise exception 'fixture failure'; end if; return NEW; end $$; create trigger reject_import before insert on trades for each row execute function reject_open_import();");
    await assert.rejects(importOwnedCsv(db,owner.id,form()));
    assert.equal((await db.select().from(trades)).length,0);assert.equal((await db.select().from(tradeImports)).length,0);
    await client.exec('drop trigger reject_import on trades');
    await client.exec("create function reject_import_links() returns trigger language plpgsql as $$ begin raise exception 'fixture link failure'; end $$; create trigger reject_links before insert on trade_import_rows for each row execute function reject_import_links();");
    await assert.rejects(importOwnedCsv(db,owner.id,form()));
    assert.equal((await db.select().from(trades)).length,0);assert.equal((await db.select().from(tradeImports)).length,0);assert.equal((await db.select().from(tradeImportRows)).length,0);
    await client.exec('drop trigger reject_links on trade_import_rows');
    const lostReply = new Proxy(db,{get(target,key){
      if(key==='execute')return async(query: Parameters<typeof db.execute>[0])=>{await target.execute(query);throw new Error('lost response');};
      return Reflect.get(target,key);
    }});
    await assert.rejects(importOwnedCsv(lostReply,owner.id,form()),/lost response/);
    assert.equal((await db.select().from(trades)).length,2);assert.equal((await db.select().from(tradeImports)).length,1);
    assert.equal((await importOwnedCsv(db,owner.id,form())).count,2);
    assert.equal((await db.select().from(trades)).length,2);
    assert.equal((await db.select().from(tradeImportRows)).length,2);
    await migrate(db,{migrationsFolder:'./drizzle'});
  } finally {await client.close();}
});
