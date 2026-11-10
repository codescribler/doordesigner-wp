// boot.js and the emailed My designs link (?designs=TOKEN&k=KEY): once k has been read it is taken
// out of the address bar with history.replaceState, keeping designs= and every other parameter.
// boot.js runs here in a sandbox with a stub page. `node tests/js/d4-boot-key.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var src = fs.readFileSync(path.join(__dirname, '..', '..', 'assets/js/boot.js'), 'utf8');

function run(href) {
  var u = new URL(href);
  var replaced = [], opened = [], ready = null;
  function D4() {}
  D4.prototype.loadDesigns = function (t, k) { opened.push(['designs', t, k]); };
  D4.prototype.loadCopy = function (t) { opened.push(['copy', t]); };
  D4.prototype.render = function () { opened.push(['render']); };
  var root = { getAttribute: function () { return ''; }, innerHTML: '', textContent: '' };
  var win = {
    location: { href: href, search: u.search, pathname: u.pathname, hash: u.hash, origin: u.origin },
    history: { state: null, replaceState: function (s, t, url) { replaced.push(String(url)); } },
    HD_DD_CONFIG: { restUrl: 'https://example.test/wp-json/hd/', catalogueUrl: 'cat', renderModelUrl: 'rm' },
    HD_DD_Experiment: { canRunSwipe: function () { return false; }, canRunDesigner3: function () { return true; }, canRunDesigner4: function () { return true; },
      forcedFlow: function () { return ''; }, resolve: function () { return { flow: 'designer4', counted: false }; } },
    HD_DD_Designer4App: D4,
    console: console
  };
  var doc = {
    addEventListener: function (k, f) { if (k === 'DOMContentLoaded') { ready = f; } },
    querySelectorAll: function () { return [root]; },
    querySelector: function () { return null; },
    createElement: function () { return { style: {} }; },
    body: { appendChild: function () {} }
  };
  var ctx = {
    window: win, document: doc, URLSearchParams: URLSearchParams, URL: URL, Promise: Promise, console: console,
    fetch: function (url) { return Promise.resolve({ json: function () { return url === 'cat' ? { catalogue: { byType: { 'Single Door': {} } } } : { available: true, model: {} }; } }); }
  };
  vm.runInNewContext(src, ctx);
  ready();
  return new Promise(function (r) { setTimeout(r, 20); }).then(function () { return { replaced: replaced, opened: opened }; });
}

(async function () {
  var a = await run('https://example.test/door-designer/?designs=T1&k=K1&utm_source=email#top');
  assert.deepStrictEqual(a.opened, [['designs', 'T1', 'K1']], 'the owner pair is still handed to the app');
  assert.strictEqual(a.replaced.length, 1, 'the address is replaced once');
  var after = new URL(a.replaced[0], 'https://example.test');
  assert.strictEqual(after.searchParams.get('k'), null, 'k is gone from the address bar');
  assert.strictEqual(after.searchParams.get('designs'), 'T1', 'designs= is kept');
  assert.strictEqual(after.searchParams.get('utm_source'), 'email', 'other parameters are kept');
  assert.strictEqual(after.pathname, '/door-designer/', 'the path is kept');
  assert.strictEqual(after.hash, '#top', 'the hash is kept');

  var b = await run('https://example.test/door-designer/?designs=T1');
  assert.deepStrictEqual(b.replaced, [], 'no k: the address is left alone');
  var c = await run('https://example.test/door-designer/?design=T2');
  assert.deepStrictEqual(c.replaced, [], 'a design link is left alone');
  assert.deepStrictEqual(c.opened, [['copy', 'T2']], 'and opens as a copy');
  console.log('d4-boot-key.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
