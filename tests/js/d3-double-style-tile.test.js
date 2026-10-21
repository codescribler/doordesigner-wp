// Designer 3's style screen draws a Double Door style as both leaves (composited layers), not one slab.
// `node tests/js/d3-double-style-tile.test.js`
var assert = require('assert');
function node(tag) {
  var n = { tag: tag, className: '', textContent: '', children: [], attrs: {}, style: {}, html: '',
    appendChild: function (c) { n.children.push(c); return c; }, addEventListener: function () {}, setAttribute: function () {} };
  Object.defineProperty(n, 'innerHTML', { set: function (v) { n.html = v; n.children = []; }, get: function () { return n.html; } });
  return n;
}
global.document = { createElement: node };
global.window = { HD_DD_SwipeParts: require('../../assets/js/swipe/swipe-parts.js'), HD_DD_RenderModel: require('../../assets/js/render-model.js') };
require('../../assets/js/designer3/d3-screens.js');
var model = require('../../data/render-model.json');
var type = 'Double Door', cur = type;
var app = {
  type: function () { return cur; }, style: function () { return 'Abbott'; }, styles: function () { return [{ label: 'Abbott' }]; },
  categories: {}, model: model, assetBase: function () { return 'http://x/endurance'; }, go: function () {}, select: function () {}
};
function find(n, t, out) { out = out || []; if (t(n)) { out.push(n); } n.children.forEach(function (c) { find(c, t, out); }); return out; }
function imgs(t) {
  cur = t; var shell = node('div'); window.HD_DD_D3Screens.style(app, shell);
  return find(shell, function (n) { return n.tag === 'img'; });
}
var dbl = imgs('Double Door');
assert.ok(dbl.length >= 3, 'double style tile is several layers (both leaves), got ' + dbl.length);
assert.ok(dbl.some(function (i) { return i.style.transform === 'scaleX(-1)'; }) || dbl.length > 3, 'second leaf drawn');
assert.ok(dbl.every(function (i) { return /^http:\/\/x\/endurance\//.test(i.src); }), 'layers resolve against assetBase');
var one = imgs('Single Door');
assert.ok(one.length <= 1, 'single door keeps one blank picture');
console.log('d3-double-style-tile: ok');
