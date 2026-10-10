import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseExpectedRef, verifyRelease } from "../scripts/lib/release-verification";

function checkout() {
  const cwd = mkdtempSync(join(tmpdir(), "rationale-release-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  writeFileSync(join(cwd, ".gitignore"), ".env.local\n");
  writeFileSync(join(cwd, "README.md"), "original\n");
  git("add", ".");
  git("commit", "-m", "fixture");
  const head = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/release", head);
  return { cwd, git, head, close: () => rmSync(cwd, { recursive: true, force: true }) };
}

test("release arguments require an explicit revision and reject extra arguments and expressions", () => {
  assert.equal(parseExpectedRef(["--expect-ref", "origin/codex/cp32-release-preflight"]), "origin/codex/cp32-release-preflight");
  for (const args of [[], ["--expect-ref"], ["--expect-ref", "HEAD~1"], ["--expect-ref", "--help"], ["--expect-ref", "main", "extra"]]) {
    assert.throws(() => parseExpectedRef(args), /Usage:/);
  }
});

test("clean matching detached checkout runs verification without exposing ignored environment files", async () => {
  const fixture = checkout();
  try {
    fixture.git("checkout", "--detach");
    writeFileSync(join(fixture.cwd, ".env.local"), "PRIVATE=fixture\n");
    let calls = 0;
    assert.equal(await verifyRelease(fixture.cwd, "origin/release", async () => { calls++; }), fixture.head);
    assert.equal(calls, 1);
  } finally { fixture.close(); }
});

test("wrong checkout, missing ref, modified, staged and untracked work stop before database access", async () => {
  const fixture = checkout();
  try {
    let calls = 0;
    const verify = async () => { calls++; };
    await assert.rejects(verifyRelease(fixture.cwd, "origin/missing", verify), /Cannot resolve/);
    writeFileSync(join(fixture.cwd, "README.md"), "local work\n");
    await assert.rejects(verifyRelease(fixture.cwd, "origin/release", verify), /uncommitted/);
    fixture.git("add", "README.md");
    await assert.rejects(verifyRelease(fixture.cwd, "origin/release", verify), /uncommitted/);
    fixture.git("commit", "-m", "local commit");
    await assert.rejects(verifyRelease(fixture.cwd, "origin/release", verify), /Checkout mismatch/);
    writeFileSync(join(fixture.cwd, "new.ts"), "// untracked\n");
    await assert.rejects(verifyRelease(fixture.cwd, "HEAD", verify), /untracked/);
    assert.equal(calls, 0);
  } finally { fixture.close(); }
});

test("database failure and mid-checkout changes cannot report success", async () => {
  const fixture = checkout();
  try {
    await assert.rejects(verifyRelease(fixture.cwd, "origin/release", async () => { throw new Error("database failed"); }), /database failed/);
    await assert.rejects(verifyRelease(fixture.cwd, "origin/release", async () => {
      writeFileSync(join(fixture.cwd, "README.md"), "changed during verification");
    }), /after the database check/);
  } finally { fixture.close(); }
});
