/*
 * probe-glass-thumbs.js  (Node — occasional, read-only network step)
 * ---------------------------------------------------------------------------
 * The glass picker's thumbnails use the chosen STYLE's cassette key, so on a
 * small-aperture door the glass images are tiny (12-95px) and the patterns wash
 * out — the picker looks half-blank. Endurance ships a glass image per aperture
 * key (DoorGlazing/<glass>/Thumbnails/<key>.png) and the SAME glass is far more
 * detailed at some keys than others (e.g. Comete is ~7KB at one aperture but
 * ~50KB at another). This finds, per glass, the key with the LARGEST image — the
 * clearest pattern — so the picker can show a legible thumbnail regardless of the
 * door style. Plain glasses (Satin, Clear) stay small at every key: that's
 * correct, they have no pattern.
 *
 * Writes data/glass-thumbs.json: { "<glass label>": "<best cassette key>", ... }.
 * Run:  node tools/probe-glass-thumbs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const MODEL = path.join(__dirname, '..', 'data', 'render-model.json');
const SRC = path.join(__dirname, '..', 'data', 'endurance-catalogue-full.json');
const OUT = path.join(__dirname, '..', 'data', 'glass-thumbs.json');
const ASSET_FALLBACK = 'https://bmapprocaldoorportalretail.azurewebsites.net';

// The common rectangular aperture keys worth checking for a legible thumbnail.
// (Avantal/GB variants are niche frame-specific keys — the glass art is shared,
//  so the standard keys cover every glass.)
const CANDIDATE_KEYS = ['K2', 'K15', '764', '848', 'K3', 'K5', 'K7', '2264', 'CR868', 'Pendle', '2248', '2223', '2210', 'Diamond', 'K1'];

const CONCURRENCY = 16;

// HEAD-ish: GET but read only the Content-Length header, then abort the body.
function sizeOf(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search, timeout: 15000 }, (res) => {
      const len = res.statusCode === 200 ? parseInt(res.headers['content-length'] || '0', 10) : 0;
      res.destroy();
      resolve(Number.isFinite(len) ? len : 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}

async function pool(items, worker) {
  const out = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  return out;
}

function glassLabels(raw) {
  const set = new Set();
  ['Single Door', 'Double Door', 'Stable Door', 'Avantal'].forEach((t) => {
    const node = raw[t];
    if (!node || !node.glazingByStyle) { return; }
    Object.values(node.glazingByStyle).forEach((arr) => (arr || []).forEach((g) => {
      const l = g && g.label;
      if (l && !/^unglazed$/i.test(l) && !/^-?unset-?$/i.test(l)) { set.add(l); }
    }));
  });
  return Array.from(set).sort();
}

async function main() {
  const model = JSON.parse(fs.readFileSync(MODEL, 'utf8'));
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const base = (model._assetBase || ASSET_FALLBACK).replace(/\/$/, '');
  const glasses = glassLabels(raw);

  const result = {};
  for (const glass of glasses) {
    const sizes = await pool(CANDIDATE_KEYS, async (key) => ({
      key,
      size: await sizeOf(`${base}/Assets/CompositeDoors/Images/DoorGlazing/${encodeURIComponent(glass)}/Thumbnails/${encodeURIComponent(key)}.png`),
    }));
    const best = sizes.filter((s) => s.size > 0).sort((a, b) => b.size - a.size)[0];
    if (best) {
      result[glass] = best.key;
      console.log(`${glass}: ${best.key} (${best.size}b)`);
    } else {
      console.log(`${glass}: (no image at any candidate key — leaving to style default)`);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(path.join(__dirname, '..'), OUT)} (${Object.keys(result).length} glasses).`);
}

main();
