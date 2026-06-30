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
// Endurance puts the handle on the MASTER leaf (verified live: "Left Leaf" master → handle on the
// left). Our baseline draws the handle on the left leaf, so only "Right Leaf" mirrors. (This is the
// OPPOSITE of the single-door hinge test — a leaf and a hinge side mean opposite handle sides.)
assert.equal(shouldFlip(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Master Leaf': { label: 'Left Leaf' } }), false, 'Left Leaf master = handle on the left leaf (baseline) → no flip');
assert.equal(shouldFlip(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Master Leaf': { label: 'Right Leaf' } }), true, 'Right Leaf master → flip so the handle moves to the right leaf');

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

// 11. Knocker height is mould-dependent too (verified against Endurance's renderer).
const knCyFor = (type, style) => {
  const ks = assemble(model, type, { 'Door Type': { label: type }, 'Door Design': { label: style }, 'Knocker': { label: 'Chrome Doctors Knocker' } }).filter((l) => l.slot === 'Knockers');
  return ks.length ? ks[0].cy : null;
};
assert.equal(knCyFor('Single Door', 'Abbott'), 80, 'Abbott (Mould 10) knocker cy 80');
assert.equal(knCyFor('Single Door', 'Berwyn'), 112, 'Berwyn (Mould 12) knocker cy 112');
assert.notEqual(knCyFor('Single Door', 'Abbott'), knCyFor('Single Door', 'Berwyn'), 'Knocker height varies by mould');

// 12. The stable-door handle sits at Endurance's height (144), not the captured-too-low 196.
const hdCyFor = (type, style) => {
  const hs = assemble(model, type, { 'Door Type': { label: type }, 'Door Design': { label: style } }).filter((l) => /Handles/i.test(l.slot));
  return hs.length ? hs[0].cy : null;
};
assert.equal(hdCyFor('Stable Door', 'Ben Nevis Stable'), 144, 'Stable handle sits at cy 144 (just above the split)');
assert.equal(hdCyFor('Single Door', 'Abbott'), 160.5, 'Single handle unchanged at door centre (160.5)');

// 13. The stable door renders at single-door width — it was captured with the double-door frame
//     (293px) which shoved the door to the left of a too-wide canvas.
assert.equal(model.types['Stable Door'].canvas.width, 156, 'Stable door canvas is single-width (156), not double (294)');
assert.ok(/DoorFrames\/Single\//.test(model.types['Stable Door'].baseFrame.url), 'Stable door uses the Single-width frame, not the Double frame');
assert.equal(model.types['Stable Door'].baseFrame.geom.w, 155.25, 'Stable frame is single-width (155.25)');

// 14. Letterplate Position choice (Middle / Bottom) — only on moulds whose Middle spot is high.
const lpPos = (style, pos) => {
  const d = { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: style }, 'Letterplate': { label: 'Letterplate' } };
  if (pos) { d['Letterplate Position'] = { label: pos }; }
  const ls = assemble(model, 'Single Door', d).filter((l) => l.slot === 'Letterplates');
  return ls.length ? ls[0].cy : null;
};
assert.ok(model.types['Single Door'].styles['Abbott'].letterplateBottomCy != null, 'Abbott offers the Middle/Bottom choice (has a bottom position)');
assert.equal(model.types['Single Door'].styles['Brecon'].letterplateBottomCy, undefined, 'Brecon offers no choice (plate already at the bottom)');
assert.equal(lpPos('Abbott'), 152, 'Abbott default = Middle (cy 152)');
assert.equal(lpPos('Abbott', 'Bottom'), 290, 'Abbott Bottom drops the plate to the bottom rail (cy 290)');
assert.equal(lpPos('Abbott', 'Middle'), 152, 'Abbott Middle is the central rail (cy 152)');
assert.equal(lpPos('Brecon', 'Bottom'), 288, 'A no-choice mould ignores the position (stays at its fixed cy 288)');

// 15. Double doors captured NO knocker layers (Endurance never recorded them), but the
//     knocker product is identical across types — so a selected knocker is BORROWED from a
//     type that has it and drawn ONCE on the double door (never mirrored onto both leaves).
const ddKnock = assemble(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Door Design': { label: 'Abbott' }, 'Knocker': { label: 'Chrome Doctors Knocker' } }).filter((l) => l.slot === 'Knockers');
assert.equal(ddKnock.length, 1, 'Double door draws exactly one knocker (borrowed; not mirrored onto both leaves)');
assert.ok(/Knockers\//.test(ddKnock[0].url), 'Borrowed double-door knocker points at a real Knockers asset');
assert.equal(knCyFor('Double Door', 'Abbott'), 80, 'Double-door Abbott knocker sits at the mould-10 height (cy 80)');
const ddNoKnock = assemble(model, 'Double Door', { 'Door Type': { label: 'Double Door' }, 'Door Design': { label: 'Abbott' }, 'Knocker': { label: 'No Knocker' } }).filter((l) => l.slot === 'Knockers');
assert.equal(ddNoKnock.length, 0, 'No Knocker draws nothing on a double door');

// 16. Glazed styles whose Middle letterplate would sit OVER the glass default to the Bottom
//     rail so the plate never covers an aperture — on single AND double doors. Bruce (Mould 10)
//     is one such style: Middle cy 152 overlaps its apertures; Bottom 290 clears them.
const lpCyDefault = (type, style) => {
  const ls = assemble(model, type, { 'Door Type': { label: type }, 'Door Design': { label: style }, 'Letterplate': { label: 'Letterplate' } }).filter((l) => l.slot === 'Letterplates');
  return ls.length ? ls[0].cy : null;
};
assert.ok(model.types['Single Door'].styles['Bruce'].letterplateDefaultBottom, 'Bruce is flagged: its Middle plate overlaps the glass');
assert.ok(!model.types['Single Door'].styles['Abbott'].letterplateDefaultBottom, 'Abbott does not overlap — no forced bottom');
assert.equal(lpCyDefault('Single Door', 'Bruce'), 290, 'Bruce defaults the letterplate to the Bottom rail (clears the glass)');
assert.equal(lpCyDefault('Double Door', 'Bruce'), 290, 'Double-door Bruce also defaults to Bottom');
assert.equal(lpCyDefault('Single Door', 'Abbott'), 152, 'Abbott (no overlap) still defaults to the central rail (152)');
const bruceMid = assemble(model, 'Single Door', { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Bruce' }, 'Letterplate': { label: 'Letterplate' }, 'Letterplate Position': { label: 'Middle' } }).filter((l) => l.slot === 'Letterplates');
assert.equal(bruceMid[0].cy, 152, 'Explicit Middle overrides the smart default (back to cy 152)');

// 17. Decorative sidelight (F4): "Matches the door" paints the door's glass DESIGN into a
//     key-matched side layout's apertures (per panel); any obscure choice keeps the Ornate overlay.
const slBase = { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' }, 'Door Glass': { label: 'Clarence' }, 'Frame Colour': { label: 'Anthracite Grey/White' }, 'Frame Design': { label: 'Double Sidelight' }, 'Sidelight Type': { label: 'Glazed' } };
const sideOf = (ls) => ls.filter((l) => l.slot === 'Side');
const deco = sideOf(assemble(model, 'Single Door', Object.assign({}, slBase, { 'Sidelight Glass': { label: 'Matches the door' } })));
assert.ok(deco.length > 0 && deco.every((l) => /DoorGlazing\/Clarence\/K1\.png/.test(l.url)), 'decorative sidelight paints the door glass (Clarence/K1), not the Ornate overlay');
assert.ok(deco.some((l) => l.cx < 147) && deco.some((l) => l.cx > 147), 'decorative glass drawn into BOTH side panels of a Double Sidelight');
const obscure = sideOf(assemble(model, 'Single Door', Object.assign({}, slBase, { 'Sidelight Glass': { label: 'Reeded' } })));
assert.ok(obscure.length > 0 && obscure.every((l) => /Side\/Ornate/.test(l.url)), 'an obscure sidelight keeps the captured Ornate privacy-glass overlay');
// A door whose glazing key has no side layout (e.g. Berwyn, Mould 12) can't match — stays obscure.
assert.ok(!model.sideDesignByKey[model.types['Single Door'].styles['Berwyn'].cassetteKey], 'Berwyn key has no side layout (decorative not offered)');
const noKeyMatch = sideOf(assemble(model, 'Single Door', Object.assign({}, slBase, { 'Door Design': { label: 'Berwyn' }, 'Door Glass': { label: 'Clarence' }, 'Sidelight Glass': { label: 'Matches the door' } })));
assert.ok(noKeyMatch.every((l) => /Side\/Ornate/.test(l.url)), 'a door with no key-matched side layout falls back to the Ornate overlay even on "Matches the door"');

console.log('render-model OK');
