const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { makeLoader } = require('./helpers/load-ts.cjs');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://wiki.test/wiki?id=74', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Document', 'ShadowRoot', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Range', 'Text', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'MutationObserver', 'File', 'FormData']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
global.getSelection = window.getSelection.bind(window);
global.getComputedStyle = window.getComputedStyle.bind(window);
const React = require('react');
const { act } = require('react-dom/test-utils');
const { createRoot } = require('react-dom/client');
const { renderToString } = require('react-dom/server');
const globals = { window, document, HTMLElement, Element, Node, CustomEvent, getComputedStyle: window.getComputedStyle.bind(window), File, FormData,
  requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  fetch: (...args) => fetchMock(...args), alert: message => alerts.push(message), navigator: window.navigator };
let fetchMock = async () => new Response('{}');
let alerts = [];
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const load = makeLoader({}, globals);
const { ModalCard } = load('app/components/common/Modal.tsx');
const ImageUploadModal = load('app/components/image/ImageUploadModal.tsx').default;
const CollapsibleBlock = load('app/components/wiki-render/collapsible/CollapsibleBlock.tsx').default;
const { revealCollapsedAncestors } = load('app/wiki/lib/collapsible.ts');
const h = React.createElement;
let activeRoots = [];
async function render(element) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); activeRoots.push({ root, container });
  await act(async () => { root.render(element); });
  return { container, rerender: async element => { await act(async () => root.render(element)); } };
}
async function cleanup() {
  await act(async () => { activeRoots.forEach(({ root }) => root.unmount()); });
  activeRoots.forEach(({ container }) => container.remove()); activeRoots = []; alerts = [];
}
async function click(button) { assert.ok(button, 'button exists'); await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true }))); }
function button(text) { return [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text); }
function drop(target, files) { const event = new Event('drop', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'dataTransfer', { value: { files } }); target.dispatchEvent(event); }
after(async () => { await cleanup(); dom.window.close(); });

test('modal content and footer survive conflicting route CSS, scroll internally, and support server rendering', async () => {
  await cleanup();
  const css = document.createElement('style');
  css.textContent = fs.readFileSync('app/components/common/Modal.module.css', 'utf8').replace(/:global\(([^)]+)\)/g, '$1') + fs.readFileSync('app/wiki/css/wiki-final-polish.css', 'utf8') + '\n.rd-card-content,.rd-card-heading,.rd-card-button-wrapper{display:none!important;color:transparent!important}';
  document.head.append(css);
  assert.equal(renderToString(h(ModalCard, { open: true, title: '경고', onClose() {} }, '로그인이 필요합니다.')), '');
  const before = document.createElement('button'); document.body.append(before); before.focus();
  let closed = 0;
  const ui = await render(h(ModalCard, { open: true, title: '경고', onClose: () => closed++, actions: h('button', null, '확인') }, h('p', null, '로그인이 필요합니다.')));
  const panel = document.querySelector('[role="dialog"]');
  assert.ok(panel); assert.match(panel.textContent, /로그인이 필요합니다/);
  assert.notEqual(window.getComputedStyle(panel.querySelector('h2')).display, 'none');
  assert.equal(window.getComputedStyle(panel.querySelector('.content')).overflowY, 'auto');
  assert.equal(button('확인').parentElement.className, 'actions');
  assert.notEqual(window.getComputedStyle(button('확인')).display, 'none');
  const legacy = document.createElement('div'); legacy.style.cssText = 'position:fixed;z-index:100000';
  legacy.innerHTML = '<div><div>title</div><div><div>drop</div><div id=legacy-buttons><button>취소</button><button>업로드</button></div></div></div>';
  document.body.append(legacy);
  assert.notEqual(window.getComputedStyle(legacy.querySelector('#legacy-buttons')).display, 'none');
  legacy.remove();
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(panel.contains(document.activeElement), true);
  const wheel = new Event('wheel', { bubbles: true, cancelable: true }); panel.querySelector('.content').dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented, false);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(closed, 1);
  await ui.rerender(h(ModalCard, { open: false, title: '경고', onClose() {} }));
  assert.equal(document.body.style.overflow, ''); assert.equal(document.activeElement, before);
  before.remove(); css.remove();
});

