const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const babel = require('next/dist/compiled/babel/core');
const { JSDOM } = require('jsdom');

// Use the actual styled-jsx compiler. Plain TSX/jsdom rendering cannot detect
// that replacing a native img with a custom component drops its scope class.
function compile(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.Preserve },
  }).outputText;
  return babel.transformSync(js, { configFile: false, babelrc: false,
    plugins: [require('styled-jsx/babel')], parserOpts: { plugins: ['jsx'] }, ast: true });
}

function strings(node) {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'StringLiteral') return [node.value];
  if (node.type === 'TemplateElement') return [node.value.cooked || node.value.raw];
  if (Array.isArray(node)) return node.flatMap(strings);
  return Object.entries(node).filter(([key]) => !['loc', 'extra', 'leadingComments', 'trailingComments'].includes(key)).flatMap(([, value]) => strings(value));
}

function hasDynamicScope(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && node.callee.property?.name === 'dynamic') return true;
  return Object.values(node).some(value => Array.isArray(value) ? value.some(hasDynamicScope) : hasDynamicScope(value));
}

for (const [file, className, size] of [
  ['app/components/wiki/Breadcrumb.tsx', 'wiki-breadcrumb-icon-img', '16px'],
  ['app/components/wiki/DocQuickBadges.tsx', 'qbd-doc-icon-img', '24px'],
]) {
  test(`compiled styles preserve ${size} icon size: ${className}`, () => {
    const output = compile(file);
    let scopeClass, dynamic = false;
    babel.traverse(output.ast, { JSXOpeningElement(path) {
      if (path.node.name.type !== 'JSXIdentifier' || path.node.name.name !== 'img') return;
      const attribute = path.node.attributes.find(a => a.type === 'JSXAttribute' && a.name.name === 'className');
      const value = strings(attribute?.value).join(' ');
      if (value.includes(className)) { scopeClass = value; dynamic = hasDynamicScope(attribute?.value); }
    } });
    assert.ok(scopeClass, 'original native image element is present');
    assert.ok(dynamic || /jsx-[a-z0-9]+/.test(scopeClass), 'styled-jsx attaches a static or dynamic scope class');
    const allCss = strings(output.ast).filter(value => value.includes(`.${className}`) && value.includes('width:')).join('\n');
    const rule = allCss.match(new RegExp(`\\.${className}[^{}]*\\{[^{}]*\\}`));
    assert.ok(rule, 'compiled icon sizing rule exists');
    const css = rule[0].replace(/__jsx-style-dynamic-selector/g, 'jsx-test-dynamic');
    const classes = `${dynamic ? 'jsx-test-dynamic' : scopeClass.match(/jsx-[a-z0-9]+/)[0]} ${className}`;
    const dom = new JSDOM('<html><head></head><body></body></html>');
    try {
      const style = dom.window.document.createElement('style'); style.textContent = css; dom.window.document.head.append(style);
      const img = dom.window.document.createElement('img'); img.className = classes; dom.window.document.body.append(img);
      const computed = dom.window.getComputedStyle(img);
      assert.equal(computed.width, size); assert.equal(computed.height, size);
    } finally { dom.window.close(); }
  });
}
