'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const SC = require(path.join(__dirname, '..', '..', 'assets/js/wizard/step-config.js'));

// Build a customer_view from the full data the same way the PHP does (labels/ids only).
const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data/endurance-catalogue-full.json'), 'utf8'));
function view(type) {
  const n = full[type];
  const cv = { fields: {}, glazingByStyle: {}, knockerByStyle: {},
    sidelights: n.sidelights ? {
      sidelightType: (n.sidelights.sidelightType.choices || []).map((c) => ({ label: c.label, id: c.id })),
      sidelightGlass: (n.sidelights.sidelightGlass.choices || []).map((c) => ({ label: c.label, id: c.id }))
    } : null,
    hasInternalColour: !!n.fields['Door Colour (Internal)'], hasKnocker: !!n.fields['Knocker'],
    hasFrameShape: !!(n.fields['Frame Design'] && n.fields['Frame Design'].choices.length > 1),
    hingeSideField: n.fields['Door Hinged On'] ? 'Door Hinged On' : 'Master Leaf' };
  Object.keys(n.fields).forEach((h) => { cv.fields[h] = n.fields[h].choices.map((c) => ({ label: c.label, id: c.id })); });
  Object.entries(n.glazingByStyle || {}).forEach(([s, g]) => cv.glazingByStyle[s] = g.map((x) => ({ label: x.label, id: x.id })));
  Object.entries(n.knockerByStyle || {}).forEach(([s, g]) => cv.knockerByStyle[s] = g.map((x) => ({ label: x.label, id: x.id })));
  return cv;
}

// Double Door hides the frame-shape step (only "No Sidelights"); per the captured
// data it DOES expose a knocker (31 options) and uses Master Leaf for hinge side.
const dbl = view('Double Door');
let steps = SC.applicableSteps(dbl, { 'Door Type': { label: 'Double Door' } }).map((s) => s.key);
assert.ok(!steps.includes('frame'), 'Double hides frame-shape step (single "No Sidelights")');
assert.ok(steps.includes('knocker'), 'Double offers a knocker (data: 31 options)');
assert.ok(steps.includes('hinge'), 'hinge step present');

// Single + solid style (Mayon) hides glazing (zero glazing) but still offers a knocker.
const sd = view('Single Door');
steps = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Mayon' } }).map((s) => s.key);
assert.ok(!steps.includes('glazing'), 'Mayon (solid) hides glazing');
assert.ok(steps.includes('knocker'), 'Mayon still offers a knocker');

// Single + Ketu offers glazing but NO knocker (per-style knockerByStyle['Ketu'] is empty).
steps = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Ketu' } }).map((s) => s.key);
assert.ok(steps.includes('glazing'), 'Ketu shows glazing');
assert.ok(!steps.includes('knocker'), 'Ketu hides knocker (per-style: none)');

// Single + Abbott shows glazing + knocker.
steps = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' } }).map((s) => s.key);
assert.ok(steps.includes('glazing') && steps.includes('knocker'), 'Abbott shows glazing + knocker');

// "No Sidelights" must NOT surface either sidelight step (regex must not match the label).
const noSL = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' }, 'Frame Design': { label: 'No Sidelights' } }).map((s) => s.key);
assert.ok(noSL.indexOf('sidelightType') === -1, 'No Sidelights hides the sidelight-type step');
assert.ok(noSL.indexOf('sidelightGlass') === -1, 'No Sidelights hides the sidelight-glass step');

