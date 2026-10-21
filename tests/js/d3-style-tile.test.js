// Designer 3's style screen draws every type's styles as composited layers (glass shows), not one blank slab.
// `node tests/js/d3-style-tile.test.js`
var assert = require('assert');
function node(tag) {
  var n = { tag: tag, className: '', textContent: '', children: [], attrs: {}, style: {}, html: '',
    appendChild: function (c) { n.children.push(c); return c; }, addEventListener: function () {}, setAttribute: function () {} };
  n.style.setProperty = function (k, v) { n.style[k] = v; };
  Object.defineProperty(n, 'innerHTML', { set: function (v) { n.html = v; n.children = []; }, get: function () { return n.html; } });
  return n;
}
global.document = { createElement: node };
global.window = { HD_DD_SwipeParts: require('../../assets/js/swipe/swipe-parts.js'), HD_DD_RenderModel: require('../../assets/js/render-model.js') };
require('../../assets/js/designer3/d3-screens.js');
var model = require('../../data/render-model.json');
var cur = 'Double Door', STY = 'Abbott';
var app = {
  type: function () { return cur; }, style: function () { return STY; }, styles: function () { return [{ label: STY }]; },
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
['Single Door', 'Stable Door'].forEach(function (t) {
  ['Abbott', 'Etna'].forEach(function (st) {
    if (!model.types[t].styles[st]) { return; }
    STY = st; var l = imgs(t);
    assert.ok(l.length > 1, t + ' ' + st + ' tile is several layers, got ' + l.length);
    assert.ok(l.some(function (i) { return /NoGlass/.test(i.src); }), t + ' ' + st + ' has a cassette/glazing layer');
  });
});
// Alignment (the "shadow behind the door" bug): every layer is a % of ONE box that has the stage's
// exact shape, the frame fills that box, the slab sits inside the frame, the drip bar on the door's
// bottom; and no CSS rule may resize a layer on its own (the plain-picture max-width/max-height 92%
// used to shrink the frame toward the top-left, leaving an offset edge to the right and a gap below).
function pct(i) { return { l: parseFloat(i.style.left), t: parseFloat(i.style.top), w: parseFloat(i.style.width), h: parseFloat(i.style.height) }; }
function boxOf(t, st) {
  cur = t; STY = st; var shell = node('div'); window.HD_DD_D3Screens.style(app, shell);
  return find(shell, function (n) { return n.className === 'hd-d3-card__door'; })[0];
}
['Single Door', 'Double Door', 'Stable Door'].forEach(function (t) {
  ['Abbott', 'Etna'].forEach(function (st) {
    if (!model.types[t].styles[st]) { return; }
    var box = boxOf(t, st), ls = find(box, function (n) { return n.tag === 'img'; });
    var r = parseFloat(box.style['--hd-d3-ratio']);
    assert.ok(r > 0.2 && r < 3, t + ' ' + st + ' box carries the stage ratio, got ' + box.style['--hd-d3-ratio']);
    assert.ok(!box.style.width && !box.style.height && !box.style.aspectRatio, 'box size comes from the CSS fit only');
    var fr = ls.filter(function (i) { return /DoorFrames/.test(i.src); }).map(pct);
    var sl = ls.filter(function (i) { return /DoorBlanks/.test(i.src); }).map(pct);
    var dr = ls.filter(function (i) { return /DripBars/.test(i.src); }).map(pct);
    assert.ok(fr.length && sl.length, t + ' ' + st + ' has a frame and a slab');
    var f = fr[0];
    assert.ok(f.l === 0 && f.t === 0 && f.w > 98 && f.w <= 100 && f.h > 98 && f.h <= 100, t + ' ' + st + ' frame fills the box ' + JSON.stringify(f));
    sl.concat(dr).forEach(function (b) {
      assert.ok(b.l > 0 && b.t > 0 && b.l + b.w < f.l + f.w && b.t + b.h <= f.t + f.h + 0.01, t + ' ' + st + ' slab/drip inside the frame ' + JSON.stringify(b));
    });
    dr.forEach(function (d) {
      var bottom = Math.max.apply(null, sl.map(function (s) { return s.t + s.h; }));
      assert.ok(d.t < bottom && d.t + d.h >= bottom - 0.5, t + ' ' + st + ' drip bar sits on the door bottom, not below it');
    });
  });
});
var css = require('fs').readFileSync(require('path').join(__dirname, '../../assets/css/hd-designer3.css'), 'utf8');
assert.ok(!/\.hd-d3-card__media\s+img\s*\{/.test(css), 'no descendant `.hd-d3-card__media img` rule (it reached the layers)');
var lr = /\.hd-d3-card__door\s+\.hd-d3-card__layer\s*\{([^}]*)\}/.exec(css);
assert.ok(lr, 'layer rule outranks plain-picture and theme img rules (two classes)');
['max-width: none', 'max-height: none', 'object-fit: fill', 'position: absolute'].forEach(function (d) { assert.ok(lr[1].indexOf(d) >= 0, 'layer rule has ' + d); });
assert.ok(/\.hd-d3-card__door\s*\{[^}]*aspect-ratio:\s*var\(--hd-d3-ratio/.test(css), 'door box keeps the stage ratio');

// Fallback: nothing assembled -> the blank thumbnail.
STY = 'Abbott'; cur = 'Single Door';
var rm = window.HD_DD_RenderModel, orig = rm.assemble; rm.assemble = function () { return []; };
var fb = imgs('Single Door');
assert.ok(fb.length <= 1, 'falls back to one blank picture when assembly yields nothing');
rm.assemble = orig;
console.log('d3-style-tile: ok');
