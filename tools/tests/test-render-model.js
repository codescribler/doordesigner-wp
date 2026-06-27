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
const { assemble, shouldFlip } = require(path.join(__dirname, '..', '..', 'assets/js/render-model.js'));
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

// 7. Hinge orientation. The captured baseline is a RIGHT-hinged / RIGHT-leaf door
//    (handle on the latch side, opposite the hinges). The whole-door mirror must
//    therefore flip ONLY when the customer picks the OPPOSITE (left) hinge — never for
//    the baseline (right). Flipping the baseline is what put the handle on the wrong
//    side / hard against the edge.
const single = (hinge) => ({ 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' }, 'Door Hinged On': { label: hinge } });
assert.equal(shouldFlip(model, 'Single Door', single('Hinges on Right')), false, 'Hinges on Right = baseline → no flip (handle stays on the left/latch side)');
assert.equal(shouldFlip(model, 'Single Door', single('Hinges on Left')), true, 'Hinges on Left → flip so the handle moves to the right');
const sidelitLeft = Object.assign({}, single('Hinges on Left'), { 'Frame Colour': { label: 'Anthracite Grey/White' }, 'Frame Design': { label: 'Double Sidelight' } });
assert.equal(shouldFlip(model, 'Single Door', sidelitLeft), false, 'A sidelit door never flips (the frame fixes the side)');
assert.equal(shouldFlip(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Master Leaf': { label: 'Right Leaf' } }), false, 'Right Leaf master = baseline → no flip');
assert.equal(shouldFlip(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Master Leaf': { label: 'Left Leaf' } }), true, 'Left Leaf master → flip');

// 8. Letterplate is composited onto the door (it has captured image + geometry, exactly
//    like a knocker). A selected letterplate must add a Letterplates layer; "No Letterplate"
//    adds nothing.
const withLetter = assemble(model, 'Single Door', { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' }, 'Letterplate': { label: 'Letterplate' } });
assert.ok(withLetter.some((l) => l.slot === 'Letterplates'), 'A selected letterplate draws a Letterplates layer');
const noLetter = assemble(model, 'Single Door', { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' }, 'Letterplate': { label: 'No Letterplate' } });
assert.ok(!noLetter.some((l) => l.slot === 'Letterplates'), 'No Letterplate draws no Letterplates layer');

// 9. A DOUBLE door takes exactly ONE letterplate — it must NOT be mirrored onto both leaves.
const ddLetter = assemble(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Door Design': { label: 'Abbott' }, 'Letterplate': { label: 'Letterplate' } });
assert.equal(ddLetter.filter((l) => l.slot === 'Letterplates').length, 1, 'Double door draws exactly one letterplate (not one per leaf)');

// 10. Letterplate HEIGHT is mould-dependent — the same letterplate sits at different cy on
//     different door pressings (Endurance render truth: Abbott central rail, Brecon bottom rail).
const lpCyFor = (type, style) => {
  const ls = assemble(model, type, { 'Door Type': { label: type }, 'Door Design': { label: style }, 'Letterplate': { label: 'Letterplate' } }).filter((l) => l.slot === 'Letterplates');
  return ls.length ? ls[0].cy : null;
};
assert.equal(lpCyFor('Single Door', 'Abbott'), 152, 'Abbott (Mould 10) letterplate sits in the central rail (cy 152)');
assert.equal(lpCyFor('Single Door', 'Brecon'), 288, 'Brecon (Mould 6) letterplate sits in the bottom rail (cy 288)');
assert.notEqual(lpCyFor('Single Door', 'Abbott'), lpCyFor('Single Door', 'Brecon'), 'Letterplate height varies by mould');
assert.equal(lpCyFor('Stable Door', 'Ben Nevis Stable'), 277, 'Stable Ben Nevis letterplate cy 277');

console.log('render-model OK');