// A real sidelit frame surfaces the sidelight-TYPE step first; the glass step only
// appears once the sidelight is Glazed (Unglazed sidelights have no glass pattern).
const slBase = { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' }, 'Frame Design': { label: 'Double Sidelight' } };
let slKeys = SC.applicableSteps(sd, slBase).map((s) => s.key);
assert.ok(slKeys.indexOf('sidelightType') !== -1, 'Double Sidelight shows the sidelight-type step');
assert.ok(slKeys.indexOf('sidelightGlass') === -1, 'Sidelight glass hidden until the sidelight is Glazed');

const slGlazed = Object.assign({}, slBase, { 'Sidelight Type': { label: 'Glazed', id: 20 } });
slKeys = SC.applicableSteps(sd, slGlazed).map((s) => s.key);
assert.ok(slKeys.indexOf('sidelightGlass') !== -1, 'Glazed sidelight shows the glass step');

const slUnglazed = Object.assign({}, slBase, { 'Sidelight Type': { label: 'Unglazed', id: 10 } });
slKeys = SC.applicableSteps(sd, slUnglazed).map((s) => s.key);
assert.ok(slKeys.indexOf('sidelightGlass') === -1, 'Unglazed sidelight hides the glass step');

// Avantal hides internal colour + knocker (no such fields).
const av = view('Avantal');
steps = SC.applicableSteps(av, { 'Door Type': { label: 'Avantal' }, 'Door Design': { label: 'Sirius' } }).map((s) => s.key);
assert.ok(!steps.includes('intColour') && !steps.includes('knocker'), 'Avantal hides internal colour + knocker');

// Hinge is asked NEAR THE BEGINNING (partner feedback: not buried at the very end).
const order = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' } }).map((s) => s.key);
const hi = order.indexOf('hinge');
assert.ok(hi >= 0 && hi <= 3, 'Hinge step is within the first four steps, not last (got index ' + hi + ')');
assert.ok(hi < order.indexOf('handle'), 'Hinge is asked before the handle');

// Letterplate position DEFAULTS to Bottom for a glazed style whose Middle plate overlaps the
// glass, and stays Middle otherwise. (The App seeds letterplatePosStyles from the render model:
// 'bottom' for over-glass styles, 'middle' for the rest.)
const sdLP = view('Single Door');
sdLP.letterplatePosStyles = { Bruce: 'bottom', Abbott: 'middle' };
const posStepFor = (style) => SC.applicableSteps(sdLP, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: style }, 'Letterplate': { label: 'Letterplate' } }).filter((s) => s.key === 'letterplatePosition')[0];
assert.equal(posStepFor('Bruce').defaultLabel, 'Bottom', 'Over-glass style defaults the letterplate to Bottom');
assert.equal(posStepFor('Abbott').defaultLabel, 'Middle', 'Non-overlapping style keeps the Middle default');

// The decorative "Matches the door" sidelight glass (F4) is offered only for a glazed door whose
// style has a key-matched side layout (n.decorativeSideStyles, seeded by the App from the model).
const sdDeco = view('Single Door');
sdDeco.decorativeSideStyles = { Abbott: true };
const slGlassStep = (extra) => SC.applicableSteps(sdDeco, Object.assign({ 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' }, 'Frame Design': { label: 'Double Sidelight' }, 'Sidelight Type': { label: 'Glazed' } }, extra)).filter((s) => s.key === 'sidelightGlass')[0];
const decoStep = slGlassStep({ 'Door Glass': { label: 'Clarence' } });
assert.ok(decoStep && decoStep.choices.some((c) => /matches the door/i.test(c.label)), 'Abbott (decorative-capable) + decorative glass offers "Matches the door"');
const unglazedStep = slGlassStep({ 'Door Glass': { label: 'Unglazed' } });
assert.ok(!unglazedStep || !unglazedStep.choices.some((c) => /matches the door/i.test(c.label)), 'an unglazed door offers no "Matches the door"');
// A style with no key-matched side layout never offers it, even with decorative glass.
const sdPlain = view('Single Door');
sdPlain.decorativeSideStyles = {}; // Berwyn etc. not decorative-capable
const plainStep = SC.applicableSteps(sdPlain, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Berwyn' }, 'Door Glass': { label: 'Clarence' }, 'Frame Design': { label: 'Double Sidelight' }, 'Sidelight Type': { label: 'Glazed' } }).filter((s) => s.key === 'sidelightGlass')[0];
assert.ok(!plainStep || !plainStep.choices.some((c) => /matches the door/i.test(c.label)), 'a non-decorative-capable style never offers "Matches the door"');

// On a double door the hinge step's field is the Master Leaf (choices "Left/Right Leaf"), so its
// wording is reframed — "Hinge side" + a hinges/handle hint is wrong for two leaves.
const dblHinge = SC.applicableSteps(dbl, { 'Door Type': { label: 'Double Door' }, 'Door Design': { label: 'Abbott' } }).filter((s) => s.key === 'hinge')[0];
assert.equal(dblHinge.heading, 'Master Leaf', 'double-door hinge field is the Master Leaf');
assert.ok(/leaf/i.test(dblHinge.label) && !/hinge side/i.test(dblHinge.label), 'double-door hinge step is reframed (not "Hinge side")');
assert.ok(/master/i.test(dblHinge.hint), 'double-door hinge hint explains the master leaf');
const sglHinge = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' } }).filter((s) => s.key === 'hinge')[0];
assert.equal(sglHinge.label, 'Hinge side', 'single-door hinge step keeps "Hinge side"');

// Double doors show ALL designs as a visual grid (no category gate); single doors keep the
// category-first picker (the side-by-side leaves make a double-door design self-evident).
const dblStyle = SC.applicableSteps(dbl, { 'Door Type': { label: 'Double Door' } }).filter((s) => s.key === 'style')[0];
assert.equal(dblStyle.categoryFirst, false, 'double-door style step shows every design (no category gate)');
const sglStyle = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' } }).filter((s) => s.key === 'style')[0];
assert.equal(sglStyle.categoryFirst, true, 'single-door style step keeps the category-first picker');

console.log('step-config OK');
