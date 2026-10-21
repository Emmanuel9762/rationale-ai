import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const {encodeReply}=createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node');
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
let loseImportReply = false;
let loseReviewReply = false;
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
        if (loseImportReply && /with claimed as/i.test(body.query)) { loseImportReply=false; return reply({message:'Fixture lost import response'},503); }
        if (loseReviewReply && /^insert into "saved_reviews"/i.test(body.query.trim())) { loseReviewReply=false; return reply({message:'Fixture lost review response'},503); }
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
  const fixtureEnv={ ...process.env, NODE_OPTIONS: `--require ${resolve('scripts/testing/database-preload.cjs')}`, NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: cert, DATABASE_URL: 'postgresql://fixture:fixture@fixture.invalid/test', TEST_SQL_ENDPOINT: `https://127.0.0.1:${provider.address().port}/sql`, NEON_AUTH_BASE_URL: `https://127.0.0.1:${provider.address().port}/auth`, NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString('hex') };
  const verification=spawn(process.execPath,['--import','tsx','scripts/verify-database.ts'],{env:fixtureEnv,stdio:['ignore','pipe','pipe']});
  let verificationOutput='';verification.stdout.on('data',c=>verificationOutput+=c);verification.stderr.on('data',c=>verificationOutput+=c);
  assert.equal((await once(verification,'exit'))[0],0,verificationOutput);
  assert.match(verificationOutput,/10 verified, 0 pending/);assert.match(verificationOutput,/saved-review columns and indexes verified/);
  console.log('Database verification: ten migrations and all required schema checks passed against the isolated fixture.');
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '0'], { env: fixtureEnv, stdio: ['ignore', 'pipe', 'pipe'] });
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
      const r=await fetch(base+path,{...init,redirect:'manual',headers:{...init.headers,Origin:base,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},signal:AbortSignal.timeout(15000)});
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
  assert.match(await(await a.request('/trades/preview')).text(),/Preview trade CSV/);
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
  const evidenceBefore=(await database.query('select count(*)::int n from trades')).rows[0].n;
  for(const [client,own,other] of [[a,'A private rationale','B private rationale'],[b,'B private rationale','A private rationale']]) {
    const evidenceHtml=await(await client.request('/review-evidence?from=2026-01-01&to=2026-01-01&userId='+aTrade.account_id)).text();
    assert.ok(evidenceHtml.includes(own)); assert.ok(!evidenceHtml.includes(other));
    assert.match(evidenceHtml,/Nothing is sent to a model by Rationale/);
  }
  assert.match(await(await a.request('/review-evidence?from=2099-01-01')).text(),/No trades match/);
  for(const query of ['from=bad','from=2026-02-01&to=2026-01-01','from=2026-01-01&from=2026-01-02']) {
    const html=await(await a.request('/review-evidence?'+query)).text();
    assert.match(html,/Check your dates/); assert.ok(!html.includes('A private rationale'));
  }
  assert.equal((await database.query('select count(*)::int n from trades')).rows[0].n,evidenceBefore);
  console.log('Review evidence HTTP: owner isolation, date validation, empty state and no writes passed.');
  const evidencePath='/review-evidence?from=2026-01-01&to=2026-01-01';
  const packetPath='/review-evidence/export?from=2026-01-01&to=2026-01-01';
  const beforeManual=(await database.query('select * from trades order by id')).rows;
  let ownPacket;
  for(const [client,own,other] of [[a,'A private rationale','B private rationale'],[b,'B private rationale','A private rationale']]) {
    const r=await client.request(packetPath+'&userId='+aTrade.account_id);
    assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private, no-store/);
    assert.match(r.headers.get('content-type'),/application\/json/);assert.match(r.headers.get('content-disposition'),/attachment/);
    assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    const text=await r.text();assert.ok(text.includes(own));assert.ok(!text.includes(other));
    const packet=JSON.parse(text);assert.equal(packet.evidence.entries.length,1);
    assert.equal(packet.evidence.period.from,'2026-01-01');
    assert.ok(!Object.hasOwn(packet.evidence.entries[0],'accountId'));
    if(client===a)ownPacket=packet;
  }
  for(const query of ['from=bad','from=2026-02-01&to=2026-01-01','from=2026-01-01&from=2026-01-02']) {
    const r=await a.request('/review-evidence/export?'+query);assert.equal(r.status,400);
    assert.ok(!(await r.text()).includes('A private rationale'));
  }
  assert.equal((await a.request('/review-evidence/export?from=2099-01-01')).status,422);
  const manualReply={version:1,evidenceId:ownPacket.evidenceId,
    observations:[{text:'<script>MODEL_DRAFT_ATTACK</script> https://evil.test',tradeIds:[aTrade.id],metricKeys:['included']}],
    hypotheses:[],questions:['What defined this setup?'],experiment:{action:'Record the setup before entering.',check:'Compare it with the later reflection.'}};
  const manualResponse=JSON.stringify(manualReply);
  const manualHtml=await(await a.submit(evidencePath,{response:manualResponse,userId:bTrade.account_id})).text();
  assert.match(manualHtml,/Structure and references checked/);assert.match(manualHtml,/Unsaved|unsaved draft/);
  assert.ok(manualHtml.includes('&lt;script&gt;MODEL_DRAFT_ATTACK&lt;/script&gt;'));
  assert.ok(!manualHtml.includes('<script>MODEL_DRAFT_ATTACK</script>'));
  const claimedOwner=(await database.query('select user_id from trading_accounts where id=$1',[aTrade.account_id])).rows[0].user_id;
  const wrongOwnerHtml=await(await b.submit(evidencePath,{response:manualResponse,userId:claimedOwner})).text();
  assert.match(wrongOwnerHtml,/does not match this evidence snapshot/);assert.ok(!wrongOwnerHtml.includes('Structure and references checked'));
  const foreignReply=JSON.stringify({...manualReply,observations:[{...manualReply.observations[0],tradeIds:[bTrade.id]}]});
  assert.match(await(await a.submit(evidencePath,{response:foreignReply})).text(),/Unknown or repeated trade references/);
  for(const response of ['not json','x'.repeat(16385),'😀'.repeat(5000)]) {
    const html=await(await a.submit(evidencePath,{response})).text();
    assert.ok(!html.includes('Structure and references checked'));assert.match(html,/valid JSON|at most 16 KiB/);
  }
  assert.match(await(await a.submit(evidencePath,{response:manualResponse,from:'bad'})).text(),/Check the entry dates/);
  assert.deepEqual((await database.query('select * from trades order by id')).rows,beforeManual);
  console.log('Manual review HTTP: private owner/date-scoped packet, empty/invalid/oversized input, forged identity, foreign references, escaped text and no writes passed.');
  const reviewManifest=JSON.parse(await readFile('.next/server/server-reference-manifest.json','utf8'));
  const saveReviewAction=Object.entries(reviewManifest.node).find(([,entry])=>entry.exportedName==='saveManualReviewAction')[0];
  async function submitSavedReview(client,fields) {
    const data=fields instanceof FormData ? fields : new FormData();
    if(!(fields instanceof FormData))for(const [key,value]of Object.entries(fields))data.set(key,value);
    return client.request(evidencePath,{method:'POST',headers:{'Next-Action':saveReviewAction},body:await encodeReply([{error:'forged state',view:{owner:claimedOwner}},data])});
  }
  const saveFields={response:manualResponse,from:'2026-01-01',to:'2026-01-01',userId:'forged-owner',evidence:'forged-snapshot'};
  for(const [client,fields]of [[b,saveFields],[a,{...saveFields,response:foreignReply}],[a,{...saveFields,response:'not json'}],[a,{...saveFields,response:'😀'.repeat(5000)}],[a,{...saveFields,from:'bad'}]]) {
    const r=await submitSavedReview(client,fields);assert.ok(!r.headers.get('x-action-redirect'));await r.text();
  }
  const repeatedDates=new FormData();for(const [key,value]of Object.entries(saveFields))repeatedDates.set(key,value);
  repeatedDates.append('from','2026-01-01');await(await submitSavedReview(a,repeatedDates)).text();
  assert.equal((await database.query('select count(*)::int n from saved_reviews')).rows[0].n,0);
  loseReviewReply=true;
  assert.match(await(await submitSavedReview(a,saveFields)).text(),/Could not confirm the save/);
  assert.equal(loseReviewReply,false);
  const savedReply=await submitSavedReview(a,saveFields);
  const savedReviewPath=savedReply.headers.get('x-action-redirect')?.split(';')[0];await savedReply.text();
  assert.match(savedReviewPath,/^\/review-evidence\/history\/[a-f0-9-]+$/);
  const repeatedSave=await submitSavedReview(a,saveFields);assert.equal(repeatedSave.headers.get('x-action-redirect')?.split(';')[0],savedReviewPath);await repeatedSave.text();
  assert.equal((await database.query('select count(*)::int n from saved_reviews')).rows[0].n,1);
  const savedHtml=await(await a.request(savedReviewPath)).text();
  assert.match(savedHtml,/Manual review · saved draft/);assert.match(savedHtml,/A private rationale/);
  assert.ok(savedHtml.includes('&lt;script&gt;MODEL_DRAFT_ATTACK&lt;/script&gt;'));assert.ok(!savedHtml.includes('<script>MODEL_DRAFT_ATTACK</script>'));
  assert.equal((await b.request(savedReviewPath+'?userId='+claimedOwner)).status,404);
  assert.equal((await a.request('/review-evidence/history/not-an-id')).status,404);
  const historyHtml=await(await a.request('/review-evidence/history')).text();assert.ok(historyHtml.includes(savedReviewPath));
  assert.ok(!(await(await b.request('/review-evidence/history?userId='+claimedOwner)).text()).includes(savedReviewPath));
  assert.match((await(await a.request('/review-evidence/history?page=bad')).text()).replace(/<!--.*?-->/g,''),/Page 1/);
  assert.match(await(await a.request('/review-evidence/history?page=1&page=2')).text(),/Use only one page value/);
  assert.deepEqual((await database.query('select * from trades order by id')).rows,beforeManual);
  const updated=await a.submit(editPath,{...input,notes:'Owner correction'},editHtml);assert.equal(updated.status,303);
  assert.equal((await database.query('select notes from trades where id=$1',[aTrade.id])).rows[0].notes,'Owner correction');
  const staleManual=await(await a.submit(evidencePath,{response:manualResponse})).text();
  assert.match(staleManual,/does not match this evidence snapshot/);assert.ok(!staleManual.includes('Structure and references checked'));
  assert.match(await(await submitSavedReview(a,saveFields)).text(),/does not match this evidence snapshot/);
  const historical=await(await a.request(savedReviewPath)).text();assert.ok(!historical.includes('Owner correction'));assert.match(historical,/A private rationale/);
  assert.equal((await database.query('select count(*)::int n from saved_reviews')).rows[0].n,1);
  console.log('Saved review HTTP: authenticated save/recovery, duplicate prevention, owner isolation, bounded input, stale rejection, original evidence after edits and no trade writes passed.');
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
  assert.ok(filteredHtml.includes('26 matching trades · 25 on this page.'));
  const nextTag=(filteredHtml.match(/<a\b[^>]*>Next<\/a>/g)??[])[0];assert.ok(nextTag,'filtered first page has Next');
  const nextPath=decode(nextTag.match(/href="([^"]+)"/)[1]);
  const nextUrl=new URL(nextPath,base);assert.equal(nextUrl.searchParams.get('page'),'2');
  for(const key of ['symbol','direction','status','from','to'])assert.equal(nextUrl.searchParams.get(key),new URL(filteredPath,base).searchParams.get(key));
  const removeSymbolTag=filteredHtml.match(/<a[^>]*aria-label="Remove Symbol filter"[^>]*>/)[0];
  const withoutSymbol=new URL(decode(removeSymbolTag.match(/href="([^"]+)"/)[1]),base);
  assert.ok(!withoutSymbol.searchParams.has('symbol'));
  assert.ok(!withoutSymbol.searchParams.has('page'));
  for(const key of ['direction','status','from','to']) assert.equal(withoutSymbol.searchParams.get(key),new URL(filteredPath,base).searchParams.get(key));
  const secondHtml=await(await a.request(nextPath)).text();assert.ok(!/>Next<\/a>/.test(secondHtml));assert.match(secondHtml,/ONLY_A<\/a>/);
  assert.ok(secondHtml.includes('26 matching trades · 1 on this page.'));
  const beyondHtml=await(await a.request(filteredPath+'&page=99')).text();
  assert.ok(beyondHtml.includes('26 matching trades · 0 on this page.'));
  const contextualLink=decode(secondHtml.match(/href="([^"]+)"[^>]*>ONLY_A<\/a>/)[1]);
  assert.equal(new URL(contextualLink,base).searchParams.get('returnTo'),nextPath);
  const contextualHtml=await(await a.request(contextualLink)).text();
  const backTag=contextualHtml.match(/<a[^>]*>Back to trades<\/a>/)[0];
  assert.equal(decode(backTag.match(/href="([^"]+)"/)[1]),nextPath);
  const unsafeContext=await(await a.request(tradePath+'?returnTo=https%3A%2F%2Fevil.test')).text();
  assert.match(unsafeContext,/<a[^>]*href="\/trades"[^>]*>Back to trades<\/a>/);
  const form=filteredHtml.match(/<form\b[^>]*>[\s\S]*?<\/form>/)[0];assert.match(form,/method="[gG][eE][tT]"/);assert.ok(!/name="page"/.test(form),'Apply resets pagination');
  assert.match(await(await a.request('/trades?symbol=MISSING')).text(),/No trades match these filters/);
  assert.match(await(await a.request('/trades?page=99&symbol=ONLY_A')).text(),/Return to the first page/);
  const invalidHtml=await(await a.request('/trades?from=2026-02-30')).text();assert.match(invalidHtml,/Check your filters/);assert.ok(!invalidHtml.includes('<table'));assert.ok(!invalidHtml.includes('Journal result count'));
  const otherFiltered=await(await b.request(filteredPath)).text();assert.match(otherFiltered,/No trades match these filters/);assert.ok(!otherFiltered.includes('<table'));assert.ok(otherFiltered.includes('0 matching trades · 0 on this page.'));
  console.log('Journal HTTP filters: preserved pagination links, first-page apply, empty/error states and owner isolation passed.');
  const datedDashboard=await(await a.request('/?from=2026-01-01&to=2026-01-01')).text();
  assert.ok(datedDashboard.includes('/trades?status=closed&amp;review=unreviewed&amp;from=2026-01-01&amp;to=2026-01-01'));
  assert.ok(datedDashboard.includes('/performance?from=2026-01-01&amp;to=2026-01-01'));
  assert.ok(datedDashboard.includes('/trades?from=2026-01-01&amp;to=2026-01-01'));
  const futureDashboard=await(await a.request('/?from=2027-01-01')).text();
  assert.match(futureDashboard,/No trades match these entry dates/);assert.ok(!futureDashboard.includes('ONLY_A'));
  for(const query of ['from=2026-02-30','from=2026-02-01&to=2026-01-01','from=2026-01-01&from=2026-01-02']) {
    const html=await(await a.request('/?'+query)).text();assert.match(html,/Check your dates/);
    assert.ok(!html.includes('aria-label="Trading metrics"'));assert.ok(!html.includes('Journal follow-up'));assert.ok(!html.includes('Recent trades'));
  }
  for (const pathname of ['/', '/performance']) {
    const html=await(await a.request(pathname+'?from=invalid')).text();
    const nav=html.match(/<nav aria-label="Quick entry dates"[^>]*>([\s\S]*?)<\/nav>/)[1];
    for (const label of ['Last 7 days','Last 30 days','This month','Last month']) assert.ok(nav.includes(label));
    const hrefs=[...nav.matchAll(/href="([^"]+)"/g)].map(match=>decode(match[1]));
    assert.equal(hrefs.length,4);
    for(const href of hrefs) {
      const url=new URL(href,base);assert.equal(url.pathname,pathname);
      assert.match(url.searchParams.get('from'),/^\d{4}-\d{2}-\d{2}$/);
      assert.match(url.searchParams.get('to'),/^\d{4}-\d{2}-\d{2}$/);
      assert.ok(url.searchParams.get('from')<=url.searchParams.get('to'));
    }
    const recovered=await(await a.request(hrefs[0])).text();
    assert.ok(!recovered.includes('Check your dates.'));
    assert.ok(recovered.includes('aria-current="true"'));
  }
  const performanceBefore = await(await a.request('/performance')).text();
  assert.match(performanceBefore,/Performance breakdowns/);assert.match(performanceBefore,/By setup/);assert.match(performanceBefore,/By symbol/);
  assert.ok(performanceBefore.includes('ONLY_A'));assert.ok(!performanceBefore.includes('ONLY_B'));
  const rowsBefore=performanceBefore.match(/<tbody>[\s\S]*?<\/tbody>/g);assert.equal(rowsBefore.length,4);
  assert.ok(rowsBefore.every(table=>table.includes('—')),'open-only groups have no measured results');
  await database.query("update trades set setup='OWNER_SETUP',exit_price=2,exit_time='2026-01-01 13:00:00',pnl=12.34 where id=$1",[aTrade.id]);
  const performanceAfter = await(await a.request('/performance')).text();
  assert.match(performanceAfter,/OWNER_SETUP/);assert.match(performanceAfter,/12\.34/);assert.match(performanceAfter,/100\.0%/);
  const outcomeRow=performanceAfter.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g).find(row=>row.includes('OWNER_SETUP'));
  const outcomeCells=[...outcomeRow.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match=>decode(match[1]));
  assert.deepEqual(outcomeCells.slice(-4),['12.34','12.34','—','∞']);
  for (const outcome of ['win','loss','breakeven']) assert.ok(performanceAfter.includes('/trades?setup=OWNER_SETUP&amp;outcome='+outcome));
  const winnerQuery='symbol=ONLY_A&outcome=win';
  const winnerHtml=await(await a.request('/trades?'+winnerQuery)).text();
  assert.ok(winnerHtml.includes(`href="${tradePath}?returnTo=`));
  assert.match(winnerHtml,/<option value="win" selected="">Wins/);
  assert.equal(((await(await a.request('/trades/export?'+winnerQuery)).text()).match(/ONLY_A/g)||[]).length,1);
  assert.ok(!(await(await a.request('/trades?symbol=ONLY_A&outcome=loss')).text()).includes(`href="${tradePath}?returnTo=`));
  assert.match(await(await b.request('/trades?'+winnerQuery)).text(),/No trades match these filters/);
  const otherPerformance = await(await b.request('/performance')).text();assert.ok(otherPerformance.includes('ONLY_B'));assert.ok(!otherPerformance.includes('OWNER_SETUP'));assert.ok(!otherPerformance.includes('ONLY_A'));
  const datedPerformance=await(await a.request('/performance?from=2026-01-01&to=2026-01-01')).text();
  assert.match(datedPerformance,/OWNER_SETUP/);assert.match(datedPerformance,/12\.34/);assert.ok(!datedPerformance.includes('ONLY_B'));
  assert.match(datedPerformance,/href="\/trades\?from=2026-01-01&amp;to=2026-01-01"/);
  assert.match(datedPerformance,/href="\/trades\?setup=OWNER_SETUP&amp;from=2026-01-01&amp;to=2026-01-01"/);
  assert.match(datedPerformance,/By entry month \(UTC\)/);assert.ok(datedPerformance.includes('View trades for month: 2026-01'));
  assert.match(datedPerformance,/By plan adherence/);assert.match(datedPerformance,/Followed my plan/);
  const performanceExportPath='/performance/export?from=2026-01-01&to=2026-01-01';
  const reportResponse=await a.request(performanceExportPath);assert.equal(reportResponse.status,200);
  assert.match(reportResponse.headers.get('content-type'),/text\/csv/);assert.match(reportResponse.headers.get('cache-control'),/private, no-store/);
  assert.equal(reportResponse.headers.get('x-content-type-options'),'nosniff');assert.match(reportResponse.headers.get('content-disposition'),/rationale-performance.csv/);
  const reportCsv=await reportResponse.text();
  assert.ok(reportCsv.includes('"setup","OWNER_SETUP","false","2026-01-01","2026-01-01","1","0","0","1","1","0","0","100.0%","12.34"'));
  assert.ok(reportCsv.includes('"month","2026-01","false","2026-01-01","2026-01-01","26","25","0","1","1","0","0"'));
  assert.ok(!reportCsv.includes('ONLY_B'));assert.ok(!reportCsv.includes('PRIVATE_REVIEW'));
  const otherReport=await(await b.request(performanceExportPath)).text();assert.ok(otherReport.includes('ONLY_B'));assert.ok(!otherReport.includes('OWNER_SETUP'));
  assert.equal(await(await a.request(performanceExportPath+'&symbol=ignored')).text(),reportCsv);
  assert.equal((await(await a.request('/performance/export?from=2027-01-01')).text()).trim().split('\r\n').length,1);
  for(const query of ['from=2026-02-30','from=2026-02-01&to=2026-01-01','from=2026-01-01&from=2026-01-02']) {
    const rejected=await a.request('/performance/export?'+query);assert.equal(rejected.status,400);assert.match(rejected.headers.get('cache-control'),/no-store/);
  }
  const measuredQuery='setup=OWNER_SETUP&outcome=measured&from=2026-01-01&to=2026-01-01';
  assert.ok(datedPerformance.includes('/trades?'+measuredQuery.replaceAll('&','&amp;')));
  assert.ok((await(await a.request('/trades?'+measuredQuery)).text()).includes(`href="${tradePath}?returnTo=`));
  assert.equal(((await(await a.request('/trades/export?'+measuredQuery)).text()).match(/ONLY_A/g)||[]).length,1);
  const adherenceQuery='adherence=followed&from=2026-01-01&to=2026-01-01';
  assert.ok(datedPerformance.includes('/trades?'+adherenceQuery.replaceAll('&','&amp;')));
  const adherenceHtml=await(await a.request('/trades?'+adherenceQuery)).text();
  assert.ok(adherenceHtml.includes(`href="${tradePath}?returnTo=`));
  assert.match(adherenceHtml,/<option value="followed" selected="">Followed my plan/);
  const adherenceCsv=await(await a.request('/trades/export?'+adherenceQuery)).text();
  assert.equal((adherenceCsv.match(/ONLY_A/g)||[]).length,1);assert.ok(!adherenceCsv.includes('ONLY_B'));
  assert.match(await(await b.request('/trades?'+adherenceQuery)).text(),/No trades match these filters/);
  assert.ok(!(await(await a.request('/trades?adherence=unreviewed')).text()).includes(`href="${tradePath}?returnTo=`));
  const drillQuery='setup=OWNER_SETUP&from=2026-01-01&to=2026-01-01';
  const drilled=await(await a.request('/trades?'+drillQuery)).text();
  assert.ok(drilled.includes(`href="${tradePath}?returnTo=`));assert.match(drilled,/name="setup"[^>]*value="OWNER_SETUP"/);
  assert.match(drilled,/\/trades\/export\?setup=OWNER_SETUP&amp;from=2026-01-01&amp;to=2026-01-01/);
  assert.match(await(await b.request('/trades?'+drillQuery)).text(),/No trades match these filters/);
  assert.ok(!(await(await a.request('/trades?missing=setup')).text()).includes(`href="${tradePath}?returnTo=`));
  for(const query of ['outcome=unknown','outcome=win&outcome=loss','outcome=win&status=open','setup=A&setup=B','missing=setup&setup=OWNER_SETUP','missing=unknown','adherence=unknown','adherence=followed&adherence=partly']) {
    assert.match(await(await a.request('/trades?'+query)).text(),/Check your filters/);
    assert.equal((await a.request('/trades/export?'+query)).status,400);
  }
  assert.match(await(await a.request('/performance?from=2027-01-01')).text(),/No trades match these entry dates/);
  for(const query of ['from=2026-02-30','from=2026-02-01&to=2026-01-01','from=2026-01-01&from=2026-01-02']) {
    const html=await(await a.request('/performance?'+query)).text();assert.match(html,/Check your dates/);assert.ok(!html.includes('<table'));
  }
  console.log('Performance periods HTTP: matching journal link, empty range, invalid/repeated dates and owner scope passed.');
  console.log('Performance HTTP: setup/symbol groups, unmeasured display, recorded results and owner isolation passed.');
  const queueRow=(await database.query("insert into trades(account_id,symbol,direction,entry_price,quantity,entry_time,exit_price,exit_time) values ($1,'QUEUE_A','LONG',1,1,'2026-01-01',2,'2026-01-02') returning id",[aTrade.account_id])).rows[0];
  const queuePath='/trades?status=closed&review=unreviewed';
  const queueHtml=await(await a.request(queuePath)).text();assert.match(queueHtml,/QUEUE_A/);assert.ok(!queueHtml.includes('ONLY_A</a>'));
  assert.ok(!(await(await b.request(queuePath)).text()).includes('QUEUE_A'));
  const followUpBefore=await(await a.request('/')).text();
  assert.match(followUpBefore,/Closed trades awaiting review: 1/);
  assert.match(followUpBefore,/Closed trades missing P&amp;L: 1/);
  assert.match(await(await b.request('/')).text(),/Closed trades awaiting review: 0/);
  const queueSaved=await a.submit('/trades/'+queueRow.id,{planAdherence:'followed',reviewWentWell:'Queue complete'});assert.match(await queueSaved.text(),/Review saved/);
  assert.match(await(await a.request(queuePath)).text(),/No trades match these filters/);
  const followUpAfter=await(await a.request('/')).text();
  assert.match(followUpAfter,/Closed trades awaiting review: 0/);
  assert.match(followUpAfter,/Closed trades missing P&amp;L: 1/);

  assert.match(await(await a.request('/trades?review=reviewed')).text(),/QUEUE_A/);
  assert.match(await(await a.request('/trades?review=invalid')).text(),/Check your filters/);
  console.log('Review queue HTTP: closed/unreviewed scope, save removes row, owner isolation and invalid filters passed.');
  const exportResponse=await a.request('/trades/export?symbol=ONLY_A&page=2');assert.equal(exportResponse.status,200);
  assert.match(exportResponse.headers.get('content-type'),/text\/csv/);assert.match(exportResponse.headers.get('cache-control'),/no-store/);
  assert.match(exportResponse.headers.get('content-disposition'),/attachment/);
  const csv=await exportResponse.text();assert.equal((csv.match(/"ONLY_A"/g)??[]).length,26);assert.ok(!csv.includes('ONLY_B'));assert.ok(!csv.includes('submission_hash'));
  const otherCsv=await(await b.request('/trades/export')).text();assert.ok(otherCsv.includes('ONLY_B'));assert.ok(!otherCsv.includes('ONLY_A'));
  assert.equal((await a.request('/trades/export?review=bad')).status,400);
  assert.equal((await a.request('/trades/export?symbol=ONLY_A&symbol=ONLY_B')).status,400);
  const emptyCsv=await(await a.request('/trades/export?symbol=MISSING')).text();assert.equal(emptyCsv.trim().split('\r\n').length,1);
  await database.query("insert into trades(account_id,symbol,direction,entry_price,quantity,entry_time,setup) select $1,'EXPORT_LIMIT','LONG',1,1,'2026-01-01'::timestamp,'PERF_LIMIT_'||g from generate_series(1,2001) g",[aTrade.account_id]);
  assert.equal((await a.request('/trades/export?symbol=EXPORT_LIMIT')).status,422);
  assert.equal((await a.request('/performance/export')).status,422);
  console.log('Performance export HTTP: owner scope, dates, headers, empty/invalid requests and combined group cap passed.');
  console.log('Export HTTP: all filtered pages, private attachment headers, owner isolation, invalid/empty/oversized responses passed.');
  await a.submit('/account',{});
  assert.equal((await a.request('/trades/export')).headers.get('location'),'/sign-in');
  assert.equal((await a.request('/performance/export')).headers.get('location'),'/sign-in');
  const deniedReview=await a.submit(tradePath,review,reviewHtml);assert.equal(deniedReview.headers.get('location'),'/sign-in');
  assert.equal((await database.query('select review_improve from trades where id=$1',[aTrade.id])).rows[0].review_improve,'Revised reflection');
  const denied=await a.submit(editPath,{...input,notes:'SIGNED OUT'},editHtml);assert.equal(denied.headers.get('location'),'/sign-in');
  assert.equal((await database.query('select notes from trades where id=$1',[aTrade.id])).rows[0].notes,'Owner correction');
  for(const session of sessions.values())session.session.expiresAt=new Date(0).toISOString();
  const expired=await b.request('/trades');assert.equal(expired.headers.get('location'),'/sign-in');
  console.log('Two-user HTTP isolation: scoped dashboard/list/detail, denied cross-owner update, forged ownership ignored, owner edit, signed-out write and expired session passed.');
  const importManifest=JSON.parse(await readFile('.next/server/server-reference-manifest.json','utf8'));
  const importAction=Object.entries(importManifest.node).find(([,entry])=>entry.exportedName==='importTradeCsv')[0];
  const importCsv='symbol,direction,entry_price,quantity,entry_time_utc,exit_price,exit_time_utc,recorded_pnl,plan_adherence,review_went_well\nBATCH_HTTP,LONG,1,2,2026-09-01T00:00:00.123Z,2,2026-09-01T01:00:00.456Z,2,followed,Patient';
  async function submitImport(client,fields) {
    const data=new FormData();for(const [name,value]of Object.entries(fields))data.set(name,value);
    return client.request('/trades/preview',{method:'POST',headers:{'Next-Action':importAction},body:await encodeReply([data])});
  }
  const deniedImport=await submitImport(a,{csv:importCsv,confirmed:'yes'});
  assert.match(deniedImport.headers.get('x-action-redirect')??'',/^\/sign-in;/);await deniedImport.text();
  const c=browserSession();await c.submit('/sign-up',{name:'Importer',email:'importer@example.test',password:'fixture-password'});
  assert.match(await(await submitImport(c,{csv:importCsv,confirmed:'no'})).text(),/Confirm that you want to save/);
  const mixed=await readFile('public/samples/rationaleai-mock-trades.csv','utf8');
  assert.match(await(await submitImport(c,{csv:mixed,confirmed:'yes'})).text(),/Fix all 6 invalid/);
  assert.equal((await database.query('select count(*)::int n from trade_imports')).rows[0].n,0);
  loseImportReply=true;
  const lostImport=await submitImport(c,{csv:importCsv,confirmed:'yes',accountId:aTrade.account_id});
  assert.match(await lostImport.text(),/Could not confirm the import/);assert.equal(loseImportReply,false);
  assert.equal((await database.query("select count(*)::int n from trades where symbol='BATCH_HTTP'")).rows[0].n,1);
  const imports=await Promise.all(Array.from({length:4},()=>submitImport(c,{csv:importCsv,confirmed:'yes'})));
  for(const response of imports)assert.match(await response.text(),/"receipt"/);
  assert.equal((await database.query("select count(*)::int n from trades where symbol='BATCH_HTTP'")).rows[0].n,1);
  const imported=(await database.query("select account_id,reviewed_at from trades where symbol='BATCH_HTTP'")).rows[0];assert.notEqual(imported.account_id,aTrade.account_id);assert.ok(imported.reviewed_at);
  assert.match(await(await c.request('/trades?symbol=BATCH_HTTP')).text(),/BATCH_HTTP<\/a>/);
  assert.match(await(await c.request('/performance')).text(),/Followed my plan/);
  const receiptId=(await database.query('select id from trade_imports where account_id=$1',[imported.account_id])).rows[0].id;
  const importHistoryHtml=await(await c.request('/trades/imports')).text();
  assert.match(importHistoryHtml,/Import history/);assert.ok(importHistoryHtml.includes(`/trades?import=${receiptId}`));
  const batchHtml=await(await c.request('/trades?import='+receiptId)).text();
  assert.match(batchHtml,/BATCH_HTTP<\/a>/);const batchInput=batchHtml.match(/<input[^>]*name="import"[^>]*>/)[0];assert.match(batchInput,/readonly=""/i);assert.ok(batchInput.includes(`value="${receiptId}"`));
  assert.ok(batchHtml.includes('/trades/export?import='+receiptId));
  const batchCsv=await(await c.request('/trades/export?import='+receiptId)).text();assert.equal((batchCsv.match(/BATCH_HTTP/g)||[]).length,1);assert.ok(!batchCsv.includes('ONLY_A'));
  for(const query of ['import=invalid',`import=${receiptId}&import=${receiptId}`]){
    assert.match(await(await c.request('/trades?'+query)).text(),/Check your filters/);
    assert.equal((await c.request('/trades/export?'+query)).status,400);
  }
  const legacyId=(await database.query("insert into trade_imports(user_id,account_id,payload_hash,row_count) select user_id,id,'fixture-legacy',3 from trading_accounts where id=$1 returning id",[imported.account_id])).rows[0].id;
  const legacyHtml=await(await c.request('/trades/imports')).text();assert.ok(legacyHtml.includes(legacyId));assert.match(legacyHtml,/Trade links unavailable/);
  assert.match(await(await c.request('/trades?import='+legacyId)).text(),/No trades match these filters/);
  assert.match(await(await c.request('/trades/imports?page=99')).text(),/Return to the first page/);
  console.log('Import history HTTP: persisted links, batch filters/CSV, legacy counts and invalid IDs passed.');
  console.log('CSV import HTTP: server validation, signed-out denial, forged ownership ignored and lost-response/concurrent retries passed.');
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
      await pages[0].locator('[name="setup"]').fill('BROWSER_SETUP');
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
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/performance?from=2026-01-01&to=2026-01-01');
      await pages[0].getByRole('link',{name:'Review evidence for these dates',exact:true}).click();
      await pages[0].getByRole('heading',{name:'Review evidence',exact:true}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('from'),'2026-01-01');
      await pages[0].getByText('Read evidence',{exact:true}).click();
      await pages[0].getByText('A private rationale',{exact:true}).waitFor();
      const manualBefore=(await database.query('select * from trades where id=$1',[path.split('/').pop()])).rows;
      await pages[0].getByText('Review this evidence with an external model',{exact:true}).click();
      const packetDownloadEvent=pages[0].waitForEvent('download');
      await pages[0].getByRole('link',{name:'Download review packet (JSON)',exact:true}).click();
      const packetDownload=await packetDownloadEvent;
      assert.equal(packetDownload.suggestedFilename(),'rationale-review-packet.json');
      const packet=JSON.parse(await readFile(await packetDownload.path(),'utf8'));
      assert.equal(packet.evidence.period.from,'2026-01-01');
      assert.equal(packet.evidence.entries.length,1);
      const unsafeText='<img src=x onerror="window.manualReviewExecuted=true"> https://evil.test';
      const browserReply=JSON.stringify({version:1,evidenceId:packet.evidenceId,
        observations:[{text:unsafeText,tradeIds:[packet.evidence.entries[0].id],metricKeys:['included']}],
        hypotheses:[{text:'The entry conditions may need more detail.',tradeIds:[],metricKeys:['missingSetup']}],
        questions:['What defined this setup?'],experiment:{action:'Write the setup before entry.',check:'Compare it with the later reflection.'}});
      await pages[0].getByLabel('Model response JSON',{exact:true}).fill(browserReply);
      await pages[0].getByRole('button',{name:'Check response',exact:true}).click();
      const draftView=pages[0].getByRole('region',{name:'Checked review draft',exact:true});
      try { await draftView.getByText('Review draft',{exact:true}).waitFor(); }
      catch(error) {
        if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:process.env.JOURNAL_SCREENSHOTS+'-manual-failure.png',fullPage:true});
        console.log('Manual review check state:',await pages[0].getByRole('alert').allTextContents());
        throw error;
      }
      assert.equal(await draftView.locator('img').count(),0);
      assert.equal(await draftView.locator('a[href="https://evil.test"]').count(),0);
      assert.equal(await pages[0].evaluate(()=>window.manualReviewExecuted),undefined);
      assert.equal(await draftView.getByText(unsafeText,{exact:true}).textContent(),unsafeText);
      assert.ok((await draftView.getByRole('link',{name:'ONLY_A · 2026-01-01',exact:true}).getAttribute('href')).includes('returnTo='));
      assert.ok(await draftView.getByRole('region',{name:'Tentative hypotheses',exact:true}).isVisible());
      await draftView.getByRole('link',{name:'Included trades',exact:true}).click();
      assert.equal(new URL(pages[0].url()).hash,'#draft-metric-included');
      await pages[0].setViewportSize({width:390,height:844});
      assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:process.env.JOURNAL_SCREENSHOTS+'-manual-review.png',fullPage:true});
      await pages[0].getByRole('button',{name:'Clear response',exact:true}).click();
      assert.equal(await pages[0].getByLabel('Model response JSON',{exact:true}).inputValue(),'');
      assert.equal(await pages[0].getByRole('region',{name:'Checked review draft',exact:true}).count(),0);
      await pages[0].getByLabel('Model response JSON',{exact:true}).fill('not json');
      await pages[0].getByRole('button',{name:'Check response',exact:true}).click();
      await pages[0].getByRole('alert').filter({hasText:'not valid JSON'}).waitFor();
      assert.equal(await pages[0].getByLabel('Model response JSON',{exact:true}).inputValue(),'not json');
      await pages[0].getByRole('button',{name:'Clear response',exact:true}).click();
      const manualErrors=pages[0].getByRole('form',{name:'Check manual review',exact:true}).getByRole('alert');
      await manualErrors.waitFor({state:'detached'});
      assert.equal(await manualErrors.count(),0);
      assert.deepEqual((await database.query('select * from trades where id=$1',[path.split('/').pop()])).rows,manualBefore);
      console.log('Manual review browser: packet download, pasted response, escaped HTML/URLs, cited sources/metrics, mobile width, clear/recovery and no writes passed.');
      await pages[0].getByLabel('Model response JSON',{exact:true}).fill(browserReply);
      await pages[0].getByRole('button',{name:'Check response',exact:true}).click();
      await draftView.getByText('Review draft',{exact:true}).waitFor();
      await pages[0].getByRole('button',{name:'Save review draft',exact:true}).click();
      await pages[0].waitForURL(/\/review-evidence\/history\/[a-f0-9-]+$/);
      const browserSavedReviewPath=new URL(pages[0].url()).pathname;
      await pages[0].reload();
      const savedView=pages[0].getByRole('region',{name:'Saved review draft',exact:true});
      await savedView.getByText(unsafeText,{exact:true}).waitFor();
      assert.equal(await savedView.locator('img').count(),0);assert.equal(await pages[0].evaluate(()=>window.manualReviewExecuted),undefined);
      await pages[0].getByRole('region',{name:'Original saved evidence',exact:true}).locator('summary').click();
      await pages[0].getByRole('region',{name:'Original saved evidence',exact:true}).getByText('A private rationale',{exact:true}).waitFor();
      assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.JOURNAL_SCREENSHOTS)await pages[0].screenshot({path:process.env.JOURNAL_SCREENSHOTS+'-saved-review.png',fullPage:true});
      await pages[0].getByRole('link',{name:'Back to review history',exact:true}).click();
      await pages[0].getByRole('heading',{name:'Review history',exact:true}).waitFor();
      const savedLink=pages[0].locator(`a[href="${browserSavedReviewPath}"]`);assert.equal(await savedLink.count(),1);
      await savedLink.click();await pages[0].waitForURL(url=>url.pathname===browserSavedReviewPath);
      assert.deepEqual((await database.query('select * from trades where id=$1',[path.split('/').pop()])).rows,manualBefore);
      console.log('Saved review browser: save, reload, escaped draft, original evidence, history/reopen and mobile layout passed.');
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/review-evidence?from=2026-01-01&to=2026-01-01');
      await pages[0].setViewportSize({width:390,height:844});
      assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:process.env.JOURNAL_SCREENSHOTS+'-evidence.png',fullPage:true});
      await pages[0].getByRole('link',{name:'Open trade',exact:true}).click();
      await pages[0].waitForURL(url=>url.pathname===path);
      assert.equal(new URL(pages[0].url()).pathname,path);
      assert.equal(new URL(pages[0].url()).searchParams.get('returnTo'),'/trades?from=2026-01-01&to=2026-01-01');
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/review-evidence?from=bad');
      await pages[0].getByRole('alert').filter({hasText:'Check your dates'}).waitFor();
      await pages[0].getByRole('link',{name:'All time',exact:true}).click();
      await pages[0].getByRole('region',{name:'Evidence coverage',exact:true}).waitFor();
      assert.equal(await pages[0].getByLabel('From entry date (UTC)',{exact:true}).inputValue(),'');
      await pages[0].setViewportSize({width:1440,height:1000});
      console.log('Review evidence browser: date carryover, text inspection, mobile width, trade navigation and recovery passed.');
      const journalContext='/trades?symbol=ONLY_A&review=unreviewed&from=2026-01-01&to=2026-01-01';
      await pages[0].goto(base.replace('127.0.0.1','localhost')+journalContext);
      await pages[0].getByRole('status',{name:'Journal result count',exact:true}).filter({hasText:'1 matching trade · 1 on this page.'}).waitFor();
      await pages[0].getByRole('link',{name:'Unreviewed',exact:true}).click();
      await pages[0].getByRole('heading',{name:'Trade review',exact:true}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('returnTo'),journalContext);
      assert.equal(new URL(pages[0].url()).hash,'#review');
      await pages[0].getByLabel('Did you follow your plan?').selectOption('partly');
      await pages[0].getByLabel('What went well?').fill('Browser reflection');
      await pages[0].getByRole('button',{name:'Save review',exact:true}).click();
      await pages[0].getByText('Last saved (UTC):',{exact:false}).waitFor();
      await pages[0].reload();assert.equal(await pages[0].getByLabel('What went well?').inputValue(),'Browser reflection');
      const editTab=await contexts[0].newPage();
      await editTab.goto(base.replace('127.0.0.1','localhost')+await pages[0].getByRole('link',{name:'Edit or close trade',exact:true}).getAttribute('href'));
      assert.equal(new URL(editTab.url()).searchParams.get('returnTo'),journalContext);
      await editTab.getByLabel('Notes',{exact:true}).fill('STALE_BROWSER_TRADE');
      await pages[0].getByLabel('What went well?').fill('New browser reflection');
      await pages[0].getByRole('button',{name:'Save review',exact:true}).click();
      await pages[0].getByRole('status').filter({hasText:'Review saved.'}).waitFor();
      await editTab.getByRole('button',{name:'Save changes',exact:true}).click();
      await editTab.getByRole('alert').filter({hasText:'changed after you opened'}).waitFor();
      assert.equal(await editTab.getByLabel('Notes',{exact:true}).inputValue(),'STALE_BROWSER_TRADE');
      await Promise.all([editTab.waitForEvent('domcontentloaded'), editTab.getByRole('link',{name:'Load latest saved version (discards this draft)',exact:true}).click()]);
      await editTab.getByLabel('Notes',{exact:true}).fill('Fresh browser correction');
      await editTab.getByRole('button',{name:'Save changes',exact:true}).click();await editTab.waitForURL(url=>url.pathname===path&&url.searchParams.get('returnTo')===journalContext);
      await pages[0].getByLabel('What went well?').fill('STALE_BROWSER_REVIEW');
      await pages[0].getByRole('button',{name:'Save review',exact:true}).click();
      await pages[0].getByRole('alert').filter({hasText:'changed after you opened'}).waitFor();
      assert.equal(await pages[0].getByLabel('What went well?').inputValue(),'STALE_BROWSER_REVIEW');
      await Promise.all([pages[0].waitForEvent('domcontentloaded'), pages[0].getByRole('link',{name:'Load latest saved version (discards this draft)',exact:true}).click()]);
      assert.equal(await pages[0].getByLabel('What went well?').inputValue(),'New browser reflection');
      assert.equal(new URL(pages[0].url()).searchParams.get('returnTo'),journalContext);
      await pages[0].getByRole('link',{name:'Back to trades',exact:true}).click();
      await pages[0].getByText('No trades match these filters.',{exact:false}).waitFor();
      assert.equal(new URL(pages[0].url()).pathname+new URL(pages[0].url()).search,journalContext);
      await pages[0].getByRole('status',{name:'Journal result count',exact:true}).filter({hasText:'0 matching trades · 0 on this page.'}).waitFor();
      await editTab.close();
      console.log('Journal context browser: review, edit save, conflict reload and return to updated queue passed.');

      const beforeCsv=JSON.stringify((await database.query('select * from trades order by id')).rows);
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/trades');
      await pages[0].getByRole('link',{name:'Preview CSV',exact:true}).click();
      await pages[0].getByRole('heading',{name:'Preview trade CSV',exact:true}).waitFor();
      const csvPosts=[];
      const observeCsv=request=>{if(request.method()==='POST')csvPosts.push(request.url());};
      pages[0].on('request',observeCsv);
      await pages[0].getByLabel('Trade CSV',{exact:true}).setInputFiles(resolve('public/samples/rationaleai-mock-trades.csv'));
      await pages[0].getByRole('button',{name:'Preview CSV',exact:true}).click();
      await pages[0].getByRole('status').filter({hasText:'36 records: 30 valid, 6 invalid, 2 repeated. No trades saved.'}).waitFor();
      await pages[0].getByText('Record 32: quantity must be greater than zero',{exact:true}).waitFor();
      await pages[0].getByText('Repeats 4',{exact:true}).waitFor();
      await pages[0].getByText('Details for record 5',{exact:true}).click();
      await pages[0].getByText('Comma, quoted "patience" and a second line.',{exact:true}).waitFor();
      assert.equal(JSON.stringify((await database.query('select * from trades order by id')).rows),beforeCsv,'preview cannot change stored trades');
      const sampleDownload=await fetch(base+'/samples/rationaleai-import-ready.csv');
      assert.equal(sampleDownload.status,200);
      const sampleBytes=Buffer.from(await sampleDownload.arrayBuffer());
      assert.equal(await pages[0].getByRole('link',{name:'Download import-ready CSV',exact:true}).getAttribute('href'),'/samples/rationaleai-import-ready.csv');
      await pages[0].getByLabel('Trade CSV',{exact:true}).setInputFiles({name:'rationaleai-import-ready.csv',mimeType:'text/csv',buffer:sampleBytes});
      await pages[0].getByRole('button',{name:'Preview CSV',exact:true}).click();
      await pages[0].getByRole('status').filter({hasText:'30 records: 30 valid, 0 invalid, 2 repeated. No trades saved.'}).waitFor();
      await pages[0].getByRole('form',{name:'Confirm CSV import',exact:true}).waitFor();
      assert.equal(await pages[0].locator('input[name="allowRepeated"]').isChecked(),false);
      assert.equal(JSON.stringify((await database.query('select * from trades order by id')).rows),beforeCsv);
      await pages[0].getByLabel('Trade CSV',{exact:true}).setInputFiles({name:'broken.csv',mimeType:'text/csv',buffer:Buffer.from('symbol,direction\nBAD,LONG')});
      assert.equal(await pages[0].getByRole('region',{name:'CSV results',exact:true}).count(),0,'changing files clears stale results');
      await pages[0].getByRole('button',{name:'Preview CSV',exact:true}).click();
      await pages[0].getByRole('alert').filter({hasText:'Missing required columns'}).waitFor();
      await pages[0].getByRole('button',{name:'Clear preview',exact:true}).click();
      await pages[0].getByRole('main').getByRole('alert').waitFor({state:'detached'});
      assert.equal(await pages[0].getByLabel('Trade CSV',{exact:true}).inputValue(),'');
      assert.deepEqual(csvPosts,[],'CSV stays in the browser');
      pages[0].off('request',observeCsv);
      console.log('CSV browser: sample counts, row errors, repeats, multiline details, reset and no upload/database writes passed.');

      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/performance');
      await pages[0].getByRole('heading',{name:'Performance breakdowns',exact:true}).waitFor();
      assert.ok((await pages[0].getByRole('region',{name:'By symbol',exact:true}).textContent()).includes('ONLY_A'));
      const symbolTable=pages[0].getByRole('region',{name:'By symbol',exact:true});
      for(const label of ['Average P&L','Average win','Average loss','Profit factor']) await symbolTable.getByRole('columnheader',{name:label,exact:true}).waitFor();
      const openOutcomeCells=await symbolTable.getByRole('row').filter({hasText:'ONLY_A'}).getByRole('cell').allTextContents();
      assert.deepEqual(openOutcomeCells.slice(-4),['—','—','—','—']);
      await pages[0].getByLabel('From entry date (UTC)',{exact:true}).fill('2026-01-01');
      await pages[0].getByLabel('Through entry date (UTC)',{exact:true}).fill('2026-01-01');
      await pages[0].getByRole('button',{name:'Apply dates',exact:true}).click();
      await pages[0].waitForURL(/\/performance\?.*from=2026-01-01/);
      const datedPerformanceUrl=pages[0].url();
      await pages[0].getByRole('link',{name:'View trades for adherence: Partly followed my plan',exact:true}).click();
      await pages[0].getByRole('heading',{name:'Trade history',exact:true}).waitFor();
      assert.equal(await pages[0].locator('[name="adherence"]').inputValue(),'partly');
      assert.equal(await pages[0].locator('[name="from"]').inputValue(),'2026-01-01');
      assert.equal(await pages[0].locator('[name="to"]').inputValue(),'2026-01-01');
      assert.ok((await pages[0].getByRole('link',{name:'Export matching trades (CSV)',exact:true}).getAttribute('href')).includes('adherence=partly'));
      await pages[0].getByRole('link',{name:'Clear filters',exact:true}).click();
      await pages[0].waitForURL('**/trades');
      assert.equal(await pages[0].locator('[name="adherence"]').inputValue(),'');
      await pages[0].goto(datedPerformanceUrl);
      await pages[0].getByRole('link',{name:'View trades for setup: BROWSER_SETUP',exact:true}).click();
      await pages[0].getByRole('heading',{name:'Trade history',exact:true}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('setup'),'BROWSER_SETUP');
      assert.equal(await pages[0].locator('[name="from"]').inputValue(),'2026-01-01');
      assert.equal(await pages[0].locator('[name="to"]').inputValue(),'2026-01-01');
      assert.equal(await pages[0].locator('[name="setup"]').inputValue(),'BROWSER_SETUP');
      assert.ok((await pages[0].getByRole('link',{name:'Export matching trades (CSV)',exact:true}).getAttribute('href')).includes('setup=BROWSER_SETUP'));
      await pages[0].getByRole('link',{name:'Clear filters',exact:true}).click();
      await pages[0].waitForURL('**/trades');
      assert.equal(await pages[0].locator('[name="setup"]').inputValue(),'');
      await pages[0].getByRole('link',{name:'Performance',exact:true}).click();
      await pages[0].getByRole('heading',{name:'Performance breakdowns',exact:true}).waitFor();
      await pages[0].getByLabel('From entry date (UTC)',{exact:true}).fill('2027-01-01');
      await pages[0].getByRole('button',{name:'Apply dates',exact:true}).click();
      await pages[0].getByText('No trades match these entry dates.',{exact:false}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('from'),'2027-01-01');
      await pages[0].getByRole('link',{name:'All time',exact:true}).click();
      await pages[0].getByRole('region',{name:'By symbol',exact:true}).waitFor();
      assert.equal(await pages[0].getByLabel('From entry date (UTC)',{exact:true}).inputValue(),'');
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/trades/preview');

      // Mapping is local-only; validate/download then hand off to the existing preview.
      const mappingCount=(await database.query("select count(*)::int n from trades")).rows[0].n;
      await pages[0].getByRole('link',{name:'Map a paper-trade CSV',exact:true}).click();
      await pages[0].getByRole('heading',{name:'Map a trade CSV',exact:true}).waitFor();
      const mappingSource=await readFile('public/samples/paper-trades-mapping.csv','utf8');
      const mapperRequests=[];
      const captureMapping=request=>{if(request.method()==='POST')mapperRequests.push(request.url());};
      pages[0].on('request',captureMapping);
      await pages[0].getByLabel('Paper-trade CSV',{exact:true}).setInputFiles({name:'paper.csv',mimeType:'text/csv',buffer:Buffer.from(mappingSource)});
      await pages[0].getByRole('button',{name:'Read columns',exact:true}).click();
      for(const [field,index] of Object.entries({'Symbol':0,'Direction':1,'Entry price':2,'Quantity':3,'Entry time (UTC)':4,'Exit price':5,'Exit time (UTC)':6,'Recorded P&L':7,'Setup':8,'Notes':9})) {
        await pages[0].getByLabel(field,{exact:true}).selectOption(String(index));
      }
      await pages[0].getByLabel('Direction values',{exact:true}).selectOption('buy-sell');
      await pages[0].getByRole('checkbox').check();
      await pages[0].getByRole('button',{name:'Validate mapping',exact:true}).click();
      await pages[0].getByText('3 records: 3 valid, 0 invalid, 0 repeated. No trades saved.',{exact:true}).waitFor();
      const mappedDownloadEvent=pages[0].waitForEvent('download');
      await pages[0].getByRole('button',{name:'Download mapped CSV',exact:true}).click();
      const mappedDownload=await mappedDownloadEvent;
      assert.equal(mappedDownload.suggestedFilename(),'rationale-paper-trades.csv');
      const mappedCsv=await readFile(await mappedDownload.path(),'utf8');
      assert.ok(mappedCsv.includes('"SHORT"'));assert.ok(mappedCsv.includes('"-2.00"'));assert.ok(!mappedCsv.includes('DEMO-001'));
      await pages[0].getByText('Reuse a mapping',{exact:true}).click();
      const presetDownloadEvent=pages[0].waitForEvent('download');
      await pages[0].getByRole('button',{name:'Download mapping settings',exact:true}).click();
      const presetDownload=await presetDownloadEvent;
      const presetJson=await readFile(await presetDownload.path(),'utf8');
      assert.equal(JSON.parse(presetJson).fields.symbol,'Instrument');
      assert.ok(!presetJson.includes('EURUSD'));
      await pages[0].getByLabel('Symbol',{exact:true}).selectOption('10');
      await pages[0].getByLabel('Mapping JSON',{exact:true}).setInputFiles({name:'mapping.json',mimeType:'application/json',buffer:Buffer.from(presetJson)});
      await pages[0].waitForFunction(()=>document.querySelector('select[aria-label="Symbol"]').value==='0');
      assert.equal(await pages[0].getByRole('checkbox').isChecked(),false);
      assert.equal(await pages[0].getByRole('button',{name:'Download mapped CSV',exact:true}).count(),0);
      await pages[0].getByRole('checkbox').check();
      await pages[0].getByRole('button',{name:'Validate mapping',exact:true}).click();
      await pages[0].getByText('3 records: 3 valid, 0 invalid, 0 repeated. No trades saved.',{exact:true}).waitFor();
      await pages[0].setViewportSize({width:390,height:844});
      assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:process.env.JOURNAL_SCREENSHOTS+'-mapping.png',fullPage:true});
      await pages[0].setViewportSize({width:1440,height:1000});
      await pages[0].getByLabel('Entry time (UTC)',{exact:true}).selectOption('7');
      assert.equal(await pages[0].getByRole('button',{name:'Download mapped CSV',exact:true}).count(),0);
      await pages[0].getByLabel('Recorded P&L',{exact:true}).selectOption('');
      await pages[0].getByRole('button',{name:'Validate mapping',exact:true}).click();
      await pages[0].getByText('3 records: 0 valid, 3 invalid, 0 repeated. No trades saved.',{exact:true}).waitFor();
      assert.equal(await pages[0].getByRole('button',{name:'Download mapped CSV',exact:true}).count(),0);
      const validationDownloadEvent=pages[0].waitForEvent('download');
      await pages[0].getByRole('button',{name:'Download validation report',exact:true}).click();
      const validationDownload=await validationDownloadEvent;
      assert.equal(validationDownload.suggestedFilename(),'rationale-validation-report.csv');
      const validationCsv=await readFile(await validationDownload.path(),'utf8');
      assert.ok(validationCsv.includes('"source_record","status","duplicate_of","message"'));
      assert.equal((validationCsv.match(/"invalid"/g)||[]).length,3);
      assert.ok(!validationCsv.includes('EURUSD'));
      await pages[0].getByLabel('Symbol',{exact:true}).selectOption('10');
      assert.equal(await pages[0].getByRole('button',{name:'Download validation report',exact:true}).count(),0);
      await pages[0].getByRole('button',{name:'Clear mapping',exact:true}).click();
      assert.equal(await pages[0].getByRole('form',{name:'Paper CSV mapping',exact:true}).count(),0);
      assert.deepEqual(mapperRequests,[]);
      pages[0].off('request',captureMapping);
      assert.equal((await database.query("select count(*)::int n from trades")).rows[0].n,mappingCount);
      await pages[0].getByRole('link',{name:'Preview CSV',exact:true}).click();
      await pages[0].getByLabel('Trade CSV',{exact:true}).setInputFiles({name:'mapped.csv',mimeType:'text/csv',buffer:Buffer.from(mappedCsv)});
      await pages[0].getByRole('button',{name:'Preview CSV',exact:true}).click();
      await pages[0].getByRole('form',{name:'Confirm CSV import',exact:true}).waitFor();
      assert.equal((await database.query("select count(*)::int n from trades")).rows[0].n,mappingCount);
      console.log('Paper CSV mapping: exact values, local-only preview, invalidation, download and import handoff passed.');
      const browserImportCsv=importCsv.replaceAll('BATCH_HTTP','BATCH_BROWSER');
      async function previewBrowserImport() {
        await pages[0].getByLabel('Trade CSV',{exact:true}).setInputFiles({name:'valid.csv',mimeType:'text/csv',buffer:Buffer.from(browserImportCsv)});
        await pages[0].getByRole('button',{name:'Preview CSV',exact:true}).click();
        await pages[0].getByRole('form',{name:'Confirm CSV import',exact:true}).waitFor();
      }
      await previewBrowserImport();
      await pages[0].getByLabel('I confirm these trades should be saved to my journal.',{exact:true}).check();
      await pages[0].getByRole('button',{name:'Confirm import',exact:true}).click();
      await pages[0].getByText('Batch confirmed: 1 trade. Replaying this batch will not add it again.',{exact:true}).waitFor();
      await pages[0].reload();await previewBrowserImport();
      await pages[0].getByLabel('I confirm these trades should be saved to my journal.',{exact:true}).check();
      await pages[0].getByRole('button',{name:'Confirm import',exact:true}).click();
      await pages[0].getByText('Batch confirmed: 1 trade. Replaying this batch will not add it again.',{exact:true}).waitFor();
      assert.equal((await database.query("select count(*)::int n from trades where symbol='BATCH_BROWSER'")).rows[0].n,1);
      const browserReceipt=(await database.query("select r.import_id from trade_import_rows r join trades t on t.id=r.trade_id where t.symbol='BATCH_BROWSER'")).rows[0].import_id;
      await pages[0].getByRole('link',{name:'Import history',exact:true}).last().click();
      await pages[0].getByRole('heading',{name:'Import history',exact:true}).waitFor();
      await pages[0].getByRole('link',{name:`View trades for import ${browserReceipt}`,exact:true}).click();
      await pages[0].getByRole('heading',{name:'Trade history',exact:true}).waitFor();
      assert.equal(await pages[0].getByLabel('Import batch',{exact:true}).inputValue(),browserReceipt);
      await pages[0].getByLabel('Symbol (exact)',{exact:true}).fill('BATCH_BROWSER');
      await pages[0].getByLabel('Recorded outcome',{exact:true}).selectOption('win');
      await pages[0].getByRole('button',{name:'Apply filters',exact:true}).click();
      await pages[0].waitForURL(url=>url.searchParams.get('symbol')==='BATCH_BROWSER'&&url.searchParams.get('import')===browserReceipt);
      assert.ok((await pages[0].getByRole('link',{name:'Export matching trades (CSV)',exact:true}).getAttribute('href')).includes('import='+browserReceipt));
      assert.equal(new URL(pages[0].url()).searchParams.get('outcome'),'win');
      assert.ok((await pages[0].getByRole('link',{name:'Export matching trades (CSV)',exact:true}).getAttribute('href')).includes('outcome=win'));
      await pages[1].goto(base.replace('127.0.0.1','localhost')+'/trades/imports');
      await pages[1].getByText('No imports yet.',{exact:false}).waitFor();
      await pages[1].goto(base.replace('127.0.0.1','localhost')+'/trades?import='+browserReceipt);
      await pages[1].getByText('No trades match these filters.',{exact:false}).waitFor();

      await pages[0].getByRole('link',{name:'BATCH_BROWSER',exact:true}).waitFor();
      console.log('CSV import browser: confirm, save, reload/replay and journal visibility passed.');
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/performance?from=2026-09-01&to=2026-09-01');
      const reportDownloadEvent=pages[0].waitForEvent('download');
      await pages[0].getByRole('link',{name:'Export performance (CSV)',exact:true}).click();
      const reportDownload=await reportDownloadEvent;assert.equal(reportDownload.suggestedFilename(),'rationale-performance.csv');
      const browserReport=await readFile(await reportDownload.path(),'utf8');
      assert.ok(browserReport.includes('"symbol","BATCH_BROWSER","false","2026-09-01","2026-09-01","1","0","0","1","1","0","0","100.0%","2.00"'));
      assert.ok(!browserReport.includes('ONLY_A'));
      assert.ok(browserReport.includes('"month","2026-09","false","2026-09-01","2026-09-01","1"'));
      await pages[0].getByRole('link',{name:'View 1 winning trades for month: 2026-09',exact:true}).click();
      await pages[0].getByRole('link',{name:'BATCH_BROWSER',exact:true}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('from'),'2026-09-01');
      assert.equal(new URL(pages[0].url()).searchParams.get('to'),'2026-09-01');
      assert.equal(new URL(pages[0].url()).searchParams.get('outcome'),'win');
      await pages[0].goBack();

      await pages[0].getByRole('link',{name:'View 0 closed trades without P&L for symbol: BATCH_BROWSER',exact:true}).click();
      await pages[0].getByText('No trades match these filters.',{exact:false}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('outcome'),'missing');
      await pages[0].goBack();
      await pages[0].getByRole('link',{name:'View 1 closed trades with P&L for symbol: BATCH_BROWSER',exact:true}).click();
      await pages[0].getByRole('link',{name:'BATCH_BROWSER',exact:true}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('outcome'),'measured');
      assert.equal(new URL(pages[0].url()).searchParams.get('from'),'2026-09-01');
      assert.ok((await pages[0].getByRole('link',{name:'Export matching trades (CSV)',exact:true}).getAttribute('href')).includes('outcome=measured'));

      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/performance?from=2026-09-01&to=2026-09-01');
      await pages[0].getByRole('link',{name:'View 1 winning trades for symbol: BATCH_BROWSER',exact:true}).click();
      await pages[0].getByRole('link',{name:'BATCH_BROWSER',exact:true}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('outcome'),'win');
      assert.equal(new URL(pages[0].url()).searchParams.get('from'),'2026-09-01');
      await pages[0].goBack();
      await pages[0].getByRole('link',{name:'View 0 break-even trades for symbol: BATCH_BROWSER',exact:true}).click();
      await pages[0].getByText('No trades match these filters.',{exact:false}).waitFor();
      assert.equal(new URL(pages[0].url()).searchParams.get('outcome'),'breakeven');
      await pages[1].goto(base.replace('127.0.0.1','localhost')+'/performance');
      await pages[1].getByText('No trades yet.',{exact:false}).waitFor();
      await pages[1].goto(base.replace('127.0.0.1','localhost')+path);assert.ok(!(await pages[1].textContent('body')).includes('A private rationale'));
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/trades?page=2');
      await pages[0].locator('.journal-filter-panel > summary').click();
      await pages[0].getByLabel('Symbol (exact)',{exact:true}).fill('missing');
      await pages[0].getByRole('button',{name:'Apply filters',exact:true}).click();
      await pages[0].waitForURL(url=>url.searchParams.get('symbol')==='missing'&&!url.searchParams.has('page'));
      await pages[0].getByText('No trades match these filters.',{exact:false}).waitFor();
      await pages[0].getByRole('link',{name:'Clear filters',exact:true}).first().click();
      await pages[0].waitForURL(url=>url.pathname==='/trades'&&!url.search);
      assert.ok((await pages[0].textContent('table')).includes('ONLY_A'));
      // The same semantic ledger becomes cards without hiding fields on mobile.
      await pages[0].setViewportSize({width:390,height:844});
      assert.ok(await pages[0].locator('.journal-filter-panel').evaluate(el=>!el.open));
      assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      await pages[0].locator('.journal-filter-panel > summary').click();
      await pages[0].getByLabel('Symbol (exact)',{exact:true}).fill('ONLY_A');
      await pages[0].getByRole('button',{name:'Apply filters',exact:true}).click();
      await pages[0].waitForURL(url=>url.searchParams.get('symbol')==='ONLY_A');
      await pages[0].getByRole('link',{name:'Remove Symbol filter',exact:true}).click();
      await pages[0].waitForURL(url=>url.pathname==='/trades'&&!url.search);
      assert.ok(await pages[0].getByRole('table').isVisible());
      assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:process.env.JOURNAL_SCREENSHOTS+'-mobile.png',fullPage:true});
      await pages[0].setViewportSize({width:1440,height:1000});
      if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:process.env.JOURNAL_SCREENSHOTS+'-desktop.png',fullPage:true});
      await pages[0].getByRole('link',{name:'ONLY_A',exact:true}).click();
      await pages[0].getByRole('heading',{name:'The thinking behind the trade',exact:true}).waitFor();
      await pages[0].setViewportSize({width:390,height:844});
      assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      await pages[0].getByRole('link',{name:'Jump to review ↓',exact:true}).click();
      await pages[0].waitForURL(url=>url.hash==='#review');
      if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:process.env.JOURNAL_SCREENSHOTS+'-detail.png',fullPage:true});
      await pages[0].getByRole('link',{name:'Back to trades',exact:true}).click();
      await pages[0].waitForURL(url=>url.pathname==='/trades');
      await pages[0].setViewportSize({width:1440,height:1000});

      const downloadEvent=pages[0].waitForEvent('download');
      await pages[0].getByRole('link',{name:'Export matching trades (CSV)',exact:true}).click();
      const download=await downloadEvent;assert.equal(download.suggestedFilename(),'rationale-trades.csv');
      const browserCsv=await readFile(await download.path(),'utf8');assert.ok(browserCsv.includes('ONLY_A'));assert.ok(!browserCsv.includes('ONLY_B'));

      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/');
      await pages[0].getByLabel('From entry date (UTC)',{exact:true}).fill('2026-09-01');
      await pages[0].getByLabel('Through entry date (UTC)',{exact:true}).fill('2026-09-01');
      await pages[0].getByRole('button',{name:'Apply dates',exact:true}).click();
      await pages[0].waitForURL(url=>url.searchParams.get('from')==='2026-09-01');
      assert.ok((await pages[0].getByRole('link',{name:'View all matching trades',exact:true}).getAttribute('href')).includes('to=2026-09-01'));
      await pages[0].getByRole('link',{name:'Closed trades awaiting review: 0',exact:true}).click();
      await pages[0].waitForURL(url=>url.pathname==='/trades'&&url.searchParams.get('from')==='2026-09-01'&&url.searchParams.get('review')==='unreviewed');
      await pages[0].getByText('No trades match these filters.',{exact:false}).waitFor();
      await pages[0].goBack();
      await pages[0].getByRole('link',{name:'View performance for these dates',exact:true}).click();
      await pages[0].waitForURL(url=>url.pathname==='/performance'&&url.searchParams.get('from')==='2026-09-01');
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/?from=2027-01-01');
      await pages[0].getByRole('link',{name:'All time',exact:true}).click();
      await pages[0].waitForURL(url=>url.pathname==='/'&&!url.search);
      assert.equal(await pages[0].getByLabel('From entry date (UTC)',{exact:true}).inputValue(),'');
      const lastMonth=pages[0].getByRole('link',{name:'Last month',exact:true});
      const monthUrl=new URL(await lastMonth.getAttribute('href'),base);
      await lastMonth.click();
      await pages[0].waitForURL(url=>url.search===monthUrl.search);
      assert.equal(await pages[0].getByLabel('From entry date (UTC)',{exact:true}).inputValue(),monthUrl.searchParams.get('from'));
      assert.equal(await pages[0].getByLabel('Through entry date (UTC)',{exact:true}).inputValue(),monthUrl.searchParams.get('to'));
      await pages[0].getByRole('link',{name:'View performance for these dates',exact:true}).click();
      await pages[0].waitForURL(url=>url.pathname==='/performance'&&url.search===monthUrl.search);
      const lastWeek=pages[0].getByRole('link',{name:'Last 7 days',exact:true});
      const weekUrl=new URL(await lastWeek.getAttribute('href'),base);
      await lastWeek.click();
      await pages[0].waitForURL(url=>url.search===weekUrl.search);
      const exportUrl=new URL(await pages[0].getByRole('link',{name:'Export performance (CSV)',exact:true}).getAttribute('href'),base);
      assert.equal(exportUrl.search,weekUrl.search);
      await pages[0].getByRole('link',{name:'All time',exact:true}).click();
      await pages[0].waitForURL(url=>url.pathname==='/performance'&&!url.search);
      assert.equal(await pages[0].getByLabel('From entry date (UTC)',{exact:true}).inputValue(),'');
      for (const [name,query] of [
        [/^Open \/ incomplete trades:/,'status=open'],
        [/^Closed trades missing P&L:/,'outcome=missing'],
        [/^Closed trades awaiting review:/,'status=closed&review=unreviewed'],
      ]) {
        await pages[0].goto(base.replace('127.0.0.1','localhost')+'/');
        const card=pages[0].getByRole('region',{name:'Journal follow-up',exact:true}).getByRole('link',{name});
        assert.equal(await card.getAttribute('href'),'/trades?'+query);
        await card.click();
        await pages[0].waitForURL(url=>url.pathname==='/trades'&&url.search==='?'+query);
      }
      await pages[1].goto(base.replace('127.0.0.1','localhost')+'/');
      await pages[1].getByRole('link',{name:'Closed trades awaiting review: 0',exact:true}).click();
      await pages[1].getByText('No trades match these filters.',{exact:false}).waitFor();
      // The shared frame must remain usable on every route at narrow widths.
      const visualRoutes = [
        ['/', 'Dashboard', 'dashboard'], ['/trades', 'Trade history', 'journal'],
        ['/performance', 'Performance', 'performance'], ['/review-evidence', 'Review evidence', 'evidence'],
        ['/review-evidence/history', 'Review evidence', 'review-history'], [browserSavedReviewPath, 'Review evidence', 'saved-review'],
        ['/trades/preview', 'Trade history', 'preview'], ['/trades/map-csv', 'Trade history', 'mapping-empty'],
        ['/trades/imports', 'Trade history', 'imports'], ['/trades/new', 'Trade history', 'new'],
        [path, 'Trade history', 'trade'], [path+'/edit', 'Trade history', 'edit'],
        ['/account', 'Account', 'account'],
      ];
      for (const width of [320, 1440]) {
        await pages[0].setViewportSize({width,height:1000});
        for (const [route,active,name] of visualRoutes) {
          await pages[0].goto(base.replace('127.0.0.1','localhost')+route);
          const nav=pages[0].getByRole('navigation',{name:'Main navigation',exact:true});
          assert.equal(await nav.locator('[aria-current="page"]').textContent(),active);
          assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} fits ${width}px`);
          assert.equal(await pages[0].locator('main#main-content').count(),1);
          if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:`${process.env.JOURNAL_SCREENSHOTS}-${name}-${width}.png`,fullPage:true});
        }
        for (const route of ['/sign-in','/sign-up','/forgot-password','/reset-password','/verify-email']) {
          await pages[0].goto(base.replace('127.0.0.1','localhost')+route);
          assert.ok(await pages[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} fits ${width}px`);
          assert.ok(await pages[0].getByRole('heading',{level:1}).isVisible());
          if(process.env.JOURNAL_SCREENSHOTS) await pages[0].screenshot({path:`${process.env.JOURNAL_SCREENSHOTS}-${route.slice(1)}-${width}.png`,fullPage:true});
        }
      }
      await pages[0].goto(base.replace('127.0.0.1','localhost')+'/trades/new');
      await pages[0].keyboard.press('Tab');
      assert.equal(await pages[0].locator(':focus').textContent(),'Skip to content');
      await pages[0].keyboard.press('Enter');
      assert.equal(await pages[0].locator(':focus').getAttribute('id'),'main-content');
      await pages[0].getByLabel('Symbol',{exact:true}).focus();
      assert.equal(await pages[0].locator(':focus').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
      console.log(`Shared UI browser: active navigation, ${visualRoutes.length + 5} routes at 320/1440px, skip link and field focus passed.`);
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
