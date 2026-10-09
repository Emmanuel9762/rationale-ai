import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { users, trades, tradeImports, tradeImportRows } from "../src/db/schema";
import { importOwnedCsv } from "../src/lib/trade-import";
import { importHistory } from "../src/lib/import-history";
import { tradeRepository } from "../src/lib/trade-repository";
import { journalHref, parseJournalFilters } from "../src/lib/journal-filters";

test('batch history links exact trades across pages, exports and edits without exposing another owner or guessing legacy links',async()=>{
  const client=new PGlite(),db=drizzle(client);
  try {
    await migrate(db,{migrationsFolder:'./drizzle'});
    const [a,b]=await db.insert(users).values([{email:'history-a@local.test'},{email:'history-b@local.test'}]).returning();
    assert.deepEqual(await importHistory(db,a.id),{imports:[],hasNext:false});
    const form=new FormData();form.set('confirmed','yes');
    form.set('csv','symbol,direction,entry_price,quantity,entry_time_utc\n'+Array.from({length:29},(_,i)=>`BATCH${i},LONG,1,2,2026-09-01T00:00:00Z`).join('\n'));
    const saved=await importOwnedCsv(db,a.id,form), other=await importOwnedCsv(db,b.id,form);
    const history=await importHistory(db,a.id);
    assert.equal(history.imports.length,1);assert.equal(history.imports[0].linkedCount,29);assert.equal(history.imports[0].originalCount,29);
    assert.equal(history.imports[0].id,saved.id);
    const repo=tradeRepository(db);
    const first=await repo.list(a.id,1,{import:saved.id});const second=await repo.list(a.id,2,{import:saved.id});
    assert.equal(first.trades.length,25);assert.equal(first.hasNext,true);assert.equal(second.trades.length,4);assert.equal(second.hasNext,false);
    const exported=await repo.exportRows(a.id,{import:saved.id});
    assert.equal(new Set([...first.trades,...second.trades].map(t=>t.id)).size,29);
    assert.deepEqual(exported.map(t=>t.id),[...first.trades,...second.trades].map(t=>t.id));
    assert.equal((await repo.list(b.id,1,{import:saved.id})).trades.length,0);
    assert.equal((await repo.exportRows(a.id,{import:other.id})).length,0);
    assert.equal((await repo.list(a.id,1,{import:randomUUID()})).trades.length,0);
    const trade=exported[0];
    await db.update(trades).set({symbol:'EDITED',revision:1,notes:'Later note'}).where(eq(trades.id,trade.id));
    const filtered={import:saved.id,symbol:'EDITED',from:'2026-09-01',to:'2026-09-01'};
    assert.equal((await repo.exportRows(a.id,filtered))[0].notes,'Later note');
    assert.deepEqual(parseJournalFilters(Object.fromEntries(new URL(journalHref(filtered,2),'https://example.test').searchParams)).filters,filtered);
    assert.equal((await repo.exportRows(a.id,{import:saved.id,status:'closed'})).length,0);
    assert.deepEqual(await importOwnedCsv(db,a.id,form),saved);assert.equal((await db.select().from(tradeImportRows)).length,58);
    await assert.rejects(db.insert(tradeImportRows).values({tradeId:trade.id,importId:other.id}),'one trade can belong to only one batch');
    // Even a malformed cross-account link introduced outside the app cannot expose a trade.
    const foreign=(await repo.exportRows(b.id,{import:other.id}))[0];
    await db.update(tradeImportRows).set({importId:saved.id}).where(eq(tradeImportRows.tradeId,foreign.id));
    assert.equal((await importHistory(db,a.id)).imports[0].linkedCount,29);
    assert.equal((await repo.exportRows(a.id,{import:saved.id})).length,29);
    assert.equal((await repo.exportRows(b.id,{import:saved.id})).length,0);
    // CP30 receipts have no persisted links. A replay must neither insert nor guess them.
    await db.delete(tradeImportRows).where(eq(tradeImportRows.importId,saved.id));
    assert.deepEqual(await importOwnedCsv(db,a.id,form),saved);
    assert.equal((await importHistory(db,a.id)).imports[0].linkedCount,0);
    assert.equal((await importHistory(db,a.id)).imports[0].originalCount,29);
    assert.equal((await repo.exportRows(a.id,{import:saved.id})).length,0);
    const older=await db.insert(tradeImports).values(Array.from({length:26},(_,i)=>({userId:a.id,accountId:trade.accountId,payloadHash:`legacy-${i}`,rowCount:3,createdAt:new Date('2020-01-01')}))).returning();
    const p1=await importHistory(db,a.id),p2=await importHistory(db,a.id,2);
    assert.equal(p1.imports.length,25);assert.equal(p1.hasNext,true);assert.equal(p2.imports.length,2);assert.equal(p2.hasNext,false);
    const ids=[...p1.imports,...p2.imports].map(r=>r.id);
    assert.equal(new Set(ids).size,27);assert.ok(!ids.includes(other.id));
    assert.deepEqual(ids.slice(1),older.map(r=>r.id).sort().reverse());
    assert.deepEqual(await importHistory(db,a.id,3),{imports:[],hasNext:false});
  } finally {await client.close();}
});
