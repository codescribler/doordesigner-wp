'use strict';
// Hardware-colour recolour. The Endurance designer recolours door furniture by
// swapping the filename's trailing colour token (LeverLever`Chrome` ->
// LeverLever`Black`), and each base only offers SOME colours. assemble() must do the
// same: recolour the handle + letterplate to the chosen Hardware Colour when a
// variant exists, and otherwise leave the captured image untouched (a missing
// variant would 404 and drop the layer). Tokens + per-base availability come from
// data/hardware-colours.json (built read-only by tools/probe-hardware-colours.js).
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { assemble } = require(path.join(__dirname, '..', '..', 'assets/js/render-model.js'));
const model = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data/render-model.json'), 'utf8'));

const TYPE = 'Single Door';
const base = { 'Door Type': { label: TYPE }, 'Door Design': { label: 'Abbott' }, 'Door Colour (External)': { label: 'Irish Oak' } };
const fileOf = (ls, slot) => { const l = ls.find((x) => x.slot === slot); return l ? l.url.split('/').pop() : null; };
const handleFile = (extra) => fileOf(assemble(model, TYPE, Object.assign({}, base, extra)), 'Handles');
const letterFile = (extra) => fileOf(assemble(model, TYPE, Object.assign({}, base, extra)), 'Letterplates');

// 0. The model carries the recolour data.
assert.ok(model.hardwareColours && model.hardwareColours['Stainless Steel'] === 'Satin', 'hardwareColours maps labels to filename tokens');
assert.ok(model.furnitureColours && Array.isArray(model.furnitureColours.LeverLever), 'furnitureColours lists per-base availability');
assert.ok(model.furnitureColourAliases && model.furnitureColourAliases.MattSilver === 'Satin', 'aliases map alternate tokens (MattSilver) to their canonical finish (Satin)');

// 1. A lever handle recolours to each finish that has a variant.
assert.equal(handleFile({ Handle: { label: 'Lever/Lever' }, 'Hardware Type': { label: 'Chrome' } }), 'LeverLeverChrome.png', 'Chrome = captured baseline');
assert.equal(handleFile({ Handle: { label: 'Lever/Lever' }, 'Hardware Type': { label: 'Black' } }), 'LeverLeverBlack.png', 'Black recolours the lever');
assert.equal(handleFile({ Handle: { label: 'Lever/Lever' }, 'Hardware Type': { label: 'Stainless Steel' } }), 'LeverLeverSatin.png', 'Stainless Steel -> Satin token');
assert.equal(handleFile({ Handle: { label: 'Lever/Lever' }, 'Hardware Type': { label: 'Antique Black' } }), 'LeverLeverAntiqueBlack.png', 'Antique Black matches before Black (longest token first)');
assert.equal(handleFile({ Handle: { label: 'Lever/Lever' }, 'Hardware Type': { label: 'Bronze' } }), 'LeverLeverBronze.png', 'Bronze recolours the lever');

// 2. A finish with no recolour variant (Endurance swaps it to a different product) leaves
//    the captured image — never a guessed/404 filename.
assert.equal(handleFile({ Handle: { label: 'Lever/Lever' }, 'Hardware Type': { label: 'Forged Black' } }), 'LeverLeverChrome.png', 'Forged Black has no token -> handle unchanged');

// 3. Fixed furniture (a stainless pull handle) is never recoloured.
assert.equal(handleFile({ Handle: { label: '1200mm Pull Handle' }, 'Hardware Type': { label: 'Black' } }), 'PullHandle1200.jpg', 'A fixed pull handle ignores the finish');

// 4. No Hardware Type selected at all -> captured colour.
assert.equal(handleFile({ Handle: { label: 'Lever/Lever' } }), 'LeverLeverChrome.png', 'No finish selected -> captured Chrome');

// 5. The generic letterplate recolours; the architectural one only to colours it has.
assert.equal(letterFile({ Letterplate: { label: 'Letterplate' }, 'Hardware Type': { label: 'Gold' } }), 'LetterplateGold.png', 'Generic letterplate recolours to Gold');
assert.equal(letterFile({ Letterplate: { label: 'Letterplate' }, 'Hardware Type': { label: 'Black' } }), 'LetterplateBlack.png', 'Generic letterplate recolours to Black');
assert.equal(letterFile({ Letterplate: { label: 'Architectural Letterplate' }, 'Hardware Type': { label: 'Graphite' } }), 'LetterplateArchGraphite.png', 'Architectural letterplate recolours to Graphite (a variant it has)');
assert.equal(letterFile({ Letterplate: { label: 'Architectural Letterplate' }, 'Hardware Type': { label: 'Black' } }), 'LetterplateArchChrome.png', 'Architectural letterplate has no Black -> stays Chrome');

// 6. Every recoloured filename it produces must be a declared-available variant — proof we
//    can never emit a 404 swap.
['Chrome', 'Black', 'Gold', 'Stainless Steel', 'Antique Black', 'Graphite', 'Bronze', 'Forged Black'].forEach((hw) => {
  const f = handleFile({ Handle: { label: 'Lever/Lever' }, 'Hardware Type': { label: hw } });
  const tok = f.replace(/^LeverLever/, '').replace(/\.\w+$/, '');
  assert.ok(model.furnitureColours.LeverLever.indexOf(tok) !== -1, `LeverLever ${hw} -> token ${tok} is an available variant`);
});

