import assert from 'node:assert/strict';
import https from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';

// Exercise real Next Server Actions and the installed SDK with a controlled
// HTTPS provider. No live Neon accounts or database credentials are used.
const dir = await mkdtemp(join(tmpdir(), 'rationale-auth-'));
let child;
let provider;
try {
  const cert = join(dir, 'cert.pem'), key = join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const user = { id: '00000000-0000-4000-8000-000000000009', email: 'auth-test@example.test', name: 'Test', emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  let active = false, expired = false;
  let password;
  const token = randomBytes(24).toString('hex');
  provider = https.createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const path = new URL(req.url, 'https://localhost').pathname;
    res.setHeader('Content-Type', 'application/json');
    const reply = (data, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (path.endsWith('/sign-up/email') || path.endsWith('/sign-in/email')) {
      if (path.endsWith('/sign-up/email')) password = body.password;
      if (body.password !== password) return reply({ message: 'Invalid credentials', code: 'INVALID_EMAIL_OR_PASSWORD' }, 401);
      active = true; expired = false;
      res.setHeader('Set-Cookie', `__Secure-neon-auth.session_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`);
      return reply({ token, user });
    }
    if (path.endsWith('/get-session')) {
      if (!active || !req.headers.cookie?.includes(token)) return reply(null);
      return reply({ user, session: { id: 'session-test', token, userId: user.id, expiresAt: new Date(Date.now() + (expired ? -60000 : 3600000)).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    }
    if (path.endsWith('/sign-out')) {
      active = false;
      res.setHeader('Set-Cookie', '__Secure-neon-auth.session_token=; Path=/; HttpOnly; Secure; Max-Age=0');
      return reply({ success: true });
    }
    reply({ message: 'Unknown test endpoint' }, 404);
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '0'], {
    env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: cert, DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', NEON_AUTH_BASE_URL: `https://127.0.0.1:${provider.address().port}/auth`, NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString('hex') }, stdio: ['ignore', 'pipe', 'pipe'],
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
  const jar = new Map();
  const decode = s => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  async function request(path, init = {}) {
    const r = await fetch(base + path, { ...init, redirect: 'manual', headers: { Origin: base, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, signal: AbortSignal.timeout(10000) });
    for (const header of r.headers.getSetCookie()) {
      const pair = header.split(';')[0], i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return r;
  }
  async function submit(path, fields) {
    const html = await (await request(path)).text(); const body = new FormData();
    for (const tag of html.match(/<input[^>]*type="hidden"[^>]*>/g) ?? []) {
      const name = tag.match(/name="([^"]*)"/), value = tag.match(/value="([^"]*)"/);
      if (name) body.append(decode(name[1]), decode(value?.[1] ?? ''));
    }
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    return request(path, { method: 'POST', body });
  }
  const credentials = { email: user.email, password: randomBytes(24).toString('hex') };
  let response = await submit('/sign-up', { ...credentials, name: user.name });
  assert.equal(response.status, 303, 'signup action redirect');
  assert.equal(response.headers.get('location'), '/account');
  for (let i = 0; i < 2; i++) {
    response = await request('/account'); assert.equal(response.status, 200); assert.ok((await response.text()).includes(user.email));
  }
  expired = true;
  response = await request('/account'); assert.equal(response.headers.get('location'), '/sign-in', 'expired provider session is denied despite cached cookie');
  expired = false;
  response = await submit('/account', {}); assert.equal(response.headers.get('location'), '/sign-in');
  response = await request('/account'); assert.equal(response.headers.get('location'), '/sign-in');
  response = await submit('/sign-in', { ...credentials, password: 'wrong-password' });
  assert.equal(response.status, 200); assert.match(await response.text(), /Sign-in failed/);
  response = await submit('/sign-in', credentials); assert.equal(response.headers.get('location'), '/account');
  response = await submit('/account', {}); assert.equal(response.headers.get('location'), '/sign-in');
  console.log('Auth HTTP flow: registration, session refresh, expiry, sign-out, invalid credentials and sign-in passed. Provider was a controlled fixture.');
} finally {
  if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped; }
  provider?.closeAllConnections();
  if (provider?.listening) await new Promise(resolve => provider.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
