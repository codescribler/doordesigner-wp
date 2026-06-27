'use strict';
// Faithful Glazed/Unglazed sidelight rendering.
// Probe finding (live Endurance designer): an UNGLAZED sidelight is the GLAZED
// composite MINUS the two Glazing/Side/*.jpg overlays — the wide frame already
// renders the solid side panels, and the glass is just an overlay on top. The
// specific glass PATTERN has no visual effect (Endurance draws the same side image
// for every pattern), so the only distinction the preview must honour is
// Glazed (draw the side-glass overlays) vs Unglazed (omit them).
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { assemble } = require(path.join(__dirname, '..', '..', 'assets/js/render-model.js'));
const model = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data/render-model.json'), 'utf8'));

const TYPE = 'Single Door';
const base = {
  'Door Type': { label: TYPE },
  'Door Design': { label: 'Abbott' },
  'Frame Colour': { label: 'Anthracite Grey/White' },
  'Frame Design': { label: 'Double Sidelight' } // a real sidelit shape with 2 panels
};
const withType = (label) => Object.assign({}, base, { 'Sidelight Type': { label: label } });

const sideLayers = (ls) => ls.filter((l) => l.slot === 'Side');
const frameLayers = (ls) => ls.filter((l) => l.slot === 'DoorFrames');
const nonSide = (ls) => ls.filter((l) => l.slot !== 'Side').map((l) => l.url).sort();

// 1. GLAZED (explicit) draws both side-glass overlays + the wide frame.
const glazed = assemble(model, TYPE, withType('Glazed'));
assert.equal(sideLayers(glazed).length, 2, 'Glazed Double Sidelight draws 2 side-glass overlays');
assert.ok(frameLayers(glazed).length >= 1, 'Glazed sidelit door draws the wide frame');

// 2. Absent Sidelight Type defaults to Glazed (Endurance default) — overlays present.
const def = assemble(model, TYPE, base);
assert.equal(sideLayers(def).length, 2, 'Default (no Sidelight Type) renders as Glazed');

// 3. UNGLAZED omits the side-glass overlays but keeps everything else.
const unglazed = assemble(model, TYPE, withType('Unglazed'));
assert.equal(sideLayers(unglazed).length, 0, 'Unglazed sidelight draws NO side-glass overlay');
assert.ok(frameLayers(unglazed).length >= 1, 'Unglazed sidelit door still draws the wide frame');

// 4. Faithful invariant: Unglazed === Glazed MINUS the side overlays. Every other
//    layer (offset door body, cassettes, handle, drip bar, wide frame) is identical.
assert.deepEqual(nonSide(unglazed), nonSide(glazed), 'Unglazed keeps the exact same non-side layers as Glazed');
assert.equal(frameLayers(unglazed)[0].url, frameLayers(glazed)[0].url, 'Same wide frame variant in both states');

// 5. Double door: the right leaf is mirrored from the captured left leaf (the capture
//    only records the left slab + the full-width frame).
const center = model.types['Double Door'].canvas.width / 2;
const dd = assemble(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Door Design': { label: 'Abbott' }, 'Door Colour (External)': { label: 'White' }, 'Frame Colour': { label: 'White' } });
const ddBlanks = dd.filter((l) => l.slot === 'DoorBlanks');
assert.ok(ddBlanks.some((l) => l.cx < center) && ddBlanks.some((l) => l.cx > center), 'Double door draws both leaves (a blank either side of centre)');
assert.equal(dd.filter((l) => l.slot === 'DoorFrames').length, 1, 'Double-door frame is drawn once (full width)');

// 6. A borrowed handle (no native double-door layer) still draws on the canvas.
const ddh = assemble(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Door Design': { label: 'Abbott' }, 'Handle': { label: 'Premium Stainless Lever Handles' } }).filter((l) => /Handles/i.test(l.slot));
assert.ok(ddh.length > 0 && /PremiumLever/i.test(ddh[0].url), 'Borrowed lever handle is drawn on the double-door canvas');

console.log('render-model OK');
