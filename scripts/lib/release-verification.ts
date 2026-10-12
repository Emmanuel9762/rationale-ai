import { execFileSync } from "node:child_process";

export function parseExpectedRef(args: string[]) {
  if (args.length !== 2 || args[0] !== "--expect-ref" || !/^[a-zA-Z0-9][a-zA-Z0-9/._-]*$/.test(args[1])) {
    throw new Error("Usage: npm run release:verify -- --expect-ref <fetched-ref-or-commit>");
  }
  return args[1];
}

export function verifyCheckout(cwd: string, expectedRef: string) {
  // No shell and no revision expressions supplied by the caller.
  parseExpectedRef(["--expect-ref", expectedRef]);
  const git = (...args: string[]) => execFileSync("git", args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  let head: string;
  let expected: string;
  let dirty: string;
  try {
    head = git("rev-parse", "--verify", "HEAD");
    expected = git("rev-parse", "--verify", "--end-of-options", `${expectedRef}^{commit}`);
    dirty = git("status", "--porcelain", "--untracked-files=all");
  } catch {
    throw new Error("Cannot resolve the checkout or expected revision. Fetch origin and check the supplied ref; database verification was not started.");
  }
  if (head !== expected) {
    throw new Error(`Checkout mismatch: HEAD ${head.slice(0, 12)}, expected ${expected.slice(0, 12)}. Switch successfully before verifying; database verification was not started.`);
  }
  if (dirty) {
    throw new Error("Checkout has uncommitted or untracked files. Inspect git status and preserve your work before verifying; database verification was not started.");
  }
  return head;
}

export async function verifyRelease(
  cwd: string,
  expectedRef: string,
  verifyDatabase: () => Promise<void>,
) {
  const head = verifyCheckout(cwd, expectedRef);
  await verifyDatabase();
  // Catch checkout changes made while the database check was running.
  let finalHead: string;
  try {
    finalHead = verifyCheckout(cwd, expectedRef);
  } catch {
    throw new Error("Checkout changed or could not be verified after the database check. Inspect git status and run verification again.");
  }
  if (finalHead !== head) {
    throw new Error("Checkout changed during verification. Run the check again.");
  }
  return head;
}
