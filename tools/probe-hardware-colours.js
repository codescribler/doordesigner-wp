/*
 * probe-hardware-colours.js  (Node — occasional, read-only network step)
 * ---------------------------------------------------------------------------
 * The Endurance designer recolours door furniture (handles, letterplates) by
 * SWAPPING the image filename's colour-token suffix — e.g. LeverLever`Chrome`.png
 * -> LeverLever`Black`.png — not by tinting. The "Hardware Colour" option maps to
 * one of these tokens, and each furniture base only has SOME colours available
 * (a lever has all seven; an architectural letterplate only three; pull handles
 * none). This script discovers, read-only, which (base, colour) image files
 * actually exist on the asset host, so the render model can recolour the preview
 * exactly as Endurance does and never swap to a 404 (which would drop the layer).
 *
 * It reads the furniture filenames already in data/render-model.json, derives each
 * recolourable base (a name ending in a standard token), HEAD-checks every token
 * variant, and writes data/hardware-colours.json:
 *   { tokens: { <Hardware Colour label>: <filename token> },
 *     variants: { <base>: [<token>, ...] } }
 *
 * Run:  node tools/probe-hardware-colours.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const MODEL = path.join(__dirname, '..', 'data', 'render-model.json');
const OUT = path.join(__dirname, '..', 'data', 'hardware-colours.json');

// Endurance "Hardware Colour" label -> the token used in furniture filenames.
// Derived from the live designer's drawing elements + the catalogue's Stable-door
// escutcheon deltas. The four omitted finishes (Forged Black, Pewter, Matt Black,
// Satin Brass) have no recolour variants — Endurance swaps them to distinct handle
// products, so they intentionally have no token here and leave the preview as-is.
const TOKENS = {
  'Chrome': 'Chrome',
  'Black': 'Black',
  'Gold': 'Gold',
  'Stainless Steel': 'Satin',
  'Antique Black': 'AntiqueBlack',
  'Graphite': 'Graphite',
  'Bronze': 'Bronze',
};
// Some furniture spells a finish with a DIFFERENT filename token than the rest. The Heritage
// finger pull renders the "Stainless Steel" finish as `MattSilver`, not the `Satin` every
// other base uses (verified against the images the live Endurance designer actually loads —
// HeritagePullMattSilver.png exists; HeritagePullSatin.png 404s). Map each alternate token to
// the canonical finish token it stands in for, so the recolour and the greying treat them as
// the same finish. (alternate token -> canonical finish token)
const ALIASES = { MattSilver: 'Satin' };

// The set of filename tokens, longest-first so AntiqueBlack matches before Black.
const TOKEN_SUFFIXES = Object.values(TOKENS).sort((a, b) => b.length - a.length);

// Every token worth HEAD-checking per base: the canonical finish tokens plus the alternates.
const PROBE_TOKENS = [...new Set([...Object.values(TOKENS), ...Object.keys(ALIASES)])];

const ASSET_FALLBACK = 'https://bmapprocaldoorportalretail.azurewebsites.net';
const ASSET_DIR = 'Assets/CompositeDoors/Images';
const FOLDER = { handles: 'Handles', letterplates: 'Letterplates' };

// Split "LeverLeverChrome" -> { base:'LeverLever', token:'Chrome' } when it ends in
// a standard token, else null (fixed/stainless/product-colour furniture).
function splitToken(filename) {
  const stem = filename.replace(/\.\w+$/, '');
  for (const tok of TOKEN_SUFFIXES) {
    if (stem.length > tok.length && stem.slice(-tok.length) === tok) {
      return { base: stem.slice(0, -tok.length), token: tok };
    }
  }
  return null;
}

function head(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({ method: 'HEAD', hostname: u.hostname, path: u.pathname + u.search, timeout: 15000 },
      (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function main() {
  const model = JSON.parse(fs.readFileSync(MODEL, 'utf8'));
  const assetBase = (model._assetBase || ASSET_FALLBACK).replace(/\/$/, '');

  // Collect each recolourable base alongside the folder it lives in.
  const folderOf = {}; // base -> 'Handles' | 'Letterplates'
  for (const t of Object.values(model.types || {})) {
    for (const grp of Object.keys(FOLDER)) {
      for (const entry of Object.values(t[grp] || {})) {
        const filename = String(entry.url || '').split('/').pop().split('?')[0];
        const split = splitToken(filename);
        if (split) { folderOf[split.base] = FOLDER[grp]; }
      }
    }
  }

  const bases = Object.keys(folderOf).sort();
  const variants = {};
  for (const base of bases) {
    const found = [];
    for (const tok of PROBE_TOKENS) {
      const url = `${assetBase}/${ASSET_DIR}/${folderOf[base]}/${base}${tok}.png`;
      // eslint-disable-next-line no-await-in-loop -- sequential keeps the host happy
      if (await head(url)) { found.push(tok); }
    }
    variants[base] = found;
    console.log(`${base}: ${found.join(', ') || '(none)'}`);
  }

  fs.writeFileSync(OUT, JSON.stringify({ tokens: TOKENS, aliases: ALIASES, variants }, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(path.join(__dirname, '..'), OUT)} (${bases.length} bases).`);
}

main();
