// Designer 3 funnel order. `node tests/js/funnel-v4.test.js`
var assert = require('assert');
global.window = { location: { search: '' }, HD_DD_CONFIG: {} };
var F = require('../../assets/js/wizard/funnel.js');
var keys = ['opened', 'type', 'style', 'shown', 'colour', 'handle', 'letterplate', 'knocker', 'more', 'saved', 'frame', 'quoteform', 'callback'];
assert.deepStrictEqual(Object.keys(F.ORDER_V4), keys);
keys.forEach(function (k, i) { assert.strictEqual(F.ORDER_V4[k], i); assert.strictEqual(k, k.toLowerCase()); });
assert.strictEqual(F.ORDER_V4.lead, undefined);
console.log('funnel-v4 ok');
