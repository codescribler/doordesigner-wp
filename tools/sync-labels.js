'use strict';
// Compare the catalogue's option labels with a live capture from the Endurance designer and
// (with --apply) adopt Endurance's names. Endurance is the source of truth: orders are placed
// there, so the enquiry must carry their exact labels.
//
// Capture shape (read in the logged-in designer; see README "Label sync"):
//   { "<Door Type>": { fields: { "<Heading>": [[id, label], …] },
//                      glazing: { "<style>": [[id, label], …] }, knocker: { … } } }
//
//   node tools/sync-labels.js <capture.json>           report only
//   node tools/sync-labels.js <capture.json> --apply   rename in place, then rebuild the model
//   … --apply --adopt [--field='Avantal|Door Colour (External)']  also take Endurance's per-style
//     glass/knocker lists and the named field lists wholesale
//
// Matching is by Endurance option ID: same ID + different label = a rename. Options that were
// added or removed are only reported, never applied automatically — an added option has no
// captured image layers, and removing one changes what customers can pick.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FULL = path.join(ROOT, 'data', 'endurance-catalogue-full.json');
const CATS = path.join(ROOT, 'data', 'style-categories.json');

function diffList(ours, theirs) {
  const byId = new Map((theirs || []).map((p) => [p[0], p[1]]));
  const ourIds = new Set((ours || []).map((c) => c.id));
  const renamed = [];
  const removed = [];
  (ours || []).forEach((c) => {
    if (!byId.has(c.id)) { removed.push(c.label); }
    else if (byId.get(c.id) !== c.label && !/^-unset-$/i.test(byId.get(c.id))) { renamed.push({ id: c.id, from: c.label, to: byId.get(c.id) }); }
  });
  const added = (theirs || []).filter((p) => !ourIds.has(p[0])).map((p) => p[1]);
  return { renamed, added, removed };
}

// Every labelled list in one type node: its fields, sidelight fields and per-style lists.
function lists(node) {
  const out = [];
  Object.keys(node.fields || {}).forEach((h) => out.push({ where: h, ours: node.fields[h].choices || [], key: ['fields', h] }));
  const sl = node.sidelights && node.sidelights.fields;
  Object.keys(sl || {}).forEach((h) => out.push({ where: h, ours: sl[h].choices || [], key: ['sidelights', h] }));
  return out;
}

function compare(full, capture) {
  const report = [];
  Object.keys(capture).forEach((type) => {
    const node = full[type];
    if (!node) { report.push({ type, where: '(type)', renamed: [], added: [type], removed: [] }); return; }
    const cap = capture[type];
    lists(node).forEach((l) => {
      const theirs = cap.fields[l.where];
      if (!theirs) { return; } // a heading the live designer only shows in other states
      const d = diffList(l.ours, theirs);
      if (d.renamed.length || d.added.length || d.removed.length) { report.push(Object.assign({ type, where: l.where, key: l.key }, d)); }
    });
    ['glazing', 'knocker'].forEach((kind) => {
      const ours = kind === 'glazing' ? node.glazingByStyle : node.knockerByStyle;
      Object.keys(cap[kind] || {}).forEach((style) => {
        const d = diffList((ours || {})[style] || (ours || {})[renamedStyle(node, cap, style)] || [], cap[kind][style]);
        if (d.renamed.length || d.added.length || d.removed.length) { report.push(Object.assign({ type, where: kind + ' for ' + style, style, kind }, d)); }
      });
    });
  });
  return report;
}

// Our label for a style Endurance now calls `live` (by ID), else `live` itself.
function renamedStyle(node, cap, live) {
  const id = ((cap.fields['Door Design'] || []).find((p) => p[1] === live) || [])[0];
  const ours = (node.fields['Door Design'].choices || []).find((c) => c.id === id);
  return ours ? ours.label : live;
}

function renameKey(obj, from, to) {
  if (obj && Object.prototype.hasOwnProperty.call(obj, from) && from !== to) { obj[to] = obj[from]; delete obj[from]; }
}

