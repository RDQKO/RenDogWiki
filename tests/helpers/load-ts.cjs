const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function makeLoader(overrides = {}, globals = {}) {
  const modules = new Map();
  function load(filename) {
    if (!path.isAbsolute(filename)) filename = path.resolve(root, filename);
    if (!path.extname(filename)) filename += '.ts';
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, console, process, Buffer, Date, URL, URLSearchParams, Request, Response,
      AbortController, AbortSignal, setTimeout, clearTimeout, global: {}, ...globals,
      require(id) {
        if (Object.hasOwn(overrides, id)) return overrides[id];
        if (id === 'server-only') return {};
        if (id.startsWith('@/wiki/')) return load(path.join(root, 'app/wiki', id.slice(7)));
        if (id.startsWith('@wiki/')) return load(path.join(root, 'app/wiki', id.slice(6)));
        if (id.startsWith('@/app/')) return load(path.join(root, id.slice(2)));
        if (id.startsWith('./') || id.startsWith('../')) return load(path.resolve(path.dirname(filename), id));
        return require(id);
      },
    }, { filename });
    return module.exports;
  }
  return load;
}
module.exports = { makeLoader };
