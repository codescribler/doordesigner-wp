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

// The letterplate's vertical position is MOULD-dependent — the plate drops into a panel
// gap that moves with the door pressing, so it ranges from the central rail (~152) to the
// bottom rail (~299) depending on the style's mould. The captured option-delta geometry
// stored a single (wrong-for-most) value; these are the true positions read from Endurance's
// own renderer (mJobState.Job.Drawing.Elements, scaled to our 318-tall stage). Single and
// Double doors share the same moulds.
const LP_CY_BY_MOULD = {
  'Single Door': {
    'Door Mould 10': 152, 'Door Mould 2': 182, 'Door Mould 3': 182,
    '3 Panel Mould': 288, 'Door Mould 1': 288, 'Door Mould 11 Flipped': 296, 'Door Mould 12': 299,
    'Door Mould 4': 287, 'Door Mould 5': 288, 'Door Mould 6': 288, 'Door Mould 7': 288,
    'Door Mould 8': 288, 'Door Mould 9': 287
  },
  'Stable Door': {
    'Door Mould 1': 183, 'Door Mould 10': 183,
    'Door Mould 2': 277, 'Door Mould 3': 277, 'Door Mould 4': 277, 'Door Mould 5': 277, 'Door Mould 6': 277
  },
  'Avantal': { 'Avantal': 194 }
};
LP_CY_BY_MOULD['Double Door'] = LP_CY_BY_MOULD['Single Door'];

// The knocker is mould-dependent too (it sits in an upper panel gap). Same story as the
// letterplate — the captured single value is right for only one mould. Verified positions
// from Endurance's renderer (Drawing.Elements, scaled to our 318-tall stage). Mould 9 has no
// knocker option in Endurance, so it's omitted (falls back to the captured geom, unused).
const KNOCKER_CY_BY_MOULD = {
  'Single Door': {
    'Door Mould 10': 80,
    'Door Mould 1': 97, 'Door Mould 2': 97, 'Door Mould 3': 97, 'Door Mould 4': 97,
    'Door Mould 5': 95, 'Door Mould 6': 95, 'Door Mould 7': 95, 'Door Mould 8': 95,
    '3 Panel Mould': 104, 'Door Mould 12': 112, 'Door Mould 11 Flipped': 140
  },
  'Stable Door': {
    'Door Mould 10': 95,
    'Door Mould 1': 81, 'Door Mould 2': 81, 'Door Mould 3': 81, 'Door Mould 4': 81, 'Door Mould 5': 81, 'Door Mould 6': 81
  }
};
// Double doors never captured a knocker layer (Endurance only records them for single/stable
// doors), so the assembler borrows the knocker image from a type that has it. The knocker's
// HEIGHT is still mould-driven, and double doors share single-door moulds — so reuse the table.
KNOCKER_CY_BY_MOULD['Double Door'] = KNOCKER_CY_BY_MOULD['Single Door'];

// The stable-door HANDLE was captured ~50px too low (cy 196 vs Endurance's constant 144 —
// the lever sits just above the centre split). Single/Double/Avantal handles already match.
const HANDLE_CY_BY_TYPE = { 'Stable Door': 144 };

// Endurance offers a "Letterplate Position" choice (Middle / Bottom) — but only on moulds whose
// natural (Middle) spot is up in the central rail; on the rest the plate already sits at the
// bottom so there's no choice. These are the BOTTOM-rail positions for the moulds that offer it
// (the Middle position is the per-mould value in LP_CY_BY_MOULD). Captured from Endurance's
// renderer. Single & Double share moulds.
const LETTERPLATE_BOTTOM_BY_MOULD = {
  'Single Door': { 'Door Mould 10': 290, 'Door Mould 2': 286, 'Door Mould 3': 286 },
  'Stable Door': { 'Door Mould 1': 275, 'Door Mould 10': 275 }
};
LETTERPLATE_BOTTOM_BY_MOULD['Double Door'] = LETTERPLATE_BOTTOM_BY_MOULD['Single Door'];

