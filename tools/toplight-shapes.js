'use strict';
// Top-light frame layouts for the render model: types[type].sidelights.topShapes.
// Source: data/endurance-toplights.json (captured from the Endurance designer by
// tools/build-toplights-data.js), in the same thumbnail space as sidelitComposites.
// Keyed by Frame Design ID, not label: ids 14/31, 17/32 and 20/33 share a label but
// are different frames. Kept apart from the label-keyed `shapes` that Classic reads,
// so only an assemble(..., {toplights:true}) caller ever draws them.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'endurance-toplights.json');
const r3 = (n) => +n.toFixed(3);
const g = (o) => ({ cx: o.cx, cy: o.cy, w: o.w, h: o.h, rotation: 0, flipH: false, leftSlab: true, urlRight: '' });

function loadToplights() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {
    console.warn('endurance-toplights.json not found — no top-light artwork.');
    return null;
  }
}

// base: the plain door's blank centre { cx, cy } on this type ("No Sidelights").
function buildTopShapes(data, typeName, base) {
  const node = data && data[typeName];
  if (!node || !base) { return null; }
  const out = {};
  Object.keys(node).forEach((id) => {
    const s = node[id];
    out[id] = {
      label: s.label,
      doorOffsetX: r3(s.doorBlank.cx - base.cx),
      doorOffsetY: r3(s.doorBlank.cy - base.cy),
      frameVariant: s.frameVariant,
      frameGeom: g(s.frameGeom),
      top: (s.top || []).map((t) => ({ url: t.url, geom: g(t.geom) })),
      panels: (s.panels || []).map((p) => ({ url: p.url, geom: g(p.geom), side: p.side })),
      canvas: s.canvas,
    };
  });
  return out;
}

module.exports = { loadToplights, buildTopShapes };
