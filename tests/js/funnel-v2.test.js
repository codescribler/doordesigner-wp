// Plain-Node tests for HD_DD_Funnel.create() — the per-flow funnel factory used by the
// swipe flow (`door-designer-v2`). `node tests/js/funnel-v2.test.js`.
var assert = require('assert');
var Funnel = require('../../assets/js/wizard/funnel.js');

// The swipe flow's canonical order: design first, side panels last.
assert.deepStrictEqual(Object.keys(Funnel.ORDER_V2), [
  'design', 'type', 'hinge', 'colour', 'intcolour', 'glazing', 'hardware', 'handle',
  'letterplate', 'letterplateposition', 'knocker', 'frame', 'sidelighttype', 'sidelightglass',
  'review', 'details'
]);
Object.keys(Funnel.ORDER_V2).forEach(function (k, i) { assert.strictEqual(Funnel.ORDER_V2[k], i + 1); });

var calls = [];
global.window = {
  HD_DD_CONFIG: { version: '0.3.0' },
  hdAnalytics: {
    step: function (funnel, name, opts) { calls.push(['step', funnel, name, opts]); },
    lead: function (funnel, opts) { calls.push(opts === undefined ? ['lead', funnel] : ['lead', funnel, opts]); }
  }
};

var v2 = Funnel.create('door-designer-v2', Funnel.ORDER_V2);
v2.step('design', 'Ketu');
assert.deepStrictEqual(calls[0], ['step', 'door-designer-v2', 'design', { order: 1, choice: 'Ketu', version: '0.3.0' }]);
v2.step('sidelightglass', 'Satin');
assert.deepStrictEqual(calls[1], ['step', 'door-designer-v2', 'sidelightglass', { order: 14, choice: 'Satin', version: '0.3.0' }]);
v2.step('review');
assert.deepStrictEqual(calls[2], ['step', 'door-designer-v2', 'review', { order: 15, version: '0.3.0' }]);
v2.lead();
assert.deepStrictEqual(calls[3], ['lead', 'door-designer-v2', { version: '0.3.0' }]);

// An unknown key is a programming error in the flow — never send a step with no order.
calls.length = 0;
v2.step('nonsense', 'x');
assert.strictEqual(calls.length, 0);

// The module-level API is still the classic `door-designer` funnel, unchanged.
Funnel.step('style', 'Balmoral');
assert.deepStrictEqual(calls[0], ['step', 'door-designer', 'style', { order: 3, choice: 'Balmoral', version: '0.3.0' }]);

// A classic instance from the factory behaves exactly like the module-level API.
calls.length = 0;
var classic = Funnel.create('door-designer', Funnel.ORDER);
classic.step('knocker', 'No Knocker');
assert.deepStrictEqual(calls[0], ['step', 'door-designer', 'knocker', { order: 14, choice: 'No Knocker', version: '0.3.0' }]);

console.log('funnel-v2.test.js: all assertions passed');
