'use strict';
// Merge a compact Door Design slab capture into the full catalogue, then rebuild.
// The capture is { "<Door Type>": { "<style>": { ok, layers: [[url,cx,cy,w,h,rot,flipH,leftSlab,urlRight], …] } } }
// — the same data EXT.capturePatchStyles() produces, in a compact form that is easier to
// copy out of the browser. Usage:
//   node tools/ingest-style-slabs.js <capture.json>
//   node tools/build-render-model.js
const fs = require('fs');
const path = require('path');
const { merge } = require('./merge-patch.js');

function toPatch(capture) {
  const patch = { _schema: 'patch-v1', _capturedAt: new Date().toISOString() };
  const problems = [];
  Object.keys(capture).forEach((type) => {
    const slabs = {};
    Object.keys(capture[type]).forEach((style) => {
      const s = capture[type][style];
      if (!s.ok) { problems.push(type + ' / ' + style + ': selection not confirmed'); }
      if (!s.layers.length) { problems.push(type + ' / ' + style + ': no layers'); }
      slabs[style] = s.layers.map((l) => ({ url: l[0], urlRight: l[8] || '', cx: l[1], cy: l[2], w: l[3], h: l[4], rotation: l[5] || 0, flipH: !!l[6], leftSlab: l[7] !== false, excludeDouble: false }));
    });
    patch[type] = { doorType: type, styleSlabs: slabs };
  });
  return { patch, problems };
}

// Endurance occasionally re-spells a label (2026-09-28: "Vega (Uni-Matt Black Cassette)" became
// "Vega (Ulti-Matt Black Cassette)"). Store such a slab under the catalogue's existing label
// (the enquiry payload keeps the exact catalogue string) and report it as drift.
const norm = (s) => String(s).toLowerCase().replace(/uni-matt|ulti-matt/g, 'matt').replace(/\s+/g, ' ').trim();
function alignLabels(full, patch) {
  const moved = [];
  Object.keys(patch).forEach((type) => {
    const slabs = patch[type] && patch[type].styleSlabs;
    const dd = full[type] && full[type].fields && full[type].fields['Door Design'];
    if (!slabs || !dd) { return; }
    dd.choices.forEach((c) => {
      if (slabs[c.label]) { return; }
      const hit = Object.keys(slabs).find((k) => norm(k) === norm(c.label));
      if (hit) { slabs[c.label] = slabs[hit]; delete slabs[hit]; moved.push(type + ': "' + c.label + '" is now "' + hit + '" upstream'); }
    });
  });
  return moved;
}

module.exports = { toPatch, alignLabels };

if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error('usage: node tools/ingest-style-slabs.js <capture.json>'); process.exit(1); }
  const FULL = path.join(__dirname, '..', 'data', 'endurance-catalogue-full.json');
  const { patch, problems } = toPatch(JSON.parse(fs.readFileSync(src, 'utf8')));
  if (problems.length) { console.error('Capture problems:\n  ' + problems.join('\n  ')); process.exit(1); }
  const full = JSON.parse(fs.readFileSync(FULL, 'utf8'));
  alignLabels(full, patch).forEach((m) => console.log('  renamed upstream: ' + m));
  merge(full, patch).forEach((a) => console.log('  ' + a));
  fs.writeFileSync(FULL, JSON.stringify(full, null, 2));
  console.log('Merged. Next: node tools/build-render-model.js');
}