function buildType(node, typeName) {
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
    const styleMould = pb ? pb.mould : baselineMould;
    const styleGlazed = ((glazingByStyle[c.label]) || []).length > 1;
    // Inherit the baseline cassettes only when a glazed style captured NONE of its own
    // AND it shares the baseline MOULD. The captured cassette positions belong to the
    // baseline mould (Abbott / Mould 10); stamping them on a DIFFERENT mould paints a
    // second, misaligned panel layout over the door — the "overlaid styles" bug. A
    // different-mould style with no captured cassettes is a solid door whose panels are
    // already in its blank pressing (like Brecon), so it needs no cassettes at all.
    const inheritBaseline = !cassettes.length && styleGlazed && styleMould === baselineMould;
    const useCassettes = cassettes.length ? cassettes : (inheritBaseline ? baseCassettes : []);
    const cassetteGeom = useCassettes.map(geom);
    styles[c.label] = {
      mould: styleMould,
      cassetteKey: pc ? pc.key : (inheritBaseline ? baselineCassetteKey : null),
      blankGeom: blank ? geom(blank) : (baseBlankLayer ? geom(baseBlankLayer) : null),
      cassetteGeom: cassetteGeom,
      glazingGeom: innerCassettes(cassetteGeom) // where the glass panels go for this style
    };
  });

  // FRAMES: frameColour label -> { url, geom }
  const frames = {};
  const fc = node.fields['Frame Colour'];
  (fc ? fc.choices : []).forEach((c) => { const f = keep(c.delta, 'DoorFrames')[0]; if (f) frames[c.label] = { url: strip(f.url), geom: geom(f) }; });
  let baseFrame = keep(base, 'DoorFrames')[0];
  let baseFrameGeom = baseFrame ? geom(baseFrame) : null;
  // The Stable Door was captured with the DOUBLE-door frame (293px wide) → it rendered on a
  // too-wide canvas with the door shoved to the left (white space on the right). Endurance
  // renders the stable door at single-door proportions; rewrite its frame to the Single-width
  // variant + geometry. (Verified: Endurance stable canvas is 900px wide, blank centred.)
  if (typeName === 'Stable Door') {
    const SINGLE_FRAME = { cx: 77.625, cy: 159, w: 155.25, h: 318, rotation: 0, flipH: false, leftSlab: true, urlRight: '' };
    const toSingle = (u) => String(u).replace('/DoorFrames/Double/', '/DoorFrames/Single/');
    Object.keys(frames).forEach((k) => { frames[k] = { url: toSingle(frames[k].url), geom: Object.assign({}, SINGLE_FRAME) }; });
    if (baseFrame) { baseFrame.url = toSingle(strip(baseFrame.url)); baseFrameGeom = Object.assign({}, SINGLE_FRAME); }
  }

  // HANDLES: handle label -> captured layer (baseline hardware colour) + derived base name.
  const handles = {};
  const hf = node.fields['Handle'];
  // Double-door handles are captured as right-slab HandlesRight/* layers, whose images
  // 404 on the asset host; the parallel left-slab Handles/* versions exist (HTTP 200).
  // Rewrite to the path that actually resolves so every handle shows a real image.
  const leftHandle = (u) => strip(u).replace('/HandlesRight/', '/Handles/');
  (hf ? hf.choices : []).forEach((c) => { const h = keep(c.delta, 'Handles').concat(keep(c.delta, 'HandlesRight'))[0]; if (h) handles[c.label] = { url: leftHandle(h.url), geom: geom(h) }; });
  const baseHandle = keep(base, 'Handles').concat(keep(base, 'HandlesRight'))[0];
  // The baseline handle never appears in a delta (it's already in the baseline composite),
  // so the loop above gives it no thumbnail. Add it explicitly from the baseline layer so
  // EVERY handle — including the default (e.g. Lever/Lever) — has an image.
  const baseHandleLabel = baseSel['Handle'] && baseSel['Handle'].label;
  if (baseHandleLabel && baseHandle && !handles[baseHandleLabel]) {
    handles[baseHandleLabel] = { url: leftHandle(baseHandle.url), geom: geom(baseHandle) };
  }

  // HARDWARE COLOUR suffix mapping (best-effort): Hardware Type delta handle URLs.
  const hardwareSuffix = {};
  const hw = node.fields['Hardware Type'];
  (hw ? hw.choices : []).forEach((c) => { const h = keep(c.delta, 'Handles')[0]; if (h) { const file = strip(h.url).split('/').pop().replace(/\.\w+$/, ''); hardwareSuffix[c.label] = file; } });

  // KNOCKERS: label -> captured layer.
  const knockers = {};
  const kf = node.fields['Knocker'];
  (kf ? kf.choices : []).forEach((c) => { const k = keep(c.delta, 'Knockers')[0]; if (k) knockers[c.label] = { url: strip(k.url), geom: geom(k) }; });
  // Stamp each style's mould-specific knocker height (same approach as the letterplate).
  const knByMould = KNOCKER_CY_BY_MOULD[typeName] || {};
  Object.keys(styles).forEach((s) => { const md = styles[s].mould; if (knByMould[md] != null) { styles[s].knockerCy = knByMould[md]; } });

  // LETTERPLATES: label -> captured layer (same shape as knockers — the source catalogue
  // records a Letterplates/* image + geometry under each Letterplate choice's delta).
  const letterplates = {};
  const ltf = node.fields['Letterplate'];
  (ltf ? ltf.choices : []).forEach((c) => { const lp = keep(c.delta, 'Letterplates')[0]; if (lp) letterplates[c.label] = { url: strip(lp.url), geom: geom(lp) }; });
  // Stamp each style's mould-specific letterplate height onto its style record, so assemble()
  // places the plate where Endurance does for whatever style the customer picks.
  const lpByMould = LP_CY_BY_MOULD[typeName] || {};
  Object.keys(styles).forEach((s) => { const md = styles[s].mould; if (lpByMould[md] != null) { styles[s].letterplateCy = lpByMould[md]; } });
  // Stamp the BOTTOM letterplate position on styles whose mould offers the Middle/Bottom choice.
  const lpBottom = LETTERPLATE_BOTTOM_BY_MOULD[typeName] || {};
  Object.keys(styles).forEach((s) => { const md = styles[s].mould; if (lpBottom[md] != null) { styles[s].letterplateBottomCy = lpBottom[md]; } });
  // Flag glazed styles whose MIDDLE letterplate would land over the glass apertures — those
  // must DEFAULT to the Bottom rail so the plate never covers an aperture. (The Middle/Bottom
  // choice still lets a customer override it.) A plate is ~14.4 tall; it overlaps an aperture
  // when their vertical spans intersect. Only flag when a clear Bottom position exists.
  Object.keys(styles).forEach((s) => {
    const st = styles[s];
    if (st.letterplateBottomCy == null || st.letterplateCy == null || !(st.glazingGeom || []).length) { return; }
    const span = (cy) => [cy - 7.2, cy + 7.2];
    const hits = (cy) => st.glazingGeom.some((g) => { const a = span(cy); return a[0] < g.cy + g.h / 2 && a[1] > g.cy - g.h / 2; });
    if (hits(st.letterplateCy) && !hits(st.letterplateBottomCy)) { st.letterplateDefaultBottom = true; }
  });

  // Correct the captured handle height where it disagrees with Endurance's renderer (Stable).
  let baseHandleGeom = baseHandle ? geom(baseHandle) : null;
  const handleCyOverride = HANDLE_CY_BY_TYPE[typeName];
  if (handleCyOverride != null) {
    Object.keys(handles).forEach((k) => { handles[k].geom.cy = handleCyOverride; });
    if (baseHandleGeom) { baseHandleGeom.cy = handleCyOverride; }
  }

  const dripbar = keep(base, 'DripBars')[0];

  // Z-order from the baseline composite's folder sequence.
  const zOrder = [];
  base.forEach((l) => { const s = slotOf(l.url); if (!zOrder.includes(s)) zOrder.push(s); });

  return {
    baselineColour, baselineMould, baselineCassetteKey,
    zOrder,
    canvas: typeName === 'Stable Door' ? { width: 156, height: deriveCanvas(base).height } : deriveCanvas(base),
    styles,
    frames, baseFrame: baseFrame ? { url: strip(baseFrame.url), geom: baseFrameGeom } : null,
    handles, baseHandle: baseHandle ? { url: strip(baseHandle.url), geom: baseHandleGeom } : null,
    hardwareSuffix,
    knockers,
    letterplates,
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

// Hardware-colour recolour data (generated read-only by tools/probe-hardware-colours.js):
//   hardwareColours { <Hardware Colour label>: <filename token> }
//   furnitureColours { <furniture base>: [<available token>, ...] }
// assemble() uses these to swap a handle/letterplate's colour-token suffix to the
// chosen finish, exactly as the Endurance designer does. Optional — if the file is
// missing the model simply omits recolouring (the build still succeeds).
function loadHardwareColours() {
  const file = path.join(__dirname, '..', 'data', 'hardware-colours.json');
  try {
    const hc = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { hardwareColours: hc.tokens || {}, furnitureColours: hc.variants || {}, furnitureColourAliases: hc.aliases || {} };
  } catch (e) {
    console.warn('hardware-colours.json not found — preview will not recolour furniture. Run tools/probe-hardware-colours.js.');
    return { hardwareColours: {}, furnitureColours: {}, furnitureColourAliases: {} };
  }
}

// Per-glass thumbnail key (generated read-only by tools/probe-glass-thumbs.js): the
// cassette key whose glass image is clearest, so the glass picker shows a legible pattern
// instead of the style's tiny-aperture crop. Optional — missing file just keeps the old
// behaviour (style's own key).
function loadGlassThumbs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'glass-thumbs.json'), 'utf8'));
  } catch (e) {
    console.warn('glass-thumbs.json not found — glass picker uses the style aperture key. Run tools/probe-glass-thumbs.js.');
    return {};
  }
}

function build(raw) {
  const hc = loadHardwareColours();
  const model = {
    _assetBase: raw._assetBase,
    _builtFrom: raw._capturedAt,
    hardwareColours: hc.hardwareColours,
    furnitureColours: hc.furnitureColours,
    furnitureColourAliases: hc.furnitureColourAliases,
    glassThumbs: loadGlassThumbs(),
    types: {},
  };
  ['Single Door', 'Double Door', 'Stable Door', 'Avantal'].forEach((t) => { if (raw[t]) model.types[t] = buildType(raw[t], t); });
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
