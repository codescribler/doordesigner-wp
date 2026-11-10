// Designer 4 funnel order and milestones. `node tests/js/funnel-v5.test.js`
var assert = require('assert');
var calls = [];
global.window = { location: { search: '' }, HD_DD_CONFIG: {}, hdAnalytics: { step: function (n, k, o) { calls.push([n, k, o]); }, lead: function () {} } };
var F = require('../../assets/js/wizard/funnel.js');
var keys = ['opened', 'type', 'style', 'shown', 'handle_preview', 'colour', 'handle', 'letterplate', 'knocker', 'more', 'nohandle', 'lead', 'doorway', 'doorway_group', 'doorway_exact', 'doorway_change', 'doorway_skip', 'details', 'finished', 'mydesigns', 'door_added', 'door_removed'];
assert.deepStrictEqual(Object.keys(F.ORDER_V5), keys);
keys.forEach(function (k, i) { assert.strictEqual(F.ORDER_V5[k], i); });

var V5 = 'door-designer-v5';
assert.strictEqual(F.milestoneFor(V5, 'shown'), 'shown');
assert.strictEqual(F.milestoneFor(V5, 'lead'), 'form');
assert.strictEqual(F.milestoneFor(V5, 'doorway'), 'doorway');
assert.strictEqual(F.milestoneFor(V5, 'doorway_exact'), 'doorwaypicked');
assert.strictEqual(F.milestoneFor(V5, 'finished'), 'details');
assert.strictEqual(F.milestoneFor(V5, 'type'), 'started');
assert.strictEqual(F.milestoneFor(V5, 'colour'), 'started');
assert.strictEqual(F.milestoneFor(V5, 'opened'), '');
assert.strictEqual(F.milestoneFor(V5, ''), '');

// The existing funnels are unchanged.
assert.strictEqual(F.milestoneFor('door-designer-v4', 'quoteform'), 'form');
assert.strictEqual(F.milestoneFor('door-designer-v4', 'shown'), 'shown');
assert.strictEqual(F.milestoneFor('door-designer-v4', 'lead'), 'started');
assert.strictEqual(F.milestoneFor('door-designer', 'details'), 'form');
assert.strictEqual(F.milestoneFor('door-designer', 'review'), 'shown');
assert.strictEqual(F.milestoneFor('door-designer-v3', 'review'), 'shown');
assert.strictEqual(F.milestoneFor('door-designer-v3', 'doorway'), 'started');
assert.strictEqual(F.milestoneFor('door-designer', 'doorway'), 'started');

// A step missing from ORDER_V5 is dropped; a choice reaches hdAnalytics.step.
var f = F.create(V5, F.ORDER_V5);
f.step('not_a_step');
assert.strictEqual(calls.length, 0);
f.step('doorway_group', 'Patio doors');
assert.strictEqual(calls[0][0], V5);
assert.strictEqual(calls[0][1], 'doorway_group');
assert.strictEqual(calls[0][2].choice, 'Patio doors');
assert.strictEqual(calls[0][2].order, 13);
console.log('funnel-v5 ok');