test('nested modal Escape affects only the top dialog and traps Tab', async () => {
  await cleanup();
  let parentClosed = 0;
  function Harness() {
    const [child, setChild] = React.useState(false);
    return h(ModalCard, { open: true, title: '부모', onClose: () => parentClosed++ },
      h('button', { onClick: () => setChild(true) }, '자식 열기'),
      h(ModalCard, { open: child, title: '자식', onClose: () => setChild(false), actions: h('button', null, '끝') }, h('button', null, '처음')));
  }
  await render(h(Harness)); await click(button('자식 열기'));
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 2);
  const last = button('끝'); last.focus();
  await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  assert.equal(document.activeElement.getAttribute('aria-label'), '닫기');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1); assert.equal(parentClosed, 0);
  assert.equal(document.body.style.overflow, 'hidden');
});

test('image drop updates the file list and persistent actions, then uploads and resets the modal', async () => {
  await cleanup();
  const uploaded = []; let resolveUpload; let request;
  fetchMock = (url, options) => { request = { url, options }; return new Promise(resolve => { resolveUpload = resolve; }); };
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return h(ImageUploadModal, { open, folderId: 5, onClose: () => setOpen(false), onUploaded: files => uploaded.push(...files) });
  }
  await render(h(Harness));
  assert.ok(button('취소')); assert.equal(button('업로드').disabled, true);
  const image = new File(['image'], '드롭.png', { type: '', lastModified: 1 });
  await act(async () => drop(document.querySelector('label.custum-file-upload'), [image]));
  assert.match(document.body.textContent, /드롭.png/); assert.equal(button('업로드').disabled, false);
  assert.equal(button('업로드').parentElement.className, 'actions');
  await click(button('업로드'));
  assert.equal(request.url, '/api/image/upload'); assert.equal(request.options.body.get('folder_id'), '5');
  assert.equal(request.options.body.get('files').name, '드롭.png');
  assert.equal(document.querySelector('input[type="file"]').disabled, true);
  await act(async () => {
    drop(document.querySelector('label.custum-file-upload'), [new File(['later'], 'later.png')]);
    resolveUpload(new Response(JSON.stringify({ images: [{ id: 1, name: '드롭.png', url: '/local-image', folder_id: 5 }] }), { status: 200 }));
  });
  assert.equal(uploaded.length, 1); assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('reader toggles regions, keeps its choice through rerenders, and TOC reveals all closed ancestors', async () => {
  await cleanup();
  const content = h(CollapsibleBlock, { title: '안쪽', defaultOpen: false }, h('h2', { id: 'heading-target--0' }, '목표'));
  const ui = await render(h(CollapsibleBlock, { title: '바깥', defaultOpen: false }, content));
  const [outer, inner] = document.querySelectorAll('details');
  assert.equal(outer.open, false); assert.equal(inner.open, false);
  outer.open = true;
  await ui.rerender(h(CollapsibleBlock, { title: '바깥', defaultOpen: false }, content));
  assert.equal(outer.open, true);
  outer.open = false; revealCollapsedAncestors(document.getElementById('heading-target--0'));
  assert.equal(outer.open, true); assert.equal(inner.open, true);
});

test('FAQ uses shared auth with null page user and exposes edit/delete only through context menu', async () => {
  await cleanup();
  const item = { id: 1, title: '테스트 질문', content: '답변', tags: [], uploader: '관리자' };
  let role = 'admin';
  const FaqList = makeLoader({ '@/components/auth/AuthProvider': { useAuth: () => ({ canWrite: role !== 'guest', isAdmin: role === 'admin' }) }, '@/components/wiki/FaqUpsertModal': { default: () => h('div', { 'data-edit-modal': true }, '편집 창'), __esModule: true } }, globals)('app/components/wiki/FaqList.tsx').default;
  fetchMock = async url => new Response(JSON.stringify(url.startsWith('/api/faq?') ? [item] : item));
  const ui = await render(h(FaqList, { user: null }));
  assert.ok(button('Q테스트 질문')); assert.equal(document.querySelector('.faq-inline-edit'), null);
  const row = document.querySelector('.faq-row');
  await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })));
  assert.ok(button('질문 수정')); assert.ok(button('질문 삭제'));
  await click(button('질문 수정')); assert.ok(document.querySelector('[data-edit-modal]'));
  role = 'writer'; await ui.rerender(h(FaqList, { user: null }));
  await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  assert.ok(button('질문 수정')); assert.equal(button('질문 삭제'), undefined);
  role = 'guest'; await ui.rerender(h(FaqList, { user: null }));
  assert.equal(document.querySelector('[role="menu"]'), null);
});

