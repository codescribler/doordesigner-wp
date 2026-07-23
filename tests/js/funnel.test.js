// Plain-Node tests for HD_DD_Funnel — no framework: `node tests/js/funnel.test.js`.
// The UMD wrapper exposes module.exports in Node; the browser global path is
// exercised by the QA harness walkthrough instead.
var assert = require('assert');

// 1) No window at all (Node's default) — every call must be a silent no-op.
var Funnel = require('../../assets/js/wizard/funnel.js');
assert.doesNotThrow(function () { Funnel.step('style', 'Balmoral'); });
assert.doesNotThrow(function () { Funnel.lead(); });

// 2) With a recording stub — payloads must match the hdAnalytics contract.
var calls = [];
global.window = {
  hdAnalytics: {
    step: function (funnel, name, opts) { calls.push(['step', funnel, name, opts]); },
    lead: function (funnel) { calls.push(['lead', funnel]); }
  }
};

Funnel.step('style', 'Balmoral');
assert.deepStrictEqual(calls[0], ['step', 'door-designer', 'style', { order: 3, choice: 'Balmoral' }]);

Funnel.step('review'); // choice-less step: the opts object has no `choice` key at all
assert.deepStrictEqual(calls[1], ['step', 'door-designer', 'review', { order: 15 }]);

Funnel.step('letterplate', 'No Letterplate'); // default-accepted choices still count
assert.deepStrictEqual(calls[2], ['step', 'door-designer', 'letterplate', { order: 12, choice: 'No Letterplate' }]);

Funnel.step('details');
assert.deepStrictEqual(calls[3], ['step', 'door-designer', 'details', { order: 16 }]);

Funnel.lead();
assert.deepStrictEqual(calls[4], ['lead', 'door-designer']);

// 3) A tracker that throws must never reach the caller.
global.window = {
  hdAnalytics: {
    step: function () { throw new Error('boom'); },
    lead: function () { throw new Error('boom'); }
  }
};
assert.doesNotThrow(function () { Funnel.step('type', 'Composite Door'); });
assert.doesNotThrow(function () { Funnel.lead(); });

console.log('funnel.test.js: all assertions passed');
