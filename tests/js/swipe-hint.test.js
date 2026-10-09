// The "swipe to see more" hint on the first carousel. `node tests/js/swipe-hint.test.js`
var assert = require('assert');

function node(tag) {
  return {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, parentNode: null,
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; },
    setAttribute: function (k, v) { this.attrs[k] = v; }
  };
}
global.document = { createElement: node };
var Hint = require('../../assets/js/swipe/swipe-hint.js');

assert.strictEqual(Hint.text(true), 'Swipe to see more doors');
assert.strictEqual(Hint.text(false), 'Use the arrows to see more');

// A fake clock: timers.set records the callback, fire() runs it.
function clock() {
  var c = { fn: null, ms: null, cleared: 0 };
  c.timers = { set: function (fn, ms) { c.fn = fn; c.ms = ms; return 1; }, clear: function () { c.cleared++; c.fn = null; } };
  c.fire = function () { var f = c.fn; c.fn = null; if (f) { f(); } };
  return c;
}

// Shown at once, worded for touch; idle after 4 seconds calls onIdle and the pill stays.
var box = node('div'), ck = clock(), idle = 0;
var h = Hint.create(box, { touch: true, onIdle: function () { idle++; }, timers: ck.timers });
assert.strictEqual(box.children.length, 1);
assert.strictEqual(h.el.className, 'hd-sw-hint');
assert.strictEqual(h.el.children[1].textContent, 'Swipe to see more doors');
assert.strictEqual(ck.ms, 4000);
ck.fire();
assert.strictEqual(idle, 1);
assert.strictEqual(box.children.length, 1, 'still showing after the idle wobble');
h.dismiss();
assert.strictEqual(box.children.length, 0);
assert.strictEqual(h.dismissed(), true);
h.dismiss(); // twice is harmless

// Dismissed before the timer: the timer is cancelled and onIdle never runs.
box = node('div'); ck = clock(); idle = 0;
h = Hint.create(box, { touch: false, delay: 10, onIdle: function () { idle++; }, timers: ck.timers });
assert.strictEqual(h.el.children[1].textContent, 'Use the arrows to see more');
assert.strictEqual(ck.ms, 10);
h.dismiss();
assert.strictEqual(ck.cleared, 1);
ck.fire();
assert.strictEqual(idle, 0);

// No options at all: still builds.
box = node('div');
Hint.create(box).dismiss();
assert.strictEqual(box.children.length, 0);

console.log('swipe-hint.test.js: all assertions passed');
