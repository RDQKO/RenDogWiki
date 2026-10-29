const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../app/wiki/lib/browserStorage.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2017,
  },
}).outputText;

function loadStorage(windowValue) {
  const module = { exports: {} };
  const context = { module, exports: module.exports };
  if (windowValue !== undefined) context.window = windowValue;
  vm.runInNewContext(compiled, context, { filename });
  return module.exports;
}

function createStorage(entries = []) {
  const values = new Map(entries);
  let writeError = null;
  return {
    values,
    failWrites(error) { writeError = error; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (writeError) throw writeError;
      values.set(key, String(value));
    },
  };
}

test('server rendering does not access or retain browser preferences', () => {
  const api = loadStorage();
  assert.equal(api.getLocalStorage(), null);
  assert.equal(api.readLocalStorage('imgmgr.selectedFolder'), null);
  assert.equal(api.writeLocalStorage('imgmgr.selectedFolder', '3'), false);
  assert.equal(api.readLocalStorage('imgmgr.selectedFolder'), null);
});

test('available storage persists preferences and reads external updates', () => {
  const storage = createStorage();
  const api = loadStorage({ localStorage: storage });
  assert.equal(api.writeLocalStorage('imgmgr.selectedFolder', '3'), true);
  assert.equal(storage.getItem('imgmgr.selectedFolder'), '3');
  storage.setItem('imgmgr.selectedFolder', '8');
  assert.equal(api.readLocalStorage('imgmgr.selectedFolder'), '8');
});

test('a full store does not break image preferences or remove editor drafts', () => {
  const draft = JSON.stringify([{ slot: 1, snapshot: [{ text: 'Unsaved work' }] }]);
  const storage = createStorage([['rdwiki:auto-draft:doc:1', draft]]);
  storage.failWrites(new DOMException('Storage is full', 'QuotaExceededError'));
  const api = loadStorage({ localStorage: storage });

  for (const [key, value] of [
    ['imgmgr.selectedFolder', '3'],
    ['imgmgr.treeState', '{"3":true}'],
    ['imgmgr.favoriteFolders.v1', '[3]'],
  ]) {
    assert.equal(api.writeLocalStorage(key, value), false);
    assert.equal(api.readLocalStorage(key), value);
    assert.equal(storage.getItem(key), null);
  }

  assert.deepEqual([...storage.values], [['rdwiki:auto-draft:doc:1', draft]]);
});

test('failed preference changes override older persisted values until recovery', () => {
  const storage = createStorage([['wiki:doc-badge-mode', 'quick']]);
  storage.failWrites(new DOMException('Storage is full', 'QuotaExceededError'));
  const api = loadStorage({ localStorage: storage });

  assert.equal(api.writeLocalStorage('wiki:doc-badge-mode', 'favorites'), false);
  assert.equal(api.readLocalStorage('wiki:doc-badge-mode'), 'favorites');
  assert.equal(storage.getItem('wiki:doc-badge-mode'), 'quick');

  storage.failWrites(null);
  assert.equal(api.writeLocalStorage('wiki:doc-badge-mode', 'favorites'), true);
  storage.setItem('wiki:doc-badge-mode', 'quick');
  assert.equal(api.readLocalStorage('wiki:doc-badge-mode'), 'quick');
});

test('denied localStorage property access falls back without throwing', () => {
  const deniedWindow = Object.defineProperty({}, 'localStorage', {
    get() { throw new DOMException('Access denied', 'SecurityError'); },
  });
  const api = loadStorage(deniedWindow);

  assert.equal(api.getLocalStorage(), null);
  assert.equal(api.readLocalStorage('rdwiki-theme'), null);
  assert.equal(api.writeLocalStorage('rdwiki-theme', 'dark'), false);
  assert.equal(api.readLocalStorage('rdwiki-theme'), 'dark');
});

test('denied storage methods do not prevent reading fallback preferences', () => {
  const storage = {
    getItem() { throw new DOMException('Access denied', 'SecurityError'); },
    setItem() { throw new DOMException('Access denied', 'SecurityError'); },
  };
  const api = loadStorage({ localStorage: storage });

  assert.equal(api.readLocalStorage('wiki:mode'), null);
  assert.equal(api.writeLocalStorage('wiki:mode', 'RPG'), false);
  assert.equal(api.readLocalStorage('wiki:mode'), 'RPG');
});

test('failed writes are limited to the current page lifetime', () => {
  const storage = createStorage();
  storage.failWrites(new DOMException('Storage is full', 'QuotaExceededError'));
  const api = loadStorage({ localStorage: storage });
  api.writeLocalStorage('imgmgr.selectedFolder', '3');
  assert.equal(api.readLocalStorage('imgmgr.selectedFolder'), '3');

  const reloadedPage = loadStorage({ localStorage: storage });
  assert.equal(reloadedPage.readLocalStorage('imgmgr.selectedFolder'), null);
});

test('badge and favorite listeners see updated preferences when storage is full', () => {
  const storage = createStorage([['wiki:doc-badge-mode', 'quick']]);
  storage.failWrites(new DOMException('Storage is full', 'QuotaExceededError'));
  const events = [];
  const windowValue = {
    localStorage: storage,
    dispatchEvent(event) { events.push(event); },
  };
  const api = loadStorage(windowValue);
  const favoritesFilename = path.join(__dirname, '../app/wiki/lib/docFavorites.ts');
  const favoritesCode = ts.transpileModule(fs.readFileSync(favoritesFilename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2017,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(favoritesCode, {
    module,
    exports: module.exports,
    window: windowValue,
    require(id) {
      assert.equal(id, './browserStorage');
      return api;
    },
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
  }, { filename: favoritesFilename });
  const favorites = module.exports;

  favorites.writeDocBadgeMode('favorites');
  assert.equal(favorites.readDocBadgeMode(), 'favorites');
  assert.equal(events[0].type, favorites.DOC_BADGE_MODE_EVENT);
  assert.equal(events[0].detail.mode, 'favorites');

  favorites.writeDocFavorites([
    { id: 3, title: 'Guide', href: '/wiki?id=3', emoji: '⭐', addedAt: 1 },
  ]);
  assert.equal(favorites.readDocFavorites()[0].id, 3);
  assert.equal(events[1].type, favorites.DOC_FAVORITES_EVENT);
  assert.equal(storage.getItem('wiki:doc-favorites'), null);
});
