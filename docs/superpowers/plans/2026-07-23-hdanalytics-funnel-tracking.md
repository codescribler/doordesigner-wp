# hdAnalytics Funnel Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report the door designer's step-by-step funnel and its lead conversion to the site-wide hdAnalytics plugin (`window.hdAnalytics`), alongside the existing Clarity events.

**Architecture:** A new standalone UMD wizard module (`HD_DD_Funnel`) owns the funnel name, canonical step orders, and all guarded calls to `window.hdAnalytics`. The app bootstrap (`hd-door-designer.js`) calls it from four places: forward advance (wizard steps, with the effective choice), the type chooser (auto-advances, so it fires on pick), the de-duped view tracker (`review`/`details` arrivals), and the enquiry-success branch (`lead`). PHP registers the module as a dependency of the app bootstrap.

**Tech Stack:** Vanilla ES5 JavaScript (WordPress plugin, no build step), WordPress `wp_register_script`, plain Node `assert` for the module test (no framework, no new dependencies).

**Spec:** `docs/superpowers/specs/2026-07-23-hdanalytics-funnel-tracking-design.md`

## Global Constraints

- Funnel name is the literal `'door-designer'` — everywhere, exactly.
- ES5 only in `assets/js/` (`var`, `function` — no arrow functions, `let`/`const`, or template literals; the plugin ships unbundled).
- Match each file's existing indentation: **2 spaces** in `assets/js/wizard/*.js`, **tabs** in `assets/js/hd-door-designer.js` and `includes/*.php`.
- Analytics must never break the wizard: every hdAnalytics touch is guarded (`typeof` check) and wrapped in try/catch; missing plugin = silent no-op, no console noise.
- The existing Clarity events (`door_step_*`, `door_quote_submitted`) are untouched.
- No new runtime or dev dependencies.
- Commits: do NOT add a `Co-Authored-By` line (user's golden rule).

Canonical step orders (single source of truth, defined once in Task 1):
`type:1, frame:2, style:3, hinge:4, extColour:5, intColour:6, sidelightType:7, sidelightGlass:8, glazing:9, hardware:10, handle:11, letterplate:12, letterplatePosition:13, knocker:14, review:15, details:16`

---

### Task 1: `HD_DD_Funnel` module with Node test

**Files:**
- Create: `assets/js/wizard/funnel.js`
- Test: `tests/js/funnel.test.js`

**Interfaces:**
- Consumes: `window.hdAnalytics.step(funnelName, stepName, opts)` and `window.hdAnalytics.lead(funnelName)` — provided by the site's analytics plugin at runtime; may be absent.
- Produces (used by Task 3): global `window.HD_DD_Funnel` (browser) / `module.exports` (Node) with:
  - `step(key, choice)` — `key`: string step key from the ORDER map; `choice`: string or `undefined`. Returns nothing.
  - `lead()` — returns nothing.
  - `ORDER` — plain object, the canonical order map above.

- [ ] **Step 1: Confirm Node is available**

Run: `node --version`
Expected: a version string (e.g. `v20.x`). If Node is genuinely missing, stop and report — the test steps below need it.

- [ ] **Step 2: Write the failing test**

Create `tests/js/funnel.test.js` (2-space indent):

```js
// Plain-Node tests for HD_DD_Funnel — no framework: `node tests/js/funnel.test.js`.
// The UMD wrapper exposes module.exports in Node; the browser global path is
// exercised by the QA harness walkthrough instead.
var assert = require('assert');

// 1) No window at all (Node's default) — every call must be a silent no-op.
var Funnel = require('../../assets/js/wizard/funnel.js');
assert.doesNotThrow(function () { Funnel.step('style', 'Balmoral'); });
assert.doesNotThrow(function () { Funnel.lead(); });

// 2) With a recording stub — payloads must match the hdAnalytics contract.
var calls = [];
global.window = {
  hdAnalytics: {
    step: function (funnel, name, opts) { calls.push(['step', funnel, name, opts]); },
    lead: function (funnel) { calls.push(['lead', funnel]); }
  }
};

Funnel.step('style', 'Balmoral');
assert.deepStrictEqual(calls[0], ['step', 'door-designer', 'style', { order: 3, choice: 'Balmoral' }]);

Funnel.step('review'); // choice-less step: the opts object has no `choice` key at all
assert.deepStrictEqual(calls[1], ['step', 'door-designer', 'review', { order: 15 }]);

Funnel.step('letterplate', 'No Letterplate'); // default-accepted choices still count
assert.deepStrictEqual(calls[2], ['step', 'door-designer', 'letterplate', { order: 12, choice: 'No Letterplate' }]);

Funnel.step('details');
assert.deepStrictEqual(calls[3], ['step', 'door-designer', 'details', { order: 16 }]);

Funnel.lead();
assert.deepStrictEqual(calls[4], ['lead', 'door-designer']);

// 3) A tracker that throws must never reach the caller.
global.window = {
  hdAnalytics: {
    step: function () { throw new Error('boom'); },
    lead: function () { throw new Error('boom'); }
  }
};
assert.doesNotThrow(function () { Funnel.step('type', 'Composite Door'); });
assert.doesNotThrow(function () { Funnel.lead(); });

console.log('funnel.test.js: all assertions passed');
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from the plugin root `own-sites/doordesigner-wp`): `node tests/js/funnel.test.js`
Expected: FAIL — `Error: Cannot find module '../../assets/js/wizard/funnel.js'`

- [ ] **Step 4: Write the implementation**

Create `assets/js/wizard/funnel.js` (2-space indent, same UMD wrapper as `step-config.js`):

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HD_DD_Funnel = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FUNNEL = 'door-designer';

  // Canonical dashboard order — fixed per step key regardless of which conditional
  // steps a given visitor is offered, so the funnel draws a stable sequence.
  var ORDER = {
    type: 1, frame: 2, style: 3, hinge: 4, extColour: 5, intColour: 6,
    sidelightType: 7, sidelightGlass: 8, glazing: 9, hardware: 10, handle: 11,
    letterplate: 12, letterplatePosition: 13, knocker: 14, review: 15, details: 16
  };

  // The site-wide analytics plugin defines window.hdAnalytics before our code runs
  // and queues early calls, so when present it is always safe to call. When absent
  // (plugin deactivated, QA harness) every call is a silent no-op.
  function tracker() {
    return (typeof window !== 'undefined' && window.hdAnalytics) ? window.hdAnalytics : null;
  }

  function step(key, choice) {
    var t = tracker();
    if (!t) { return; }
    var opts = { order: ORDER[key] };
    if (choice) { opts.choice = choice; }
    try { t.step(FUNNEL, key, opts); } catch (e) { /* analytics is best-effort */ }
  }

  function lead() {
    var t = tracker();
    if (!t) { return; }
    try { t.lead(FUNNEL); } catch (e) { /* analytics is best-effort */ }
  }

  return { ORDER: ORDER, step: step, lead: lead };
}));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node tests/js/funnel.test.js`
Expected: `funnel.test.js: all assertions passed`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add assets/js/wizard/funnel.js tests/js/funnel.test.js
git commit -m "feat(wizard): add HD_DD_Funnel hdAnalytics reporter"
```

---

### Task 2: Register the module in WordPress

**Files:**
- Modify: `includes/class-hd-assets.php` (the `enqueue()` method, wizard-module registration block around lines 57–77)

**Interfaces:**
- Consumes: the file `assets/js/wizard/funnel.js` created in Task 1.
- Produces: script handle `self::HANDLE . '-funnel'`, loaded before the app bootstrap (`self::HANDLE`) via its dependency array — so `window.HD_DD_Funnel` exists when `hd-door-designer.js` runs (relied on by Task 3).

- [ ] **Step 1: Register the script and add the dependency**

In `includes/class-hd-assets.php`, after the `-review` registration line:

```php
		wp_register_script( self::HANDLE . '-review', HD_DD_URL . 'assets/js/wizard/review.js', array(), $ver_js, true );
```

add:

```php
		wp_register_script( self::HANDLE . '-funnel', HD_DD_URL . 'assets/js/wizard/funnel.js', array(), $ver_js, true );
```

Then in the app bootstrap registration just below, extend the dependency array:

```php
		// App bootstrap depends on the compositor + every wizard module.
		wp_register_script(
			self::HANDLE,
			HD_DD_URL . 'assets/js/hd-door-designer.js',
			array(
				self::HANDLE . '-preview',
				self::HANDLE . '-wizard',
				self::HANDLE . '-steprender',
				self::HANDLE . '-review',
				self::HANDLE . '-funnel',
			),
			$ver_js,
			true
		);
```

- [ ] **Step 2: Syntax-check the PHP**

Run: `php -l includes/class-hd-assets.php`
Expected: `No syntax errors detected in includes/class-hd-assets.php`
If the PHP CLI is not installed on this machine, state that plainly and verify by re-reading the diff (`git diff includes/class-hd-assets.php`) — the change is two additions, both mirroring the adjacent lines exactly.

- [ ] **Step 3: Commit**

```bash
git add includes/class-hd-assets.php
git commit -m "feat(assets): register funnel.js wizard module"
```

---

### Task 3: Wire the four call sites in the app bootstrap

**Files:**
- Modify: `assets/js/hd-door-designer.js` (tabs for indentation) — five edits: one alias + four call sites. Line numbers are pre-edit references; match on the quoted code, not the numbers.

**Interfaces:**
- Consumes: `window.HD_DD_Funnel` from Task 1 (`step(key, choice)`, `lead()`), guaranteed loaded by Task 2's dependency chain in WordPress; may be absent in the QA harness.
- Produces: the complete `door-designer` funnel event stream described in the spec.

- [ ] **Step 1: Add the safe module alias**

Near the top of the IIFE, directly after:

```js
	var CFG = window.HD_DD_CONFIG || {};
	var I18N = CFG.i18n || {};
```

add:

```js
	// Funnel reporter (site-wide hdAnalytics). The WP dependency chain guarantees the
	// module is loaded; the QA harness may omit its script tag, so fall back to a no-op.
	var Funnel = window.HD_DD_Funnel || { step: function () {}, lead: function () {} };
```

- [ ] **Step 2: Fire wizard steps on forward advance (~line 717, `App.prototype.advance`)**

Wizard steps report when the visitor leaves them going forward — this captures both picked and default-accepted choices (optional steps are pre-filled by `applyDefaults()`, so "just hit Continue" must still count) exactly once per pass. Replace the else branch:

```js
		} else {
			this.wiz.next();
		}
