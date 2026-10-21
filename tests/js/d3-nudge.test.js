// Run: node tests/js/d3-nudge.test.js
var assert = require('assert');
var N = require('../../assets/js/designer3/d3-nudge.js');
function mem() { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); } }; }

var s = mem();
var n = N.create({ after: 3, storage: s });
assert.deepStrictEqual([n.change(), n.change(), n.change(), n.change()], [false, false, true, false]);
assert.strictEqual(s.getItem('hd_dd_d3_nudged'), '1');
assert.strictEqual(N.create({ after: 3, storage: s }).change(), false, 'already nudged this visit');

var s2 = mem();
N.create({ after: 3, storage: s2 }).dismiss();
var b = N.create({ after: 3, storage: s2 });
assert.deepStrictEqual([b.change(), b.change(), b.change(), b.change()], [false, false, false, false]);

var bad = { getItem: function () { throw new Error('x'); }, setItem: function () { throw new Error('x'); } };
var c = N.create({ after: 3, storage: bad });
assert.deepStrictEqual([c.change(), c.change(), c.change(), c.change()], [false, false, true, false]);
c.dismiss();
console.log('d3-nudge ok');
