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
const merge = require(path.join(__dirname, '..', 'merge-patch.js')).merge;

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data/endurance-catalogue-full.json'), 'utf8'));
const A = 'Assets/CompositeDoors/Images/';
const layer = (url, cx, cy, w, h) => ({ url: A + url, urlRight: '', cx, cy, w, h, rotation: 0, flipH: false, leftSlab: true });

// Before: Bowmont has only the two tall K2 apertures.
const before = build(JSON.parse(JSON.stringify(raw))).types['Single Door'].styles['Bowmont'];
assert.equal(before.glazingGeom.length, 2, 'current data: 2 apertures (the bug)');

// A patch carrying Bowmont's full slab: its delta layers PLUS the two K1 top windows.
const delta = raw['Single Door'].fields['Door Design'].choices.find((c) => c.label === 'Bowmont').delta;
const slab = delta.concat([
  layer('DoorCassettes/K1/Thumbnails/NoGlass.png', 51.4, 48.2, 30.3, 22.6),
  layer('DoorCassettes/K1/Thumbnails/NoGlass.png', 103.9, 48.2, 30.3, 22.6),
  layer('DoorCassettes/K1/Thumbnails/White.png', 51.4, 48.2, 37.5, 30),
  layer('DoorCassettes/K1/Thumbnails/White.png', 103.9, 48.2, 37.5, 30)
]);
const patched = JSON.parse(JSON.stringify(raw));
const applied = merge(patched, { _schema: 'patch-v1', 'Single Door': { doorType: 'Single Door', styleSlabs: { Bowmont: slab } } });
assert.ok(applied[0].indexOf('styleSlabs(1)') !== -1, 'merge reports the style slabs: ' + applied[0]);
assert.ok(patched._imageUrls.indexOf(A + 'DoorCassettes/K1/Thumbnails/White.png') !== -1, 'slab images join the mirror list');

const model = build(patched);
const after = model.types['Single Door'].styles['Bowmont'];
assert.equal(after.glazingGeom.length, 4, 'all four apertures from the slab');
const keys = after.glazingGeom.map((g) => g.key + '@' + Math.round(g.cy)).sort();
assert.deepEqual(keys, ['K1@48', 'K1@48', 'K2@149', 'K2@149']);

// And the assembled door draws the top windows' glass with the K1 image.
const layers = assemble(model, 'Single Door', { 'Door Design': { label: 'Bowmont' }, 'Door Colour (External)': { label: 'White' }, 'Door Glass': { label: 'Satin' } });
const glass = layers.filter((l) => l.slot === 'DoorGlazing').map((l) => l.url.split('/').pop()).sort();
assert.deepEqual(glass, ['K1.png', 'K1.png', 'K2.png', 'K2.png']);

// Styles without a slab keep today's behaviour exactly.
assert.deepEqual(model.types['Single Door'].styles['Cheviot'], build(JSON.parse(JSON.stringify(raw))).types['Single Door'].styles['Cheviot']);

console.log('style-slabs OK');