test('direct management entry shows a complete denial dialog for guests and ordinary accounts', async () => {
  await cleanup();
  let loggedIn = false; let path;
  const Layout = makeLoader({
    '@/components/auth/AuthProvider': { useAuth: () => ({ loading: false, hydrated: true, canWrite: false, loggedIn }) },
    'next/navigation': { useRouter: () => ({ replace: value => { path = value; } }) },
  }, globals)('app/manage/layout.tsx').default;
  const ui = await render(h(Layout, null, '관리 내용'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /로그인이 필요합니다/);
  assert.equal(document.body.textContent.includes('관리 내용'), false);
  await click(button('확인')); assert.equal(path, '/wiki');
  loggedIn = true; await ui.rerender(h(Layout, null, '관리 내용'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /권한이 없습니다/);
});

test('document navigation clears stale TOC hashes, stays at the top, and shows the admin FAQ add action', async () => {
  await cleanup();
  window.history.replaceState({}, '', '/wiki?id=74#heading-target--0');
  let params = new URLSearchParams(window.location.search);
  const scrolls = [];
  const oldScrollTo = window.HTMLElement.prototype.scrollTo;
  const oldRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.scrollTo = function (value) { this.scrollTop = value.top; scrolls.push({ id: this.id, top: value.top }); };
  window.scrollTo = value => { scrolls.push({ id: 'window', top: value.top }); };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const root = document.getElementById('wiki-scroll-root');
    const top = this.id === 'heading-target--0' ? 1000 - (root?.scrollTop ?? 0) : 0;
    return { top, left: 0, bottom: top + 30, right: 800, width: 800, height: 30, x: 0, y: top, toJSON() {} };
  };
  const noop = () => null;
  const mod = component => ({ __esModule: true, default: component });
  const docs = [{ id: 74, title: '일반 문서', path: 1, fullPath: [1] }, { id: 75, title: '자주 묻는 질문', path: 1, fullPath: [1], special: 'faq' }];
  let rerender;
  const router = { push(url) { window.history.pushState({}, '', url); params = new URLSearchParams(window.location.search); rerender?.(); }, replace(url) { window.history.replaceState({}, '', url); params = new URLSearchParams(window.location.search); rerender?.(); } };
  const Tree = props => h('nav', null, ...docs.map(doc => h('button', { key: doc.id, 'data-open-document': doc.id, onClick: () => props.fetchDoc([1], doc.title, doc.id, { history: 'push' }) }, `문서 ${doc.id}`)));
  const auth = { user: { id: 1, username: 'admin', email: '', minecraft_name: 'admin' }, canWrite: true, isAdmin: true };
  const wikiLoad = makeLoader({
    '@/components/auth/AuthProvider': { useAuth: () => auth },
    'next/navigation': { useRouter: () => router, useSearchParams: () => params },
    '@/components/common/Header': mod(noop), './CategoryTree': mod(Tree), './Breadcrumb': mod(noop),
    './NpcGrid': mod(noop), './HeadGrid': mod(noop), './MobileWikiNav': mod(noop),
    './NpcDetailModal': mod(noop), './HeadDetailModal': mod(noop), './DocQuickBadges': mod(noop),
    './FaqList': { ...mod(noop), FaqDetailModal: noop },
    '@/components/wiki/FaqUpsertModal': mod(noop),
    '@/wiki/lib/WikiReadRenderer': mod(() => h('h2', { id: 'heading-target--0' }, 'Target')),
    '@fortawesome/react-fontawesome': { FontAwesomeIcon: () => null },
  }, { ...globals, performance, Blob, URL, URLSearchParams });
  const Wiki = wikiLoad('app/components/wiki/WikiPageInner.tsx').default;
  fetchMock = async raw => {
    const url = new URL(raw, 'https://wiki.test');
    if (url.pathname === '/api/bootstrap') return Response.json({ categories: [{ id: 1, name: '분류', parent_id: null }], documents: docs });
    if (url.pathname.startsWith('/api/documents')) {
      const id = Number(url.searchParams.get('id') || url.pathname.split('/').pop());
      const doc = docs.find(d => d.id === id) || docs[0];
      return Response.json({ ...doc, content: [{ type: 'heading-one', children: [{ text: 'Target' }] }, { type: 'paragraph', children: [{ text: 'body' }] }] });
    }
    return Response.json([]);
  };
  try {
    const ui = await render(h(Wiki, { user: null }));
    rerender = () => ui.rerender(h(Wiki, { user: null }));
    await act(async () => { await new Promise(r => setTimeout(r, 350)); });
    const root = document.getElementById('wiki-scroll-root'); assert.ok(root);
    root.style.overflowY = 'auto';
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 2500 });
    assert.equal(window.location.hash, '');
    assert.equal(scrolls.some(s => s.top > 0), false, 'stale URL did not move to a heading');
    await act(async () => window.dispatchEvent(new CustomEvent('rdwiki:search-hash-nav', { detail: { domId: 'heading-target--0' } })));
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    assert.equal(root.scrollTop, 928);
    assert.match(window.location.hash, /heading-target/);
    const before = scrolls.length;
    await click(document.querySelector('[data-open-document="74"]'));
    await act(async () => { await new Promise(r => setTimeout(r, 1250)); });
    assert.equal(window.location.hash, ''); assert.equal(root.scrollTop, 0);
    assert.equal(scrolls.slice(before).some(s => s.top > 0), false, 'reopening did not bounce back to the old heading');
    await click(document.querySelector('[data-open-document="75"]'));
    await act(async () => { await new Promise(r => setTimeout(r, 350)); });
    assert.ok(document.querySelector('button[aria-label="질문 추가"]'));
    assert.equal(document.querySelector('button[aria-label="질문 추가"]').parentElement.parentElement.querySelector('h2').textContent.includes('자주 묻는 질문'), true);
  } finally {
    await cleanup();
    window.HTMLElement.prototype.scrollTo = oldScrollTo;
    window.HTMLElement.prototype.getBoundingClientRect = oldRect;
  }
});

