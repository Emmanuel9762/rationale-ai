import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseExpectedRef, verifyRelease } from "./lib/release-verification";

async function main() {
  const expectedRef = parseExpectedRef(process.argv.slice(2));
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const head = await verifyRelease(cwd, expectedRef, () => new Promise<void>((resolve, reject) => {
    console.log("Checkout matches the expected revision and is clean. Running read-only database verification.");
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/verify-database.ts"], {
      cwd, stdio: "inherit", env: process.env,
    });
    child.once("error", () => reject(new Error("Could not start database verification.")));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Database verification did not pass. Release verification stopped.")));
  }));
  console.log(`Checkout and database verification passed for ${head}.`);
  console.log("No migrations applied. Confirm database/Auth pairing privately and complete browser acceptance in RELEASE.md; this is not deployment approval.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Release verification failed.");
  process.exitCode = 1;
});
