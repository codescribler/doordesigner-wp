/*
 * test-extractor.js (Node) — runs EXT.capturePatch() against a SIMULATED mJobState
 * to prove the incremental capture executes end-to-end and grabs all the missing
 * data (per-style knocker, sidelights incl. Side Slab, letterplate layers) BEFORE
 * running it on the live site. Also exercises the merge.
 *
 *   node tools/test-extractor.js
 */
'use strict';
const path = require('path');
const fs = require('fs');

// ---- globals the browser extractor expects ----
global.window = {};
global.location = { origin: 'https://mock.test' };
global.document = { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) };
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.Blob = function () {};

// ---- a small but realistic mock catalogue ----
const CATALOG = {
  // 'Kit' first → Single defaults to a style with NO knocker field, reproducing the
  // gate bug where the per-style walk was skipped for the whole type.
  'Single Door': { hasKnocker: true,  styles: ['Kit', 'Abbott', 'Eiger'], frames: ['No Sidelights', 'Sidelight Left', 'Sidelight Right', 'Double Sidelight'] },
  'Double Door': { hasKnocker: false, styles: ['Abbott', 'Eiger'],        frames: ['No Sidelights'] },
  'Stable Door': { hasKnocker: true,  styles: ['Eiger Stable', 'Hope Stable'], frames: ['No Sidelights', 'Sidelight Left'] },
  'Avantal':     { hasKnocker: false, styles: ['Sirius', 'Vega'],         frames: ['No Sidelights', 'Double Sidelight'] }
};
const LETTERPLATES = ['No Letterplate', 'Pewter Architectural Letterplate'];
const A = 'Assets/CompositeDoors/Images/';

let idSeq = 1000; const ids = {};
const idOf = (s) => (ids[s] || (ids[s] = ++idSeq));

const cur = {}; // heading -> selected Description
const curDesc = (h, d) => (cur[h] !== undefined ? cur[h] : d);
const curType = () => curDesc('Door Type', 'Single Door');
const curStyle = () => curDesc('Door Design', CATALOG[curType()].styles[0]);
const glassFor = (style) => (/Kit/.test(style) ? [] : ['Clear', 'Reeded']);
const knockerFor = (style, has) => (!has ? [] : (/Kit/.test(style) ? [] : ['No Knocker', 'Urn']));

const img = (url, cx, cy, w, h) => ({ ImageURL: url, OnRightImageURL: '', CX: cx, CY: cy, W: w, H: h, Rotation: 0, FlipH: false, DrawOnLeftSlab: true, ExcludeFromDoubleDoorSelector: false });
function currentComposite() {
  const colour = 'Anthracite Grey';
  const glass = curDesc('Door Glass', ''), handle = curDesc('Handle', 'Lever/Lever');
  const lp = curDesc('Letterplate', 'No Letterplate'), knock = curDesc('Knocker', 'No Knocker');
  const fshape = curDesc('Frame Design', 'No Sidelights');
  const sidelit = fshape !== 'No Sidelights' && /sidelight|flag/i.test(fshape);
  const dx = sidelit ? 68 : 0; // door shifts right into the centre when sidelit
  const L = [];
  L.push(img(A + 'DoorBlanks/Mould1/Thumbnails/' + colour + '.jpg', 77 + dx, 162, 138, 307));
  L.push(img(A + 'DoorCassettes/K1/Thumbnails/' + colour + '.png', 77 + dx, 49, 82, 37));
  if (glass && !/unglazed/i.test(glass)) { L.push(img(A + 'DoorGlazing/' + glass + '/Thumbnails/K1.png', 77 + dx, 49, 82, 37)); }
  L.push(img(A + 'Handles/' + handle.replace(/\W/g, '') + 'Chrome.png', 23 + dx, 160, 25, 40));
  if (!/no letterplate/i.test(lp)) { L.push(img(A + 'Letterplates/' + lp.replace(/\W/g, '') + '.png', 77 + dx, 200, 40, 8)); }
  if (!/no knocker/i.test(knock)) { L.push(img(A + 'Knockers/' + knock.replace(/\W/g, '') + '.png', 77 + dx, 80, 21, 24)); }
  L.push(img(A + 'DripBars/White.png', 77 + dx, 313, 130, 5));
  if (sidelit) {
    if (/left|double/i.test(fshape)) { L.push(img(A + 'Side/Ornate.jpg', 32, 160, 48, 303)); }
    if (/right|double/i.test(fshape)) { L.push(img(A + 'Side/Ornate.jpg', 254, 160, 48, 303)); }
    L.push(img(A + 'DoorFrames/SingleBothSidelights/' + colour + '.png', 145, 159, 290, 318));
  } else {
    L.push(img(A + 'DoorFrames/Single/' + colour + '.png', 77, 159, 155, 318));
  }
  return L;
}

