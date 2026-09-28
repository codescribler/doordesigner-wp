'use strict';
// Every door image the designer can request, found by running the REAL assembler over each
// choice (so it can't drift from what the browser asks for). The site's image warmer
// (includes/class-hd-image-warmer.php) pre-fetches these into its cache, so a colour or glass
// nobody has picked yet still shows when the upstream Endurance host is slow or down.
//   Written to data/image-manifest.json by tools/build-render-model.js.

const PREFIX = 'Assets/CompositeDoors/Images/';

function labels(list) { return (list || []).map((c) => c.label); }

function imageManifest(raw, model, assemble) {
  const set = new Set();
  const add = (layers) => layers.forEach((l) => { if (l.url && /\.(png|jpe?g)$/i.test(l.url)) { set.add(l.url.replace(/\?.*$/, '')); } });
  Object.keys(model.types).forEach((type) => {
    const node = raw[type];
    const T = model.types[type];
    if (!node || !node.fields) { return; }
    const f = (h) => labels(node.fields[h] && node.fields[h].choices);
    const colours = f('Door Colour (External)');
    const finishes = f('Hardware Type');
    const base = { 'Door Type': { label: type } };
    const d = (extra) => Object.assign({}, base, extra);
    Object.keys(T.styles).forEach((style) => {
      const s = { 'Door Design': { label: style } };
      // Every colour of this style's blank + cassettes.
      colours.forEach((c) => add(assemble(model, type, d(Object.assign({ 'Door Colour (External)': { label: c } }, s)))));
      // Every glass this style offers.
      labels((node.glazingByStyle || {})[style]).forEach((g) => add(assemble(model, type, d(Object.assign({ 'Door Glass': { label: g } }, s)))));
      // Knockers sit at a style-dependent height but use the same image — once per style is plenty.
      labels((node.knockerByStyle || {})[style]).forEach((k) => add(assemble(model, type, d(Object.assign({ 'Knocker': { label: k } }, s)))));
    });
    // Furniture in every finish (recoloured file names).
    finishes.forEach((hw) => {
      f('Handle').forEach((h) => add(assemble(model, type, d({ 'Hardware Type': { label: hw }, 'Handle': { label: h } }))));
      f('Letterplate').forEach((lp) => add(assemble(model, type, d({ 'Hardware Type': { label: hw }, 'Letterplate': { label: lp } }))));
    });
  });
  // Everything the capture recorded (frames, drip bars, sidelights, side designs…).
  (raw._imageUrls || []).forEach((u) => { const c = u.replace(/\?.*$/, ''); if (/\.(png|jpe?g)$/i.test(c)) { set.add(c); } });
  return Array.from(set).filter((u) => u.indexOf(PREFIX) === 0).sort();
}

module.exports = { imageManifest };
