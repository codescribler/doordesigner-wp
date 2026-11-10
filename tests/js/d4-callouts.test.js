// Designer 4's labels with lines: where each label sits (pure maths, no DOM).
// `node tests/js/d4-callouts.test.js`
var assert = require('assert');
var C = require('../../assets/js/designer4/d4-callouts.js');
var H = require('../../assets/js/designer3/d3-hotspots.js');
var model = require('../../data/render-model.json');

var FRAME = { w: 200, h: 410 };
var DESK = { mode: 'desk', frame: FRAME, bounds: { left: -220, right: 420, top: -20, bottom: 430 } };
var EDGE = { mode: 'edge', frame: FRAME, bounds: { left: -90, right: 290, top: -14, bottom: 424 } };
function opts(base, more) { var o = {}; [base, more || {}].forEach(function (s) { Object.keys(s).forEach(function (k) { o[k] = s[k]; }); }); return o; }
function by(list, key) { return list.filter(function (l) { return l.key === key; })[0]; }
function side(list, s) { return list.filter(function (l) { return l.side === s; }).sort(function (a, b) { return a.y - b.y; }); }

// Labels on one side never overlap (gap kept), stay inside the top and bottom, and keep the parts'
// order, so their lines never cross.
function sane(list, o, msg) {
  var gap = o.gap != null ? o.gap : 6;
  ['left', 'right'].forEach(function (s) {
    var col = side(list, s);
    col.forEach(function (l, i) {
      assert.ok(l.y >= o.bounds.top - 1e-9 && l.y + l.h <= o.bounds.bottom + 1e-9, msg + ': ' + l.key + ' inside top and bottom');
      if (i) { assert.ok(l.y >= col[i - 1].y + col[i - 1].h + gap - 1e-9, msg + ': ' + l.key + ' clear of ' + col[i - 1].key); }
      if (i) { assert.ok(l.ey >= col[i - 1].ey, msg + ': lines on the ' + s + ' do not cross'); }
    });
  });
  list.forEach(function (l) {
    if (o.mode === 'desk') {
      assert.ok(l.side === 'left' ? l.x + l.w <= 0 : l.x >= o.frame.w, msg + ': ' + l.key + ' outside the door picture');
    } else {
      assert.ok(l.x >= o.bounds.left - 1e-9 && l.x + l.w <= o.bounds.right + 1e-9, msg + ': ' + l.key + ' inside the stage width');
      var edge = l.side === 'left' ? 0 : o.frame.w;
      assert.ok(l.x < edge && l.x + l.w > edge, msg + ': ' + l.key + ' over the door edge');
    }
    // the line starts at the label's inner edge and ends on the part
    assert.strictEqual(l.ax, l.side === 'left' ? l.x + l.w : l.x, msg + ': line from the inner edge');
    assert.strictEqual(l.ay, l.y + l.h / 2);
  });
}

// ---- sides --------------------------------------------------------------------------------
var parts = [{ key: 'glass', x: 0.5, y: 0.15 }, { key: 'handle', x: 0.15, y: 0.5 }, { key: 'knocker', x: 0.85, y: 0.3 }];
var out = C.layout(parts, DESK);
assert.deepStrictEqual(out.map(function (l) { return l.key; }), ['glass', 'handle', 'knocker'], 'one label per part, in order');
assert.strictEqual(by(out, 'handle').side, 'left', 'left of centre: a left label');
assert.strictEqual(by(out, 'knocker').side, 'right', 'right of centre: a right label');
// a centred part goes to the side with fewer labels
var three = parts.concat([{ key: 'letterplate', x: 0.9, y: 0.6 }]);
assert.strictEqual(by(C.layout(three, DESK), 'glass').side, 'left', 'centred: to the side with fewer');
assert.strictEqual(by(C.layout([{ key: 'glass', x: 0.52, y: 0.2 }, { key: 'handle', x: 0.2, y: 0.5 }], DESK), 'glass').side, 'right');
sane(out, DESK, 'three parts');
// the line ends on the part
assert.strictEqual(by(out, 'handle').ex, 0.15 * FRAME.w);
assert.strictEqual(by(out, 'handle').ey, 0.5 * FRAME.h);
// a lone part sits level with its part
var lone = by(C.layout([{ key: 'handle', x: 0.2, y: 0.5 }], DESK), 'handle');
assert.strictEqual(lone.y + lone.h / 2, 0.5 * FRAME.h, 'level with its part when nothing is in the way');

// ---- no overlap, inside top and bottom ------------------------------------------------------
var crowd = [{ key: 'glass', x: 0.2, y: 0.5 }, { key: 'knocker', x: 0.25, y: 0.505 }, { key: 'handle', x: 0.15, y: 0.51 }];
sane(C.layout(crowd, DESK), DESK, 'nearly the same height (desk)');
sane(C.layout(crowd, EDGE), EDGE, 'nearly the same height (edge)');
var low = [{ key: 'glass', x: 0.2, y: 0.97 }, { key: 'colour', x: 0.2, y: 0.99 }, { key: 'handle', x: 0.2, y: 1 }];
sane(C.layout(low, DESK), DESK, 'at the very bottom');
var high = [{ key: 'glass', x: 0.8, y: 0 }, { key: 'knocker', x: 0.8, y: 0.01 }];
sane(C.layout(high, opts(EDGE, { gap: 2 })), opts(EDGE, { gap: 2 }), 'at the very top, phone gap');

