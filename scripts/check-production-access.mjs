import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";

// Exercise a real production server without using a live database or credentials.
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "0"], {
  env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test", NEON_AUTH_BASE_URL: "https://127.0.0.1:1/auth", NEON_AUTH_COOKIE_SECRET: "test-only-cookie-secret-not-for-deployment" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", chunk => { output += chunk.toString(); });
child.stderr.on("data", chunk => { output += chunk.toString(); });
const deadline = Date.now() + 30000;
try {
  let base;
  while (Date.now() < deadline) {
    const match = output.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
    if (match && output.includes("Ready in")) { base = `http://127.0.0.1:${match[1]}`; break; }
    if (child.exitCode !== null) throw new Error("Production server exited before startup");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(base, "Production server did not start within 30 seconds");
  const id = "00000000-0000-4000-8000-000000000000";
  for (const path of ["/", "/trades", "/trades/new", `/trades/${id}`, `/trades/${id}/edit`]) {
    const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), "/sign-in", path);
    await response.text();
  }
  const manifest = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
  for (const [name, path, args] of [
    ["createTrade", "/trades/new", [{ error: "" }, {}]],
    ["updateTrade", `/trades/${id}/edit`, [id, { error: "" }, {}]],
  ]) {
    const entry = Object.entries(manifest.node).find(([, action]) => action.exportedName === name);
    assert.ok(entry, `Missing action ${name}`);
    const response = await fetch(base + path, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(10000),
      headers: { "Next-Action": entry[0], "Content-Type": "text/plain;charset=UTF-8", Origin: base },
      body: JSON.stringify(args),
    });
    // Next may stream the redirect destination with status 200 for an RSC action.
    assert.ok([200, 303].includes(response.status), name);
    assert.match(response.headers.get("x-action-redirect") ?? "", /^\/sign-in;/, name);
    await response.text();
  }
  const signIn = await fetch(base + "/sign-in");
  assert.equal(signIn.status, 200);
  assert.match(await signIn.text(), /Sign in to your journal/);
  console.log("Production access: 5 protected pages and both save actions redirect; sign-in page is accessible.");
} finally {
  const exited = once(child, "exit");
  if (child.exitCode === null) { child.kill("SIGTERM"); await exited; }
}
