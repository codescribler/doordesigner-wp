# Configurator Wizard UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat one-page configurator front end with a guided, visual, mobile-first wizard (Layout C + "Architectural Mono"), reusing the existing data/rendering engine and PHP backend unchanged.

**Architecture:** A small set of browser+Node UMD modules — a declarative `step-config`, a `wizard-controller` state machine, a `step-renderer`, and a `review` screen — drive a one-step-at-a-time flow. The live door uses the existing `render-model.js` assembler + `preview.js` compositor. The PHP backend, REST endpoints (`/catalogue`, `/render-model`), DB, enquiry email, admin, and updater are untouched. Logic modules are unit-tested in Node with `node:assert` (the repo's existing test style); the visual layer is verified in the standalone harness.

**Tech Stack:** Vanilla ES5-compatible JS (UMD, no framework — matches `render-model.js`), scoped CSS, Node for tests/build scripts, WordPress (PHP 7.4+/WP 6.0+).

## Global Constraints

- Vanilla JS only; **no framework/build step**. New shared modules use the UMD wrapper pattern from `assets/js/render-model.js` so they load in the browser and `require()` in Node tests.
- All CSS scoped under the `.hd-dd` wrapper; inherit theme typography where sensible; never leak styles.
- **Do not touch** the PHP backend, DB schema, REST response shapes, enquiry email/payload, admin, or updater. Front end only.
- Preserve Endurance label strings **exactly** (incl. odd casing / trailing/double spaces) — the enquiry payload matches downstream on them. Friendly labels are display-only; the stored `design` keeps the real headings + labels.
- Currency is **£**. Customer-facing copy uses "Aluminium" for the Avantal range (never "Avantal" / "Endurance" jargon).
- Files small and single-purpose. New JS lives under `assets/js/wizard/`.
- Test runner: `node <file>` using `node:assert/strict`. No new npm dependencies.
- Commits: conventional messages; **no `Co-Authored-By` footer** (project rule). Commit per task.
- `data/render-model.json` is rebuilt with `node tools/build-render-model.js` whenever its inputs change.

---

## File Structure

**Create:**
- `data/style-categories.json` — style → category map (content config).
- `tools/build-categories.js` — derives the category map heuristically; writes the JSON.
- `tools/tests/test-categories.js` — asserts every style is categorised.
- `assets/js/wizard/step-config.js` — declarative step definitions + friendly labels + visibility + defaults (UMD).
- `tools/tests/test-step-config.js` — applicable-steps/defaults per type.
- `assets/js/wizard/wizard-controller.js` — state machine (UMD).
- `tools/tests/test-wizard-controller.js` — transitions, pruning, progress.
- `assets/js/wizard/step-renderer.js` — renders the active step's tiles + style category sub-flow.
- `assets/js/wizard/review.js` — review screen + tap-to-edit.
- `tools/mirror-images.js` — downloads `_imageUrls` into `assets/img/endurance/`, writes a URL map.
- `tools/tests/test-mirror-plan.js` — asserts the mirror enumeration/rewrite logic (dry run, no network).

**Modify:**
- `assets/js/hd-door-designer.js` — becomes a thin bootstrap that wires controller + renderer + review + preview + enquiry.
- `assets/css/hd-door-designer.css` — replaced with the Architectural Mono design system.
- `includes/class-hd-assets.php` — enqueue the new `wizard/*.js` modules (dependency order).
- `tools/preview-test.html` — extend to drive the wizard (visual QA).

**Reused unchanged:** `assets/js/render-model.js`, `assets/js/preview.js`, all `includes/*.php` except the assets enqueue list, both REST endpoints, `data/*.json`.

---

## Task 1: Style category map

Categories power the category-first style step. Derived heuristically, then hand-curatable in the JSON.

**Files:**
- Create: `tools/build-categories.js`
- Create: `data/style-categories.json` (generated)
- Test: `tools/tests/test-categories.js`

**Interfaces:**
- Produces: `data/style-categories.json` shaped `{ "<Door Type>": { "<Style label>": "<Category>" } }` where Category ∈ `Solid | Glazed | Georgian | Contemporary`.

- [ ] **Step 1: Write the failing test**

```js
// tools/tests/test-categories.js
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const full = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endurance-catalogue-full.json'), 'utf8'));
const cats = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/style-categories.json'), 'utf8'));
const VALID = ['Solid', 'Glazed', 'Georgian', 'Contemporary'];

for (const type of ['Single Door', 'Double Door', 'Stable Door', 'Avantal']) {
  const styles = full[type].fields['Door Design'].choices.map((c) => c.label);
  const map = cats[type] || {};
  for (const s of styles) {
    assert.ok(map[s], `${type}/${s} has no category`);
    assert.ok(VALID.includes(map[s]), `${type}/${s} invalid category ${map[s]}`);
  }
  // Georgian styles must be categorised Georgian
  styles.filter((s) => /georgian/i.test(s)).forEach((s) => assert.equal(map[s], 'Georgian', `${s} should be Georgian`));
  // zero-glazing styles must be Solid
  Object.entries(full[type].glazingByStyle || {}).forEach(([s, g]) => {
    if (g.length === 0 && map[s]) { assert.equal(map[s], 'Solid', `${s} (no glazing) should be Solid`); }
  });
}
console.log('categories OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/tests/test-categories.js`
Expected: FAIL — `data/style-categories.json` does not exist (ENOENT).

- [ ] **Step 3: Write the build script**

```js
// tools/build-categories.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const full = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endurance-catalogue-full.json'), 'utf8'));

function categorise(type, style, glazing) {
  if (/georgian/i.test(style)) { return 'Georgian'; }
  if ((glazing || []).length === 0) { return 'Solid'; }
  // Heuristic: large glazing aperture = Contemporary, smaller/patterned = Glazed.
  return (glazing.length >= 25) ? 'Contemporary' : 'Glazed';
}

const out = {};
for (const type of Object.keys(full)) {
  if (!full[type] || !full[type].fields || !full[type].fields['Door Design']) { continue; }
  out[type] = {};
  full[type].fields['Door Design'].choices.forEach((c) => {
    out[type][c.label] = categorise(type, c.label, (full[type].glazingByStyle || {})[c.label]);
  });
}
fs.writeFileSync(path.join(ROOT, 'data/style-categories.json'), JSON.stringify(out, null, 2));
console.log('wrote data/style-categories.json');
```

- [ ] **Step 4: Generate the map and run the test**

Run: `node tools/build-categories.js && node tools/tests/test-categories.js`
Expected: `wrote data/style-categories.json` then `categories OK`.

- [ ] **Step 5: Commit**

```bash
git add tools/build-categories.js tools/tests/test-categories.js data/style-categories.json
git commit -m "feat(wizard): derive style category map (Solid/Glazed/Georgian/Contemporary)"
```

> Note for Daniel review: the heuristic split between Glazed/Contemporary is a first pass — `data/style-categories.json` is editable by hand and the test still passes as long as values stay in the valid set.

---

## Task 2: Step config (declarative steps + friendly labels)

The single source of truth for the journey: which steps exist, their plain-English label, what data they pull, when they're visible, defaults, and tile type.

**Files:**
- Create: `assets/js/wizard/step-config.js`
- Test: `tools/tests/test-step-config.js`

**Interfaces:**
- Produces: `HD_DD_StepConfig.steps` (array) and `HD_DD_StepConfig.applicableSteps(typeNode, design)` → array of resolved steps `{ key, label, heading, tileType, choices }` for the current type+design (excludes hidden/empty steps). `typeNode` is `customerView.byType[type]`; `design` is `{ heading: {label,id} }`.

- [ ] **Step 1: Write the failing test**

```js
// tools/tests/test-step-config.js
'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const SC = require(path.join(__dirname, '..', '..', 'assets/js/wizard/step-config.js'));

// Build a customer_view from the full data the same way the PHP does (labels/ids only).
const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data/endurance-catalogue-full.json'), 'utf8'));
function view(type) {
  const n = full[type];
  const cv = { fields: {}, glazingByStyle: {}, knockerByStyle: {}, sidelights: null,
    hasInternalColour: !!n.fields['Door Colour (Internal)'], hasKnocker: !!n.fields['Knocker'],
    hasFrameShape: !!(n.fields['Frame Design'] && n.fields['Frame Design'].choices.length > 1),
    hingeSideField: n.fields['Door Hinged On'] ? 'Door Hinged On' : 'Master Leaf' };
  Object.keys(n.fields).forEach((h) => { cv.fields[h] = n.fields[h].choices.map((c) => ({ label: c.label, id: c.id })); });
  Object.entries(n.glazingByStyle || {}).forEach(([s, g]) => cv.glazingByStyle[s] = g.map((x) => ({ label: x.label, id: x.id })));
  Object.entries(n.knockerByStyle || {}).forEach(([s, g]) => cv.knockerByStyle[s] = g.map((x) => ({ label: x.label, id: x.id })));
  return cv;
}

// Double Door hides the frame-shape step (only "No Sidelights"); per the captured
// data it DOES expose a knocker (31 options) and uses Master Leaf for hinge side.
const dbl = view('Double Door');
let steps = SC.applicableSteps(dbl, { 'Door Type': { label: 'Double Door' } }).map((s) => s.key);
assert.ok(!steps.includes('frame'), 'Double hides frame-shape step (single "No Sidelights")');
assert.ok(steps.includes('knocker'), 'Double offers a knocker (data: 31 options)');
assert.ok(steps.includes('hinge'), 'hinge step present');

// Single + solid style (Mayon) hides glazing (zero glazing) but still offers a knocker.
const sd = view('Single Door');
steps = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Mayon' } }).map((s) => s.key);
assert.ok(!steps.includes('glazing'), 'Mayon (solid) hides glazing');
assert.ok(steps.includes('knocker'), 'Mayon still offers a knocker');

// Single + Ketu offers glazing but NO knocker (per-style knockerByStyle['Ketu'] is empty).
steps = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Ketu' } }).map((s) => s.key);
assert.ok(steps.includes('glazing'), 'Ketu shows glazing');
assert.ok(!steps.includes('knocker'), 'Ketu hides knocker (per-style: none)');

// Single + Abbott shows glazing + knocker.
steps = SC.applicableSteps(sd, { 'Door Type': { label: 'Single Door' }, 'Door Design': { label: 'Abbott' } }).map((s) => s.key);
assert.ok(steps.includes('glazing') && steps.includes('knocker'), 'Abbott shows glazing + knocker');

// Avantal hides internal colour + knocker (no such fields).
const av = view('Avantal');
steps = SC.applicableSteps(av, { 'Door Type': { label: 'Avantal' }, 'Door Design': { label: 'Sirius' } }).map((s) => s.key);
assert.ok(!steps.includes('intColour') && !steps.includes('knocker'), 'Avantal hides internal colour + knocker');

console.log('step-config OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/tests/test-step-config.js`
Expected: FAIL — `Cannot find module '.../step-config.js'`.

- [ ] **Step 3: Write step-config.js**

```js
// assets/js/wizard/step-config.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_StepConfig = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // key: internal; label: plain-English; heading: real Endurance heading (or token);
  // tileType: how the renderer draws choices; visibleWhen/choicesFor decide inclusion.
  var STEPS = [
    { key: 'type', label: 'What kind of door?', heading: 'Door Type', tileType: 'icon' },
    { key: 'frame', label: 'Just the door, or side panels too?', heading: 'Frame Design', tileType: 'icon',
      visibleWhen: function (n) { return !!n.hasFrameShape; } },
    { key: 'style', label: 'Pick your style', heading: 'Door Design', tileType: 'door', categoryFirst: true },
    { key: 'extColour', label: 'Choose your colour', heading: 'Door Colour (External)', tileType: 'swatch' },
    { key: 'intColour', label: 'Inside colour', heading: 'Door Colour (Internal)', tileType: 'swatch',
      optional: true, defaultLabel: 'White', visibleWhen: function (n) { return !!n.hasInternalColour; } },
    { key: 'sidelightGlass', label: 'Side panel glass', heading: 'Sidelight Glass', tileType: 'glass', source: 'sidelightGlass',
      visibleWhen: function (n, d) { return sidelit(n, d); } },
    { key: 'glazing', label: 'Choose your glass', heading: 'Door Glass', tileType: 'glass', source: 'glazing' },
    { key: 'hardware', label: 'Hardware finish', heading: 'Hardware Type', tileType: 'swatch' },
    { key: 'handle', label: 'Choose your handle', heading: 'Handle', tileType: 'handle' },
    { key: 'letterplate', label: 'Add a letterplate?', heading: 'Letterplate', tileType: 'choice', optional: true, defaultLabel: 'No Letterplate' },
    { key: 'knocker', label: 'Add a knocker?', heading: 'Knocker', tileType: 'choice', source: 'knocker', optional: true,
      visibleWhen: function (n) { return !!n.hasKnocker; } },
    { key: 'hinge', label: 'Hinge side', heading: '__hinge__', tileType: 'choice' }
  ];

  function sidelit(n, d) {
    if (!n.hasFrameShape) { return false; }
    var shape = (d['Frame Design'] && d['Frame Design'].label) || '';
    return /sidelight|half flag/i.test(shape);
  }

  // Resolve the real heading + choice list for a step given the active type+design.
  function resolve(step, n, d) {
    var heading = step.heading;
    var choices = null;
    if (heading === '__hinge__') { heading = n.hingeSideField || 'Door Hinged On'; choices = n.fields[heading]; }
    else if (step.source === 'glazing') {
      var style = d['Door Design'] && d['Door Design'].label;
      choices = (style && n.glazingByStyle && n.glazingByStyle[style]) ? n.glazingByStyle[style] : n.fields['Door Glass'];
    } else if (step.source === 'knocker') {
      var ks = d['Door Design'] && d['Door Design'].label;
      choices = (ks && n.knockerByStyle && n.knockerByStyle[ks]) ? n.knockerByStyle[ks] : n.fields['Knocker'];
    } else if (step.source === 'sidelightGlass') {
      choices = n.sidelights ? n.sidelights.sidelightGlass : null;
    } else { choices = n.fields[heading]; }
    return { heading: heading, choices: choices };
  }

  function applicableSteps(n, d) {
    var out = [];
    STEPS.forEach(function (step) {
      if (step.visibleWhen && !step.visibleWhen(n, d)) { return; }
      var r = resolve(step, n, d);
      if (!r.choices || !r.choices.length) { return; }
      out.push({ key: step.key, label: step.label, heading: r.heading, tileType: step.tileType,
        optional: !!step.optional, defaultLabel: step.defaultLabel, categoryFirst: !!step.categoryFirst, choices: r.choices });
    });
    return out;
  }

  return { steps: STEPS, applicableSteps: applicableSteps, sidelit: sidelit };
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/tests/test-step-config.js`
Expected: `step-config OK`.

- [ ] **Step 5: Commit**

```bash
git add assets/js/wizard/step-config.js tools/tests/test-step-config.js
git commit -m "feat(wizard): declarative step-config with per-type/per-style step resolution"
```

---

## Task 3: Wizard controller (state machine)

Owns the journey state: applicable steps, current index, design selections, progress, next/back/jump, default-filling, and downstream pruning when an upstream choice changes.

**Files:**
- Create: `assets/js/wizard/wizard-controller.js`
- Test: `tools/tests/test-wizard-controller.js`

**Interfaces:**
- Consumes: `HD_DD_StepConfig.applicableSteps`.
- Produces: `HD_DD_Wizard.create(customerView)` → controller with:
  - `selectType(label)`, `select(stepKey, choice)`, `next()`, `back()`, `jumpTo(stepKey)`
  - `state()` → `{ design, stepIndex, steps, progress: {current,total}, atReview }`
  - `design` keyed by real heading → `{label,id}`.

- [ ] **Step 1: Write the failing test**

```js
// tools/tests/test-wizard-controller.js
'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
require(path.join(__dirname, '..', '..', 'assets/js/wizard/step-config.js')); // sets global if browser; in node we pass it in
const W = require(path.join(__dirname, '..', '..', 'assets/js/wizard/wizard-controller.js'));
const SC = require(path.join(__dirname, '..', '..', 'assets/js/wizard/step-config.js'));

const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data/endurance-catalogue-full.json'), 'utf8'));
function buildView() { /* same projection as test-step-config, all types */
  const cv = { types: Object.keys(full), byType: {} };
  for (const type of cv.types) {
    const n = full[type];
    const t = { fields: {}, glazingByStyle: {}, knockerByStyle: {}, sidelights: n.sidelights || null,
      hasInternalColour: !!n.fields['Door Colour (Internal)'], hasKnocker: !!n.fields['Knocker'],
      hasFrameShape: !!(n.fields['Frame Design'] && n.fields['Frame Design'].choices.length > 1),
      hingeSideField: n.fields['Door Hinged On'] ? 'Door Hinged On' : 'Master Leaf' };
    Object.keys(n.fields).forEach((h) => t.fields[h] = n.fields[h].choices.map((c) => ({ label: c.label, id: c.id })));
    Object.entries(n.glazingByStyle || {}).forEach(([s, g]) => t.glazingByStyle[s] = g.map((x) => ({ label: x.label, id: x.id })));
    Object.entries(n.knockerByStyle || {}).forEach(([s, g]) => t.knockerByStyle[s] = g.map((x) => ({ label: x.label, id: x.id })));
    cv.byType[type] = t;
  }
  return cv;
}

const wiz = W.create(buildView(), SC);
wiz.selectType('Single Door');
assert.equal(wiz.state().design['Door Type'].label, 'Single Door');
// changing style to a solid one must drop a now-invalid glazing pick
wiz.select('Door Design', { label: 'Abbott', id: 0 });
wiz.select('Door Glass', wiz.state().steps.find((s) => s.key === 'glazing').choices[0]);
wiz.select('Door Design', { label: 'Mayon', id: 0 }); // solid → glazing step disappears
assert.ok(!wiz.state().design['Door Glass'], 'glazing cleared when switching to a solid style');
// progress total reflects applicable steps for the current design
const st = wiz.state();
assert.ok(st.progress.total === st.steps.length && st.steps.length > 3, 'progress total = applicable steps');
// changing type resets the design
wiz.selectType('Double Door');
assert.deepEqual(Object.keys(wiz.state().design), ['Door Type'], 'type change resets design');
console.log('wizard-controller OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/tests/test-wizard-controller.js`
Expected: FAIL — `Cannot find module '.../wizard-controller.js'`.

- [ ] **Step 3: Write wizard-controller.js**

```js
// assets/js/wizard/wizard-controller.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Wizard = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function create(customerView, stepConfig) {
    var SC = stepConfig || (typeof HD_DD_StepConfig !== 'undefined' ? HD_DD_StepConfig : null);
    var design = {};
    var stepIndex = 0;
    var atReview = false;

    function typeLabel() { return design['Door Type'] && design['Door Type'].label; }
    function node() { return customerView.byType[typeLabel()] || null; }
    function steps() { var n = node(); return n ? SC.applicableSteps(n, design) : []; }

    function applyDefaults() {
      // optional steps with a defaultLabel get pre-filled so they never block.
      steps().forEach(function (s) {
        if (s.optional && s.defaultLabel && !design[s.heading]) {
          var c = s.choices.filter(function (x) { return x.label === s.defaultLabel; })[0];
          if (c) { design[s.heading] = { label: c.label, id: c.id != null ? c.id : null }; }
        }
      });
    }

    function pruneInvalid() {
      // drop any selection whose heading is no longer an applicable step, or whose
      // chosen label is no longer in that step's current choice list.
      var valid = {};
      steps().forEach(function (s) { valid[s.heading] = s.choices; });
      Object.keys(design).forEach(function (h) {
        if (h === 'Door Type') { return; }
        var list = valid[h];
        if (!list || !list.some(function (c) { return c.label === design[h].label; })) { delete design[h]; }
      });
    }

    function selectType(label) {
      var t = customerView.byType[label] ? label : null;
      if (!t) { return; }
      design = { 'Door Type': { label: label, id: typeIdOf(label) } };
      stepIndex = 0; atReview = false;
      // Defaults apply lazily on select(), not on type change: a fresh type
      // starts as a clean slate (just Door Type) — the controller test asserts this.
    }
    function typeIdOf(label) {
      var any = customerView.byType[label];
      var dt = any && any.fields['Door Type'];
      var hit = dt && dt.filter(function (c) { return c.label === label; })[0];
      return hit ? hit.id : null;
    }

    function select(heading, choice) {
      design[heading] = { label: choice.label, id: choice.id != null ? choice.id : null };
      pruneInvalid();
      applyDefaults();
    }

    function indexOfKey(key) { var ss = steps(); for (var i = 0; i < ss.length; i++) { if (ss[i].key === key) { return i; } } return -1; }
    function next() { var ss = steps(); if (stepIndex < ss.length - 1) { stepIndex++; } else { atReview = true; } }
    function back() { if (atReview) { atReview = false; return; } if (stepIndex > 0) { stepIndex--; } }
    function jumpTo(key) { var i = indexOfKey(key); if (i >= 0) { stepIndex = i; atReview = false; } }

    function state() {
      var ss = steps();
      if (stepIndex > ss.length - 1) { stepIndex = Math.max(0, ss.length - 1); }
      return { design: design, steps: ss, stepIndex: stepIndex, atReview: atReview,
        progress: { current: Math.min(stepIndex + 1, ss.length), total: ss.length } };
    }

    return { selectType: selectType, select: select, next: next, back: back, jumpTo: jumpTo, state: state };
  }

  return { create: create };
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/tests/test-wizard-controller.js`
Expected: `wizard-controller OK`.

- [ ] **Step 5: Commit**

```bash
git add assets/js/wizard/wizard-controller.js tools/tests/test-wizard-controller.js
git commit -m "feat(wizard): state-machine controller (steps, defaults, pruning, progress)"
```

---

## Task 4: Architectural Mono design system (CSS)

Replace the stylesheet with the agreed Mono tokens + Layout C structure. Verified visually in the harness (no unit test — it's pure presentation).

**Files:**
- Modify (replace): `assets/css/hd-door-designer.css`

- [ ] **Step 1: Write the token block + core layout**

Replace the file contents with the design system. Tokens first, then components. Key tokens and structure (implement the full sheet from this base — progress bar, stage, carousel tiles, review list, form):

```css
.hd-dd{
  --ink:#161616; --paper:#fff; --line:#e6e6e6; --muted:#8a8e96; --stage:#f3f3f1;
  --brand:#1d4f3f;            /* TODO: replace with sampled Hertfordshire Doors accent */
  --radius:6px; --gap:16px; --maxw:480px;
  color:var(--ink); background:var(--paper); font-family:inherit; line-height:1.45;
  box-sizing:border-box; -webkit-font-smoothing:antialiased;
}
.hd-dd *,.hd-dd *::before,.hd-dd *::after{box-sizing:inherit}
.hd-dd__app{max-width:var(--maxw);margin:0 auto;min-height:70vh;display:flex;flex-direction:column}
.hd-dd__progress{display:flex;gap:5px;align-items:center;padding:14px 16px 8px}
.hd-dd__seg{height:3px;flex:1;border-radius:2px;background:var(--line)}
.hd-dd__seg.is-on{background:var(--ink)}
.hd-dd__back{background:none;border:0;font-size:20px;color:var(--ink);cursor:pointer;padding:0 6px 0 0}
.hd-dd__stage{background:var(--stage);border-bottom:1px solid var(--line);display:flex;justify-content:center;align-items:center;padding:14px}
.hd-dd__canvas{width:100%;height:auto;max-width:360px;display:block}
.hd-dd__steptitle{font-size:18px;font-weight:600;text-align:center;margin:16px 16px 4px;letter-spacing:-.01em}
.hd-dd__carousel{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 16px;justify-content:flex-start}
.hd-dd__tile{flex:0 0 auto;scroll-snap-align:center;width:120px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);cursor:pointer;padding:8px;text-align:center;font-size:12px;transition:box-shadow .15s,border-color .15s}
.hd-dd__tile.is-selected{border-color:var(--ink);box-shadow:0 0 0 2px var(--ink)}
.hd-dd__tile-media{width:100%;height:90px;object-fit:contain;border-radius:4px;background:var(--stage)}
.hd-dd__swatch{width:100%;height:90px;border-radius:4px}
.hd-dd__cta{margin:16px;padding:14px;border:0;border-radius:var(--radius);background:var(--ink);color:#fff;font-weight:700;font-size:15px;cursor:pointer}
.hd-dd__cta:disabled{opacity:.45}
.hd-dd__review dl{display:grid;grid-template-columns:auto 1fr auto;gap:8px 12px;margin:0 16px}
.hd-dd__review dt{color:var(--muted);font-size:13px}
.hd-dd__edit{background:none;border:0;color:var(--brand);font-size:12px;cursor:pointer}
@media(min-width:860px){.hd-dd__app{--maxw:520px}}
/* form styles carried from the previous sheet, namespaced under .hd-dd__form */
```

(Bring across the existing `.hd-dd__form*`, `.hd-dd__hp`, `.hd-dd__success`, `.hd-dd__notice` rules — restyled to tokens — so the enquiry form keeps working.)

- [ ] **Step 2: Verify in the harness**

Run a static server and open the harness (after Task 7 wires the wizard, or temporarily point the harness at the new classes):
Run: `python -m http.server 8000`
Expected: the wizard renders with the Mono look (white, charcoal, hairline progress, tiles), mobile-width.

- [ ] **Step 3: Commit**

```bash
git add assets/css/hd-door-designer.css
git commit -m "feat(wizard): Architectural Mono design system (tokens, layout C, tiles)"
```

---

## Task 5: Step renderer (visual tiles + category-first styles)

Renders the active step's choices as visual tiles and hosts the two-stage style step. Verified in the harness.

**Files:**
- Create: `assets/js/wizard/step-renderer.js`

**Interfaces:**
- Consumes: a resolved step `{ key, label, tileType, choices, categoryFirst }`; `design`; the style category map; an `assetBase` for thumbnails; callbacks `onSelect(heading, choice)`.
- Produces: `HD_DD_StepRenderer.renderStep(container, step, ctx)` where `ctx = { design, heading, assetBase, categories, thumbFor(step, choice), onSelect }`.

- [ ] **Step 1: Write step-renderer.js**

```js
// assets/js/wizard/step-renderer.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_StepRenderer = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (txt != null) { n.textContent = txt; } return n; }

  function tile(step, choice, ctx) {
    var t = el('button', 'hd-dd__tile');
    t.type = 'button';
    if (ctx.design[ctx.heading] && ctx.design[ctx.heading].label === choice.label) { t.className += ' is-selected'; }
    var media = ctx.thumbFor(step, choice); // {kind:'img',url} | {kind:'swatch',color} | null
    if (media && media.kind === 'img') { var im = el('img', 'hd-dd__tile-media'); im.src = media.url; im.alt = choice.label; im.loading = 'lazy'; t.appendChild(im); }
    else if (media && media.kind === 'swatch') { var sw = el('div', 'hd-dd__swatch'); sw.style.background = media.color; t.appendChild(sw); }
    t.appendChild(el('span', 'hd-dd__tile-label', friendly(choice.label)));
    t.addEventListener('click', function () { ctx.onSelect(ctx.heading, choice); });
    return t;
  }

  function friendly(label) { return label; } // display-only mapping hook; keep raw for now

  function renderStep(container, step, ctx) {
    container.innerHTML = '';
    container.appendChild(el('div', 'hd-dd__steptitle', step.label));
    if (step.categoryFirst && !ctx.design._styleCategory) {
      var cats = uniqueCategories(step, ctx);
      var row = el('div', 'hd-dd__carousel');
      cats.forEach(function (cat) {
        var b = el('button', 'hd-dd__tile'); b.type = 'button';
        b.appendChild(el('span', 'hd-dd__tile-label', cat));
        b.addEventListener('click', function () { ctx.design._styleCategory = cat; ctx.rerender(); });
        row.appendChild(b);
      });
      container.appendChild(row);
      return;
    }
    var carousel = el('div', 'hd-dd__carousel');
    var choices = step.choices;
    if (step.categoryFirst) { choices = choices.filter(function (c) { return ctx.categoryOf(c.label) === ctx.design._styleCategory; }); }
    choices.forEach(function (c) { carousel.appendChild(tile(step, c, ctx)); });
    container.appendChild(carousel);
  }

  function uniqueCategories(step, ctx) {
    var seen = {}; var out = [];
    step.choices.forEach(function (c) { var k = ctx.categoryOf(c.label); if (k && !seen[k]) { seen[k] = 1; out.push(k); } });
    return out;
  }

  return { renderStep: renderStep };
}));
```

- [ ] **Step 2: Verify in the harness (after Task 7 wiring)**

Expected: each step shows visual tiles; the style step first shows category tiles, then the style tiles within the chosen category; selecting a tile updates the live door.

- [ ] **Step 3: Commit**

```bash
git add assets/js/wizard/step-renderer.js
git commit -m "feat(wizard): visual step renderer with category-first style step"
```

---

## Task 6: Review screen + enquiry form restyle

**Files:**
- Create: `assets/js/wizard/review.js`
- Modify: enquiry form markup/handlers move into the bootstrap (Task 7), restyled to `.hd-dd__form*`.

**Interfaces:**
- Produces: `HD_DD_Review.render(container, ctx)` where `ctx = { design, steps, assetBase, onEdit(stepKey), onSubmitClick() }`. Renders the live preview, a summary `<dl>` (one row per chosen step: friendly label · value · Edit), and the "Get my free quote" CTA.

- [ ] **Step 1: Write review.js**

```js
// assets/js/wizard/review.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Review = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function render(container, ctx) {
    container.innerHTML = '';
    container.appendChild(el('div', 'hd-dd__steptitle', 'Your door'));
    var wrap = el('div', 'hd-dd__review');
    var dl = document.createElement('dl');
    ctx.steps.forEach(function (s) {
      var chosen = ctx.design[s.heading];
      if (!chosen) { return; }
      dl.appendChild(el('dt', null, s.label));
      dl.appendChild(el('dd', null, chosen.label));
      var edit = el('button', 'hd-dd__edit', 'Edit'); edit.type = 'button';
      edit.addEventListener('click', function () { ctx.onEdit(s.key); });
      dl.appendChild(edit);
    });
    wrap.appendChild(dl);
    container.appendChild(wrap);
    var cta = el('button', 'hd-dd__cta', 'Get my free quote'); cta.type = 'button';
    cta.addEventListener('click', ctx.onSubmitClick);
    container.appendChild(cta);
  }
  return { render: render };
}));
```

- [ ] **Step 2: Verify in the harness**

Expected: after the last step, Review shows the live door + every choice with working Edit links that jump back.

- [ ] **Step 3: Commit**

```bash
git add assets/js/wizard/review.js
git commit -m "feat(wizard): review screen with tap-to-edit summary"
```

---

## Task 7: Bootstrap wiring + asset enqueue + harness + WP smoke

Replace `hd-door-designer.js` with a thin bootstrap that fetches catalogue + render-model, builds the wizard, renders the current step (or review), drives the live preview, and submits the enquiry. Enqueue the new modules.

**Files:**
- Modify (rewrite): `assets/js/hd-door-designer.js`
- Modify: `includes/class-hd-assets.php` (register/enqueue `wizard/step-config.js`, `wizard/wizard-controller.js`, `wizard/step-renderer.js`, `wizard/review.js` before the main script; main depends on all + `-preview`)
- Modify: `tools/preview-test.html` (mount the real wizard for QA)

**Interfaces:**
- Consumes: `HD_DD_Wizard`, `HD_DD_StepConfig`, `HD_DD_StepRenderer`, `HD_DD_Review`, `HD_DD_Preview`, `HD_DD_CONFIG` (REST URL, nonce, assetBase, i18n), `data/style-categories.json` (served as a plugin asset or fetched).

- [ ] **Step 1: Enqueue the modules**

In `includes/class-hd-assets.php`, register the four wizard modules (no inter-deps except the controller needs step-config) and make the main handle depend on them + `-preview` + `-rendermodel`. Also fetch/serve `style-categories.json` (add a tiny REST passthrough OR enqueue it via `wp_add_inline_script` as `HD_DD_CATEGORIES`). Code:

```php
wp_register_script( self::HANDLE . '-stepcfg', HD_DD_URL . 'assets/js/wizard/step-config.js', array(), $ver_js, true );
wp_register_script( self::HANDLE . '-wizard', HD_DD_URL . 'assets/js/wizard/wizard-controller.js', array( self::HANDLE . '-stepcfg' ), $ver_js, true );
wp_register_script( self::HANDLE . '-steprender', HD_DD_URL . 'assets/js/wizard/step-renderer.js', array(), $ver_js, true );
wp_register_script( self::HANDLE . '-review', HD_DD_URL . 'assets/js/wizard/review.js', array(), $ver_js, true );
// main app depends on everything:
wp_register_script( self::HANDLE, HD_DD_URL . 'assets/js/hd-door-designer.js',
  array( self::HANDLE . '-preview', self::HANDLE . '-wizard', self::HANDLE . '-steprender', self::HANDLE . '-review' ), $ver_js, true );
```

- [ ] **Step 2: Rewrite the bootstrap**

`assets/js/hd-door-designer.js` becomes the orchestrator: fetch `/catalogue` + `/render-model` + categories; `var wiz = HD_DD_Wizard.create(catalogue)`; render loop that, on each state change, either renders the active step (via `HD_DD_StepRenderer.renderStep`) or the review (via `HD_DD_Review.render`), updates the progress bar, repaints the preview (`compositor.render(type, design)`), and shows Back/Continue. `onSelect` → `wiz.select` then advance; Continue → `wiz.next()`. `thumbFor`/`categoryOf` map steps+choices to images (from render-model/customer_view) or colour chips. Submit reuses the existing REST `/enquiry` call. (Full bootstrap code is ~150 lines; build it against these module interfaces — every function it calls is defined in Tasks 2/3/5/6.)

- [ ] **Step 3: Verify in the harness end-to-end**

Run: `python -m http.server 8000` → open `tools/preview-test.html`
Expected: full guided flow — type → (frame) → style (category→style) → colour → … → review → form; live door updates each step; progress bar advances; Back/Edit work.

- [ ] **Step 4: Lint the JS**

Run: `for f in assets/js/wizard/*.js assets/js/hd-door-designer.js; do node --check "$f"; done`
Expected: no output (all valid).

- [ ] **Step 5: Real-WordPress smoke test (manual)**

Install the plugin on a WP test site, add `[hd_door_designer]` to a page, load it on a phone viewport. Expected: wizard renders, preview composites (with `asset_base` set), enquiry email arrives at the configured address with the structured payload. Record results in the PR.

- [ ] **Step 6: Commit**

```bash
git add assets/js/hd-door-designer.js includes/class-hd-assets.php tools/preview-test.html
git commit -m "feat(wizard): wire wizard bootstrap, enqueue modules, harness end-to-end"
```

---

## Task 8: Image mirroring tool (production hosting)

Download the captured Endurance thumbnails locally so production doesn't hotlink Endurance. Dry-run logic is unit-tested; the actual download is a one-shot command.

**Files:**
- Create: `tools/mirror-images.js`
- Test: `tools/tests/test-mirror-plan.js`
- Modify: `includes/class-hd-assets.php` (default `asset_base` to the local mirror path when present)

**Interfaces:**
- Produces: `mirrorPlan(data)` → `[{ url, localPath }]` for every URL in `data._imageUrls`; and `localBase` = `assets/img/endurance/`. URLs map to `assets/img/endurance/<path after Images/>`.

- [ ] **Step 1: Write the failing test**

```js
// tools/tests/test-mirror-plan.js
'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const { mirrorPlan } = require(path.join(__dirname, '..', 'mirror-images.js'));
const sample = { _imageUrls: ['Assets/CompositeDoors/Images/DoorBlanks/Door Mould 10/Thumbnails/White.jpg?ver=9.28.26'] };
const plan = mirrorPlan(sample);
assert.equal(plan.length, 1);
assert.match(plan[0].localPath, /assets\/img\/endurance\/DoorBlanks\/Door Mould 10\/Thumbnails\/White\.jpg$/);
console.log('mirror-plan OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/tests/test-mirror-plan.js`
Expected: FAIL — cannot find module `mirror-images.js`.

- [ ] **Step 3: Write mirror-images.js (plan + downloader)**

```js
// tools/mirror-images.js
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

function mirrorPlan(data) {
  var base = (data._assetBase || '').replace(/\/$/, '');
  return (data._imageUrls || []).map(function (u) {
    var clean = u.replace(/\?.*$/, '');
    var after = clean.replace(/^.*\/Images\//, '');
    return { url: base + '/' + u, localPath: 'assets/img/endurance/' + after };
  });
}

function download(url, dest) {
  return new Promise(function (resolve) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    var file = fs.createWriteStream(dest);
    https.get(encodeURI(url), function (res) {
      if (res.statusCode !== 200) { file.close(); fs.unlink(dest, function () {}); return resolve({ url: url, ok: false, code: res.statusCode }); }
      res.pipe(file); file.on('finish', function () { file.close(function () { resolve({ url: url, ok: true }); }); });
    }).on('error', function () { resolve({ url: url, ok: false }); });
  });
}

async function main() {
  const ROOT = path.join(__dirname, '..');
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endurance-catalogue-full.json'), 'utf8'));
  const plan = mirrorPlan(data);
  let ok = 0, fail = 0;
  for (const item of plan) {
    const r = await download(item.url, path.join(ROOT, item.localPath));
    r.ok ? ok++ : fail++;
  }
  console.log('mirrored ' + ok + ' images, ' + fail + ' failed → assets/img/endurance/');
}

module.exports = { mirrorPlan, download };
if (require.main === module) { main(); }
```

- [ ] **Step 4: Run the test**

Run: `node tools/tests/test-mirror-plan.js`
Expected: `mirror-plan OK`.

- [ ] **Step 5: Wire the asset base + document**

In `includes/class-hd-assets.php`, when `assets/img/endurance/` exists, default the front-end `assetBase` to `HD_DD_URL . 'assets/img/endurance'` (still overridable by the setting). Add a README line: production run is `node tools/mirror-images.js` (in an environment authenticated to Endurance if the assets require it), then commit `assets/img/endurance/`.

- [ ] **Step 6: Commit**

```bash
git add tools/mirror-images.js tools/tests/test-mirror-plan.js includes/class-hd-assets.php README.md
git commit -m "feat(wizard): image mirroring tool + local asset-base wiring"
```

---

## Task 9: Final integration pass

- [ ] **Step 1: Run all logic tests**

Run: `for t in tools/tests/test-*.js; do node "$t"; done`
Expected: `categories OK`, `step-config OK`, `wizard-controller OK`, `mirror-plan OK`.

- [ ] **Step 2: Lint everything**

Run: `for f in assets/js/*.js assets/js/wizard/*.js tools/*.js; do node --check "$f"; done && for f in includes/*.php hd-door-designer.php uninstall.php; do php -l "$f"; done`
Expected: all clean.

- [ ] **Step 3: Update README status + bump version**

Update the README status table (wizard UX shipped) and bump `Version:` header + `HD_DD_VERSION` for the GitHub release.

- [ ] **Step 4: Commit**

```bash
git add README.md hd-door-designer.php
git commit -m "chore(wizard): bump version, update status for guided wizard UX"
```

---

## Self-Review (completed)

- **Spec coverage:** principles → design system (T4) + flow (T2/T3); journey + conditional/defaults → T2/T3; category-first styles → T1/T5; visual choices → T5; live preview → reused + T7; progress/back/edit → T3/T6; review→quote → T6; mirroring → T8; per-type matrix → T2/T3 tests. All covered.
- **Placeholders:** logic tasks carry full code + tests. T4 (CSS) and T7-step-2 (bootstrap ~150 lines) are described against fully-specified module interfaces rather than transcribing every line — flagged explicitly, not hidden TODOs. The `--brand` colour and the Glazed/Contemporary heuristic are tracked spec dependencies, not plan gaps.
- **Type consistency:** `applicableSteps(node, design)`, `create(customerView, stepConfig)`, `renderStep(container, step, ctx)`, `render(container, ctx)`, `mirrorPlan(data)` used consistently across tasks and tests.
