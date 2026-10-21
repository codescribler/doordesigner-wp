// Designer 3's first screen draws a style-neutral outline per door type (not a single-door slab):
// Double has two leaves and two handles, Stable has the split, every type gets an svg.
// `node tests/js/d3-type-art.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, html: '',
    appendChild: function (c) { n.children.push(c); return c; },
    addEventListener: function () {}, setAttribute: function (k, v) { n.attrs[k] = v; }
  };
  Object.defineProperty(n, 'innerHTML', { set: function (v) { n.html = v; n.children = []; }, get: function () { return n.html; } });
  return n;
}
global.document = { createElement: node };
global.window = {
  HD_DD_SwipeParts: require('../../assets/js/swipe/swipe-parts.js'),
  HD_DD_D3TypeArt: require('../../assets/js/designer3/d3-type-art.js')
};
require('../../assets/js/designer3/d3-screens.js');

var types = ['Single Door', 'Double Door', 'Stable Door', 'Avantal'];
var byType = {};
types.forEach(function (t) { byType[t] = { fields: { 'Door Design': [{ label: 'Abbott' }] } }; });
var picked = [];
var app = {
  types: function () { return types; }, type: function () { return 'Single Door'; },
  cv: { byType: byType }, model: {}, assetBase: function () { return ''; },
  go: function () {}, select: function (k, v) { picked.push([k, v]); }
};
var shell = node('div');
window.HD_DD_D3Screens.type(app, shell);

function find(n, test, out) { out = out || []; if (test(n)) { out.push(n); } n.children.forEach(function (c) { find(c, test, out); }); return out; }
var cards = find(shell, function (n) { return n.className.indexOf('hd-d3-card ') === 0 || n.className === 'hd-d3-card'; });
assert.strictEqual(cards.length, 4, 'one card per type');
function art(i) { return find(cards[i], function (n) { return n.html.indexOf('<svg') === 0; })[0]; }
function count(html, cls) { return html.split('class="' + cls).length - 1; }

cards.forEach(function (c, i) {
  assert.ok(art(i), types[i] + ' card draws an svg');
  assert.strictEqual(find(c, function (n) { return n.tag === 'img'; }).length, 0, types[i] + ' has no door-slab picture');
});
assert.strictEqual(count(art(0).html, 'hd-dd__sil-handle'), 1, 'single: one handle');
assert.strictEqual(count(art(1).html, 'hd-dd__sil-handle'), 2, 'double: two handles');
assert.strictEqual(count(art(1).html, 'hd-dd__sil-panel'), 2, 'double: two leaves');
assert.strictEqual(count(art(2).html, 'hd-dd__sil-split'), 1, 'stable: the split');
assert.strictEqual(count(art(3).html, 'hd-dd__sil-frame hd-dd__sil-frame--slim'), 1, 'aluminium: slim frame');
assert.strictEqual(window.HD_DD_D3TypeArt.svg('Nope'), '', 'unknown type draws nothing');

// Without the art module the card falls back to the picture (no crash).
delete window.HD_DD_D3TypeArt;
var shell2 = node('div');
window.HD_DD_D3Screens.type(app, shell2);
assert.strictEqual(find(shell2, function (n) { return n.className.indexOf('hd-d3-card') === 0; }).length >= 4, true);

console.log('d3-type-art: ok');