// Adopt Endurance's labels for every same-ID rename (mutates full + categories).
function apply(full, categories, report) {
  const done = [];
  report.forEach((r) => {
    r.renamed.forEach((rn) => {
      const node = full[r.type];
      const relabel = (list) => (list || []).forEach((c) => { if (c.id === rn.id && c.label === rn.from) { c.label = rn.to; } });
      if (r.key) {
        const list = r.key[0] === 'fields' ? node.fields[r.key[1]].choices : node.sidelights.fields[r.key[1]].choices;
        relabel(list);
        if (r.key[0] === 'sidelights') {
          const alias = r.key[1] === 'Sidelight Type' ? 'sidelightType' : (r.key[1] === 'Sidelight Glass' ? 'sidelightGlass' : null);
          if (alias && node.sidelights[alias]) { relabel(node.sidelights[alias].choices); }
        }
        if (r.where === 'Door Design') {
          // A style is also a key in the per-style maps, the slabs and the categories.
          [node.glazingByStyle, node.knockerByStyle, node.styleSlabs, categories && categories[r.type]].forEach((m) => renameKey(m, rn.from, rn.to));
        }
        if (r.where === 'Door Glass' || r.where === 'Knocker') {
          const per = r.where === 'Door Glass' ? node.glazingByStyle : node.knockerByStyle;
          Object.keys(per || {}).forEach((s) => relabel(per[s]));
        }
      } else {
        const per = r.kind === 'glazing' ? node.glazingByStyle : node.knockerByStyle;
        relabel((per || {})[r.style]);
      }
      done.push(r.type + ' / ' + r.where + ': "' + rn.from + '" → "' + rn.to + '"');
    });
  });
  return done;
}

// Replace lists wholesale with Endurance's live ones (after renames):
//   • each style's glass and knocker list (Endurance adds/withdraws options per style);
//   • any field named in `fields` ("<Type>|<Heading>"), for lists that don't depend on other
//     choices. Handle/Letterplate vary with the chosen finish — never adopt those here.
// A type that gains knockers also gets a Knocker field (the union of its styles' lists), which
// is what switches the knocker step on in the customer view.
function adopt(full, capture, fields) {
  const done = [];
  const toChoices = (pairs) => (pairs || []).filter((p) => !/^-unset-$/i.test(p[1])).map((p) => ({ label: p[1], id: p[0] }));
  Object.keys(capture).forEach((type) => {
    const node = full[type];
    if (!node) { return; }
    const cap = capture[type];
    const oursByLabel = (list) => new Map((list || []).map((c) => [c.label, c]));
    ['glazing', 'knocker'].forEach((kind) => {
      const key = kind === 'glazing' ? 'glazingByStyle' : 'knockerByStyle';
      node[key] = node[key] || {};
      Object.keys(cap[kind] || {}).forEach((style) => { node[key][style] = toChoices(cap[kind][style]); });
      done.push(type + ': ' + key + ' ← live (' + Object.keys(cap[kind] || {}).length + ' styles)');
    });
    const union = new Map();
    Object.values(node.knockerByStyle || {}).forEach((l) => l.forEach((c) => union.set(c.id, c)));
    if (union.size && !node.fields['Knocker']) {
      node.fields['Knocker'] = { heading: 'Knocker', category: null, baselineId: null, choices: Array.from(union.values()).map((c) => ({ label: c.label, id: c.id, delta: [] })) };
      done.push(type + ': Knocker field added (' + union.size + ' knockers; images borrowed from other door types)');
    }
    (fields || []).forEach((spec) => {
      const [t, h] = spec.split('|');
      if (t !== type || !cap.fields[h] || !node.fields[h]) { return; }
      const old = oursByLabel(node.fields[h].choices);
      node.fields[h].choices = toChoices(cap.fields[h]).map((c) => Object.assign({ delta: [] }, old.get(c.label) || {}, c));
      done.push(type + ': ' + h + ' ← live (' + node.fields[h].choices.length + ')');
    });
  });
  return done;
}

function main() {
  const src = process.argv[2];
  if (!src) { console.error('usage: node tools/sync-labels.js <capture.json> [--apply]'); process.exit(1); }
  const capture = JSON.parse(fs.readFileSync(src, 'utf8'));
  const full = JSON.parse(fs.readFileSync(FULL, 'utf8'));
  const categories = JSON.parse(fs.readFileSync(CATS, 'utf8'));
  const report = compare(full, capture);
  if (!report.length) { console.log('Labels match Endurance exactly.'); return; }
  report.forEach((r) => {
    console.log('\n' + r.type + ' — ' + r.where);
    r.renamed.forEach((x) => console.log('  renamed: "' + x.from + '" → "' + x.to + '"'));
    r.added.forEach((x) => console.log('  added upstream (not in the designer): "' + x + '"'));
    r.removed.forEach((x) => console.log('  gone upstream (still in the designer): "' + x + '"'));
  });
  if (process.argv.includes('--apply')) {
    const done = apply(full, categories, report);
    const fieldArgs = process.argv.filter((a) => a.indexOf('--field=') === 0).map((a) => a.slice(8));
    if (process.argv.includes('--adopt')) { adopt(full, capture, fieldArgs).forEach((x) => console.log('  ' + x)); }
    fs.writeFileSync(FULL, JSON.stringify(full, null, 2));
    fs.writeFileSync(CATS, JSON.stringify(categories, null, 2) + '\n');
    console.log('\nApplied ' + done.length + ' rename(s). Next: node tools/build-render-model.js');
  }
}

module.exports = { diffList, compare, apply, adopt };
if (require.main === module) { main(); }
