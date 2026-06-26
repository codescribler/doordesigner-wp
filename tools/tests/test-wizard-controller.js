'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
require(path.join(__dirname, '..', '..', 'assets/js/wizard/step-config.js')); // sets global if browser; in node we pass it in
const W = require(path.join(__dirname, '..', '..', 'assets/js/wizard/wizard-controller.js'));
const SC = require(path.join(__dirname, '..', '..', 'assets/js/wizard/step-config.js'));

const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data/endurance-catalogue-full.json'), 'utf8'));
function buildView() { /* same projection as test-step-config, all types */
  const cv = { types: Object.keys(full).filter(k => !k.startsWith('_') && full[k].fields), byType: {} };
  for (const type of cv.types) {
    const n = full[type];
    const t = { fields: {}, glazingByStyle: {}, knockerByStyle: {}, sidelights: n.sidelights || null,
      hasInternalColour: !!n.fields['Door Colour (Internal)'], hasKnocker: !!n.fields['Knocker'],
      hasFrameShape: !!(n.fields['Frame Design'] && n.fields['Frame Design'].choices.length > 1),
      hingeSideField: n.fields['Door Hinged On'] ? 'Door Hinged On' : 'Master Leaf' };
    Object.keys(n.fields).forEach((h) => t.fields[h] = n.fields[h].choices.map((c) => ({ label: c.label, id: c.id })));
    Object.entries(n.glazingByStyle || {}).forEach(([s, g]) => t.glazingByStyle[s] = g.map((x) => ({ label: x.label, id: x.id })));
    Object.entries(n.knockerByStyle || {}).forEach(([s, g]) => t.knockerByStyle[s] = g.map((x) => ({ label: x.label, id: x.id })));
    cv.byType[type] = t;
  }
  return cv;
}

const wiz = W.create(buildView(), SC);
wiz.selectType('Single Door');
assert.equal(wiz.state().design['Door Type'].label, 'Single Door');
// changing style to a solid one must drop a now-invalid glazing pick
wiz.select('Door Design', { label: 'Abbott', id: 0 });
wiz.select('Door Glass', wiz.state().steps.find((s) => s.key === 'glazing').choices[0]);
wiz.select('Door Design', { label: 'Mayon', id: 0 }); // solid → glazing step disappears
assert.ok(!wiz.state().design['Door Glass'], 'glazing cleared when switching to a solid style');
// progress total reflects applicable steps for the current design
const st = wiz.state();
assert.ok(st.progress.total === st.steps.length && st.steps.length > 3, 'progress total = applicable steps');
// changing type resets the design
wiz.selectType('Double Door');
assert.deepEqual(Object.keys(wiz.state().design), ['Door Type'], 'type change resets design');
console.log('wizard-controller OK');
