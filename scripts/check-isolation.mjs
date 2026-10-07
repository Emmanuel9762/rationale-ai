import assert from 'node:assert/strict';
import https from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';

// Exercise real Next Server Actions and the installed SDK with a controlled
// HTTPS provider. No live Neon accounts or database credentials are used.
const dir = await mkdtemp(join(tmpdir(), 'rationale-auth-'));
const database = new PGlite();
await migrate(drizzle(database), { migrationsFolder: './drizzle' });
let child;
let provider;
let loseTradeInsertReply = false;
try {
  const cert = join(dir, 'cert.pem'), key = join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const sessions = new Map(), identities = new Map();
  provider = https.createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const path = new URL(req.url, 'https://localhost').pathname;
    res.setHeader('Content-Type', 'application/json');
    const reply = (data, status=200) => { res.statusCode=status; res.end(JSON.stringify(data)); };
    if (path === '/sql') {
      try {
        // Preserve duplicate aggregate column names, as Neon array rows do.
        const result = await database.query(body.query, body.params, { rowMode: "array" });
        // Simulate a committed insert whose result cannot reach the application.
        if (loseTradeInsertReply && /^insert into "trades"/i.test(body.query.trim())) {
          loseTradeInsertReply = false;
          return reply({message:'Fixture lost insert response'},503);
        }
        const text = (value, field) => value === null ? null : value instanceof Date ? (field.dataTypeID === 1114 ? value.toISOString().slice(0,-1).replace('T',' ') : value.toISOString()) : typeof value === 'boolean' ? (value ? 't':'f') : typeof value === 'object' ? JSON.stringify(value) : String(value);
        return reply({ fields: result.fields, rows: result.rows.map(row=>result.fields.map((f, i)=>text(row[i], f))), rowCount: result.affectedRows ?? result.rows.length, command: 'SELECT' });
      } catch (e) { return reply({message:e.message,code:e.code},400); }
    }
    const token = req.headers.cookie?.match(/__Secure-neon-auth.session_token=([^;]+)/)?.[1];
    if (path.endsWith('/sign-up/email')) {
      const user = {id:randomUUID(),email:body.email,name:body.name,emailVerified:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      identities.set(user.email,user); const sessionToken=randomBytes(24).toString('hex');
      sessions.set(sessionToken,{user,session:{id:randomUUID(),userId:user.id,token:sessionToken,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}});
      res.setHeader('Set-Cookie',`__Secure-neon-auth.session_token=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      return reply({user,token:sessionToken});
    }
    if (path.endsWith('/get-session')) return reply(sessions.get(token) ?? null);
    if (path.endsWith('/sign-out')) {sessions.delete(token);res.setHeader('Set-Cookie','__Secure-neon-auth.session_token=; Path=/; HttpOnly; Secure; Max-Age=0');return reply({success:true});}
    return reply({message:'Unknown fixture endpoint'},404);
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '0'], {
    env: { ...process.env, NODE_OPTIONS: `--require ${resolve('scripts/testing/database-preload.cjs')}`, NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: cert, DATABASE_URL: 'postgresql://fixture:fixture@fixture.invalid/test', TEST_SQL_ENDPOINT: `https://127.0.0.1:${provider.address().port}/sql`, NEON_AUTH_BASE_URL: `https://127.0.0.1:${provider.address().port}/auth`, NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString('hex') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
  let base;
  for (let i = 0; i < 150; i++) {
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match && output.includes('Ready')) { base = match[0]; break; }
    if (child.exitCode !== null) throw new Error('Test server exited before ready');
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(base, 'test server ready');
  const decode=s=>s.replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  function browserSession() {
    const jar=new Map();
    async function request(path,init={}) {
      const r=await fetch(base+path,{...init,redirect:'manual',headers:{Origin:base,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},signal:AbortSignal.timeout(15000)});
      for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}return r;
    }
    async function submit(path,fields,html) {
      html ??= await(await request(path)).text();const body=new FormData();
      for(const tag of html.match(/<input[^>]*type="hidden"[^>]*>/g)??[]){const n=tag.match(/name="([^"]*)"/),v=tag.match(/value="([^"]*)"/);if(n)body.append(decode(n[1]),decode(v?.[1]??''));}
      for(const [k,v]of Object.entries(fields))body.set(k,v);
      return request(path,{method:'POST',body});
    }
    return {request,submit};
  }
  const a=browserSession(),b=browserSession();
  for(const [client,email]of [[a,'a@example.test'],[b,'b@example.test']]) {
    const r=await client.submit('/sign-up',{name:email,email,password:'fixture-password'});assert.equal(r.status,303);
  }
  const input={symbol:'ONLY_A',direction:'LONG',entryPrice:'1.5',quantity:'2',entryTime:'2026-01-01T12:00',rationale:'A private rationale'};
  const newTradeHtml=await(await a.request('/trades/new')).text();
  const keyFrom=html=>html.match(/name="submissionKey"[^>]*value="([^"]+)"/)[1];
  const submissionKey=keyFrom(newTradeHtml);
  const invalidSubmission=await a.submit('/trades/new',{...input,pnl:'1'},newTradeHtml);
  const invalidSubmissionHtml=await invalidSubmission.text();assert.match(invalidSubmissionHtml,/P&amp;L can only be recorded/);
  assert.equal(keyFrom(invalidSubmissionHtml),submissionKey,'validation errors preserve the submission key');
  assert.equal((await database.query('select count(*)::int n from trades')).rows[0].n,0);
  loseTradeInsertReply=true;
  const uncertain=await a.submit('/trades/new',input,invalidSubmissionHtml);
  const uncertainHtml=await uncertain.text();assert.match(uncertainHtml,/Could not confirm the save/);
  assert.equal(loseTradeInsertReply,false);assert.equal(keyFrom(uncertainHtml),submissionKey);
  assert.equal((await database.query('select count(*)::int n from trades')).rows[0].n,1);
  const created=await a.submit('/trades/new',input,uncertainHtml);assert.equal(created.status,303);
  const tradePath=created.headers.get('location');assert.match(tradePath,/^\/trades\/[a-f0-9-]+$/);
  const replays=await Promise.all(Array.from({length:3},()=>a.submit('/trades/new',input,newTradeHtml)));
  for(const replay of replays){assert.equal(replay.status,303);assert.equal(replay.headers.get('location'),tradePath);}
  const changedReplay=await a.submit('/trades/new',{...input,symbol:'CHANGED'},newTradeHtml);
  assert.match(await changedReplay.text(),/different details/);
  const badKey=await a.submit('/trades/new',{...input,submissionKey:'bad'},newTradeHtml);
  assert.match(await badKey.text(),/valid submission key/);
  assert.equal((await database.query('select count(*)::int n from trades')).rows[0].n,1);
  assert.notEqual(keyFrom(await(await a.request('/trades/new')).text()),submissionKey,'fresh forms get new keys');
  console.log('Submission HTTP: validation key retention, lost insert response/retry, concurrent replay and mismatched payload protection passed.');
  if (process.argv.includes('--performance')) {
    for (const path of ['/', '/trades', tradePath]) {
      const samples=[];
      for(let i=0;i<6;i++){const start=performance.now(); const r=await a.request(path);assert.equal(r.status,200);await r.text();samples.push(Math.round(performance.now()-start));}
      console.log(`Production fixture HTTP ${path===tradePath?'/trades/[id]':path}: first=${samples[0]}ms; warm median=${samples.slice(1).sort((a,b)=>a-b)[2]}ms (local Auth/PGlite, not live Neon).`);
    }
  }
  const aTrade=(await database.query('select * from trades')).rows[0];
  const editPath=tradePath+'/edit';const editHtml=await(await a.request(editPath)).text();
  for(const path of [tradePath,editPath]) {const r=await b.request(path);const html=await r.text();assert.ok(!html.includes('A private rationale'));assert.ok(r.status===404||html.includes('NEXT_HTTP_ERROR_FALLBACK;404'));}
  for(const path of ['/','/trades','/performance']) {const html=await(await b.request(path)).text();assert.ok(!html.includes('ONLY_A'));}
  const forged=await b.submit(editPath,{...input,notes:'HACKED',userId:aTrade.account_id},editHtml);
  assert.match(await forged.text(),/Trade not found or unavailable/);
  assert.equal((await database.query('select notes from trades where id=$1',[aTrade.id])).rows[0].notes,null);
  const bCreated=await b.submit('/trades/new',{...input,symbol:'ONLY_B',rationale:'B private rationale',submissionKey,accountId:aTrade.account_id,userId:'00000000-0000-4000-8000-000000000000'});
  assert.equal(bCreated.status,303);
  const bTrade=(await database.query("select * from trades where symbol='ONLY_B'")).rows[0];assert.notEqual(bTrade.account_id,aTrade.account_id);
  const updated=await a.submit(editPath,{...input,notes:'Owner correction'},editHtml);assert.equal(updated.status,303);
  assert.equal((await database.query('select notes from trades where id=$1',[aTrade.id])).rows[0].notes,'Owner correction');
  const revisionFrom=html=>html.match(/name="revision"[^>]*value="([^"]+)"/)[1];
  const staleEdit=await a.submit(editPath,{...input,notes:'MY_STALE_DRAFT'},editHtml);
  const staleEditHtml=await staleEdit.text();assert.match(staleEditHtml,/changed after you opened/);assert.match(staleEditHtml,/MY_STALE_DRAFT/);
  assert.equal(revisionFrom(staleEditHtml),revisionFrom(editHtml),'a stale response must not silently upgrade the revision');
  assert.match(staleEditHtml,/Load latest saved version/);
  assert.equal((await database.query('select notes from trades where id=$1',[aTrade.id])).rows[0].notes,'Owner correction');
  const repeatedStale=await a.submit(editPath,{...input,notes:'MY_STALE_DRAFT'},staleEditHtml);assert.match(await repeatedStale.text(),/changed after you opened/);
  const freshEdit=await(await a.request(editPath)).text();
  const recoveredEdit=await a.submit(editPath,{...input,notes:'Owner correction'},freshEdit);assert.equal(recoveredEdit.status,303);
  const replayAfterEdit=await a.submit('/trades/new',input,newTradeHtml);assert.equal(replayAfterEdit.headers.get('location'),tradePath);
  assert.equal((await database.query('select notes from trades where id=$1',[aTrade.id])).rows[0].notes,'Owner correction');
  const firstOwner=(await database.query('select user_id from trading_accounts where id=$1',[aTrade.account_id])).rows[0].user_id;
  assert.equal((await database.query('select count(*)::int n from trading_accounts where user_id=$1 and is_default',[firstOwner])).rows[0].n,1);
  const reviewHtml=await(await a.request(tradePath)).text();
  assert.match(reviewHtml,/Not reviewed yet/);
  const review={planAdherence:'partly',reviewWentWell:'PRIVATE_REVIEW',reviewImprove:'Wait for confirmation'};
  const rejectedReview=await b.submit(tradePath,review,reviewHtml);
  assert.match(await rejectedReview.text(),/Trade not found or unavailable/);
  const invalidReview=await a.submit(tradePath,{planAdherence:'followed'},reviewHtml);
  assert.match(await invalidReview.text(),/Add what went well/);
  assert.equal((await database.query('select reviewed_at from trades where id=$1',[aTrade.id])).rows[0].reviewed_at,null);
  const savedReview=await a.submit(tradePath,{...review,pnl:'999',accountId:bTrade.account_id},reviewHtml);
  assert.equal(savedReview.status,200);const savedReviewHtml=await savedReview.text();assert.match(savedReviewHtml,/Review saved/);
  const staleReview=await a.submit(tradePath,{...review,reviewWentWell:'STALE_REVIEW_DRAFT'},reviewHtml);
  const staleReviewHtml=await staleReview.text();assert.match(staleReviewHtml,/changed after you opened/);assert.match(staleReviewHtml,/STALE_REVIEW_DRAFT/);
  assert.equal(revisionFrom(staleReviewHtml),revisionFrom(reviewHtml));
  assert.equal((await database.query('select review_went_well from trades where id=$1',[aTrade.id])).rows[0].review_went_well,'PRIVATE_REVIEW');
  const reviewedHtml=await(await a.request(tradePath)).text();assert.match(reviewedHtml,/PRIVATE_REVIEW/);assert.match(reviewedHtml,/Last saved/);
  assert.ok(!(await(await b.request(tradePath)).text()).includes('PRIVATE_REVIEW'));
  const reviewedRow=(await database.query('select * from trades where id=$1',[aTrade.id])).rows[0];
  assert.equal(reviewedRow.pnl,null);assert.equal(reviewedRow.account_id,aTrade.account_id);assert.equal(reviewedRow.rationale,input.rationale);
  const revised=await a.submit(tradePath,{planAdherence:'followed',reviewImprove:'Revised reflection'},savedReviewHtml);assert.equal(revised.status,200);assert.match(await revised.text(),/Review saved/);
  assert.equal((await database.query('select review_went_well from trades where id=$1',[aTrade.id])).rows[0].review_went_well,null);
  console.log('Revision HTTP: stale trade/review drafts retained, latest data preserved, fresh reload and successive review saves passed.');
  console.log('Review HTTP: validation, save/reload/edit, cross-owner denial and unchanged trade data passed.');
  // Exercise filters through the real server, with enough matches for two pages.
  await database.query("insert into trades (account_id,symbol,direction,entry_price,quantity,entry_time) select $1,'ONLY_A','LONG',1,1,'2026-01-01 12:00:00'::timestamp from generate_series(1,25)",[aTrade.account_id]);
  const filteredPath='/trades?symbol=ONLY_A&direction=LONG&status=open&from=2026-01-01&to=2026-01-01';
  const filteredHtml=await(await a.request(filteredPath)).text();
  const nextTag=(filteredHtml.match(/<a\b[^>]*>Next<\/a>/g)??[])[0];assert.ok(nextTag,'filtered first page has Next');
  const nextPath=decode(nextTag.match(/href="([^"]+)"/)[1]);
  const nextUrl=new URL(nextPath,base);assert.equal(nextUrl.searchParams.get('page'),'2');
  for(const key of ['symbol','direction','status','from','to'])assert.equal(nextUrl.searchParams.get(key),new URL(filteredPath,base).searchParams.get(key));
  const secondHtml=await(await a.request(nextPath)).text();assert.ok(!/>Next<\/a>/.test(secondHtml));assert.match(secondHtml,/ONLY_A<\/a>/);
  const form=filteredHtml.match(/<form\b[^>]*>[\s\S]*?<\/form>/)[0];assert.match(form,/method="[gG][eE][tT]"/);assert.ok(!/name="page"/.test(form),'Apply resets pagination');
  assert.match(await(await a.request('/trades?symbol=MISSING')).text(),/No trades match these filters/);
  assert.match(await(await a.request('/trades?page=99&symbol=ONLY_A')).text(),/Return to the first page/);
  const invalidHtml=await(await a.request('/trades?from=2026-02-30')).text();assert.match(invalidHtml,/Check your filters/);assert.ok(!invalidHtml.includes('<table'));
  const otherFiltered=await(await b.request(filteredPath)).text();assert.match(otherFiltered,/No trades match these filters/);assert.ok(!otherFiltered.includes('<table'));
  console.log('Journal HTTP filters: preserved pagination links, first-page apply, empty/error states and owner isolation passed.');
  const performanceBefore = await(await a.request('/performance')).text();
  assert.match(performanceBefore,/Performance breakdowns/);assert.match(performanceBefore,/By setup/);assert.match(performanceBefore,/By symbol/);
  assert.ok(performanceBefore.includes('ONLY_A'));assert.ok(!performanceBefore.includes('ONLY_B'));
  const rowsBefore=performanceBefore.match(/<tbody>[\s\S]*?<\/tbody>/g);assert.equal(rowsBefore.length,2);
  assert.ok(rowsBefore.every(table=>table.includes('—')),'open-only groups have no measured results');
  await database.query("update trades set setup='OWNER_SETUP',exit_price=2,exit_time='2026-01-01 13:00:00',pnl=12.34 where id=$1",[aTrade.id]);
  const performanceAfter = await(await a.request('/performance')).text();
  assert.match(performanceAfter,/OWNER_SETUP/);assert.match(performanceAfter,/12\.34/);assert.match(performanceAfter,/100\.0%/);
  const otherPerformance = await(await b.request('/performance')).text();assert.ok(otherPerformance.includes('ONLY_B'));assert.ok(!otherPerformance.includes('OWNER_SETUP'));assert.ok(!otherPerformance.includes('ONLY_A'));
  console.log('Performance HTTP: setup/symbol groups, unmeasured display, recorded results and owner isolation passed.');
  await a.submit('/account',{});
  const deniedReview=await a.submit(tradePath,review,reviewHtml);assert.equal(deniedReview.headers.get('location'),'/sign-in');
  assert.equal((await database.query('select review_improve from trades where id=$1',[aTrade.id])).rows[0].review_improve,'Revised reflection');
  const denied=await a.submit(editPath,{...input,notes:'SIGNED OUT'},editHtml);assert.equal(denied.headers.get('location'),'/sign-in');
  assert.equal((await database.query('select notes from trades where id=$1',[aTrade.id])).rows[0].notes,'Owner correction');
  for(const session of sessions.values())session.session.expiresAt=new Date(0).toISOString();
  const expired=await b.request('/trades');assert.equal(expired.headers.get('location'),'/sign-in');
  console.log('Two-user HTTP isolation: scoped dashboard/list/detail, denied cross-owner update, forged ownership ignored, owner edit, signed-out write and expired session passed.');
  if(process.argv.includes('--browser')) {
    const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
    try {
      const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
      const pages=await Promise.all(contexts.map(c=>c.newPage()));
      for(const [i,page]of pages.entries()){
        await page.goto(base.replace('127.0.0.1','localhost')+'/sign-up');
        await page.getByLabel('Name',{exact:true}).fill('Browser '+i);await page.getByLabel('Email',{exact:true}).fill(`browser${i}@example.test`);await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Create account',exact:true}).click();await page.waitForURL('**/account');
      }
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/trades/new');
      for(const [name,value]of Object.entries(input)) {const field=pages[0].locator(`[name="${name}"]`);if(name==='direction')await field.selectOption(value);else await field.fill(value);}
      const browserSubmissionKey=await pages[0].locator('[name="submissionKey"]').inputValue();
      await pages[0].locator('[name="pnl"]').fill('1');
      await pages[0].getByRole('button',{name:'Save trade',exact:true}).click();
      await pages[0].getByRole('alert').filter({hasText:'P&L can only be recorded'}).waitFor();
      assert.equal(await pages[0].locator('[name="submissionKey"]').inputValue(),browserSubmissionKey);
      for (const [name,value] of Object.entries(input)) assert.equal(await pages[0].locator(`[name="${name}"]`).inputValue(),value,`validation preserves ${name}`);
      await pages[0].locator('[name="pnl"]').fill('');
      await pages[0].getByRole('button',{name:'Save trade',exact:true}).click();await pages[0].waitForURL(/\/trades\/[a-f0-9-]+$/);
      const path=new URL(pages[0].url()).pathname;await pages[0].reload();assert.ok((await pages[0].textContent('body')).includes('A private rationale'));
      await pages[0].getByLabel('Did you follow your plan?').selectOption('partly');
      await pages[0].getByLabel('What went well?').fill('Browser reflection');
      await pages[0].getByRole('button',{name:'Save review',exact:true}).click();
      await pages[0].getByText('Last saved (UTC):',{exact:false}).waitFor();
      await pages[0].reload();assert.equal(await pages[0].getByLabel('What went well?').inputValue(),'Browser reflection');
      const editTab=await contexts[0].newPage();
      await editTab.goto(base.replace('127.0.0.1','localhost')+path+'/edit');
      await editTab.getByLabel('Notes',{exact:true}).fill('STALE_BROWSER_TRADE');
      await pages[0].getByLabel('What went well?').fill('New browser reflection');
      await pages[0].getByRole('button',{name:'Save review',exact:true}).click();
      await pages[0].getByRole('status').filter({hasText:'Review saved.'}).waitFor();
      await editTab.getByRole('button',{name:'Save changes',exact:true}).click();
      await editTab.getByRole('alert').filter({hasText:'changed after you opened'}).waitFor();
      assert.equal(await editTab.getByLabel('Notes',{exact:true}).inputValue(),'STALE_BROWSER_TRADE');
      await editTab.getByRole('link',{name:'Load latest saved version (discards this draft)',exact:true}).click();
      await editTab.getByLabel('Notes',{exact:true}).fill('Fresh browser correction');
      await editTab.getByRole('button',{name:'Save changes',exact:true}).click();await editTab.waitForURL('**'+path);
      await pages[0].getByLabel('What went well?').fill('STALE_BROWSER_REVIEW');
      await pages[0].getByRole('button',{name:'Save review',exact:true}).click();
      await pages[0].getByRole('alert').filter({hasText:'changed after you opened'}).waitFor();
      assert.equal(await pages[0].getByLabel('What went well?').inputValue(),'STALE_BROWSER_REVIEW');
      await pages[0].getByRole('link',{name:'Load latest saved version (discards this draft)',exact:true}).click();
      assert.equal(await pages[0].getByLabel('What went well?').inputValue(),'New browser reflection');
      await editTab.close();

      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/performance');
      await pages[0].getByRole('heading',{name:'Performance breakdowns',exact:true}).waitFor();
      assert.ok((await pages[0].getByRole('region',{name:'By symbol',exact:true}).textContent()).includes('ONLY_A'));
      await pages[1].goto(base.replace('127.0.0.1','localhost')+'/performance');
      await pages[1].getByText('No trades yet.',{exact:false}).waitFor();
      await pages[1].goto(base.replace('127.0.0.1','localhost')+path);assert.ok(!(await pages[1].textContent('body')).includes('A private rationale'));
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/trades?page=2');
      await pages[0].getByLabel('Symbol (exact)',{exact:true}).fill('missing');
      await pages[0].getByRole('button',{name:'Apply filters',exact:true}).click();
      await pages[0].waitForURL(url=>url.searchParams.get('symbol')==='missing'&&!url.searchParams.has('page'));
      await pages[0].getByText('No trades match these filters.',{exact:false}).waitFor();
      await pages[0].getByRole('link',{name:'Clear filters',exact:true}).first().click();
      await pages[0].waitForURL(url=>url.pathname==='/trades'&&!url.search);
      assert.ok((await pages[0].textContent('table')).includes('ONLY_A'));
      console.log('Two isolated Chromium contexts: signup, trade creation, refresh and cross-user denial passed.');
    } finally {await browser.close();}
  }
} finally {
  if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped; }
  provider?.closeAllConnections();
  if (provider?.listening) await new Promise(resolve => provider.close(resolve));
  await database.close();
  await rm(dir, { recursive: true, force: true });
}
