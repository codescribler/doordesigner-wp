'use strict';
// A full per-style slab capture (EXT.capturePatchStyles → styleSlabs) must win over the
// Door Design delta. The delta lost any layer a style reuses from the baseline at a different
// position: Bowmont's two small top windows are Abbott's K1 cassette image, so the delta held
// only its tall K2 panels and the door rendered with a blank top.
//   node tools/tests/test-style-slabs.js
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { build, assemble } = require(path.join(__dirname, '..', 'build-render-model.js'));
const { toPatch } = require(path.join(__dirname, '..', 'ingest-style-slabs.js'));

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data/endurance-catalogue-full.json'), 'utf8'));
const withoutSlabs = JSON.parse(JSON.stringify(raw));
Object.keys(withoutSlabs).forEach((t) => { if (withoutSlabs[t] && withoutSlabs[t].styleSlabs) { delete withoutSlabs[t].styleSlabs; } });

// Every type carries a slab for every style it offers (captured 2026-09-28).
['Single Door', 'Double Door', 'Stable Door', 'Avantal'].forEach((t) => {
  const styles = raw[t].fields['Door Design'].choices.map((c) => c.label);
  styles.forEach((s) => assert.ok((raw[t].styleSlabs || {})[s], t + ' / ' + s + ' has a slab'));
});

// Delta only: Bowmont has just the two tall K2 apertures (the bug).
const before = build(withoutSlabs).types['Single Door'].styles['Bowmont'];
assert.equal(before.glazingGeom.length, 2, 'delta-only data: 2 apertures (the bug)');

// With the slab: all four apertures, each with its own cassette key.
const model = build(raw);
const after = model.types['Single Door'].styles['Bowmont'];
const keys = after.glazingGeom.map((g) => g.key + '@' + Math.round(g.cy)).sort();
assert.deepEqual(keys, ['K1@46', 'K1@46', 'K2@149', 'K2@149']);

// And the assembled door draws the top windows' glass with the K1 image.
const layers = assemble(model, 'Single Door', { 'Door Design': { label: 'Bowmont' }, 'Door Colour (External)': { label: 'White' }, 'Door Glass': { label: 'Satin' } });
const glass = layers.filter((l) => l.slot === 'DoorGlazing').map((l) => l.url.split('/').pop()).sort();
assert.deepEqual(glass, ['K1.png', 'K1.png', 'K2.png', 'K2.png']);

// A style with no apertures of its own no longer inherits the baseline's four squares.
assert.equal(model.types['Single Door'].styles['Knott'].glazingGeom.length, 1);

// The compact browser capture converts to the patch shape merge-patch expects.
const conv = toPatch({ 'Single Door': { Bowmont: { ok: true, layers: [['Assets/CompositeDoors/Images/DoorCassettes/K1/Thumbnails/White.png', 51.38, 45.9, 37.5, 30, 0, false, true, '']] } } });
assert.deepEqual(conv.problems, []);
assert.deepEqual(conv.patch['Single Door'].styleSlabs.Bowmont[0], { url: 'Assets/CompositeDoors/Images/DoorCassettes/K1/Thumbnails/White.png', urlRight: '', cx: 51.38, cy: 45.9, w: 37.5, h: 30, rotation: 0, flipH: false, leftSlab: true, excludeDouble: false });
assert.equal(toPatch({ 'Single Door': { X: { ok: false, layers: [] } } }).problems.length, 2, 'unconfirmed / empty captures are reported');

console.log('style-slabs OK');
