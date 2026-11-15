const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEditor, Editor, Node, Transforms } = require('slate');
const { withHistory } = require('slate-history');
const { makeLoader } = require('./helpers/load-ts.cjs');
const load = makeLoader({ '@/wiki/lib/db': {} });
const { withCollapsible, wrapInCollapsible, unwrapCollapsible } = load('app/components/editor/helpers/collapsible.ts');
const { ensureWeaponStats } = load('app/components/editor/render/weapon/weaponStatUtils.ts');
const { extractHeadings } = load('app/wiki/lib/extractHeadings.ts');
const { buildDocumentSearchSections } = load('app/wiki/lib/documentSearchIndex.ts');
const { extractSearchSections } = load('app/wiki/lib/extractSearchSections.ts');
const p = text => ({ type: 'paragraph', children: [{ text }] });
const plain = value => JSON.parse(JSON.stringify(value));
function editorWith(value) { const e = withCollapsible(withHistory(createEditor())); e.children = plain(value); return e; }

test('partial selection wraps only selected text and preserves marks, undo and redo', () => {
  const original = [p('before text'), { type: 'paragraph', children: [{ text: 'chosen', bold: true }, { text: ' tail' }] }, p('after')];
  const e = editorWith(original);
  const selection = { anchor: { path: [0, 0], offset: 7 }, focus: { path: [1, 0], offset: 6 } };
  wrapInCollapsible(e, selection, { title: '설명', defaultOpen: false });
  assert.deepEqual(plain(e.children), [p('before '), { type: 'collapsible', title: '설명', defaultOpen: false, children: [p('text'), { type: 'paragraph', children: [{ text: 'chosen', bold: true }] }] }, p(' tail'), p('after')]);
  e.undo(); assert.deepEqual(plain(e.children), original);
  e.redo(); assert.equal(e.children[1].defaultOpen, false);
  const saved = plain(e.children);
  const reopened = editorWith(saved); Editor.normalize(reopened, { force: true });
  assert.deepEqual(plain(reopened.children), saved);
});

test('backward and hanging selections preserve boundaries', () => {
  const e = editorWith([p('first'), p('second'), p('third')]);
  wrapInCollapsible(e, { anchor: { path: [2, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } });
  assert.equal(e.children[0].type, 'collapsible');
  assert.equal(Node.string(e.children[0]), 'firstsecond');
  assert.equal(Node.string(e.children[1]), 'third');
});

test('table selections keep complete rows and cells, and unwrapping keeps their content', () => {
  const table = { type: 'table', children: [{ type: 'table-row', children: [{ type: 'table-cell', children: [p('A')] }, { type: 'table-cell', children: [p('B')] }] }] };
  const e = editorWith([table, p('tail')]);
  wrapInCollapsible(e, { anchor: { path: [0, 0, 0, 0, 0], offset: 0 }, focus: { path: [1, 0], offset: 4 } });
  assert.deepEqual(plain(e.children[0].children[0]), table);
  unwrapCollapsible(e, [0]);
  assert.deepEqual(plain(e.children), [table, p('tail')]);
});

test('regions can nest and empty regions normalize to an editable paragraph', () => {
  const e = editorWith([{ type: 'collapsible', title: 'outer', defaultOpen: false, children: [p('one'), p('two')] }]);
  wrapInCollapsible(e, { anchor: { path: [0, 0, 0], offset: 0 }, focus: { path: [0, 1, 0], offset: 3 } });
  assert.equal(e.children[0].children[0].type, 'collapsible');
  const blank = editorWith([{ type: 'collapsible', title: 'empty', defaultOpen: true, children: [] }]);
  Editor.normalize(blank, { force: true });
  assert.equal(blank.children[0].children[0].type, 'paragraph');
  const fresh = editorWith([]); wrapInCollapsible(fresh, null);
  assert.equal(fresh.children[0].children[0].type, 'paragraph');
});

test('nested headings retain TOC order, unique anchors and search sections', () => {
  const heading = text => ({ type: 'heading-one', children: [{ text }] });
  const value = [heading('반복'), p('앞'), { type: 'collapsible', title: '접힌 안내', defaultOpen: false, children: [heading('반복'), p('숨겨진 설명'), { type: 'weapon-card', name: '검', stats: [{ label: '추가 효과', summary: '힘 증가' }], children: [{ text: '' }] }] }, heading('마지막'), p('뒤')];
  const headings = extractHeadings(value);
  assert.deepEqual(Array.from(headings, h => h.domId), ['heading-반복--0', 'heading-반복--1', 'heading-마지막--0']);
  const sections = buildDocumentSearchSections(value);
  assert.equal(sections[1].domId, 'heading-반복--1');
  assert.match(sections[1].plainText, /숨겨진 설명/);
  assert.match(sections[1].plainText, /힘 증가/);
  assert.equal(sections[2].headingText, '마지막');
  assert.equal(extractSearchSections(value)[1].domId, 'heading-반복--1');
});

test('weapon normalization supports 15 unique fields without losing original six values', () => {
  const keys = ['damage', 'cooldown', 'hitCount', 'range', 'duration', 'heal'];
  const original = keys.map((key, i) => ({ key, label: `항목 ${i}`, summary: `${i + 10}`, unit: '%', enabled: true, levels: [{ levelLabel: '기본', value: `${i}` }] }));
  const stats = ensureWeaponStats(original, 'hidden');
  assert.equal(stats.length, 15); assert.equal(new Set(stats.map(s => s.key)).size, 15);
  assert.deepEqual(plain(stats.slice(0, 6)), original);
  const expanded = stats.map((s, i) => ({ ...s, enabled: true, label: `정보 ${i + 1}`, summary: `${i + 1}` }));
  assert.deepEqual(plain(ensureWeaponStats(plain(expanded), 'hidden')), plain(expanded));
  assert.equal(stats.slice(6).every(s => !s.enabled), true);
});

test('old URL hashes do not create document scroll intents and explicit search targets are consumed once', () => {
  const { setNextDocumentHeading, consumeNextDocumentHeading } = load('app/wiki/lib/documentScrollIntent.ts');
  assert.equal(consumeNextDocumentHeading(74), '');
  setNextDocumentHeading(74, 'heading-target--0');
  assert.equal(consumeNextDocumentHeading(75), '');
  assert.equal(consumeNextDocumentHeading(74), '#heading-target--0');
  assert.equal(consumeNextDocumentHeading(74), '');
  setNextDocumentHeading(74, 'heading-target--0');
  setNextDocumentHeading(74, null);
  assert.equal(consumeNextDocumentHeading(74), '');
});
