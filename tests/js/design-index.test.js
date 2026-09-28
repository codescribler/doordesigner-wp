// Plain-Node tests for HD_DD_DesignIndex — the swipe flow's showcase list.
// `node tests/js/design-index.test.js`
var assert = require('assert');
var fx = require('./fixtures/customer-view.js');
var DI = require('../../assets/js/swipe/design-index.js');

var idx = DI.build(fx.customerView(), fx.categories());
var composite = idx.designs.filter(function (d) { return d.family === 'composite'; });
var aluminium = idx.designs.filter(function (d) { return d.family === 'aluminium'; });

// 88 composite designs, every one offered as a single and a double door.
assert.strictEqual(composite.length, 88);
composite.forEach(function (d) {
  assert.strictEqual(d.types['Single Door'], d.name);
  assert.strictEqual(d.types['Double Door'], d.name);
});

// 30 of them also come as a stable door, mapped to their "X Stable" label.
var stable = composite.filter(function (d) { return d.types['Stable Door']; });
assert.strictEqual(stable.length, 30);
assert.strictEqual(idx.byKey['Rushmore Georgian'].types['Stable Door'], 'Rushmore Georgian Stable');
assert.strictEqual(idx.byKey['Ketu'].types['Stable Door'], undefined);

// Avantal's 13 style x cassette entries collapse to 5 designs.
assert.deepStrictEqual(aluminium.map(function (d) { return d.name; }), ['Antares', 'Celeste', 'Rigel', 'Sirius', 'Vega']);
var antares = idx.byKey['Antares'];
assert.deepStrictEqual(antares.variants.map(function (v) { return v.cassette; }), ['Anthracite Grey', 'Signal Grey', 'Ulti-Matt Black']);
assert.strictEqual(antares.types['Avantal'], 'Antares (Anthracite Grey Cassette)');
assert.strictEqual(idx.byKey['Sirius'].variants.length, 1);
assert.strictEqual(idx.byKey['Sirius'].variants[0].cassette, null);
assert.deepStrictEqual(Object.keys(antares.types), ['Avantal']);

// Every design is filterable; the filter chips cover every category present.
idx.designs.forEach(function (d) { assert.ok(d.category, d.name + ' has a category'); });
assert.deepStrictEqual(idx.filters, ['All', 'Glazed', 'Solid', 'Contemporary', 'Georgian', 'Aluminium']);
assert.ok(DI.matches(idx.byKey['Antares'], 'Aluminium'));
assert.ok(!DI.matches(idx.byKey['Antares'], 'Glazed'));
assert.ok(DI.matches(idx.byKey['Ketu'], 'All'));
assert.ok(DI.matches(idx.byKey['Ketu'], idx.byKey['Ketu'].category));

// The type order a customer sees on step 2.
assert.deepStrictEqual(DI.typesFor(idx.byKey['Rushmore']), ['Single Door', 'Double Door', 'Stable Door']);
assert.deepStrictEqual(DI.typesFor(idx.byKey['Ketu']), ['Single Door', 'Double Door']);
assert.deepStrictEqual(DI.typesFor(antares), ['Avantal']);

// Reverse lookup (saved designs / deep links): an Endurance label back to its design.
assert.strictEqual(DI.designForLabel(idx, 'Tate Georgian Stable').key, 'Tate Georgian');
assert.strictEqual(DI.designForLabel(idx, 'Vega (Ulti-Matt Black Cassette)').key, 'Vega');
assert.strictEqual(DI.designForLabel(idx, 'Nope'), null);

console.log('design-index.test.js: all assertions passed');