function mkField(heading, cat, descs, kind) {
  const subs = descs.map((d) => ({ Description: d, ID: idOf(heading + '::' + d), Images: kind === 'rich' ? currentComposite() : (kind === 'slab' ? [img(A + 'DoorBlanks/Mould1/Thumbnails/Anthracite Grey.jpg', 77, 162, 138, 307)] : []), IsSelected: false }));
  let sel = subs.find((s) => s.Description === cur[heading]) || subs[0];
  if (sel) { cur[heading] = sel.Description; sel.IsSelected = true; }
  return { Heading: heading, Category: cat, CurrentID: sel ? sel.ID : 0, CurrentOption: sel ? sel.Description : '', SubOptions: subs, Visible: subs.length > 0 };
}

function buildOptions() {
  const c = CATALOG[curType()], style = curStyle();
  const o = [];
  o.push(mkField('Door Type', 1, Object.keys(CATALOG)));
  o.push(mkField('Door Design', 2, c.styles, 'slab'));
  o.push(mkField('Door Glass', 3, glassFor(style)));
  // The real designer REMOVES the Knocker field for styles that offer no knocker
  // (rather than leaving it empty), so field('Knocker') is undefined on those styles.
  if (c.hasKnocker && knockerFor(style, true).length) { o.push(mkField('Knocker', 4, knockerFor(style, true))); }
  o.push(mkField('Frame Design', 5, c.frames));       // empty own images
  o.push(mkField('Letterplate', 6, LETTERPLATES));    // empty own images
  o.push(mkField('Handle', 7, ['Lever/Lever', '1200mm Stainless Flat Pull Handle'], 'rich')); // carries full composite
  if (/sidelight|half flag/i.test(curDesc('Frame Design', 'No Sidelights'))) {
    o.push(mkField('Sidelight Type', 8, ['Unglazed', 'Glazed']));
    o.push(mkField('Sidelight Glass', 9, ['Reeded', 'Satin (0 to 300mm wide)']));
    o.push(mkField('Side Slab Required', 10, ['No - Use sidelight glass details', 'Yes - Side Slab']));
  }
  return o;
}

global.window.mJobState = { Job: { Options: [], SegmentDoor: { Width: 1025, Height: 2120 }, SegmentSidelight_L: { Width: 434 }, SegmentSidelight_R: { Width: 0 }, SegmentTopBox: { Width: 0 } } };
const rebuild = () => { global.window.mJobState.Job.Options = buildOptions(); };
global.SelectOption = function (category, id) {
  const f = global.window.mJobState.Job.Options.find((o) => o.Category === category);
  if (!f) { return; }
  const s = f.SubOptions.find((x) => x.ID === id);
  if (!s) { return; }
  cur[f.Heading] = s.Description;
  if (f.Heading === 'Door Type') { ['Door Design', 'Door Glass', 'Knocker', 'Frame Design', 'Letterplate', 'Handle', 'Sidelight Type', 'Sidelight Glass', 'Side Slab Required'].forEach((h) => delete cur[h]); }
  if (f.Heading === 'Door Design') { delete cur['Door Glass']; delete cur['Knocker']; }
  rebuild();
};
rebuild();

require('./endurance-catalogue-extractor.js');
const EXT = global.window.EXT;

