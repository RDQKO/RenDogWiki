const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const { makeLoader } = require('./helpers/load-ts.cjs');
const input = makeLoader()('app/wiki/lib/apiInput.ts');
const { parseDocumentContent } = makeLoader()('app/wiki/lib/documentInput.ts');

test('missing limits use intended defaults, explicit values are finite bounded integers', () => {
  for (const value of [null, undefined, '', '  ', 'bad', 'NaN', 'Infinity']) assert.equal(input.boundedInteger(value, 50, 1, 100), 50);
  for (const [value, expected] of [['0', 1], ['-3', 1], ['2.9', 2], ['1000', 100], ['12', 12]]) assert.equal(input.boundedInteger(value, 50, 1, 100), expected);
  assert.equal(input.escapeLike('100%_\\'), '100\\%\\_\\\\');
});

test('malformed document content cannot silently erase the stored document', () => {
  for (const value of [null, undefined, '{bad', '{}', {}, [null], [{ type: 'paragraph', children: [] }]]) assert.equal(parseDocumentContent(value), null);
  for (const value of [[], [{ type: 'paragraph', children: [{ text: '보존할 본문' }] }], '[{"type":"paragraph","children":[{"text":"본문"}]}]']) assert.ok(Array.isArray(parseDocumentContent(value)));
});

test('JWT validation rejects unsigned, wrong algorithm, expired and invalid IDs', async () => {
  process.env.JWT_SECRET = 'isolated-unit-test-secret';
  let token;
  const load = makeLoader({ 'next/headers': { cookies: async () => ({ get: () => token ? { value: token } : undefined }) } });
  const auth = load('app/wiki/lib/auth.ts');
  const payload = { id: 1, username: 'writer', email: 'writer@example.test', minecraft_name: 'Writer' };
  assert.equal(await auth.getAuthUser(), null);
  for (const candidate of [jwt.sign(payload, '', { algorithm: 'none' }), jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS384' }), jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: -1 }), jwt.sign({ ...payload, id: -1 }, process.env.JWT_SECRET)]) {
    token = candidate; assert.equal(await auth.getAuthUser(), null);
  }
  token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  assert.equal((await auth.getAuthUser()).id, 1);
});
