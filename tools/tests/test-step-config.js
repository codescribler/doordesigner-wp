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

console.log('step-config OK');