(async function () {
  await EXT.capturePatch();
  const patch = global.window.__patch;
  const problems = [];
  const need = ['Single Door', 'Double Door', 'Stable Door', 'Avantal'];
  need.forEach((t) => { if (!patch[t]) { problems.push('missing type ' + t); } });

  const sd = patch['Single Door'] || {};
  if (!sd.knockerByStyle) { problems.push('SD no knockerByStyle'); }
  else {
    if ((sd.knockerByStyle['Kit'] || []).length !== 0) { problems.push('Kit should offer 0 knockers'); }
    if ((sd.knockerByStyle['Abbott'] || []).length === 0) { problems.push('Abbott should offer knockers'); }
  }
  if (!sd.glazingByStyle || (sd.glazingByStyle['Kit'] || []).length !== 0) { problems.push('Kit glazing should be 0'); }
  const slf = sd.sidelights && sd.sidelights.fields ? Object.keys(sd.sidelights.fields) : [];
  ['Sidelight Type', 'Sidelight Glass', 'Side Slab Required'].forEach((h) => { if (!slf.includes(h)) { problems.push('SD sidelights missing field: ' + h); } });
  if (!sd.sidelights || !(sd.sidelights.delta || []).length) { problems.push('SD sidelights captured no layers'); }
  const realLp = (sd.letterplate ? sd.letterplate.choices : []).find((c) => /Pewter/.test(c.label));
  if (!realLp || !(realLp.delta || []).length) { problems.push('SD letterplate layer NOT captured'); }

  const dd = patch['Double Door'] || {};
  if (dd.knockerByStyle) { problems.push('Double should have no knockerByStyle'); }
  if (dd.sidelights) { problems.push('Double should have no sidelights'); }
  if (!dd.letterplate) { problems.push('Double should still capture letterplate'); }

  const av = patch['Avantal'] || {};
  if (av.knockerByStyle) { problems.push('Avantal should have no knockerByStyle'); }
  if (!av.sidelights || !Object.keys((av.sidelights.fields || {})).length) { problems.push('Avantal should capture sidelights'); }

  // sidelight-rendering capture: full composites per sidelit shape
  await EXT.capturePatchSidelights(['Single Door']);
  const scp = (patch['Single Door'] || {}).sidelitComposites;
  if (!scp) { problems.push('no sidelitComposites captured'); }
  else {
    ['No Sidelights', 'Sidelight Left', 'Sidelight Right', 'Double Sidelight'].forEach((s) => { if (!scp[s]) { problems.push('sidelitComposites missing shape: ' + s); } });
    const dbl = scp['Double Sidelight'] || [];
    const sideGlass = dbl.filter((l) => /\/Side\//.test(l.url)).length;
    const wideFrame = dbl.some((l) => /SingleBothSidelights/.test(l.url));
    const doorShifted = dbl.some((l) => /DoorBlanks/.test(l.url) && l.cx > 100);
    if (sideGlass < 2) { problems.push('Double sidelight: expected 2 side-glass panels, got ' + sideGlass); }
    if (!wideFrame) { problems.push('Double sidelight: missing wide frame'); }
    if (!doorShifted) { problems.push('Double sidelight: door not shifted into centre'); }
    console.log('\nSidelit composites (Single): ' + Object.keys(scp).join(', '));
    console.log('  Double Sidelight: ' + dbl.length + ' layers, ' + sideGlass + ' side-glass, wideFrame=' + wideFrame + ', doorShifted=' + doorShifted);
  }

  console.log('\n=== PATCH SUMMARY ===');
  need.forEach((t) => {
    const p = patch[t] || {};
    console.log('  ' + t + ': knockerByStyle=' + (p.knockerByStyle ? Object.keys(p.knockerByStyle).length + ' styles' : '-') +
      ' | sidelights=' + (p.sidelights ? Object.keys(p.sidelights.fields || {}).length + ' fields/' + (p.sidelights.delta || []).length + ' layers' : '-') +
      ' | letterplate=' + (p.letterplate ? p.letterplate.choices.length + ' choices' : '-'));
  });

  // exercise the merge against a copy of the real data (no disk writes)
  const { merge } = require('./merge-patch.js');
  const realFull = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'endurance-catalogue-full.json'), 'utf8'));
  const applied = merge(realFull, patch);
  if (!realFull['Single Door'].knockerByStyle) { problems.push('merge did not wire knockerByStyle'); }
  console.log('\n=== MERGE (into in-memory copy) ===');
  applied.forEach((a) => console.log('  ' + a));

  console.log('\n=== RESULT ===');
  if (problems.length) { console.log('FAILED:'); problems.forEach((p) => console.log('  XX ' + p)); process.exit(1); }
  console.log('PASS — patch capture runs end-to-end, captures ALL missing data, and merges in cleanly.');
})().catch((e) => { console.error('THREW:', e && e.stack ? e.stack : e); process.exit(1); });
