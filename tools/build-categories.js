'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const full = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endurance-catalogue-full.json'), 'utf8'));

function categorise(type, style, glazing) {
  if (/georgian/i.test(style)) { return 'Georgian'; }
  if ((glazing || []).length === 0) { return 'Solid'; }
  // Heuristic: large glazing aperture = Contemporary, smaller/patterned = Glazed.
  return (glazing.length >= 25) ? 'Contemporary' : 'Glazed';
}

const out = {};
for (const type of Object.keys(full)) {
  if (!full[type] || !full[type].fields || !full[type].fields['Door Design']) { continue; }
  out[type] = {};
  full[type].fields['Door Design'].choices.forEach((c) => {
    out[type][c.label] = categorise(type, c.label, (full[type].glazingByStyle || {})[c.label]);
  });
}
fs.writeFileSync(path.join(ROOT, 'data/style-categories.json'), JSON.stringify(out, null, 2));
console.log('wrote data/style-categories.json');