```

with:

```js
		} else {
			// Report the step being left, with the choice (picked or default-accepted)
			// that carries the visitor forward. Steps merely viewed report nothing —
			// that gap is the funnel's drop-off signal.
			if (!st.atReview) {
				var stepLeft = st.steps[st.stepIndex];
				if (stepLeft) { Funnel.step(stepLeft.key, (st.design[stepLeft.heading] || {}).label); }
			}
			this.wiz.next();
		}
```

(`st` is already defined at the top of `advance` as `var st = this.wiz.state();`.)

- [ ] **Step 3: Fire the type step on pick and unify the chooser's code path**

The type chooser auto-advances on click (no Continue button), so `type` fires at selection time. Two edits:

In `App.prototype.onSelect` (~line 697), replace:

```js
	App.prototype.onSelect = function (heading, choice) {
		if (heading === 'Door Type') { this.wiz.selectType(choice.label); this.render(); return; }
```

with:

```js
	App.prototype.onSelect = function (heading, choice) {
		// The type chooser auto-advances (no Continue), so its funnel event fires here.
		if (heading === 'Door Type') { Funnel.step('type', choice.label); this.wiz.selectType(choice.label); this.render(); return; }
```

In `App.prototype.renderTypeChooser` (~line 530), route the tile click through `onSelect` so type picks have a single code path. Replace:

```js
			t.addEventListener('click', function () { self.wiz.selectType(label); self.render(); });
```

with:

```js
			t.addEventListener('click', function () { self.onSelect('Door Type', { label: label }); });
```

- [ ] **Step 4: Fire `review` / `details` on arrival (~line 505, `App.prototype.trackView`)**

These two views have no choice, so they fire on arrival, reusing the existing de-dup. Replace:

```js
	App.prototype.trackView = function (viewKey) {
		if (!viewKey || viewKey === this._lastView) { return; }
		this._lastView = viewKey;
		this.track('door_step_' + viewKey);
	};
```

with:

```js
	App.prototype.trackView = function (viewKey) {
		if (!viewKey || viewKey === this._lastView) { return; }
		this._lastView = viewKey;
		this.track('door_step_' + viewKey);
		// The two choice-less funnel steps fire on arrival (the internal 'form' view is
		// reported as 'details'); wizard steps fire on advance instead — see advance().
		if (viewKey === 'review') { Funnel.step('review'); }
		else if (viewKey === 'form') { Funnel.step('details'); }
	};
```

- [ ] **Step 5: Fire the lead on enquiry success (~line 1037, `App.prototype.submit`)**

Only a successful POST is a lead (preview mode and validation failures are not). Replace:

```js
				self.track('door_quote_submitted'); // the conversion event — the whole funnel's goal
```

with:

```js
				self.track('door_quote_submitted'); // the conversion event — the whole funnel's goal
				Funnel.lead();
```

- [ ] **Step 6: Syntax-check the file**

Run: `node --check assets/js/hd-door-designer.js`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add assets/js/hd-door-designer.js
git commit -m "feat(wizard): report designer funnel to hdAnalytics"
```

---

### Task 4: Manual funnel walkthrough in the QA harness

**Files:**
- Modify: `tools/preview-test.html` (the browser QA harness — may be gitignored; check before committing)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: verified event stream; no code artefacts beyond the harness edit.

- [ ] **Step 1: Add the module and a logging stub to the harness**

In `tools/preview-test.html`, after the line:

```html
<script src="../assets/js/wizard/review.js"></script>
```

add:

```html
<script src="../assets/js/wizard/funnel.js"></script>
```

And BEFORE the first `<script src=` line (so the stub exists before any module loads), add:

```html
<script>
  // hdAnalytics stub — logs funnel calls so the walkthrough below is verifiable.
  window.hdAnalytics = {
    step: function (f, s, o) { console.log('[hdAnalytics] step', f, s, JSON.stringify(o)); },
    lead: function (f) { console.log('[hdAnalytics] lead', f); }
  };
</script>
```

- [ ] **Step 2: Walk the funnel in the browser**

Open `file:///C:/Users/Danny/AutoProspect/own-sites/doordesigner-wp/tools/preview-test.html` in Chrome with DevTools console open (or drive it with the browser tools). Verify against this checklist:

1. **Full single-door run:** pick a type → console shows `step door-designer type {"order":1,"choice":"Composite Door"}` (or the picked label). Continue through every step: each Continue logs the step being left with its choice and canonical order. Passing a defaulted optional step (letterplate untouched → Continue) logs `{"order":12,"choice":"No Letterplate"}`. Reaching the summary logs `review {"order":15}`; clicking the quote CTA logs `details {"order":16}`.
2. **Preview-mode submit is NOT a lead:** submit the enquiry form in the harness (no REST endpoint) → "Preview mode" message and **no** `lead` line in the console.
3. **Double door:** `style` fires from the visual grid; the hinge step logs the master-leaf label.
4. **Sidelights:** choose a frame with sidelights → `sidelightType` (order 7) and, if glazed, `sidelightGlass` (order 8) fire.
5. **Back/forward + review-edit:** going back and re-advancing re-fires with the updated choice; nothing errors.
6. **Stub removed:** comment out the stub block, reload, walk two steps — wizard behaves identically, zero console errors.

Report any mismatch instead of patching around it — a wrong order or missing choice means a Task 1–3 bug.

- [ ] **Step 3: Commit the harness change (only if tracked)**

Run: `git check-ignore tools/preview-test.html && echo IGNORED || echo TRACKED`
If TRACKED:

```bash
git add tools/preview-test.html
git commit -m "chore(tools): log hdAnalytics funnel calls in QA harness"
```

If IGNORED: leave the edit in place locally; nothing to commit.
