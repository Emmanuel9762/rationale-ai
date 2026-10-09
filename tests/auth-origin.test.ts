import test from "node:test";
import assert from "node:assert/strict";
import { appOrigin } from "../src/lib/auth/app-origin";

test("reset callbacks require an explicit safe origin", () => {
  assert.equal(appOrigin({APP_ORIGIN:"http://localhost:3000"}),"http://localhost:3000");
  assert.equal(appOrigin({APP_ORIGIN:"https://journal.example/"}),"https://journal.example");
  for (const value of [undefined,"http://journal.example","https://user:secret@journal.example","https://journal.example/redirect","https://journal.example/?next=evil","javascript:alert(1)"]) {
    assert.throws(()=>appOrigin({APP_ORIGIN:value}));
  }
});
