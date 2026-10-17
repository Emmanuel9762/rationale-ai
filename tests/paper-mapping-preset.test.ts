import assert from "node:assert/strict";
import test from "node:test";
import { PRESET_MAX_BYTES, readMappingPreset, writeMappingPreset } from "../src/lib/paper-mapping-preset";

const headers = ["Instrument", "Side", "Entry", "Size", "Opened UTC", "Comment"];
const mapping = {symbol:0, direction:1, entry_price:2, quantity:3, entry_time_utc:4, notes:5};
const saved = writeMappingPreset(headers, mapping, "buy-sell");
test("presets round trip column choices and follow names when columns move", () => {
  assert.deepEqual(readMappingPreset(saved, headers), {mapping, direction:"buy-sell"});
  assert.deepEqual(readMappingPreset(saved, [...headers].reverse()).mapping,
    {symbol:5, direction:4, entry_price:3, quantity:2, entry_time_utc:1, notes:0});
  assert.deepEqual(Object.keys(JSON.parse(saved)).sort(), ["direction", "fields", "version"]);
  assert.throws(() => readMappingPreset(saved, headers.slice(0,-1)), /missing/);
  assert.throws(() => readMappingPreset(saved, [...headers, "Side"]), /ambiguous/);
});
test("untrusted presets reject unsupported versions, fields, duplicates and missing required choices", () => {
  const valid = JSON.parse(saved);
  for (const value of [null, [], {...valid, version:2}, {...valid, direction:"auto"},
    {...valid, confirmed:true}, {...valid, fields:[]}, {...valid, fields:{}},
    {...valid, fields:{...valid.fields, notes:"Side"}},
    {...valid, fields:{...valid.fields, account_id:"Comment"}},
    {...valid, fields:{...valid.fields, notes:4}}]) {
    assert.throws(() => readMappingPreset(JSON.stringify(value), headers));
  }
  assert.throws(() => readMappingPreset('{"version":1,"direction":"buy-sell","fields":{"__proto__":"Side"}}', headers));
  assert.throws(() => readMappingPreset("invalid", headers), /valid mapping/);
  assert.throws(() => readMappingPreset(" ".repeat(PRESET_MAX_BYTES+1), headers), /16 KiB/);
  assert.throws(() => writeMappingPreset(headers, {...mapping, notes:99}, "buy-sell"), /existing/);
  assert.throws(() => writeMappingPreset(headers, {...mapping, notes:0}, "buy-sell"), /distinct/);
});
