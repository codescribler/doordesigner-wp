'use strict';
// tools/sync-labels.js — adopt Endurance's current labels by option ID.
//   node tools/tests/test-sync-labels.js
const assert = require('node:assert/strict');
const path = require('path');
const { diffList, compare, apply } = require(path.join(__dirname, '..', 'sync-labels.js'));

// Same ID, new label = rename; unknown IDs are added/removed, never guessed.
const d = diffList([{ id: 1, label: 'A' }, { id: 2, label: 'Old' }, { id: 3, label: 'Gone' }], [[1, 'A'], [2, 'New'], [4, 'Fresh']]);
assert.deepEqual(d.renamed, [{ id: 2, from: 'Old', to: 'New' }]);
assert.deepEqual(d.added, ['Fresh']);
assert.deepEqual(d.removed, ['Gone']);

// A renamed STYLE is renamed everywhere it is a key: per-style lists, slabs, categories.
const full = {
  Avantal: {
    fields: {
      'Door Design': { choices: [{ id: 9, label: 'Vega (Uni-Matt Black Cassette)' }, { id: 8, label: 'Sirius' }] },
      'Door Glass': { choices: [{ id: 50, label: 'Satin' }] }
    },
    glazingByStyle: { 'Vega (Uni-Matt Black Cassette)': [{ id: 50, label: 'Satin' }], Sirius: [] },
    knockerByStyle: { 'Vega (Uni-Matt Black Cassette)': [] },
    styleSlabs: { 'Vega (Uni-Matt Black Cassette)': [{ url: 'x' }] }
  }
};
const cats = { Avantal: { 'Vega (Uni-Matt Black Cassette)': 'Glazed', Sirius: 'Solid' } };
const capture = {
  Avantal: {
    fields: { 'Door Design': [[9, 'Vega (Ulti-Matt Black Cassette)'], [8, 'Sirius']], 'Door Glass': [[50, 'Satin Glass']] },
    glazing: { 'Vega (Ulti-Matt Black Cassette)': [[50, 'Satin Glass']], Sirius: [] },
    knocker: {}
  }
};
const report = compare(full, capture);
assert.ok(report.some((r) => r.where === 'Door Design' && r.renamed.length === 1));
const done = apply(full, cats, report);
const V = 'Vega (Ulti-Matt Black Cassette)';
assert.equal(full.Avantal.fields['Door Design'].choices[0].label, V);
assert.ok(full.Avantal.glazingByStyle[V] && !full.Avantal.glazingByStyle['Vega (Uni-Matt Black Cassette)']);
assert.ok(full.Avantal.styleSlabs[V]);
assert.equal(cats.Avantal[V], 'Glazed');
// A renamed glass is renamed in the field AND in every style's glass list.
assert.equal(full.Avantal.fields['Door Glass'].choices[0].label, 'Satin Glass');
assert.equal(full.Avantal.glazingByStyle[V][0].label, 'Satin Glass');
assert.ok(done.length >= 2);
// Applying again finds nothing left to rename.
assert.equal(compare(full, capture).filter((r) => r.renamed.length).length, 0);

console.log('sync-labels OK');
