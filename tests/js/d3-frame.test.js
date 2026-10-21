// Plain-Node tests for HD_DD_D3Frame: chip choices <-> the 24 Endurance Frame Design ids.
// Run: node tests/js/d3-frame.test.js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var F = require('../../assets/js/designer3/d3-frame.js');
var cat = require('../../data/endurance-catalogue-full.json');

function frameChoices(type) {
  function find(o) {
    if (!o || typeof o !== 'object') { return null; }
    if (o['Frame Design'] && o['Frame Design'].choices) { return o['Frame Design'].choices; }
    for (var k in o) { var r = find(o[k]); if (r) { return r; } }
    return null;
  }
  return find(cat[type]);
}
var single = frameChoices('Single Door');
assert.strictEqual(single.length, 24);

// every id reachable by exactly one combination
var seen = {};
F.SIDES.forEach(function (sides) { F.TOPS.forEach(function (top) {
  F.PANELS.forEach(function (panel) { F.JOINTS.forEach(function (joint) {
    var r = F.layoutFor({ sides: sides, top: top, panel: panel, joint: joint }, single);
    if (!r) { return; }
    var p = F.partsOf(r.id);
    assert.deepStrictEqual(F.layoutFor(p, single), r, 'round trip ' + r.id);
    seen[r.id] = seen[r.id] || {};
    seen[r.id][JSON.stringify(p)] = true;
  }); });
}); });
single.forEach(function (c) {
  assert.ok(seen[c.id], 'id reachable ' + c.id);
  assert.strictEqual(Object.keys(seen[c.id]).length, 1, 'id has one parts value ' + c.id);
  var rel = F.drawingFor(c.id);
  assert.ok(/^assets\/img\/frames\/frame-\d+-.*\.png$/.test(rel));
  assert.ok(fs.existsSync(path.join(__dirname, '../../', rel)), 'drawing exists ' + c.id);
});

assert.strictEqual(F.layoutFor({ sides: 'both', top: 'top', panel: 'halfflag', joint: 'bar' }, single).id, 20);
assert.strictEqual(F.layoutFor({ sides: 'both', top: 'top', panel: 'halfflag', joint: 'totop' }, single).id, 33);
assert.strictEqual(F.layoutFor({ sides: 'left', top: 'top', panel: 'halfflag' }, single), null);
assert.strictEqual(F.layoutFor({ sides: 'none', top: 'full' }, single).label, 'Toplight (full)');
assert.strictEqual(F.layoutFor({ sides: 'none', top: 'none' }, single).label, 'No Sidelights');
assert.strictEqual(F.layoutFor({ sides: 'left', top: 'full', panel: 'glass' }, single), null);
assert.strictEqual(F.layoutFor({ sides: 'none', top: 'top', panel: 'midrail' }, single).id, 11);
assert.strictEqual(F.layoutFor({ sides: 'right', top: 'none', panel: 'midrail' }, single).id, 6);

// allowed() greys out impossible chips
assert.strictEqual(F.allowed('top', 'full', { sides: 'left' }), false);
assert.strictEqual(F.allowed('top', 'full', { sides: 'none' }), true);
assert.strictEqual(F.allowed('sides', 'both', { top: 'full' }), false);
assert.strictEqual(F.allowed('sides', 'none', { top: 'full' }), true);
assert.strictEqual(F.allowed('panel', 'glass', { sides: 'none' }), false);
assert.strictEqual(F.allowed('panel', 'glass', { sides: 'left' }), true);
assert.strictEqual(F.allowed('joint', 'bar', { sides: 'left', top: 'top', panel: 'glass' }), false);
assert.strictEqual(F.allowed('joint', 'bar', { sides: 'left', top: 'top', panel: 'halfflag' }), true);

// offered(): Double Door only has No Sidelights
assert.strictEqual(F.offered(single), true);
assert.strictEqual(F.offered(frameChoices('Double Door')), false);
assert.strictEqual(F.offered(null), false);

console.log('d3-frame ok');
