/* eslint-disable @typescript-eslint/no-require-imports */
// Test process only. Production code has no fixture mode or auth bypass.
const u = require('undici');
const original = u.fetch;
if (process.env.DATABASE_URL !== 'postgresql://fixture:fixture@fixture.invalid/test' || !process.env.TEST_SQL_ENDPOINT?.startsWith('https://127.0.0.1:')) throw Error('Invalid isolation fixture configuration');
u.fetch = (input, init) => original(new URL(String(input)).hostname.endsWith('.invalid') ? process.env.TEST_SQL_ENDPOINT : input, init);