// 7. furnitureColourInfo (shared by the recolour AND the wizard's handle greying): the
//    finishes each handle base comes in, and null for fixed-finish handles.
const { furnitureColourInfo } = require(path.join(__dirname, '..', '..', 'assets/js/render-model.js'));
const H = model.types['Single Door'].handles;
const infoFor = (label) => furnitureColourInfo(model, H[label].url);

const lever = infoFor('Lever/Lever');
assert.equal(lever.base, 'LeverLever', 'Lever/Lever base detected');
assert.deepEqual(lever.variants, ['Chrome', 'Black', 'Gold', 'Satin', 'AntiqueBlack', 'Graphite', 'Bronze'], 'Lever/Lever comes in all seven finishes');

assert.deepEqual(infoFor('Architectural Lever/Lever').variants, ['Chrome', 'Gold', 'Graphite'], 'Architectural lever: Chrome/Gold/Graphite only');
assert.deepEqual(infoFor('Heritage Lever/Lever').variants, ['Chrome', 'Gold', 'AntiqueBlack', 'Graphite'], 'Heritage lever: 4 finishes');
assert.deepEqual(infoFor('Finger Pull').variants, ['Chrome', 'Black', 'Gold', 'MattSilver'], 'Finger Pull: Chrome/Black/Gold + the MattSilver stainless variant');

// 7b. The finger pull renders the Stainless Steel finish via its MattSilver token (it has no
//     Satin variant). This is the bug the live-image check caught: before the alias the pull
//     stayed Chrome and was wrongly greyed out for Stainless Steel.
assert.equal(handleFile({ Handle: { label: 'Finger Pull' }, 'Hardware Type': { label: 'Stainless Steel' } }), 'HeritagePullMattSilver.png', 'Finger Pull + Stainless Steel -> MattSilver (Satin alias)');
assert.equal(handleFile({ Handle: { label: 'Finger Pull' }, 'Hardware Type': { label: 'Black' } }), 'HeritagePullBlack.png', 'Finger Pull recolours to Black directly');
assert.equal(handleFile({ Handle: { label: 'Finger Pull' }, 'Hardware Type': { label: 'Bronze' } }), 'HeritagePullChrome.png', 'Finger Pull has no Bronze (nor a Bronze alias) -> stays Chrome');

// Fixed-finish handles report null (always shown, never greyed, never recoloured).
assert.equal(infoFor('1200mm Pull Handle'), null, 'A stainless pull handle has no colour variants');
assert.equal(infoFor('Forged Black Monkey Tail'), null, 'A forged handle has no standard colour variants');
assert.equal(infoFor('Premium Stainless Lever Handles'), null, 'A premium stainless lever has no colour variants');

// 8. Finish-availability (orderability audit F1/F2) — the LABELS a furniture item is offered in,
//    which drives the wizard's handle AND letterplate greying. Same mapping as the App's
//    furnitureAvailableColours: variant tokens (alias-resolved) -> finish labels; null for fixed.
const tokenToLabel = {};
for (const l in model.hardwareColours) { tokenToLabel[model.hardwareColours[l]] = l; }
const aliasMap = model.furnitureColourAliases || {};
const availFinishes = (url) => {
  const i = furnitureColourInfo(model, url);
  if (!i) { return null; }
  return i.variants.map((t) => tokenToLabel[aliasMap[t] || t]).filter(Boolean);
};
const LP = model.types['Single Door'].letterplates;
const HX = model.types['Single Door'].handles;
// F1: architectural/heritage letterplates exist only in Chrome/Gold/Graphite — must be greyed elsewhere.
assert.deepEqual(availFinishes(LP['Architectural Letterplate'].url).sort(), ['Chrome', 'Gold', 'Graphite'], 'Arch letterplate offered only in Chrome/Gold/Graphite');
assert.equal(availFinishes(LP['Architectural Letterplate'].url).indexOf('Black'), -1, 'Arch letterplate NOT offered in Black (no such product) -> wizard must grey it');
assert.deepEqual(availFinishes(LP['Letterplate'].url).sort(), ['Antique Black', 'Black', 'Bronze', 'Chrome', 'Gold', 'Graphite', 'Stainless Steel'], 'Generic letterplate offered in all seven standard finishes');
// F2: a recolourable handle has no variant in the specialty finishes -> not offered there (now greyed).
assert.equal(availFinishes(HX['Lever/Lever'].url).indexOf('Forged Black'), -1, 'Lever/Lever not offered in the specialty Forged Black finish');
assert.ok(availFinishes(HX['Finger Pull'].url).indexOf('Stainless Steel') !== -1, 'Finger Pull IS offered in Stainless Steel (MattSilver alias)');
// Fixed/product items stay unconstrained (null) — left selectable pending the validator question.
assert.equal(availFinishes(HX['1200mm Pull Handle'].url), null, 'A stainless pull handle has no finish constraint');
assert.equal(availFinishes(HX['Forged Black Monkey Tail'].url), null, 'A forged-black product handle is unconstrained here (its finish is in the product)');

console.log('hardware-colour OK');
