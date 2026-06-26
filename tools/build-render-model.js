/*
 * build-render-model.js  (Node — local build step, run after each extraction)
 * ---------------------------------------------------------------------------
 * Compiles the raw v3 capture (data/endurance-catalogue-full.json) into a compact
 * per-type RENDER MODEL (data/render-model.json) that the front-end compositor uses
 * to stack the door from layers. It extracts each slot's geometry + URL convention:
 *
 *   blank   DoorBlanks/{mould}/Thumbnails/{colour}.jpg     (mould per style)
 *   cassette DoorCassettes/{cassetteKey}/Thumbnails/{colour|NoGlass}.png
 *   glazing DoorGlazing/{glass}/Thumbnails/{cassetteKey}.png
 *   frame   DoorFrames/{sub}/{frameColourExternal}.png
 *   handle  Handles/{base}{hardwareColour}.png            (best-effort colour)
 *   knocker Knockers/{captured}.png                       (baseline colour)
 *
 * Run:  node tools/build-render-model.js          # writes data/render-model.json
 *       node tools/build-render-model.js --test   # also assembles a sample door
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', 'endurance-catalogue-full.json');
const OUT = path.join(__dirname, '..', 'data', 'render-model.json');

const slotOf = (u) => { const m = String(u).match(/Images\/([^/]+)\//); return m ? m[1] : '?'; };
const strip = (u) => String(u).replace(/\?ver=.*$/, '');
const keep = (layers, folder) => (layers || []).filter((l) => slotOf(l.url) === folder);
const geom = (l) => ({ cx: l.cx, cy: l.cy, w: l.w, h: l.h, rotation: l.rotation || 0, flipH: !!l.flipH, leftSlab: l.leftSlab !== false, urlRight: l.urlRight || '' });
const area = (g) => (g.w || 0) * (g.h || 0);

// The glazing panels sit at the INNER cassette of each aperture (smallest per centre),
// so we can derive glazing geometry per style from its own captured cassette layers —
// no need to sample glazing on every aperture.
function innerCassettes(cassetteGeoms) {
  const byCentre = {};
  (cassetteGeoms || []).forEach((g) => {
    const k = (g.cx || 0).toFixed(1) + ',' + (g.cy || 0).toFixed(1);
    if (!byCentre[k] || area(g) < area(byCentre[k])) byCentre[k] = g;
  });
  return Object.values(byCentre);
}

// DoorBlanks/Door Mould 10/Thumbnails/White.jpg -> { mould:'Door Mould 10', colour:'White', ext:'jpg' }
function parseBlank(url) {
  const m = strip(url).match(/DoorBlanks\/(.+?)\/Thumbnails\/(.+)\.(\w+)$/);
  return m ? { mould: m[1], colour: m[2], ext: m[3] } : null;
}
// DoorCassettes/764/Thumbnails/White.png -> { key:'764', variant:'White', ext }
function parseCassette(url) {
  const m = strip(url).match(/DoorCassettes\/(.+?)\/Thumbnails\/(.+)\.(\w+)$/);
  return m ? { key: m[1], variant: m[2], ext: m[3] } : null;
}
// DoorGlazing/Comete/Thumbnails/K1.png -> { glass:'Comete', cassetteKey:'K1', ext }
function parseGlazing(url) {
  const m = strip(url).match(/DoorGlazing\/(.+?)\/Thumbnails\/(.+)\.(\w+)$/);
  return m ? { glass: m[1], cassetteKey: m[2], ext: m[3] } : null;
}

function buildType(node) {
  const baseSel = node.baseSelection || {};
  const base = node.baseComposite || [];
  const baselineColour = baseSel['Door Colour (External)'] ? baseSel['Door Colour (External)'].label : '';

  // Baseline blank/cassette (default mould + cassetteKey for styles that don't differ).
  const baseBlankLayer = keep(base, 'DoorBlanks')[0];
  const baseBlank = baseBlankLayer ? parseBlank(baseBlankLayer.url) : null;
  const baseCassettes = keep(base, 'DoorCassettes');
  const baselineMould = baseBlank ? baseBlank.mould : null;
  const baselineCassetteKey = baseCassettes[0] ? (parseCassette(baseCassettes[0].url) || {}).key : null;

  // STYLES: mould + cassetteKey + blank/cassette geometry (delta overrides baseline).
  // The 'Door Design' capture only records each style's SLAB; a style's own cassettes
  // are captured only when they differ from the baseline. When none were captured we may
  // fall back to the baseline cassettes — but ONLY for GLAZED styles, whose glass needs
  // the aperture frames. SOLID styles have no apertures, so the baseline cassettes are
  // spurious decorative squares that would be stamped on every plain door — draw none.
  const styles = {};
  const dd = node.fields['Door Design'];
  const glazingByStyle = node.glazingByStyle || {};
  (dd ? dd.choices : []).forEach((c) => {
    const blank = keep(c.delta, 'DoorBlanks')[0];
    const cassettes = keep(c.delta, 'DoorCassettes');
    const pb = blank ? parseBlank(blank.url) : null;
    const pc = cassettes[0] ? parseCassette(cassettes[0].url) : null;
    const styleGlazed = ((glazingByStyle[c.label]) || []).length > 1;
    const useCassettes = cassettes.length ? cassettes : (styleGlazed ? baseCassettes : []);
    const cassetteGeom = useCassettes.map(geom);
    styles[c.label] = {
      mould: pb ? pb.mould : baselineMould,
      cassetteKey: pc ? pc.key : (styleGlazed ? baselineCassetteKey : null),
      blankGeom: blank ? geom(blank) : (baseBlankLayer ? geom(baseBlankLayer) : null),
      cassetteGeom: cassetteGeom,
      glazingGeom: innerCassettes(cassetteGeom) // where the glass panels go for this style
    };
  });

  // FRAMES: frameColour label -> { url, geom }
  const frames = {};
  const fc = node.fields['Frame Colour'];
  (fc ? fc.choices : []).forEach((c) => { const f = keep(c.delta, 'DoorFrames')[0]; if (f) frames[c.label] = { url: strip(f.url), geom: geom(f) }; });
  const baseFrame = keep(base, 'DoorFrames')[0];

  // HANDLES: handle label -> captured layer (baseline hardware colour) + derived base name.
  const handles = {};
  const hf = node.fields['Handle'];
  (hf ? hf.choices : []).forEach((c) => { const h = keep(c.delta, 'Handles').concat(keep(c.delta, 'HandlesRight'))[0]; if (h) handles[c.label] = { url: strip(h.url), geom: geom(h) }; });
  const baseHandle = keep(base, 'Handles').concat(keep(base, 'HandlesRight'))[0];
  // The baseline handle never appears in a delta (it's already in the baseline composite),
  // so the loop above gives it no thumbnail. Add it explicitly from the baseline layer so
  // EVERY handle — including the default (e.g. Lever/Lever) — has an image.
  const baseHandleLabel = baseSel['Handle'] && baseSel['Handle'].label;
  if (baseHandleLabel && baseHandle && !handles[baseHandleLabel]) {
    handles[baseHandleLabel] = { url: strip(baseHandle.url), geom: geom(baseHandle) };
  }

  // HARDWARE COLOUR suffix mapping (best-effort): Hardware Type delta handle URLs.
  const hardwareSuffix = {};
  const hw = node.fields['Hardware Type'];
  (hw ? hw.choices : []).forEach((c) => { const h = keep(c.delta, 'Handles')[0]; if (h) { const file = strip(h.url).split('/').pop().replace(/\.\w+$/, ''); hardwareSuffix[c.label] = file; } });

  // KNOCKERS: label -> captured layer.
  const knockers = {};
  const kf = node.fields['Knocker'];
  (kf ? kf.choices : []).forEach((c) => { const k = keep(c.delta, 'Knockers')[0]; if (k) knockers[c.label] = { url: strip(k.url), geom: geom(k) }; });

  const dripbar = keep(base, 'DripBars')[0];

  // Z-order from the baseline composite's folder sequence.
  const zOrder = [];
  base.forEach((l) => { const s = slotOf(l.url); if (!zOrder.includes(s)) zOrder.push(s); });

  return {
    baselineColour, baselineMould, baselineCassetteKey,
    zOrder,
    canvas: deriveCanvas(base),
    styles,
    frames, baseFrame: baseFrame ? { url: strip(baseFrame.url), geom: geom(baseFrame) } : null,
    handles, baseHandle: baseHandle ? { url: strip(baseHandle.url), geom: geom(baseHandle) } : null,
    hardwareSuffix,
    knockers,
    dripbar: dripbar ? { url: strip(dripbar.url), geom: geom(dripbar) } : null,
    sidelights: buildSidelights(node),
    segments: node.segments || null
  };
}

// Derive per-sidelit-shape render data from the full captured composites: how far
// the door shifts, the wide frame variant, and the side-panel positions.
function buildSidelights(node) {
  const sc = node.sidelitComposites;
  if (!sc || !sc['No Sidelights']) { return null; }
  const baseBlank = keep(sc['No Sidelights'], 'DoorBlanks')[0];
  const baseDoorCx = baseBlank ? baseBlank.cx : 77.625;
  const shapes = {};
  Object.keys(sc).forEach((shape) => {
    if (shape === 'No Sidelights') { return; }
    const L = sc[shape];
    const blank = keep(L, 'DoorBlanks')[0];
    const frame = keep(L, 'DoorFrames')[0];
    const panels = L.filter((l) => slotOf(l.url) === 'Side' || /\/Side\//.test(strip(l.url)));
    if (!blank || !frame) { return; }
    const fm = strip(frame.url).match(/DoorFrames\/(.+?)\/(.+)\.(\w+)$/);
    shapes[shape] = {
      doorOffsetX: +(blank.cx - baseDoorCx).toFixed(3),
      frameVariant: fm ? fm[1] : 'Single',
      frameGeom: geom(frame),
      panels: panels.map((p) => ({ url: strip(p.url), geom: geom(p), side: p.cx < blank.cx ? 'left' : 'right' })),
      canvas: deriveCanvas(L)
    };
  });
  return { baseDoorCx, shapes };
}

function deriveCanvas(layers) {
  let maxX = 0, maxY = 0;
  (layers || []).forEach((l) => { maxX = Math.max(maxX, (l.cx || 0) + (l.w || 0) / 2); maxY = Math.max(maxY, (l.cy || 0) + (l.h || 0) / 2); });
  return { width: Math.ceil(maxX) || 160, height: Math.ceil(maxY) || 330 };
}

function build(raw) {
  const model = { _assetBase: raw._assetBase, _builtFrom: raw._capturedAt, types: {} };
  ['Single Door', 'Double Door', 'Stable Door', 'Avantal'].forEach((t) => { if (raw[t]) model.types[t] = buildType(raw[t]); });
  return model;
}

// ─── Assembler: single source of truth, shared with the browser compositor ──
const { assemble } = require('../assets/js/render-model.js');

// ─── main ───────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const model = build(raw);
fs.writeFileSync(OUT, JSON.stringify(model));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('render-model.json written: ' + kb + 'KB; types: ' + Object.keys(model.types).join(', '));

if (process.argv.includes('--test')) {
  const design = {
    'Door Type': { label: 'Single Door' },
    'Door Design': { label: 'Eiger' },
    'Door Colour (External)': { label: 'Irish Oak' },
    'Door Glass': { label: 'Comete' },
    'Frame Colour': { label: 'Irish Oak/White' },
    'Handle': { label: 'Lever/Pad' },
    'Knocker': { label: 'Forged Black Bull Ring' }
  };
  console.log('\n--- assemble sample: Single / Eiger / Irish Oak / Comete glazing / Irish Oak frame ---');
  assemble(model, 'Single Door', design).forEach((l) => console.log('  [' + l.slot + '] ' + l.url.split('/').slice(3).join('/') + '  @(' + l.cx + ',' + l.cy + ' ' + l.w + 'x' + l.h + ')'));
}

module.exports = { build, assemble };