// ---- phone: over the door edge, inside the stage; desk: outside the picture ------------------
var wide = { mode: 'edge', frame: FRAME, bounds: { left: -30, right: 230, top: 0, bottom: 410 }, sizes: { glass: { w: 120, h: 44 }, handle: { w: 70, h: 44 } } };
var tight = C.layout([{ key: 'glass', x: 0.3, y: 0.2 }, { key: 'handle', x: 0.7, y: 0.5 }], wide);
sane(tight, wide, 'little room beside the door');
assert.strictEqual(by(tight, 'glass').x, -30, 'pulled in to the stage edge');
// a part close to the door edge: its label moves up or down rather than cover it
var nearEdge = C.layout([{ key: 'handle', x: 0.95, y: 0.5 }], opts(EDGE, { sizes: { handle: { w: 70, h: 44 } } }));
var hl = nearEdge[0];
assert.ok(hl.y + hl.h < 0.5 * FRAME.h || hl.y > 0.5 * FRAME.h, 'the handle label does not cover the handle');
// ... and does not sit on another part near that edge
var two = C.layout([{ key: 'handle', x: 0.9, y: 0.5 }, { key: 'letterplate', x: 0.95, y: 0.6 }], opts(EDGE, { sizes: { handle: { w: 70, h: 44 }, letterplate: { w: 90, h: 44 } } }));
two.forEach(function (l) {
  [[0.9, 0.5], [0.95, 0.6]].forEach(function (p) {
    var px = p[0] * FRAME.w, py = p[1] * FRAME.h;
    assert.ok(!(px >= l.x && px <= l.x + l.w && py >= l.y && py <= l.y + l.h), l.key + ' label clear of the part at ' + p);
  });
});

// ---- need: what each side needs beside the door (desk) ---------------------------------------
var need = C.need(parts, { sizes: { handle: { w: 130, h: 36 }, glass: { w: 60, h: 36 }, knocker: { w: 80, h: 36 } }, reach: 14 });
assert.deepStrictEqual(need, { left: 144, right: 94 }, 'widest label per side plus the reach');

// ---- real styles --------------------------------------------------------------------------
var OPTS = { toplights: true };
function design(type, style, extra) {
  var T = model.types[type];
  var d = { 'Door Design': { label: style }, 'Door Glass': { label: 'Clear' }, Handle: { label: Object.keys(T.handles)[0] }, Letterplate: { label: 'Letterplate' } };
  Object.keys(extra || {}).forEach(function (k) { d[k] = { label: extra[k] }; });
  return d;
}
function real(type, style, show, extra) { return H.display(model, type, design(type, style, extra), OPTS, show || { knocker: true }); }
function keys(list) { return list.map(function (l) { return l.key; }).sort(); }

// a style that offers no knocker (the type has no Knocker step) gets no knocker label
var noKnock = C.layout(real('Single Door', 'Abbott', { knocker: false }), DESK);
assert.ok(!by(noKnock, 'knocker'), 'no knocker label');
assert.deepStrictEqual(keys(noKnock), ['colour', 'glass', 'handle', 'letterplate']);
var withKnock = real('Single Door', 'Abbott', null, { Knocker: Object.keys(model.types['Single Door'].knockers)[0] });
assert.ok(by(C.layout(withKnock, DESK), 'knocker'), 'a knocker label where the style offers one');

[['Single Door', 'Abbott'], ['Single Door', 'Alto'], ['Double Door', 'Abbott'], ['Stable Door', 'Ben Nevis Stable'], ['Stable Door', 'Algas Stable']].forEach(function (ts) {
  var list = real(ts[0], ts[1]);
  assert.ok(list.length >= 4, ts.join(' ') + ' has parts');
  [DESK, EDGE, opts(EDGE, { gap: 2, sizes: { handle: { w: 64, h: 44 }, glass: { w: 56, h: 44 }, knocker: { w: 74, h: 44 }, letterplate: { w: 90, h: 44 }, colour: { w: 64, h: 44 } } })].forEach(function (o) {
    var res = C.layout(list, o);
    assert.strictEqual(res.length, list.length, ts.join(' ') + ': one label per part');
    sane(res, o, ts.join(' ') + ' ' + o.mode);
    var l = side(res, 'left').length, r = side(res, 'right').length;
    assert.ok(Math.abs(l - r) <= 2, ts.join(' ') + ': labels shared between the sides (' + l + '/' + r + ')');
  });
});
// Double Door: the handle (by the meeting stiles) is labelled on the side the leaf parts are not
var dbl = C.layout(real('Double Door', 'Abbott'), DESK);
assert.strictEqual(by(dbl, 'handle').side, 'right');

assert.deepStrictEqual(C.NAMES, { glass: 'Glass', handle: 'Handle', letterplate: 'Letterplate', knocker: 'Knocker', colour: 'Colour' });
console.log('d4-callouts.test.js: all assertions passed');
