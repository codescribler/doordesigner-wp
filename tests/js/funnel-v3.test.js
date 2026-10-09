// Swipe 2 reports to its own funnel with pre-start steps. `node tests/js/funnel-v3.test.js`
var assert = require('assert');
var calls = [];
global.window = {
  location: { search: '' },
  HD_DD_CONFIG: { version: '0.4.0' },
  hdAnalytics: {
    step: function (funnel, key, opts) { calls.push([funnel, key, opts]); },
    lead: function (funnel, opts) { calls.push([funnel, 'lead', opts]); }
  }
};
var F = require('../../assets/js/wizard/funnel.js');

// Pre-start steps sit before the first choice; saved sits after review; no details step.
assert.strictEqual(F.ORDER_V3.opened, 0);
assert.strictEqual(F.ORDER_V3.browsed, 1);
assert.strictEqual(F.ORDER_V3.design, 2);
assert.ok(F.ORDER_V3.review < F.ORDER_V3.saved);
assert.strictEqual(F.ORDER_V3.details, undefined);
assert.strictEqual(F.ORDER_V2, undefined, 'the v2 order is retired');
Object.keys(F.ORDER_V3).forEach(function (k) { assert.strictEqual(k, k.toLowerCase(), k + ' is lower case'); });

// Classic gains only the opened step, at order 0; everything else keeps its place.
assert.strictEqual(F.ORDER.opened, 0);
assert.strictEqual(F.ORDER.type, 1);
assert.strictEqual(F.ORDER.details, 16);

// An order of 0 is a real order, not "unknown step".
var v3 = F.create('door-designer-v3', F.ORDER_V3);
v3.step('opened');
assert.deepStrictEqual(calls[0], ['door-designer-v3', 'opened', { order: 0, version: '0.4.0' }]);
v3.step('nonsense');
assert.strictEqual(calls.length, 1, 'unknown steps are still dropped');
v3.step('saved');
assert.strictEqual(calls[1][2].order, F.ORDER_V3.saved);
F.step('opened');
assert.deepStrictEqual(calls[2], ['door-designer', 'opened', { order: 0, version: '0.4.0' }]);

console.log('funnel-v3.test.js: all assertions passed');
