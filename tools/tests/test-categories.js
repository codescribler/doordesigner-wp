'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const full = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endurance-catalogue-full.json'), 'utf8'));
const cats = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/style-categories.json'), 'utf8'));
const VALID = ['Solid', 'Glazed', 'Georgian', 'Contemporary'];

for (const type of ['Single Door', 'Double Door', 'Stable Door', 'Avantal']) {
  const styles = full[type].fields['Door Design'].choices.map((c) => c.label);
  const map = cats[type] || {};
  for (const s of styles) {
    assert.ok(map[s], `${type}/${s} has no category`);
    assert.ok(VALID.includes(map[s]), `${type}/${s} invalid category ${map[s]}`);
  }
  // Georgian styles must be categorised Georgian
  styles.filter((s) => /georgian/i.test(s)).forEach((s) => assert.equal(map[s], 'Georgian', `${s} should be Georgian`));
  // zero-glazing styles must be Solid
  Object.entries(full[type].glazingByStyle || {}).forEach(([s, g]) => {
    if (g.length === 0 && map[s]) { assert.equal(map[s], 'Solid', `${s} (no glazing) should be Solid`); }
  });
}
console.log('categories OK');
