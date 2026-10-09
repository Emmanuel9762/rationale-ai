import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users, tradingAccounts } from '../src/db/schema';
import { accountForUser } from '../src/lib/trade-writes';
import { safeErrorCodes } from '../src/lib/safe-error';

dotenv.config({path:'.env.isolation.local',quiet:true});
async function main() {
  if(process.env.ISOLATION_ALLOW_WRITES!=='1'||!process.env.ISOLATION_DATABASE_URL)throw Error('Set ISOLATION_DATABASE_URL and ISOLATION_ALLOW_WRITES=1 for a disposable migrated branch.');
  const {neon,neonConfig}=await import('@neondatabase/serverless');
  const {drizzle}=await import('drizzle-orm/neon-http');
  const {fetch,EnvHttpProxyAgent,Agent}=await import('undici');
  const dispatcher=process.env.TEST_USE_PROXY==='1'?new EnvHttpProxyAgent():new Agent({connect:{family:4}});
  neonConfig.fetchFunction=(input: Parameters<typeof fetch>[0],init?: Parameters<typeof fetch>[1])=>fetch(input,{...init,dispatcher});
  const db=drizzle(neon(process.env.ISOLATION_DATABASE_URL));
  const [user]=await db.insert(users).values({email:`concurrency-${randomUUID()}@example.test`}).returning();
  try {
    const ids=await Promise.all(Array.from({length:12},()=>accountForUser(db,user.id)));
    assert.equal(new Set(ids).size,1);
    assert.equal((await db.select().from(tradingAccounts).where(eq(tradingAccounts.userId,user.id))).length,1);
    await assert.rejects(db.insert(tradingAccounts).values({userId:user.id,name:'Rejected duplicate',balance:'0',isDefault:true}),error=>safeErrorCodes(error).includes('23505'));
    console.log('Neon concurrency: 12 independent HTTP requests converge on one account; database rejects a second default.');
  } finally {
    // Only the synthetic owner created by this invocation is removed.
    await db.batch([db.delete(tradingAccounts).where(eq(tradingAccounts.userId,user.id)),db.delete(users).where(eq(users.id,user.id))]);
  }
}
main().catch(error=>{console.error('Concurrency check failed.',safeErrorCodes(error).join(', '));process.exitCode=1;});