test('real Slate editor creates a region, changes its saved default state, folds it and unwraps without losing text', async () => {
  await cleanup();
  const { createEditor, Editor, Transforms, Node: SlateNode } = require('slate');
  const { withHistory } = require('slate-history');
  const { Slate, Editable, withReact } = require('slate-react');
  const { Simulate } = require('react-dom/test-utils');
  const { withCollapsible } = load('app/components/editor/helpers/collapsible.ts');
  const Insert = load('app/components/editor/CollapsibleInsertControl.tsx').default;
  const Adapter = load('app/components/editor/render/blocks/CollapsibleEditorAdapter.tsx').default;
  const editor = withCollapsible(withHistory(withReact(createEditor())));
  const initial = [{ type: 'paragraph', children: [{ text: 'alpha' }] }, { type: 'paragraph', children: [{ text: 'beta' }] }];
  const selectionRef = { current: null };
  const element = props => props.element.type === 'collapsible' ? h(Adapter, { ...props, editor }) : h('p', props.attributes, props.children);
  await render(h(Slate, { editor, value: initial, onChange() {} }, h(Insert, { editor, selectionRef }), h(Editable, { renderElement: element })));
  await act(async () => Transforms.select(editor, { anchor: { path: [0, 0], offset: 0 }, focus: { path: [1, 0], offset: 4 } }));
  await click(document.querySelector('[aria-label="펼침·접힘 영역 추가"]'));
  await act(async () => {
    Simulate.change(document.querySelector('select'), { target: { value: 'closed' } });
  });
  await click(button('확인'));
  assert.equal(editor.children[0].type, 'collapsible'); assert.equal(editor.children[0].defaultOpen, false);
  assert.equal(SlateNode.string(editor.children[0]), 'alphabeta');
  await click(document.querySelector('[aria-label="편집 영역 접기"]'));
  assert.equal(document.querySelector('[data-wiki-collapsible="edit"] .body').hidden, true);
  assert.equal(editor.selection, null);
  await click(document.querySelector('[aria-label="펼침·접힘 영역 메뉴"]'));
  await click(button('기본 상태를 펼침으로'));
  assert.equal(editor.children[0].defaultOpen, true);
  await click(document.querySelector('[aria-label="펼침·접힘 영역 메뉴"]'));
  await click(button('영역 해제 (내용 유지)'));
  assert.deepEqual(JSON.parse(JSON.stringify(editor.children)), initial);
  assert.equal(document.querySelector('[data-wiki-collapsible="edit"]'), null);
});
