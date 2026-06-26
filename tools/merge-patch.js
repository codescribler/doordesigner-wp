/*
 * merge-patch.js (Node) — fold an incremental EXT.capturePatch() download into the
 * existing full catalogue, so we don't re-walk everything.
 *
 *   1. EXT.capturePatch(); EXT.downloadPatch();  → save as data/endurance-patch.json
 *   2. node tools/merge-patch.js                 → updates data/endurance-catalogue-full.json
 *   3. node tools/build-render-model.js          → rebuilds the render model
 *
 * The patch carries only the previously-missing pieces per type:
 *   knockerByStyle, glazingByStyle (refresh), sidelights (fixed), letterplate (layers).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FULL = path.join(__dirname, '..', 'data', 'endurance-catalogue-full.json');
const PATCH = path.join(__dirname, '..', 'data', 'endurance-patch.json');

function collectImageUrls(full) {
  const set = new Set();
  const eat = (layers) => (layers || []).forEach((l) => { if (l && l.url) set.add(l.url); if (l && l.urlRight) set.add(l.urlRight); });
  Object.keys(full).forEach((type) => {
    const t = full[type];
    if (!t || typeof t !== 'object' || type.charAt(0) === '_') { return; }
    eat(t.baseComposite);
    Object.values(t.fields || {}).forEach((f) => (f.choices || []).forEach((c) => eat(c.delta)));
    if (t.glazingLayerSamples) { (t.glazingLayerSamples.samples || []).forEach((s) => eat(s.delta)); }
    if (t.sidelights) { eat(t.sidelights.delta); }
    if (t.sidelitComposites) { Object.values(t.sidelitComposites).forEach((layers) => eat(layers)); }
  });
  return Array.from(set).sort();
}

// Pure merge (mutates `full`), returns a per-type summary. Shared with the test.
function merge(full, patch) {
  const applied = [];
  Object.keys(patch).forEach((type) => {
    if (type.charAt(0) === '_') { return; }
    const p = patch[type];
    const t = full[type];
    if (!t) { console.warn('  patch type not in full data, skipped:', type); return; }
    const did = [];
    if (p.knockerByStyle) { t.knockerByStyle = p.knockerByStyle; did.push('knockerByStyle(' + Object.keys(p.knockerByStyle).length + ')'); }
    if (p.glazingByStyle) { t.glazingByStyle = p.glazingByStyle; did.push('glazingByStyle'); }
    if (p.sidelights) { t.sidelights = p.sidelights; did.push('sidelights[' + Object.keys(p.sidelights.fields || {}).join(',') + ']'); }
    if (p.letterplate) { t.fields = t.fields || {}; t.fields['Letterplate'] = p.letterplate; did.push('letterplate'); }
    if (p.sidelitComposites) { t.sidelitComposites = p.sidelitComposites; did.push('sidelitComposites(' + Object.keys(p.sidelitComposites).length + ')'); }
    applied.push(type + ': ' + did.join(', '));
  });
  full._imageUrls = collectImageUrls(full);
  full._patchedAt = patch._capturedAt || 'unknown';
  return applied;
}

function main() {
  if (!fs.existsSync(PATCH)) {
    console.error('No patch found at data/endurance-patch.json — download one with EXT.downloadPatch() first.');
    process.exit(1);
  }
  const full = JSON.parse(fs.readFileSync(FULL, 'utf8'));
  const patch = JSON.parse(fs.readFileSync(PATCH, 'utf8'));
  const applied = merge(full, patch);
  fs.writeFileSync(FULL, JSON.stringify(full, null, 2));
  console.log('Merged patch into endurance-catalogue-full.json:');
  applied.forEach((a) => console.log('  ' + a));
  console.log('Total image URLs:', full._imageUrls.length);
  console.log('Next: node tools/build-render-model.js');
}

module.exports = { merge, collectImageUrls };
if (require.main === module) { main(); }
