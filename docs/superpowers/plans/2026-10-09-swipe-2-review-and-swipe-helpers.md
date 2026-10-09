# Swipe 2: swipe helpers and a two-step Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the swipe flow as a new version ("Swipe 2") with swipe helpers, a Review step that shows a guide price and captures an email before asking for quote details, and tracking of visitors who open the designer and never start.

**Architecture:** The existing swipe code becomes flow `swipe2`, reporting to funnel `door-designer-v3`; the old `swipe` key survives only as an alias and a label in history. A save and its later quote request are one row in `hd_enquiries` (`kind` = `save` then `enquiry`), served by a new `HD_DD_Save` REST class that reuses `HD_DD_Enquiry`'s validation helpers. On the client a new `review-save.js` module owns the two-step form; `swipe-view.js` lays the Review screen out around it. `boot.js` reports `opened` for both flows and opens a saved design in the flow it was saved from.

**Tech Stack:** WordPress plugin (PHP 7.4+), vanilla ES5 UMD modules, plain CSS. Tests are dependency-free scripts: `node tests/js/<name>.test.js` and `php tests/php/run.php`.

**Spec:** `docs/superpowers/specs/2026-10-09-swipe-2-review-and-swipe-helpers-design.md`. Companion plan (ships first): `../manager-app/docs/superpowers/plans/2026-10-09-designer-opened-pre-start-steps.md`.

## Global Constraints

- **Classic is the A/B control.** Do not edit `assets/js/hd-door-designer.js`, `assets/js/wizard/review.js`, `assets/js/wizard/step-*.js`, `assets/js/wizard/wizard-controller.js`, `assets/js/enquiry-quote.js` or `assets/css/hd-door-designer.css`. `/enquiry` keeps its rules, emails and wording for `form=quote`. `tests/js/control-arm.test.js` must pass.
- **Copy rule:** nothing customer-facing, and no comment in `assets/js` or `includes`, may say or imply we won't phone the customer. `tests/js/copy-rule.test.js` scans every line. Do not write the words "won't call", "no calls", "never phone" or similar anywhere, including comments.
- Exact copy: guide price default `Fitted doors typically cost £1,500 to £4,000. Most of our customers pay around £2,000.`; step 1 button `Email me my design`; step 2 button `Get my exact price`; step 2 lead `Want your exact fitted price? We'll send it within one working day.`; showcase button `Choose this door: <name> →`; prompt `Happy with this one? Tap Choose.`
- Flow keys: `classic`, `swipe2`. `swipe` is an alias of `swipe2` for forced flows only. Funnels: `door-designer` (classic), `door-designer-v3` (Swipe 2).
- Step keys are lower case. New keys: `opened`, `browsed`, `saved`.
- Keep files short: new behaviour goes in new focused files rather than growing `swipe-view.js` or `class-hd-enquiry.php`.
- No co-author trailer on commits. Work on branch `feat/swipe-2`.
- The plugin must not be released until the manager-app plan is live (its Task 3).

## Review Focus

- **Email typed with stray spaces or capitals** (`" Jo@Example.com "`): accepted and stored trimmed; a plainly bad address shows an inline message and stores nothing.
- **Double tap / slow network on either button:** one row, one set of emails; the button is disabled while a request is in flight and a second `quote` call for the same token changes nothing.
- **Design edited after saving:** the same row is updated; no second row and no second saver email.
- **A returning saver on another device or after the 90-day assignment expires:** opens in the flow the design was saved from, is not counted as a new experiment visitor, and a quote still converts for the arm stored at save time.
- **Network failure or expired nonce at step 1 or 2:** the typed values stay in the form and a plain message is shown; nothing is half-saved on screen.

## File Structure

| File | Responsibility |
|---|---|
| `assets/js/wizard/funnel.js` (modify) | `opened` in classic order; `ORDER_V3`; allow order 0 |
| `assets/js/experiment.js` (modify) | flow alias, `storedFlow()` |
| `assets/js/boot.js` (modify) | funnel per flow, `opened`, return-link flow |
| `assets/js/swipe/carousel.js` (modify) | arrows, `onUser` |
| `assets/js/swipe/swipe-hint.js` (create) | the swipe hint pill |
| `assets/js/swipe/review-save.js` (create) | two-step save/quote form |
| `assets/js/swipe/swipe-parts.js` (modify) | `reviewSummary()` |
| `assets/js/swipe/swipe-view.js`, `swipe-app.js` (modify) | wiring, Review layout |
| `assets/js/trust.js`, `assets/js/enquiry.js` (modify) | `renderProof`, thank-you image/price |
| `assets/css/hd-swipe.css` (modify) | all new styles |
| `includes/class-hd-save.php` (create) | `/save`, `/save/{token}`, `/save/{token}/quote` |
| `includes/class-hd-save-mailer.php` (create) | saver email, owner "saved" email |
| `includes/class-hd-repository.php` (modify) | `kind`, `flow`, `update_row`, counts |
| `includes/class-hd-enquiry.php` (modify) | helpers made public, `/design` returns `flow`/`kind` |
| `includes/class-hd-experiments.php` (modify) | flows, alias, upgrade migration |
| `includes/class-hd-trust-settings.php`, `class-hd-admin.php`, `class-hd-assets.php`, `class-hd-plugin.php`, `class-hd-failure-log.php`, `class-hd-shortcode.php`, `class-hd-mailer.php` (modify) | setting, list badge, script registration, wiring |

---

### Task 1: Flow `swipe2`, funnel v3 and the `opened` step

**Files:**
- Modify: `assets/js/wizard/funnel.js`, `assets/js/experiment.js`, `assets/js/boot.js`
- Delete: `tests/js/funnel-v2.test.js`
- Create: `tests/js/funnel-v3.test.js`
- Modify: `tests/js/experiment.test.js`, `tests/js/funnel.test.js` (only if it deep-compares `ORDER`)

**Interfaces:**
- Produces: `HD_DD_Funnel.ORDER` (now with `opened: 0`), `HD_DD_Funnel.ORDER_V3`, `HD_DD_Experiment.canonical(flow) → string`, `HD_DD_Experiment.storedFlow(body, canSwipe) → 'classic' | 'swipe2' | ''`.

- [ ] **Step 1: Write the failing tests**

Create `tests/js/funnel-v3.test.js`:

```js
// Swipe 2 reports to its own funnel with pre-start steps. `node tests/js/funnel-v3.test.js`
var assert = require('assert');
var calls = [];
global.window = {
  location: { search: '' },
  HD_DD_CONFIG: { version: '0.4.0' },
  hdAnalytics: {
    step: function (funnel, key, opts) { calls.push([funnel, key, opts]); },
    lead: function (funnel, opts) { calls.push([funnel, 'lead', opts]); }
  }
};
var F = require('../../assets/js/wizard/funnel.js');

// Pre-start steps sit before the first choice; saved sits after review; no details step.
assert.strictEqual(F.ORDER_V3.opened, 0);
assert.strictEqual(F.ORDER_V3.browsed, 1);
assert.strictEqual(F.ORDER_V3.design, 2);
assert.ok(F.ORDER_V3.review < F.ORDER_V3.saved);
assert.strictEqual(F.ORDER_V3.details, undefined);
assert.strictEqual(F.ORDER_V2, undefined, 'the v2 order is retired');
Object.keys(F.ORDER_V3).forEach(function (k) { assert.strictEqual(k, k.toLowerCase(), k + ' is lower case'); });

// Classic gains only the opened step, at order 0; everything else keeps its place.
assert.strictEqual(F.ORDER.opened, 0);
assert.strictEqual(F.ORDER.type, 1);
assert.strictEqual(F.ORDER.details, 16);

// An order of 0 is a real order, not "unknown step".
var v3 = F.create('door-designer-v3', F.ORDER_V3);
v3.step('opened');
assert.deepStrictEqual(calls[0], ['door-designer-v3', 'opened', { order: 0, version: '0.4.0' }]);
v3.step('nonsense');
assert.strictEqual(calls.length, 1, 'unknown steps are still dropped');
v3.step('saved');
assert.strictEqual(calls[1][2].order, F.ORDER_V3.saved);
F.step('opened');
assert.deepStrictEqual(calls[2], ['door-designer', 'opened', { order: 0, version: '0.4.0' }]);

console.log('funnel-v3.test.js: all assertions passed');
```

Append to `tests/js/experiment.test.js` (before its final `console.log`):

```js
// ---- Swipe 2: the old swipe key is an alias; saved designs reopen in their own flow ----
var EX = require('../../assets/js/experiment.js');
assert.strictEqual(EX.canonical('swipe'), 'swipe2');
assert.strictEqual(EX.canonical(' Swipe '), 'swipe2');
assert.strictEqual(EX.canonical('classic'), 'classic');
assert.strictEqual(EX.canonical(undefined), '');
assert.strictEqual(EX.forcedFlow('?flow=swipe', null), 'swipe2');
assert.strictEqual(EX.forcedFlow('?flow=swipe2', null), 'swipe2');
assert.strictEqual(EX.forcedFlow('', { getAttribute: function () { return 'swipe'; } }), 'swipe2');
assert.strictEqual(EX.storedFlow({ flow: 'swipe' }, true), 'swipe2');
assert.strictEqual(EX.storedFlow({ flow: 'swipe2' }, true), 'swipe2');
assert.strictEqual(EX.storedFlow({ flow: 'swipe2' }, false), 'classic', 'no render model: fall back');
assert.strictEqual(EX.storedFlow({ flow: 'classic' }, true), 'classic');
assert.strictEqual(EX.storedFlow({ flow: '' }, true), '', 'old rows: caller keeps today\'s behaviour');
assert.strictEqual(EX.storedFlow(null, true), '');
assert.strictEqual(EX.storedFlow({ flow: 'made-up' }, true), '');
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/js/funnel-v3.test.js; node tests/js/experiment.test.js`
Expected: both FAIL (`ORDER_V3` undefined; `EX.canonical is not a function`).

- [ ] **Step 3: Implement `funnel.js`**

Add `opened: 0,` as the first entry of `ORDER`. Replace the whole `ORDER_V2` block and its comment with:

```js
  // Swipe 2 reports as its own funnel ('door-designer-v3'). `opened` (the designer drew its
  // first screen) and `browsed` (the first swipe or tap through the doors) come before any
  // choice, so the dashboard can show who arrived and never started. `saved` is the
  // email-only save on Review; the quote request is the lead. Keys are lower-case because
  // the analytics pipeline lower-cases step names anyway.
  var ORDER_V3 = {
    opened: 0, browsed: 1, design: 2, type: 3, hinge: 4, colour: 5, intcolour: 6, glazing: 7,
    hardware: 8, handle: 9, letterplate: 10, letterplateposition: 11, knocker: 12, frame: 13,
    sidelighttype: 14, sidelightglass: 15, review: 16, saved: 17
  };
```

In `create()`'s `step`, change `if (!t || !order[key]) { return; }` to `if (!t || order[key] == null) { return; }`.

Change the return to `return { ORDER: ORDER, ORDER_V3: ORDER_V3, create: create, step: classic.step, lead: classic.lead, muted: muted };`.

- [ ] **Step 4: Implement `experiment.js`**

Below `var VISITOR_RE = …;` add:

```js
  // The first swipe flow was retired when Swipe 2 replaced it; old links keep working.
  var ALIASES = { swipe: 'swipe2' };
  function canonical(flow) {
    var f = String(flow == null ? '' : flow).trim().toLowerCase();
    return ALIASES[f] || f;
  }

  // The flow a saved design should reopen in, from GET design/{token}. '' = not recorded
  // (rows saved before this was stored): the caller falls back to the normal assignment.
  function storedFlow(body, canSwipe) {
    var f = canonical(body && body.flow);
    if (f === 'classic') { return 'classic'; }
    if (f === 'swipe2') { return canSwipe ? 'swipe2' : 'classic'; }
    return '';
  }
```

In `knownFlows` change the first line to `var known = { classic: true, swipe2: true };`.

In `forcedFlow` replace the two assignments so both go through `canonical`:

```js
      var q = m ? canonical(decodeURIComponent(m[1].replace(/\+/g, ' '))) : '';
      if (q && known[q]) { return q; }
      var d = (mountEl && typeof mountEl.getAttribute === 'function') ? canonical(mountEl.getAttribute('data-flow')) : '';
```

Add `canonical: canonical, storedFlow: storedFlow,` to the returned object.

- [ ] **Step 5: Implement `boot.js`**

Replace the header comment's last line and the `FUNNELS`/`funnelFor` block with:

```js
// Each flow reports to its own analytics funnel: classic → 'door-designer', swipe2 → 'door-designer-v3'.
```
```js
	var FUNNELS = { classic: 'door-designer', swipe2: 'door-designer-v3' };

	function funnelFor(flow) {
		var F = window.HD_DD_Funnel;
		if (!F || !F.create) { return { step: function () {}, lead: function () {} }; }
		return flow === 'swipe2' ? F.create(FUNNELS.swipe2, F.ORDER_V3) : F.create(FUNNELS.classic, F.ORDER);
	}
```

Replace everything inside the `.then(function (res) { … })` callback from `var muted = …` to the end of that callback with:

```js
			// ?notrack=1 (remembered): the owner using the live designer — no analytics, no A/B counting.
			var muted = !!(window.HD_DD_Funnel && window.HD_DD_Funnel.muted && window.HD_DD_Funnel.muted());
			var canSwipe = !!(rm && window.HD_DD_SwipeApp);
			var saved = null;
			try { saved = new URLSearchParams(window.location.search).get('design'); } catch (e) { saved = null; }
			var doorType = root.getAttribute('data-door-type') || '';

			// Start one flow. `assignment` is null for forced flows, muted visits and return links.
			function launch(flow, assignment) {
				if (!muted) { try { if (typeof window.clarity === 'function') { window.clarity('set', 'hd_flow', flow); } } catch (e) { /* best-effort */ } }
				root.innerHTML = '';
				if (muted) { showMutedBadge(); }
				var funnel = funnelFor(flow);
				if (flow === 'swipe2') {
					var sw = new window.HD_DD_SwipeApp(root, cv, rm, res[2], { api: api, funnel: funnel, experiment: assignment, doorType: doorType, flow: flow });
					if (saved) { sw.loadSaved(saved); } else { sw.render(); }
				} else {
					var app = new window.HD_DD_App(root, cv, rm, res[2]);
					app.experiment = assignment;
					if (saved) { app.loadSavedDesign(saved); } else { app.render(); }
				}
				// Everyone who gets a designer on screen, so the dashboard can show who never
				// starts. A return link is someone coming back, not a new arrival.
				if (!saved) { funnel.step('opened'); }
			}

			// The normal route: forced flow, else the A/B arm, else the site default.
			function launchAssigned() {
				var a = chooseFlow(root);
				// The swipe flow draws every card from the render model; without it, fall back.
				var flow = (a.flow === 'swipe2' && canSwipe) ? 'swipe2' : 'classic';
				var assignment = (!muted && a.counted && flow === a.flow) ? { experimentId: a.experimentId, visitorId: a.visitorId, arm: a.arm } : null;
				if (assignment && window.HD_DD_Experiment) { window.HD_DD_Experiment.expose(api, a); }
				launch(flow, assignment);
			}

			// A saved design reopens in the flow it was saved from, without a new assignment:
			// the arm recorded when it was saved is what a later quote request converts for.
			if (saved && window.HD_DD_Experiment && window.HD_DD_Experiment.storedFlow) {
				api('design/' + encodeURIComponent(saved), { method: 'GET' }).then(function (r) {
					var flow = (r && r.ok) ? window.HD_DD_Experiment.storedFlow(r.body, canSwipe) : '';
					if (flow) { launch(flow, null); } else { launchAssigned(); }
				}, function () { launchAssigned(); });
				return;
			}
			launchAssigned();
```

Leave the outer `.catch` as it is. `chooseFlow` already passes forced flows through `E.forcedFlow`, which now maps `swipe` to `swipe2`.

- [ ] **Step 6: Fix the existing tests**

Delete `tests/js/funnel-v2.test.js`. Run `node tests/js/funnel.test.js` and `node tests/js/experiment.test.js`. Where an existing assertion deep-compares `ORDER` add `opened: 0`; where one expects `forcedFlow(…)` to return `'swipe'` change the expectation to `'swipe2'`. Change nothing else in them.

- [ ] **Step 7: Run all JS tests**

Run: `for f in tests/js/*.test.js; do node "$f" || exit 1; done`
Expected: every file prints "all assertions passed".

- [ ] **Step 8: Commit**

```bash
git checkout -b feat/swipe-2
git add -A assets/js/wizard/funnel.js assets/js/experiment.js assets/js/boot.js tests/js
git commit -m "feat(flows): swipe2 flow, door-designer-v3 funnel, opened step, return links keep their flow"
```

---

### Task 2: Server flows, alias and the upgrade that ends the old test

**Files:**
- Modify: `includes/class-hd-experiments.php` (`flows()` line ~39, `maybe_upgrade()` near the end), `includes/class-hd-shortcode.php:54`
- Create: `tests/php/experiment-flows.test.php`

**Interfaces:**
- Produces: `HD_DD_Experiments::canonical_flow( $flow ) : string` ('' when not a live flow), `HD_DD_Experiments::migrate_flows() : void`.

- [ ] **Step 1: Write the failing test**

Create `tests/php/experiment-flows.test.php`:

```php
<?php
/**
 * Swipe 2 replaces the first swipe flow: the flow list, the alias, and the upgrade that
 * files a running Classic vs Swipe test under Finished.  Run: php tests/php/experiment-flows.test.php
 */
require __DIR__ . '/wp-stubs.php';

hd_test_reset();
check( array( 'classic', 'swipe2' ) === array_keys( HD_DD_Experiments::flows() ), 'live flows are classic and swipe2' );
check( 'Swipe 2' === HD_DD_Experiments::flow_label( 'swipe2' ), 'swipe2 is labelled Swipe 2' );
check( 'Swipe' === HD_DD_Experiments::flow_label( 'swipe' ), 'the retired flow still has a label for history' );
check( 'swipe2' === HD_DD_Experiments::canonical_flow( 'swipe' ), 'swipe is an alias of swipe2' );
check( 'swipe2' === HD_DD_Experiments::canonical_flow( ' SWIPE2 ' ), 'case and spaces are forgiven' );
check( 'classic' === HD_DD_Experiments::canonical_flow( 'classic' ), 'classic passes through' );
check( '' === HD_DD_Experiments::canonical_flow( 'made-up' ), 'unknown flows become empty' );
check( '' === HD_DD_Experiments::canonical_flow( array( 'x' ) ), 'non-strings become empty' );

// A running Classic vs Swipe test is stopped and kept in history.
hd_test_reset();
update_option( HD_DD_Experiments::OPTION, array(
	'id' => 'exp_20261001_7d55ea', 'control' => 'classic', 'challenger' => 'swipe', 'percent' => 50,
	'started_at' => '2026-10-01 14:13:32', 'status' => 'running', 'decided_at' => null, 'decision' => null,
	'emailed' => array( 'winner' => false, 'no_difference' => false ), 'unattributed' => 0,
) );
update_option( 'hd_dd_settings', array( 'default_flow' => 'swipe' ) );
HD_DD_Experiments::migrate_flows();
check( null === HD_DD_Experiments::current(), 'the running test is ended' );
$history = HD_DD_Experiments::history();
check( 1 === count( $history ) && 'stopped' === $history[0]['outcome'], 'it is filed as stopped' );
check( 'swipe' === $history[0]['challenger'], 'history keeps the old flow key' );
check( 'swipe2' === HD_DD_Plugin::settings()['default_flow'], 'a swipe default becomes swipe2' );

// Nothing to do: a test between live flows, and a second run, are left alone.
hd_test_reset();
update_option( HD_DD_Experiments::OPTION, array(
	'id' => 'exp_20261020_aaaaaa', 'control' => 'classic', 'challenger' => 'swipe2', 'percent' => 50,
	'started_at' => '2026-10-20 09:00:00', 'status' => 'running', 'decided_at' => null, 'decision' => null,
	'emailed' => array( 'winner' => false, 'no_difference' => false ), 'unattributed' => 0,
) );
HD_DD_Experiments::migrate_flows();
HD_DD_Experiments::migrate_flows();
check( null !== HD_DD_Experiments::current(), 'a Classic vs Swipe 2 test keeps running' );
check( array() === HD_DD_Experiments::history(), 'and nothing is added to history' );
check( '2' === HD_DD_Experiments::DB_VERSION, 'version bumped so the migration runs on update' );

hd_test_done( 'experiment-flows.test.php' );
```

- [ ] **Step 2: Run to verify it fails**

Run: `php tests/php/experiment-flows.test.php`
Expected: FAIL (`canonical_flow` undefined).

- [ ] **Step 3: Implement**

In `includes/class-hd-experiments.php`:

Change `const DB_VERSION  = '1';` to `'2'`.

Replace `flows()` and `flow_label()` with:

```php
	/** Flows retired from use: old key => the flow that replaced it. Labels stay for history. */
	const RETIRED = array( 'swipe' => 'swipe2' );

	/** @return array flow key => label. */
	public static function flows() {
		return (array) apply_filters( 'hd_dd_flows', array( 'classic' => 'Classic', 'swipe2' => 'Swipe 2' ) );
	}

	public static function is_flow( $flow ) {
		return is_string( $flow ) && '' !== $flow && array_key_exists( $flow, self::flows() );
	}

	public static function flow_label( $flow ) {
		$flows = self::flows();
		return isset( $flows[ $flow ] ) ? (string) $flows[ $flow ] : ucfirst( (string) $flow );
	}

	/** A live flow key for any input: retired keys map to their replacement; '' if unknown. */
	public static function canonical_flow( $flow ) {
		$flow = is_string( $flow ) ? strtolower( trim( $flow ) ) : '';
		if ( array_key_exists( $flow, self::RETIRED ) ) {
			$flow = self::RETIRED[ $flow ];
		}
		return self::is_flow( $flow ) ? $flow : '';
	}

	/**
	 * After an update that retires a flow: a running test naming it is ended (its numbers go
	 * to history, because its challenger no longer exists), and a default pointing at it
	 * moves to the replacement. Safe to run more than once.
	 */
	public static function migrate_flows() {
		$exp = self::current();
		if ( $exp && ( array_key_exists( (string) $exp['control'], self::RETIRED ) || array_key_exists( (string) $exp['challenger'], self::RETIRED ) ) ) {
			self::end( 'stopped' );
		}
		$saved = get_option( 'hd_dd_settings', array() );
		if ( is_array( $saved ) && isset( $saved['default_flow'] ) && is_string( $saved['default_flow'] ) && array_key_exists( $saved['default_flow'], self::RETIRED ) ) {
			$saved['default_flow'] = self::RETIRED[ $saved['default_flow'] ];
			update_option( 'hd_dd_settings', $saved );
		}
	}
```

(Remove the old `is_flow`/`flow_label` bodies so each exists once.)

In `maybe_upgrade()` add `self::migrate_flows();` on the line after `self::create_table();`.

In `includes/class-hd-shortcode.php` line 54 replace the assignment with `$flow = HD_DD_Experiments::canonical_flow( $atts['flow'] );`.

- [ ] **Step 4: Run the PHP suite**

Run: `php tests/php/run.php`
Expected: "all PHP tests passed". If an existing experiment test starts a test with `'swipe'` as a flow, change that literal to `'swipe2'`.

- [ ] **Step 5: Commit**

```bash
git add includes/class-hd-experiments.php includes/class-hd-shortcode.php tests/php
git commit -m "feat(experiments): Swipe 2 flow; updating ends a running test against the retired swipe flow"
```

---

### Task 3: Carousel arrows and a "the user moved it" signal

**Files:**
- Modify: `assets/js/swipe/carousel.js`
- Test: `tests/js/carousel.test.js`

**Interfaces:**
- Produces: `HD_DD_Carousel.math.arrowState(index, count) → { prev: bool, next: bool }`; carousel option `onUser()` called after any user gesture that changed the centred item (drag, card tap, dot, arrow key, arrow button). Programmatic `setIndex` never calls it.

- [ ] **Step 1: Write the failing test**

Append to `tests/js/carousel.test.js` before its final `console.log` (use whatever name that file already gives the required module; if it is `C`, this is `C.math`):

```js
// Arrow buttons hide at the ends of the list.
var arrows = require('../../assets/js/swipe/carousel.js').math.arrowState;
assert.deepStrictEqual(arrows(0, 5), { prev: false, next: true });
assert.deepStrictEqual(arrows(2, 5), { prev: true, next: true });
assert.deepStrictEqual(arrows(4, 5), { prev: true, next: false });
assert.deepStrictEqual(arrows(0, 1), { prev: false, next: false });
assert.deepStrictEqual(arrows(0, 0), { prev: false, next: false });
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/js/carousel.test.js`
Expected: FAIL (`arrows is not a function`).

- [ ] **Step 3: Implement**

Add after `dotWindow`:

```js
	function arrowState(index, count) { return { prev: index > 0, next: index < count - 1 }; }
```

and add `arrowState: arrowState` to `math`.

In `create()`, after `container.appendChild(root);` add:

```js
		// ‹ › buttons: tapping works as well as swiping, and a mouse has something to press.
		function arrow(dir, glyph, name) {
			var b = el('button', 'hd-sw-carousel__arrow hd-sw-carousel__arrow--' + dir);
			b.type = 'button';
			b.textContent = glyph;
			b.setAttribute('aria-label', name);
			b.addEventListener('click', function () { user(index + (dir === 'prev' ? -1 : 1)); });
			root.appendChild(b);
			return b;
		}
		var prevBtn = arrow('prev', '‹', 'Previous');
		var nextBtn = arrow('next', '›', 'Next');

		// A change the visitor made themselves (not one the app set).
		function user(i) {
			var before = index;
			setIndex(i);
			if (index !== before && o.onUser) { o.onUser(); }
		}
```

At the end of `layout()` (after `renderDots();`) add:

```js
			var st = arrowState(index, count);
			prevBtn.hidden = !st.prev;
			nextBtn.hidden = !st.next;
```

Route every user gesture through `user`: in `renderDots` change `setIndex(j)` to `user(j)`; in `onUp` change `setIndex(+card.getAttribute('data-i'))` to `user(+card.getAttribute('data-i'))` and `setIndex(settle(index, d.dx, d.v, spacing(), count))` to `user(settle(index, d.dx, d.v, spacing(), count))`; in `onKey` change both `setIndex(` calls to `user(`. Leave the public `setIndex` and `nudge` as they are. Add `onUser()` to the options list in the file's header comment.

- [ ] **Step 4: Run** `node tests/js/carousel.test.js` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/js/swipe/carousel.js tests/js/carousel.test.js
git commit -m "feat(swipe): carousel arrows and an onUser signal"
```

---

### Task 4: The swipe hint

**Files:**
- Create: `assets/js/swipe/swipe-hint.js`, `tests/js/swipe-hint.test.js`

**Interfaces:**
- Produces: `HD_DD_SwipeHint.text(touch) → string`; `HD_DD_SwipeHint.create(container, { touch, delay, onIdle, timers }) → { el, dismiss(), dismissed() }`. `timers` is `{ set(fn, ms) → id, clear(id) }` (defaults wrap `setTimeout`/`clearTimeout`).

- [ ] **Step 1: Write the failing test**

Create `tests/js/swipe-hint.test.js`:

```js
// The "swipe to see more" hint on the first carousel. `node tests/js/swipe-hint.test.js`
var assert = require('assert');

function node(tag) {
  return {
    tag: tag, className: '', textContent: '', children: [], attrs: {}, parentNode: null,
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; },
    setAttribute: function (k, v) { this.attrs[k] = v; }
  };
}
global.document = { createElement: node };
var Hint = require('../../assets/js/swipe/swipe-hint.js');

assert.strictEqual(Hint.text(true), 'Swipe to see more doors');
assert.strictEqual(Hint.text(false), 'Use the arrows to see more');

// A fake clock: timers.set records the callback, fire() runs it.
function clock() {
  var c = { fn: null, ms: null, cleared: 0 };
  c.timers = { set: function (fn, ms) { c.fn = fn; c.ms = ms; return 1; }, clear: function () { c.cleared++; c.fn = null; } };
  c.fire = function () { var f = c.fn; c.fn = null; if (f) { f(); } };
  return c;
}

// Shown at once, worded for touch; idle after 4 seconds calls onIdle and the pill stays.
var box = node('div'), ck = clock(), idle = 0;
var h = Hint.create(box, { touch: true, onIdle: function () { idle++; }, timers: ck.timers });
assert.strictEqual(box.children.length, 1);
assert.strictEqual(h.el.className, 'hd-sw-hint');
assert.strictEqual(h.el.children[1].textContent, 'Swipe to see more doors');
assert.strictEqual(ck.ms, 4000);
ck.fire();
assert.strictEqual(idle, 1);
assert.strictEqual(box.children.length, 1, 'still showing after the idle wobble');
h.dismiss();
assert.strictEqual(box.children.length, 0);
assert.strictEqual(h.dismissed(), true);
h.dismiss(); // twice is harmless

// Dismissed before the timer: the timer is cancelled and onIdle never runs.
box = node('div'); ck = clock(); idle = 0;
h = Hint.create(box, { touch: false, delay: 10, onIdle: function () { idle++; }, timers: ck.timers });
assert.strictEqual(h.el.children[1].textContent, 'Use the arrows to see more');
assert.strictEqual(ck.ms, 10);
h.dismiss();
assert.strictEqual(ck.cleared, 1);
ck.fire();
assert.strictEqual(idle, 0);

// No options at all: still builds.
box = node('div');
Hint.create(box).dismiss();
assert.strictEqual(box.children.length, 0);

console.log('swipe-hint.test.js: all assertions passed');
```

- [ ] **Step 2: Run to verify it fails** — `node tests/js/swipe-hint.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `assets/js/swipe/swipe-hint.js`:

```js
// assets/js/swipe/swipe-hint.js
// A pill over the first carousel that says the doors can be swiped. It goes the moment the
// visitor moves the carousel; if they have not after a few seconds, onIdle lets the caller
// wobble the cards while the pill stays.
//
//   var hint = HD_DD_SwipeHint.create(holder, { touch: true, onIdle: function () { carousel.nudge(); } });
//   hint.dismiss();
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(); }
	else { root.HD_DD_SwipeHint = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var DELAY = 4000;

	function text(touch) { return touch ? 'Swipe to see more doors' : 'Use the arrows to see more'; }

	function create(container, o) {
		o = o || {};
		var timers = o.timers || {
			set: function (fn, ms) { return setTimeout(fn, ms); },
			clear: function (id) { clearTimeout(id); }
		};
		var pill = document.createElement('div');
		pill.className = 'hd-sw-hint';
		pill.setAttribute('aria-hidden', 'true'); // the helper line above the carousel says the same
		var hand = document.createElement('span');
		hand.className = 'hd-sw-hint__hand';
		hand.textContent = '☞';
		var label = document.createElement('span');
		label.className = 'hd-sw-hint__text';
		label.textContent = text(!!o.touch);
		pill.appendChild(hand);
		pill.appendChild(label);
		container.appendChild(pill);

		var gone = false;
		var timer = timers.set(function () {
			timer = null;
			if (!gone && o.onIdle) { o.onIdle(); }
		}, o.delay == null ? DELAY : o.delay);

		function dismiss() {
			if (gone) { return; }
			gone = true;
			if (timer != null) { timers.clear(timer); timer = null; }
			if (pill.parentNode) { pill.parentNode.removeChild(pill); }
		}

		return { el: pill, dismiss: dismiss, dismissed: function () { return gone; } };
	}

	return { create: create, text: text };
}));
```

- [ ] **Step 4: Run** `node tests/js/swipe-hint.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/js/swipe/swipe-hint.js tests/js/swipe-hint.test.js
git commit -m "feat(swipe): swipe hint pill"
```

---

### Task 5: Wire the helpers into the swipe screens

**Files:**
- Modify: `assets/js/swipe/swipe-app.js`, `assets/js/swipe/swipe-view.js`, `assets/css/hd-swipe.css`, `includes/class-hd-assets.php`
- Test: `tests/js/swipe-wiring.test.js` (create)

**Interfaces:**
- Consumes: `HD_DD_SwipeHint.create`, carousel `onUser`, funnel step `browsed`.
- Produces: `SwipeApp.prototype.browsed()`; `app.flow` (string, from `opts.flow`).

- [ ] **Step 1: Write the failing test**

Create `tests/js/swipe-wiring.test.js`:

```js
// Source-level checks that the swipe screens carry the helpers. `node tests/js/swipe-wiring.test.js`
var assert = require('assert');
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }
var view = read('assets/js/swipe/swipe-view.js');
var app = read('assets/js/swipe/swipe-app.js');
var css = read('assets/css/hd-swipe.css');
var assets = read('includes/class-hd-assets.php');

assert.ok(view.indexOf("'Choose this door: '") !== -1, 'showcase button names the action');
assert.ok(view.indexOf('Happy with this one? Tap Choose.') !== -1, 'prompt above the button');
assert.ok(view.indexOf('window.HD_DD_SwipeHint.create(') !== -1, 'hint is created');
assert.ok(view.indexOf('onUser:') !== -1, 'carousels report user movement');
assert.ok(view.indexOf('hd_sw_nudged') === -1, 'the once-per-browser wobble is gone');
assert.ok(app.indexOf("this.funnel.step('browsed')") !== -1, 'browsed is reported');
assert.ok(/SwipeApp\.prototype\.browsed = function \(\) \{[^}]*this\.chosen/.test(app), 'browsed never fires after a design is chosen');
['.hd-sw-carousel__arrow', '.hd-sw-hint', '.hd-sw-prompt', '.hd-sw-cta.is-pulse'].forEach(function (s) {
  assert.ok(css.indexOf(s) !== -1, 'css has ' + s);
});
assert.ok(/\.hd-sw-cta \{[^}]*border-radius: 999px/.test(css), 'the action button is a pill on phones');
assert.ok(assets.indexOf("'swipehint'") !== -1, 'swipe-hint.js is registered');

console.log('swipe-wiring.test.js: all assertions passed');
```

- [ ] **Step 2: Run to verify it fails** — `node tests/js/swipe-wiring.test.js` → FAIL.

- [ ] **Step 3: `swipe-app.js`**

In the constructor add `this.flow = opts.flow || 'swipe2';` after `this.api = opts.api;`. In `reset()` do not touch `hintShown` (it is per page load, not per design).

Add after `SwipeApp.prototype.tag`:

```js
	// The visitor moved the showcase themselves. Reported once per page load and only before
	// a design is chosen: it sits before `design` in the funnel, so a later one would read
	// on the dashboard as going backwards.
	SwipeApp.prototype.browsed = function () {
		if (this._browsed || this.chosen || this.screen !== 'design') { return; }
		this._browsed = true;
		this.funnel.step('browsed');
	};
```

- [ ] **Step 4: `swipe-view.js`**

Delete `var NUDGE_KEY = 'hd_sw_nudged';` and the whole `maybeNudge` function. Change `var carousel = null, compositor = null, enquiry = null;` to `var carousel = null, compositor = null, enquiry = null, hint = null;` and add after `caption()`:

```js
		// ---- Helpers that teach the swipe ---------------------------------------------
		function pulseCta() {
			cta.classList.remove('is-pulse');
			void cta.offsetWidth; // restart the animation
			cta.classList.add('is-pulse');
		}

		// The visitor moved a carousel themselves.
		function userMoved() {
			if (hint) { hint.dismiss(); hint = null; }
			app.browsed();
			if (!app.pulsedMove) { app.pulsedMove = true; pulseCta(); }
		}

		// Once per page load, on the first carousel they see.
		function maybeHint(holder) {
			if (app.hintShown || !window.HD_DD_SwipeHint) { return; }
			app.hintShown = true;
			var touch = false;
			try { touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { touch = false; }
			hint = window.HD_DD_SwipeHint.create(holder, { touch: touch, onIdle: function () { if (carousel) { carousel.nudge(); } } });
		}
```

In `showcase()`:
- filter click handler becomes `function () { app.filter = f; app.showcaseAt = 0; userMoved(); v.render(); }`
- in `update(i)` replace the `setCta('Choose ' + …)` line with `setCta('Choose this door: ' + list[i].name + ' →', function () { app.pickDesign(list[i]); });`
- add `onUser: userMoved,` to the `HD_DD_Carousel.create` options
- the strip item click becomes `function () { carousel.setIndex(j); update(j); userMoved(); }`
- replace the final `maybeNudge();` with:

```js
			body.appendChild(el('p', 'hd-sw-prompt', 'Happy with this one? Tap Choose.'));
			maybeHint(holder);
			if (!app.pulsedIntro) { app.pulsedIntro = true; pulseCta(); }
```

In `optionScreen()` add `onUser: userMoved,` to its `HD_DD_Carousel.create` options.

At the top of `v.render`, after `if (carousel) { carousel.destroy(); carousel = null; }`, add `if (hint) { hint.dismiss(); hint = null; }`.

- [ ] **Step 5: CSS**

In `assets/css/hd-swipe.css` replace the `.hd-sw-cta { … }` rule in section 6 with:

```css
.hd-sw-cta {
  position: sticky; bottom: 12px; z-index: 20;
  display: block; width: 100%; margin: 14px 0 12px; padding: 16px 20px;
  border: 0; border-radius: 999px;
  background: var(--sw-accent); color: #fff;
  font: inherit; font-weight: 700; font-size: 1.02rem; cursor: pointer;
  /* A pale ring lifts it off whatever scrolls beneath, so it reads as a button, not a bar. */
  box-shadow: 0 0 0 6px rgba(255, 255, 255, .92), 0 10px 24px rgba(29, 79, 63, .38);
}
.hd-sw-cta.is-pulse { animation: hd-sw-ctapulse 1.1s ease-out 1; }
@keyframes hd-sw-ctapulse {
  0%   { box-shadow: 0 0 0 6px rgba(255, 255, 255, .92), 0 10px 24px rgba(29, 79, 63, .38), 0 0 0 6px rgba(29, 79, 63, .5); }
  100% { box-shadow: 0 0 0 6px rgba(255, 255, 255, .92), 0 10px 24px rgba(29, 79, 63, .38), 0 0 0 22px rgba(29, 79, 63, 0); }
}
.hd-sw-prompt { margin: 10px 0 0; text-align: center; font-size: .92rem; color: #33413b; }
```

In section 9 (wider screens) replace the `.hd-sw-cta` line with `.hd-sw-cta { position: static; margin: 16px 0 0; border-radius: 12px; box-shadow: none; }`.

Append a new section:

```css
/* 11. Swipe helpers: arrows on the carousel and the hint pill ----------------------------- */
.hd-sw-carousel { position: relative; }
.hd-sw-carousel__arrow {
  position: absolute; top: 42%; z-index: 150; transform: translateY(-50%);
  width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: pointer;
  background: rgba(255, 255, 255, .94); color: #161616; font-size: 26px; line-height: 1;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .18);
}
.hd-sw-carousel__arrow--prev { left: 6px; }
.hd-sw-carousel__arrow--next { right: 6px; }
.hd-sw-carousel__arrow[hidden] { display: none; }
.hd-sw-carousel__arrow:focus-visible { outline: 3px solid #7fb5a2; outline-offset: 2px; }
.hd-sw-holder { position: relative; }
.hd-sw-hint {
  position: absolute; left: 50%; bottom: 54px; z-index: 160; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px;
  background: rgba(22, 22, 22, .88); color: #fff; font-size: .9rem; font-weight: 600;
  white-space: nowrap; pointer-events: none;
}
.hd-sw-hint__hand { display: inline-block; font-size: 1.2rem; animation: hd-sw-hand 1.3s ease-in-out infinite; }
@keyframes hd-sw-hand { 0%, 100% { transform: translateX(7px); } 50% { transform: translateX(-9px); } }
```

(The existing reduced-motion rule in section 8 already switches every `.hd-sw` animation off.)

- [ ] **Step 6: Register the script**

In `includes/class-hd-assets.php` add to the `$swipe` array `'swipehint' => array( 'swipe-hint.js', array() ),` and add `self::HANDLE . '-swipehint'` to the dependency list of `-swipeview`.

- [ ] **Step 7: Run** `for f in tests/js/*.test.js; do node "$f" || exit 1; done` → all pass.

- [ ] **Step 8: Look at it**

Open `tools/swipe-test.html` in a browser at phone width. Confirm: the pill shows on the first screen and goes on the first swipe; arrows appear and hide at the ends; the button is a floating pill reading "Choose this door: …"; it pulses once on load and once after the first swipe. If the harness does not load `swipe-hint.js`, add a `<script src="../assets/js/swipe/swipe-hint.js"></script>` line before `swipe-view.js` in that file.

- [ ] **Step 9: Commit**

```bash
git add assets/js/swipe assets/css/hd-swipe.css includes/class-hd-assets.php tests/js/swipe-wiring.test.js tools/swipe-test.html
git commit -m "feat(swipe): hint, arrows, floating Choose button, browsed step"
```

---

### Task 6: Rows that are saves — `kind`, `flow`, updates

**Files:**
- Modify: `includes/class-hd-repository.php`, `tests/php/wp-stubs.php` (class `HD_Test_WPDB`), `tests/php/enquiry-save.test.php` (one line)
- Create: `tests/php/repository-kind.test.php`

**Interfaces:**
- Produces: `insert()` accepts `'kind'` (`'save'`|`'enquiry'`, default `'enquiry'`) and `'flow'` (string); `update_row( int $id, array $fields ) : int|false`; `count_by_kind() : array{enquiry:int,save:int}`; `list( $limit = 100, $offset = 0, $kind = '' )`; `DB_VERSION = '4'`.

- [ ] **Step 1: Teach the test database to find a row by token**

In `tests/php/wp-stubs.php` replace `HD_Test_WPDB::prepare` and `get_row` with:

```php
	public function prepare( $q ) {
		$args = array_slice( func_get_args(), 1 );
		if ( 1 === count( $args ) && is_array( $args[0] ) ) { $args = $args[0]; }
		foreach ( $args as $a ) {
			$q = preg_replace( '/%[sd]/', is_int( $a ) ? (string) $a : "'" . addslashes( (string) $a ) . "'", $q, 1 );
		}
		return $q;
	}
	public function get_row( $q ) {
		if ( preg_match( "/WHERE token = '([^']*)'/", $q, $m ) ) {
			foreach ( $this->rows as $r ) {
				if ( isset( $r['token'] ) && $r['token'] === $m[1] ) { return (object) $r; }
			}
		}
		return null;
	}
```

Run `php tests/php/run.php` — Expected: still "all PHP tests passed" (no test relied on `prepare` returning the raw template; if one does, make it compare against the substituted query).

- [ ] **Step 2: Write the failing test**

Create `tests/php/repository-kind.test.php`:

```php
<?php
/**
 * A save and its later quote request are one row: `kind` moves from save to enquiry.
 * Run: php tests/php/repository-kind.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_row( array $extra = array() ) {
	return array_merge( array(
		'name' => '', 'email' => 'jo@example.com', 'telephone' => '', 'postcode' => '',
		'design_name' => 'Ketu in Sage', 'design' => array( 'Door Design' => array( 'label' => 'Ketu', 'id' => 1 ) ),
		'payload' => array(), 'source_ip' => '203.0.113.5',
	), $extra );
}

hd_test_reset();
global $wpdb;
$repo = new HD_DD_Repository();

$a = $repo->insert( hd_row() );
check( 'enquiry' === $wpdb->rows[0]['kind'], 'kind defaults to enquiry' );
check( '' === $wpdb->rows[0]['flow'], 'flow defaults to empty' );

$b = $repo->insert( hd_row( array( 'kind' => 'save', 'flow' => 'swipe2' ) ) );
check( 'save' === $wpdb->rows[1]['kind'] && 'swipe2' === $wpdb->rows[1]['flow'], 'a save row stores kind and flow' );

$repo->insert( hd_row( array( 'kind' => 'nonsense' ) ) );
check( 'enquiry' === $wpdb->rows[2]['kind'], 'an unknown kind is stored as enquiry' );

$found = $repo->get_by_token( $b['token'] );
check( $found && (int) $found->id === $b['id'], 'the row is found by its token' );
check( null === $repo->get_by_token( 'nope' ), 'an unknown token finds nothing' );

$n = $repo->update_row( $b['id'], array(
	'customer_name' => 'Jo', 'customer_postcode' => 'AL1 1AA', 'kind' => 'enquiry',
	'payload' => array( 'reference' => $b['reference'] ), 'reference' => 'HACK', 'token' => 'HACK',
) );
check( 1 === $n, 'update_row reports the row it changed' );
check( 'Jo' === $wpdb->rows[1]['customer_name'] && 'enquiry' === $wpdb->rows[1]['kind'], 'fields are written' );
check( $b['reference'] === $wpdb->rows[1]['reference'] && $b['token'] === $wpdb->rows[1]['token'], 'reference and token cannot be overwritten' );
check( is_string( $wpdb->rows[1]['payload'] ) && false !== strpos( $wpdb->rows[1]['payload'], $b['reference'] ), 'arrays are stored as JSON' );
check( 0 === $repo->update_row( $b['id'], array( 'reference' => 'HACK' ) ), 'nothing writable: nothing done' );

check( array( 'enquiry' => 0, 'save' => 0 ) === $repo->count_by_kind(), 'count_by_kind always has both keys' );
check( '4' === HD_DD_Repository::DB_VERSION, 'schema version bumped so the columns are added on update' );

hd_test_done( 'repository-kind.test.php' );
```

- [ ] **Step 3: Run to verify it fails** — `php tests/php/repository-kind.test.php` → FAIL.

- [ ] **Step 4: Implement**

In `includes/class-hd-repository.php`:

- `const DB_VERSION = '4';`
- In the `CREATE TABLE`, after the `design_name` line add:
  ```
  			kind VARCHAR(10) NOT NULL DEFAULT 'enquiry',
  			flow VARCHAR(20) NOT NULL DEFAULT '',
  ```
  and after `KEY status (status)` add a comma and `KEY kind (kind)` on its own line.
- In `insert()`, add to the data array after `'design_name'`:
  ```php
  				'kind'              => ( isset( $data['kind'] ) && 'save' === $data['kind'] ) ? 'save' : 'enquiry',
  				'flow'              => isset( $data['flow'] ) ? (string) $data['flow'] : '',
  ```
  and make the format array fourteen `'%s'` entries. Update the docblock: "plus optional 'kind' and 'flow'".
- Replace `list()` and add the two new methods after `update_payload()`:

```php
	/** Columns update_row() may write. reference and token are never changed after insert. */
	const UPDATABLE = array( 'customer_name', 'customer_phone', 'customer_postcode', 'design_name', 'design', 'payload', 'kind' );

	/**
	 * Update a row in place (a save changing its design, or becoming an enquiry).
	 *
	 * @param int   $id     Row id.
	 * @param array $fields Column => value; arrays are stored as JSON; other columns are ignored.
	 * @return int|false Rows updated.
	 */
	public function update_row( $id, array $fields ) {
		global $wpdb;
		$data = array();
		foreach ( self::UPDATABLE as $col ) {
			if ( array_key_exists( $col, $fields ) ) {
				$data[ $col ] = is_array( $fields[ $col ] ) ? wp_json_encode( $fields[ $col ] ) : (string) $fields[ $col ];
			}
		}
		if ( ! $data ) {
			return 0;
		}
		return $wpdb->update( self::table(), $data, array( 'id' => (int) $id ), array_fill( 0, count( $data ), '%s' ), array( '%d' ) );
	}

	/** @return array{enquiry:int,save:int} Row counts by kind (failed submissions count as enquiries). */
	public function count_by_kind() {
		global $wpdb;
		$table = self::table();
		$out   = array( 'enquiry' => 0, 'save' => 0 );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		foreach ( (array) $wpdb->get_results( "SELECT kind, COUNT(*) AS n FROM {$table} GROUP BY kind" ) as $r ) {
			if ( isset( $out[ $r->kind ] ) ) {
				$out[ $r->kind ] = (int) $r->n;
			}
		}
		return $out;
	}

	/** @return array Row objects, newest first; $kind 'save' or 'enquiry' narrows the list. */
	public function list( $limit = 100, $offset = 0, $kind = '' ) {
		global $wpdb;
		$table = self::table();
		if ( 'save' === $kind || 'enquiry' === $kind ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
			return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE kind = %s ORDER BY created_at DESC LIMIT %d OFFSET %d", $kind, $limit, $offset ) );
		}
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is internal.
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT %d OFFSET %d", $limit, $offset ) );
	}
```

In `tests/php/enquiry-save.test.php` change `check( '3' === HD_DD_Repository::DB_VERSION, …` to `'4'` and its message to "schema version bumped so new columns are added on update".

- [ ] **Step 5: Run** `php tests/php/run.php` → all pass.

- [ ] **Step 6: Commit**

```bash
git add includes/class-hd-repository.php tests/php
git commit -m "feat(repository): kind and flow columns, update_row, counts by kind"
```

---

### Task 7: Guide price setting and the two save emails

**Files:**
- Modify: `includes/class-hd-trust-settings.php`, `includes/class-hd-mailer.php` (`customer_ack_html`, the `$price` line), `hd-door-designer.php` (require the new file next to the other `includes/` requires), `tests/php/trust-settings.test.php`, `tests/php/save-emails.test.php`
- Create: `includes/class-hd-save-mailer.php`, `tests/php/save-mailer.test.php`

**Interfaces:**
- Produces: `HD_DD_Trust_Settings::GUIDE_PRICE` (default text), `HD_DD_Trust_Settings::guide_price() : string`, `front_config()['guidePrice']`; `HD_DD_Save_Mailer::send_saver( array $payload, string $reload_url ) : bool`; `HD_DD_Save_Mailer::send_owner_saved( array $payload, string $recipient, array $attachments = array() ) : bool`.

- [ ] **Step 1: Write the failing test**

Create `tests/php/save-mailer.test.php`:

```php
<?php
/**
 * The email a saver gets, and the "saved design" note to the owner.
 * Run: php tests/php/save-mailer.test.php
 */
require __DIR__ . '/wp-stubs.php';

$payload = array(
	'reference'  => 'HD-2026-000060',
	'designName' => 'Ketu in Sage',
	'customer'   => array( 'name' => '', 'telephone' => '', 'email' => 'jo@example.com', 'postcode' => '' ),
	'design'     => array( 'Door Design' => array( 'label' => 'Ketu', 'id' => 1 ), 'Door Colour (External)' => array( 'label' => 'Sage', 'id' => 2 ) ),
	'image'      => 'https://example.test/wp-content/uploads/hd-door-designer/enquiries/HD-2026-000060.png',
);
$link = 'https://example.test/door-designer/?design=abc123abc123';

// --- Guide price setting ---------------------------------------------------------------
hd_test_reset();
check( 'Fitted doors typically cost £1,500 to £4,000. Most of our customers pay around £2,000.' === HD_DD_Trust_Settings::guide_price(), 'default guide price is the agreed sentence' );
check( HD_DD_Trust_Settings::guide_price() === HD_DD_Trust_Settings::front_config()['guidePrice'], 'the browser gets the same text' );
$clean = HD_DD_Trust_Settings::sanitize( array( 'guide_price' => " <b>From £1,500</b>\nfitted " ), HD_DD_Plugin::settings() );
check( 'From £1,500 fitted' === $clean['guide_price'], 'markup and line breaks are stripped' );
$clean = HD_DD_Trust_Settings::sanitize( array( 'guide_price' => str_repeat( 'é', 400 ) ), HD_DD_Plugin::settings() );
check( 200 === mb_strlen( $clean['guide_price'] ), 'capped at 200 characters' );
$clean = HD_DD_Trust_Settings::sanitize( array( 'guide_price' => '' ), HD_DD_Plugin::settings() );
check( '' === $clean['guide_price'], 'empty is allowed (hides the line)' );

// --- Saver email -----------------------------------------------------------------------
hd_test_reset();
check( true === HD_DD_Save_Mailer::send_saver( $payload, $link ), 'saver email is sent' );
$m = $GLOBALS['hd_test_mail'][0];
check( 'jo@example.com' === $m['to'], 'to the saver' );
check( 'Your door design: Ketu in Sage' === $m['subject'], 'subject names the design (got "' . $m['subject'] . '")' );
check( false !== strpos( $m['message'], 'Open my design' ) && false !== strpos( $m['message'], 'design=abc123abc123' ), 'has the link back' );
check( false !== strpos( $m['message'], 'Get my exact price' ) && false !== strpos( $m['message'], 'price=1' ), 'has the price button' );
check( false !== strpos( $m['message'], '£1,500 to £4,000' ), 'has the guide price' );
check( false !== strpos( $m['message'], 'HD-2026-000060.png' ), 'has the door picture' );
check( false === strpos( $m['message'], 'Thank you, ' ), 'does not greet by a name it does not have' );

hd_test_reset();
update_option( 'hd_dd_settings', array( 'guide_price' => '' ) );
HD_DD_Save_Mailer::send_saver( $payload, $link );
check( false === strpos( $GLOBALS['hd_test_mail'][0]['message'], '£1,500' ), 'no guide price when the setting is empty' );

hd_test_reset();
HD_DD_Save_Mailer::send_saver( $payload, '' );
check( false === strpos( $GLOBALS['hd_test_mail'][0]['message'], 'Get my exact price' ), 'no buttons without a link' );

hd_test_reset();
$bad = $payload; $bad['customer']['email'] = 'not-an-email';
check( false === HD_DD_Save_Mailer::send_saver( $bad, $link ) && array() === $GLOBALS['hd_test_mail'], 'no email to a bad address' );

// --- Owner note ------------------------------------------------------------------------
hd_test_reset();
HD_DD_Save_Mailer::send_owner_saved( $payload, 'owner@example.com' );
$m = $GLOBALS['hd_test_mail'][0];
check( 'New saved design — jo@example.com' === $m['subject'], 'owner subject (got "' . $m['subject'] . '")' );
check( false !== strpos( $m['message'], 'has not asked for a price yet' ), 'says no price was requested' );
check( false !== strpos( $m['message'], 'HD-2026-000060' ) && false !== strpos( $m['message'], 'Ketu' ), 'reference and design are listed' );
check( 0 !== strpos( $m['subject'], 'New door enquiry' ), 'never looks like an enquiry in the inbox' );

hd_test_reset();
$flagged = $payload; $flagged['flags'] = array( 'honeypot' );
HD_DD_Save_Mailer::send_owner_saved( $flagged, 'owner@example.com' );
check( 0 === strpos( $GLOBALS['hd_test_mail'][0]['subject'], '[Possible bot] ' ), 'a honeypot hit is marked' );

hd_test_done( 'save-mailer.test.php' );
```

- [ ] **Step 2: Run to verify it fails** — `php tests/php/save-mailer.test.php` → FAIL.

- [ ] **Step 3: Guide price setting**

In `includes/class-hd-trust-settings.php`:

- Change the class comment's "Owns its four settings" to "Owns the Review-step settings".
- Add below `const QUOTE_MAX = 6;`:
  ```php
  	const GUIDE_PRICE = 'Fitted doors typically cost £1,500 to £4,000. Most of our customers pay around £2,000.';
  ```
- Add `'guide_price' => self::GUIDE_PRICE,` to `defaults()`.
- In `sanitize()`, add a branch before the final `else`:
  ```php
  			} elseif ( 'guide_price' === $key ) {
  				$v           = sanitize_text_field( $raw );
  				$out[ $key ] = function_exists( 'mb_substr' ) ? mb_substr( $v, 0, 200 ) : substr( $v, 0, 200 );
  ```
- Add the accessor:
  ```php
  	/** The guide price sentence shown on Review and in the customer emails ('' = hidden). */
  	public static function guide_price() {
  		$s = HD_DD_Plugin::settings();
  		return isset( $s['guide_price'] ) ? (string) $s['guide_price'] : self::GUIDE_PRICE;
  	}
  ```
  and in `front_config()`'s returned array add `'guidePrice' => self::guide_price(),`.
- In `render_fields()`, change the description under the heading to `Shown on the Review step of the new designer. Only use your real rating and real customer words.` and add a row before `</table>`:
  ```php
  			<tr>
  				<th scope="row"><label for="hd_guide_price"><?php esc_html_e( 'Guide price', 'hd-door-designer' ); ?></label></th>
  				<td>
  					<input name="<?php echo esc_attr( $option ); ?>[guide_price]" id="hd_guide_price" type="text" class="large-text" value="<?php echo esc_attr( $s['guide_price'] ); ?>" />
  					<p class="description"><?php esc_html_e( 'Shown above the email box and in the email we send. Leave empty to show no price.', 'hd-door-designer' ); ?></p>
  				</td>
  			</tr>
  ```

Run `php tests/php/trust-settings.test.php`. Where it asserts the exact set of keys from `defaults()` or `sanitize()`, add `guide_price`.

- [ ] **Step 4: The acknowledgement email uses the setting (classic's wording untouched)**

In `includes/class-hd-mailer.php`, `customer_ack_html()`, replace the `$price = …;` line with:

```php
		// Classic (the A/B control) keeps its original sentence; the new flow uses the setting.
		$price = $quote_form
			? esc_html__( 'As a guide, a fully fitted composite door installed by qualified fitters typically ranges from £1,000 to £4,000 depending on the options you choose.', 'hd-door-designer' )
			: esc_html( HD_DD_Trust_Settings::guide_price() );
```

and build the price row so an empty setting leaves no empty box. Replace the three concatenated lines that output the price row with:

```php
			. ( '' !== $price ? '<tr><td style="padding:20px 28px 0;">'
				. '<p style="margin:0;padding:12px 14px;background:#f3f3f1;border:1px solid #e6e6e6;border-radius:6px;font-size:13px;line-height:1.5;color:#161616;">' . $price . '</p>'
				. '</td></tr>' : '' )
```

Run `php tests/php/save-emails.test.php` and `php tests/php/quote-form-control.test.php`. In `save-emails.test.php`, where the non-quote email is expected to contain "£1,000 to £4,000", expect "£1,500 to £4,000" instead. `quote-form-control.test.php` must pass unchanged.

- [ ] **Step 5: The save mailer**

Create `includes/class-hd-save-mailer.php`:

```php
<?php
/**
 * Emails for an email-only save: the saver's copy of their design (with the way back and
 * the way to ask for a price), and a short note to the business. A save is not an enquiry,
 * so the owner note never uses the enquiry subject line.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Save_Mailer {

	/**
	 * @param array  $payload    Save payload (reference, designName, customer.email, design, image).
	 * @param string $reload_url The "open my design" link ('' = no buttons).
	 * @return bool wp_mail result.
	 */
	public static function send_saver( array $payload, $reload_url ) {
		$to = isset( $payload['customer']['email'] ) ? sanitize_email( $payload['customer']['email'] ) : '';
		if ( ! is_email( $to ) ) {
			return false;
		}
		$name = isset( $payload['designName'] ) ? (string) $payload['designName'] : '';
		/* translators: %s: design name */
		$subject = '' !== $name ? sprintf( __( 'Your door design: %s', 'hd-door-designer' ), $name ) : __( 'Your door design', 'hd-door-designer' );

		$host     = preg_replace( '/^www\./', '', (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$headers  = array( 'Content-Type: text/html; charset=UTF-8', 'From: ' . ( $host ? 'Hertfordshire Doors <noreply@' . $host . '>' : 'Hertfordshire Doors' ) );
		$settings = HD_DD_Plugin::settings();
		if ( ! empty( $settings['recipient_email'] ) ) {
			$first = sanitize_email( trim( preg_split( '/[\s,]+/', trim( $settings['recipient_email'] ) )[0] ) );
			if ( $first ) {
				$headers[] = 'Reply-To: ' . $first;
			}
		}
		return wp_mail( $to, $subject, self::saver_html( $payload, (string) $reload_url, $name ), $headers );
	}

	private static function button( $url, $label, $dark ) {
		return '<a href="' . esc_url( $url ) . '" style="display:inline-block;margin:0 8px 8px 0;background:' . ( $dark ? '#1d4f3f' : '#ffffff' ) . ';color:' . ( $dark ? '#ffffff' : '#161616' ) . ';border:1px solid ' . ( $dark ? '#1d4f3f' : '#161616' ) . ';text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:6px;">' . esc_html( $label ) . '</a>';
	}

	private static function saver_html( array $payload, $reload_url, $name ) {
		$image = isset( $payload['image'] ) ? esc_url( $payload['image'] ) : '';
		$rows  = '';
		foreach ( ( isset( $payload['design'] ) && is_array( $payload['design'] ) ) ? $payload['design'] : array() as $heading => $choice ) {
			$label = ( is_array( $choice ) && isset( $choice['label'] ) ) ? trim( (string) $choice['label'] ) : '';
			if ( '' === $label ) {
				continue;
			}
			$rows .= '<tr><td style="padding:2px 12px 2px 0;color:#8a8e96;font-size:13px;vertical-align:top;">' . esc_html( $heading ) . '</td>'
				. '<td style="padding:2px 0;color:#161616;font-size:13px;font-weight:600;vertical-align:top;">' . esc_html( $label ) . '</td></tr>';
		}
		$price   = HD_DD_Trust_Settings::guide_price();
		$buttons = '';
		if ( '' !== $reload_url ) {
			$buttons = '<tr><td style="padding:20px 28px 0;">'
				. self::button( add_query_arg( 'price', '1', $reload_url ), __( 'Get my exact price', 'hd-door-designer' ), true )
				. self::button( $reload_url, __( 'Open my design', 'hd-door-designer' ), false )
				. '</td></tr>';
		}
		return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;"><tr><td align="center">'
			. '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e6e6;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">'
			. '<tr><td style="padding:28px 28px 6px;">'
			. '<h1 style="margin:0 0 10px;font-size:20px;color:#161616;">' . esc_html__( 'Here is the door you designed', 'hd-door-designer' ) . '</h1>'
			. '<p style="margin:0;font-size:14px;line-height:1.5;color:#5a5f68;">' . esc_html__( 'It is saved. Come back to it any time, change anything you like, and ask us for an exact fitted price when you are ready.', 'hd-door-designer' ) . '</p>'
			. '</td></tr>'
			. '<tr><td style="padding:18px 28px 0;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>'
			. ( $image ? '<td valign="top" width="160" style="width:160px;padding:0 18px 0 0;"><img src="' . $image . '" alt="' . esc_attr__( 'Your door design', 'hd-door-designer' ) . '" width="160" style="display:block;width:160px;height:auto;border:1px solid #e6e6e6;border-radius:6px;background:#f3f3f1;" /></td>' : '' )
			. '<td valign="top"><div style="font-size:13px;font-weight:700;color:#161616;margin-bottom:6px;">' . esc_html( '' !== $name ? $name : __( 'Your design', 'hd-door-designer' ) ) . '</div>'
			. '<table role="presentation" cellpadding="0" cellspacing="0">' . $rows . '</table></td>'
			. '</tr></table></td></tr>'
			. ( '' !== $price ? '<tr><td style="padding:20px 28px 0;"><p style="margin:0;padding:12px 14px;background:#f3f3f1;border:1px solid #e6e6e6;border-radius:6px;font-size:13px;line-height:1.5;color:#161616;">' . esc_html( $price ) . '</p></td></tr>' : '' )
			. $buttons
			. '<tr><td style="padding:18px 28px 28px;"><p style="margin:0;font-size:13px;color:#8a8e96;">Hertfordshire Doors</p></td></tr>'
			. '</table></td></tr></table></body></html>';
	}

	/**
	 * Tell the business a design was saved by email with no price requested yet.
	 *
	 * @return bool wp_mail result.
	 */
	public static function send_owner_saved( array $payload, $recipient, array $attachments = array() ) {
		$email = isset( $payload['customer']['email'] ) ? (string) $payload['customer']['email'] : '';
		/* translators: %s: the saver's email address */
		$subject = sprintf( __( 'New saved design — %s', 'hd-door-designer' ), $email );
		if ( ! empty( $payload['flags'] ) ) {
			$subject = __( '[Possible bot] ', 'hd-door-designer' ) . $subject;
		}
		$lines   = array();
		$lines[] = __( 'Someone saved a door design from the website designer and has not asked for a price yet, so only their email address is known.', 'hd-door-designer' );
		$lines[] = __( 'If they ask for a price you will get the usual "New door enquiry" email for the same reference.', 'hd-door-designer' );
		$lines[] = '';
		$lines[] = __( 'REFERENCE: ', 'hd-door-designer' ) . ( isset( $payload['reference'] ) ? $payload['reference'] : '' );
		$lines[] = __( 'DESIGN:    ', 'hd-door-designer' ) . ( isset( $payload['designName'] ) ? $payload['designName'] : '' );
		$lines[] = __( 'EMAIL:     ', 'hd-door-designer' ) . $email;
		$lines[] = '';
		foreach ( ( isset( $payload['design'] ) && is_array( $payload['design'] ) ) ? $payload['design'] : array() as $heading => $choice ) {
			$lines[] = sprintf( '%-26s %s', $heading . ':', ( is_array( $choice ) && isset( $choice['label'] ) ) ? $choice['label'] : '' );
		}
		if ( ! empty( $payload['image'] ) ) {
			$lines[] = '';
			$lines[] = __( 'Picture: ', 'hd-door-designer' ) . $payload['image'];
		}
		$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
		if ( is_email( $email ) ) {
			$headers[] = 'Reply-To: ' . sanitize_email( $email );
		}
		return wp_mail( $recipient, $subject, implode( "\n", $lines ), $headers, $attachments );
	}
}
```

Add `require_once HD_DD_DIR . 'includes/class-hd-save-mailer.php';` to `hd-door-designer.php` beside the existing `includes/class-hd-mailer.php` require, and add the same require to the block of requires in `tests/php/wp-stubs.php` if that file lists the classes it loads one by one.

- [ ] **Step 6: Run** `php tests/php/run.php` → all pass. `node tests/js/copy-rule.test.js` → pass.

- [ ] **Step 7: Commit**

```bash
git add includes hd-door-designer.php tests/php
git commit -m "feat(save): guide price setting, saver email and owner saved-design note"
```

---

### Task 8: The save endpoints

**Files:**
- Create: `includes/class-hd-save.php`, `tests/php/save-endpoints.test.php`
- Modify: `includes/class-hd-enquiry.php` (visibility of helpers; `rest_get_design`; `rest_submit` insert), `includes/class-hd-failure-log.php:53`, `includes/class-hd-plugin.php`, `hd-door-designer.php` (require)

**Interfaces:**
- Consumes: `HD_DD_Repository::insert/update_row/get_by_token`, `HD_DD_Save_Mailer`, `HD_DD_Experiments::canonical_flow`, `HD_DD_Experiments::sanitize_ref`.
- Produces: `POST /save` → 201 `{ ok, reference, token }`; `POST /save/{token}` → 200 `{ ok }`; `POST /save/{token}/quote` → 200 `{ ok, reference, token, message }`; errors as `WP_Error( 'hd_dd_validation', …, { status: 422, fields: { email|name|postcode: message } } )`; `GET /design/{token}` → `{ design, flow, kind }`; action `hd_dd_design_saved( $payload, $id )`.

- [ ] **Step 1: Write the failing test**

Create `tests/php/save-endpoints.test.php`:

```php
<?php
/**
 * Email-only save, then the quote request that turns it into an enquiry.
 * Run: php tests/php/save-endpoints.test.php
 */
require __DIR__ . '/wp-stubs.php';

function hd_api() {
	$repo = new HD_DD_Repository();
	return new HD_DD_Save( $repo, new HD_DD_Enquiry( $repo, new HD_DD_Catalogue() ) );
}
function hd_design( $colour = 'Sage' ) {
	return array(
		'Door Type'              => array( 'label' => 'Single Door', 'id' => null ),
		'Door Design'            => array( 'label' => 'Ketu', 'id' => 12 ),
		'Door Colour (External)' => array( 'label' => $colour, 'id' => 3 ),
	);
}
function hd_save( array $over = array() ) {
	$body = array_merge( array(
		'email' => 'jo@example.com', 'hd_hp' => '', 'design' => hd_design(), 'flow' => 'swipe2',
		'pageUrl' => 'https://example.test/door-designer/',
		'experiment' => array( 'experimentId' => 'exp_20261020_aaaaaa', 'visitorId' => str_repeat( 'a', 32 ), 'arm' => 'challenger' ),
	), $over );
	return hd_api()->rest_save( hd_test_request( 'POST', '/hd-door-designer/v1/save', $body ) );
}
function hd_with_token( $token, $suffix, array $body ) {
	$r = hd_test_request( 'POST', '/hd-door-designer/v1/save/' . $token . $suffix, $body );
	$r->set_param( 'token', $token );
	return $r;
}
function hd_quote( $token, array $over = array() ) {
	return hd_api()->rest_quote( hd_with_token( $token, '/quote', array_merge( array( 'name' => 'Jo Bloggs', 'postcode' => 'al1 1aa', 'telephone' => '', 'pageUrl' => 'https://example.test/door-designer/' ), $over ) ) );
}
function hd_rows() { global $wpdb; return $wpdb->rows; }

// --- 1) Save: one row, kind save, two emails, not a conversion ------------------------------
hd_test_reset();
$conversions = 0; $saves = 0;
add_action( 'hd_dd_enquiry_submitted', function () use ( &$conversions ) { $conversions++; }, 10, 2 );
add_action( 'hd_dd_design_saved', function () use ( &$saves ) { $saves++; }, 10, 2 );
$res = hd_save( array( 'email' => '  Jo@Example.com ' ) );
check( ! is_wp_error( $res ) && 201 === $res->get_status(), 'a save with only an email is accepted' );
$row = hd_rows()[0];
check( 'save' === $row['kind'] && 'swipe2' === $row['flow'], 'stored as a save, with its flow' );
check( 'Jo@Example.com' === $row['customer_email'], 'email stored trimmed' );
check( '' === $row['customer_name'] && '' === $row['customer_postcode'] && '' === $row['customer_phone'], 'no other details yet' );
check( 'Ketu in Sage' === $row['design_name'], 'named automatically (got "' . $row['design_name'] . '")' );
$payload = json_decode( $row['payload'], true );
check( 'save' === $payload['kind'] && 'challenger' === $payload['experiment']['arm'], 'payload carries kind and the A/B arm' );
check( 0 === $conversions && 1 === $saves, 'fires hd_dd_design_saved, not the enquiry hook' );
check( 2 === count( $GLOBALS['hd_test_mail'] ), 'saver email and owner note are sent' );
$token = $res->get_data()['token'];
check( is_string( $token ) && strlen( $token ) >= 10, 'response carries the token' );

// --- 2) Bad input stores nothing -----------------------------------------------------------
hd_test_reset();
$res = hd_save( array( 'email' => 'not-an-email' ) );
check( is_wp_error( $res ) && 'hd_dd_validation' === $res->get_error_code() && isset( $res->get_error_data()['fields']['email'] ), 'a bad email is rejected by name' );
check( array() === hd_rows() && array() === $GLOBALS['hd_test_mail'], 'nothing stored or sent' );
hd_test_reset();
$res = hd_save( array( 'design' => array() ) );
check( is_wp_error( $res ) && 'hd_dd_no_design' === $res->get_error_code(), 'no design is rejected' );
hd_test_reset();
$res = hd_save( array( 'email' => array( 'x' ) ) );
check( is_wp_error( $res ), 'an array email is rejected, not a crash' );

// --- 3) Honeypot: stored and flagged, never dropped ----------------------------------------
hd_test_reset();
$res = hd_save( array( 'hd_hp' => 'autofill' ) );
check( ! is_wp_error( $res ) && 'flagged' === hd_rows()[0]['status'], 'a honeypot hit is kept and flagged' );

// --- 4) Flow: alias mapped, junk dropped ---------------------------------------------------
hd_test_reset();
hd_save( array( 'flow' => 'swipe' ) );
check( 'swipe2' === hd_rows()[0]['flow'], 'the old swipe key is stored as swipe2' );
hd_test_reset();
hd_save( array( 'flow' => '<script>' ) );
check( '' === hd_rows()[0]['flow'], 'an unknown flow is stored empty' );

// --- 5) Design changed after saving: same row, no new emails -------------------------------
hd_test_reset();
$token = hd_save()->get_data()['token'];
$mails = count( $GLOBALS['hd_test_mail'] );
$res   = hd_api()->rest_update( hd_with_token( $token, '', array( 'design' => hd_design( 'Rich Red' ) ) ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status(), 'an update is accepted' );
check( 1 === count( hd_rows() ), 'still one row' );
check( 'Ketu in Rich Red' === hd_rows()[0]['design_name'], 'design name follows the door' );
check( false !== strpos( hd_rows()[0]['design'], 'Rich Red' ) && false !== strpos( hd_rows()[0]['payload'], 'Rich Red' ), 'design and payload are updated' );
check( $mails === count( $GLOBALS['hd_test_mail'] ), 'no email for an update' );
$res = hd_api()->rest_update( hd_with_token( 'unknowntoken12', '', array( 'design' => hd_design() ) ) );
check( is_wp_error( $res ) && 404 === $res->get_error_data()['status'], 'an unknown token is a 404' );
$res = hd_api()->rest_update( hd_with_token( $token, '', array( 'design' => array() ) ) );
check( is_wp_error( $res ) && 'hd_dd_no_design' === $res->get_error_code(), 'an empty design does not wipe the saved one' );

// --- 6) Quote: the same row becomes an enquiry and converts for the stored arm -------------
hd_test_reset();
$conversions = 0; $seen = null;
add_action( 'hd_dd_enquiry_submitted', function ( $p ) use ( &$conversions, &$seen ) { $conversions++; $seen = $p; }, 10, 2 );
$save  = hd_save()->get_data();
$mails = count( $GLOBALS['hd_test_mail'] );
$res   = hd_quote( $save['token'], array( 'telephone' => '01234 567890' ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status(), 'a quote request is accepted' );
check( 1 === count( hd_rows() ), 'no second row' );
$row = hd_rows()[0];
check( 'enquiry' === $row['kind'] && 'Jo Bloggs' === $row['customer_name'] && 'AL1 1AA' === $row['customer_postcode'] && '01234 567890' === $row['customer_phone'], 'row carries the details and is now an enquiry' );
check( $save['reference'] === $res->get_data()['reference'] && $save['token'] === $res->get_data()['token'], 'same reference and token' );
check( 1 === $conversions && 'challenger' === $seen['experiment']['arm'] && 'enquiry' === $seen['kind'], 'converts once, for the arm stored at save time' );
check( 'Jo Bloggs' === $seen['customer']['name'] && 'jo@example.com' === $seen['customer']['email'], 'the payload has the full customer' );
$new = array_slice( $GLOBALS['hd_test_mail'], $mails );
check( 2 === count( $new ) && 0 === strpos( $new[0]['subject'], 'New door enquiry ' . $save['reference'] ), 'the usual enquiry email and the customer acknowledgement are sent' );

// A second tap changes nothing.
$mails = count( $GLOBALS['hd_test_mail'] );
$res   = hd_quote( $save['token'], array( 'name' => 'Someone Else' ) );
check( ! is_wp_error( $res ) && 200 === $res->get_status() && ! empty( $res->get_data()['ok'] ), 'a repeat quote call still answers ok' );
check( 1 === $conversions && 'Jo Bloggs' === hd_rows()[0]['customer_name'] && $mails === count( $GLOBALS['hd_test_mail'] ), 'and does nothing more' );

// --- 7) Quote validation -------------------------------------------------------------------
hd_test_reset();
$token = hd_save()->get_data()['token'];
foreach ( array( 'name' => '', 'postcode' => 'nope' ) as $field => $bad ) {
	$res = hd_quote( $token, array( $field => $bad ) );
	check( is_wp_error( $res ) && isset( $res->get_error_data()['fields'][ $field ] ), "a bad $field is rejected by name" );
	check( ! isset( $res->get_error_data()['fields']['telephone'] ), 'the phone is never required' );
	check( 'save' === hd_rows()[0]['kind'], "the row stays a save after a bad $field" );
}
$res = hd_quote( $token, array( 'telephone' => 'ring me after six' ) );
check( ! is_wp_error( $res ) && '' === hd_rows()[0]['customer_phone'], 'junk in the phone box does not block the quote' );
$res = hd_quote( 'unknowntoken12' );
check( is_wp_error( $res ) && 404 === $res->get_error_data()['status'], 'an unknown token is a 404' );

// --- 8) /design tells the browser the flow and kind, and nothing personal -------------------
hd_test_reset();
$token = hd_save()->get_data()['token'];
$enq   = new HD_DD_Enquiry( new HD_DD_Repository(), new HD_DD_Catalogue() );
$r     = hd_test_request( 'GET', '/hd-door-designer/v1/design/' . $token );
$r->set_param( 'token', $token );
$data = $enq->rest_get_design( $r )->get_data();
check( 'swipe2' === $data['flow'] && 'save' === $data['kind'], 'design endpoint returns flow and kind' );
check( array( 'design', 'flow', 'kind' ) === array_keys( $data ) && false === strpos( json_encode( $data ), 'example.com' ), 'and no personal data' );

// --- 9) Routes and failure logging ---------------------------------------------------------
hd_test_reset();
hd_api()->register_routes();
$routes = array_keys( $GLOBALS['hd_test_routes'] );
check( in_array( '/save', $routes, true ) && 3 === count( $routes ), 'three routes are registered' );
foreach ( $GLOBALS['hd_test_routes'] as $args ) {
	check( is_array( $args['permission_callback'] ) && 'check_nonce' === $args['permission_callback'][1], 'every save route checks the nonce' );
}
hd_test_reset();
$log  = new HD_DD_Failure_Log( new HD_DD_Repository() );
$fail = hd_test_error_to_response( hd_save( array( 'email' => 'bad' ) ) );
$log->maybe_record( $fail, null, hd_test_request( 'POST', '/hd-door-designer/v1/save', array( 'email' => 'bad', 'design' => hd_design() ) ) );
check( 1 === count( hd_rows() ) && 'failed' === hd_rows()[0]['status'], 'a failed save is logged like a failed enquiry' );

hd_test_done( 'save-endpoints.test.php' );
```

- [ ] **Step 2: Run to verify it fails** — `php tests/php/save-endpoints.test.php` → FAIL (class `HD_DD_Save` not found).

- [ ] **Step 3: Open up the enquiry helpers and extend `/design`**

In `includes/class-hd-enquiry.php` change `private function` to `public function` for exactly these eight: `resolve_design`, `build_reload_url`, `build_payload`, `store_design_image`, `sanitize_phone`, `sanitize_postcode`, `is_valid_uk_postcode`, `client_ip`. Add to the class comment: "Its validation and payload helpers are public so HD_DD_Save can reuse them."

In `rest_get_design()` replace the final return with:

```php
		return new WP_REST_Response(
			array(
				'design' => $design,
				// Which designer this was saved from, so the link reopens it there; and whether
				// a price has been asked for yet. Still no personal details.
				'flow'   => isset( $row->flow ) ? (string) $row->flow : '',
				'kind'   => ( isset( $row->kind ) && 'save' === $row->kind ) ? 'save' : 'enquiry',
			),
			200
		);
```

In `rest_submit()`, add to the array passed to `$this->repository->insert(` : `'kind' => 'enquiry',` and `'flow' => $quote_form ? 'classic' : '',`.

- [ ] **Step 4: The endpoints**

Create `includes/class-hd-save.php`:

```php
<?php
/**
 * The new designer's Review step: save a design with just an email address, then turn that
 * same record into an enquiry when the customer asks for an exact price. A save is stored
 * and emailed but is not a lead; the quote request is, and fires hd_dd_enquiry_submitted.
 *
 * @package HD_Door_Designer
 */

defined( 'ABSPATH' ) || exit;

class HD_DD_Save {

	const TOKEN = '(?P<token>[A-Za-z0-9]{10,64})';

	/** @var HD_DD_Repository */
	private $repository;

	/** @var HD_DD_Enquiry Shared validation, payload and image helpers. */
	private $enquiry;

	public function __construct( HD_DD_Repository $repository, HD_DD_Enquiry $enquiry ) {
		$this->repository = $repository;
		$this->enquiry    = $enquiry;
	}

	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		$routes = array(
			'/save'                           => 'rest_save',
			'/save/' . self::TOKEN            => 'rest_update',
			'/save/' . self::TOKEN . '/quote' => 'rest_quote',
		);
		foreach ( $routes as $route => $method ) {
			register_rest_route(
				HD_DD_REST_NS,
				$route,
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, $method ),
					'permission_callback' => array( $this->enquiry, 'check_nonce' ),
				)
			);
		}
	}

	private function params( WP_REST_Request $request ) {
		$p = $request->get_json_params();
		return is_array( $p ) ? $p : (array) $request->get_params();
	}

	private function text( array $p, $key ) {
		return ( isset( $p[ $key ] ) && is_scalar( $p[ $key ] ) ) ? (string) $p[ $key ] : '';
	}

	private function not_found() {
		return new WP_Error( 'hd_dd_design_not_found', __( 'That saved design could not be found.', 'hd-door-designer' ), array( 'status' => 404 ) );
	}

	private function no_design() {
		return new WP_Error( 'hd_dd_no_design', __( 'No door design was received. Please start again.', 'hd-door-designer' ), array( 'status' => 422 ) );
	}

	private function invalid( array $fields ) {
		return new WP_Error( 'hd_dd_validation', __( 'Please check the highlighted fields.', 'hd-door-designer' ), array( 'status' => 422, 'fields' => $fields ) );
	}

	private function design_name( array $design ) {
		$name = HD_DD_Enquiry::default_design_name( $design );
		return function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 80 ) : substr( $name, 0, 80 );
	}

	/** The stored preview PNG for a reference, as a mail attachment list. */
	private function attachments( $reference ) {
		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			return array();
		}
		$file = trailingslashit( $uploads['basedir'] ) . 'hd-door-designer/enquiries/' . sanitize_file_name( $reference ) . '.png';
		return is_file( $file ) ? array( $file ) : array();
	}

	/** POST /save — store a design against an email address. */
	public function rest_save( WP_REST_Request $request ) {
		$p     = $this->params( $request );
		$email = sanitize_email( trim( wp_unslash( $this->text( $p, 'email' ) ) ) );
		if ( ! is_email( $email ) ) {
			return $this->invalid( array( 'email' => __( 'Please enter a valid email address.', 'hd-door-designer' ) ) );
		}
		$design = $this->enquiry->resolve_design( ( isset( $p['design'] ) && is_array( $p['design'] ) ) ? $p['design'] : array() );
		if ( empty( $design ) ) {
			return $this->no_design();
		}
		// A filled hidden field is usually autofill on a real customer: keep it, flag it.
		$flagged = ! empty( $p['hd_hp'] );
		$name    = $this->design_name( $design );

		$saved = $this->repository->insert(
			array(
				'name'        => '',
				'email'       => $email,
				'telephone'   => '',
				'postcode'    => '',
				'design_name' => $name,
				'design'      => $design,
				'status'      => $flagged ? 'flagged' : 'new',
				'payload'     => array(),
				'source_ip'   => $this->enquiry->client_ip(),
				'kind'        => 'save',
				'flow'        => HD_DD_Experiments::canonical_flow( $this->text( $p, 'flow' ) ),
			)
		);
		if ( is_wp_error( $saved ) ) {
			return new WP_Error( 'hd_dd_save_failed', __( 'Sorry, we could not save your design. Please try again.', 'hd-door-designer' ), array( 'status' => 500 ) );
		}

		$image   = $this->enquiry->store_design_image( $saved['reference'], $this->text( $p, 'image' ) );
		$payload = $this->enquiry->build_payload( $saved['reference'], array( 'name' => '', 'telephone' => '', 'email' => $email, 'postcode' => '' ), $design, $name );
		$payload['kind'] = 'save';
		if ( $image ) {
			$payload['image'] = $image['url'];
		}
		if ( $flagged ) {
			$payload['flags'] = array( 'honeypot' );
		}
		// Kept on the record: a later quote request converts for the arm they were in today.
		$experiment = isset( $p['experiment'] ) ? HD_DD_Experiments::sanitize_ref( $p['experiment'] ) : null;
		if ( $experiment ) {
			$payload['experiment'] = $experiment;
		}
		$this->repository->update_payload( $saved['id'], $payload );

		HD_DD_Save_Mailer::send_owner_saved( $payload, HD_DD_Plugin::settings()['recipient_email'], $image ? array( $image['path'] ) : array() );
		HD_DD_Save_Mailer::send_saver( $payload, $this->enquiry->build_reload_url( $this->text( $p, 'pageUrl' ), $saved['token'] ) );

		/** Fires after a design is saved by email (not an enquiry yet). */
		do_action( 'hd_dd_design_saved', $payload, $saved['id'] );

		return new WP_REST_Response( array( 'ok' => true, 'reference' => $saved['reference'], 'token' => $saved['token'] ), 201 );
	}

	/** POST /save/{token} — the saved design was changed. */
	public function rest_update( WP_REST_Request $request ) {
		$row = $this->repository->get_by_token( (string) $request['token'] );
		if ( ! $row ) {
			return $this->not_found();
		}
		if ( 'save' !== ( isset( $row->kind ) ? $row->kind : 'enquiry' ) ) {
			return new WP_Error( 'hd_dd_already_enquiry', __( 'That design has already been sent to us.', 'hd-door-designer' ), array( 'status' => 409 ) );
		}
		$p      = $this->params( $request );
		$design = $this->enquiry->resolve_design( ( isset( $p['design'] ) && is_array( $p['design'] ) ) ? $p['design'] : array() );
		if ( empty( $design ) ) {
			return $this->no_design();
		}
		$name    = $this->design_name( $design );
		$payload = json_decode( (string) $row->payload, true );
		$payload = is_array( $payload ) ? $payload : array();
		$payload['design']     = $design;
		$payload['designName'] = $name;
		$image = $this->enquiry->store_design_image( $row->reference, $this->text( $p, 'image' ) );
		if ( $image ) {
			$payload['image'] = $image['url'];
		}
		$this->repository->update_row( $row->id, array( 'design' => $design, 'design_name' => $name, 'payload' => $payload ) );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/** POST /save/{token}/quote — the saver asks for an exact price: this is the enquiry. */
	public function rest_quote( WP_REST_Request $request ) {
		$row = $this->repository->get_by_token( (string) $request['token'] );
		if ( ! $row ) {
			return $this->not_found();
		}
		$done = array( 'ok' => true, 'reference' => $row->reference, 'token' => $row->token, 'message' => __( 'Thank you. Your price is on its way.', 'hd-door-designer' ) );
		if ( 'save' !== ( isset( $row->kind ) ? $row->kind : 'enquiry' ) ) {
			return new WP_REST_Response( $done, 200 ); // a second tap: already an enquiry.
		}

		$p         = $this->params( $request );
		$name      = sanitize_text_field( wp_unslash( $this->text( $p, 'name' ) ) );
		$postcode  = $this->enquiry->sanitize_postcode( $this->text( $p, 'postcode' ) );
		$telephone = $this->enquiry->sanitize_phone( $this->text( $p, 'telephone' ) );
		$errors    = array();
		if ( '' === $name ) {
			$errors['name'] = __( 'Please enter your name.', 'hd-door-designer' );
		}
		if ( ! $this->enquiry->is_valid_uk_postcode( $postcode ) ) {
			$errors['postcode'] = __( 'Please enter a valid UK postcode.', 'hd-door-designer' );
		}
		if ( $errors ) {
			return $this->invalid( $errors );
		}

		$payload = json_decode( (string) $row->payload, true );
		$payload = is_array( $payload ) ? $payload : array();
		$payload['kind']        = 'enquiry';
		$payload['submittedAt'] = gmdate( 'c' );
		$payload['customer']    = array( 'name' => $name, 'telephone' => $telephone, 'email' => (string) $row->customer_email, 'postcode' => $postcode );

		$this->repository->update_row(
			$row->id,
			array( 'customer_name' => $name, 'customer_phone' => $telephone, 'customer_postcode' => $postcode, 'kind' => 'enquiry', 'payload' => $payload )
		);

		HD_DD_Mailer::send( $payload, HD_DD_Plugin::settings()['recipient_email'], $this->attachments( $row->reference ) );
		HD_DD_Mailer::send_customer_ack( $payload, $this->enquiry->build_reload_url( $this->text( $p, 'pageUrl' ), $row->token ), false );

		/** The same hook an enquiry fires: this is the lead, and the A/B conversion. */
		do_action( 'hd_dd_enquiry_submitted', $payload, (int) $row->id );

		return new WP_REST_Response( $done, 200 );
	}
}
```

Note for the junk-phone test: `sanitize_phone()` strips everything but digits and phone punctuation, so "ring me after six" becomes an empty string.

- [ ] **Step 5: Wire it in**

- `hd-door-designer.php`: add `require_once HD_DD_DIR . 'includes/class-hd-save.php';` after the `class-hd-enquiry.php` require (and to `tests/php/wp-stubs.php`'s require list if it has one).
- `includes/class-hd-plugin.php`: add a property `/** @var HD_DD_Save */ public $save;`, then after `$this->enquiry = …;` add `$this->save = new HD_DD_Save( $this->repository, $this->enquiry );` and after `$this->enquiry->register();` add `$this->save->register();`.
- `includes/class-hd-failure-log.php` line 53: replace the route comparison so the three save routes are logged too:

```php
		if ( 'POST' !== $request->get_method() || ! preg_match( '#^/' . preg_quote( HD_DD_REST_NS, '#' ) . '/(enquiry|save(/[A-Za-z0-9]{10,64}(/quote)?)?)$#', (string) $request->get_route() ) ) {
```

  and change that file's opening comment from "every enquiry POST" to "every enquiry or save POST".

- [ ] **Step 6: Run** `php tests/php/run.php` → all pass.

- [ ] **Step 7: Commit**

```bash
git add includes hd-door-designer.php tests/php
git commit -m "feat(save): email-only save, design update and quote endpoints on one record"
```

---

### Task 9: The two-step form (`review-save.js`)

**Files:**
- Create: `assets/js/swipe/review-save.js`, `tests/js/review-save.test.js`
- Modify: `includes/class-hd-assets.php` (register the script)

**Interfaces:**
- Consumes: `HD_DD_Enquiry.cleanDesign(design)`, `HD_DD_Enquiry.snapshot(canvas)`; `api(path, { method, body }) → Promise<{ ok, status, body }>`.
- Produces: `HD_DD_ReviewSave.create(o) → { render(container), saved() → bool, focus(), reset() }` where `o = { api, cfg, flow, token, pageUrl, getDesign(), getCanvas(), experiment(), onSaved(result), onQuoted(result, image) }`; pure helpers `HD_DD_ReviewSave.validEmail(s)`, `.cleanEmail(s)`, `.designKey(design)`; `HD_DD_ReviewSave.COPY`.

- [ ] **Step 1: Write the failing test**

Create `tests/js/review-save.test.js`:

```js
// The Review step's two-step form: email first, then the details for an exact price.
// `node tests/js/review-save.test.js`
var assert = require('assert');

function node(tag) {
  var n = {
    tag: tag, className: '', textContent: '', value: '', children: [], attrs: {}, listeners: {}, parentNode: null, focused: 0,
    appendChild: function (c) { c.parentNode = n; n.children.push(c); return c; },
    addEventListener: function (type, fn) { n.listeners[type] = fn; },
    setAttribute: function (k, v) { n.attrs[k] = v; },
    focus: function () { n.focused++; }
  };
  Object.defineProperty(n, 'innerHTML', { set: function () { n.children = []; }, get: function () { return ''; } });
  return n;
}
global.document = { createElement: node };
global.window = { location: { origin: 'https://example.test', pathname: '/door-designer/' } };
var RS = require('../../assets/js/swipe/review-save.js');

function find(n, cls) {
  if (n.className === cls) { return n; }
  for (var i = 0; i < n.children.length; i++) { var r = find(n.children[i], cls); if (r) { return r; } }
  return null;
}
function input(n, name) {
  if (n.tag === 'input' && n.name === name) { return n; }
  for (var i = 0; i < n.children.length; i++) { var r = input(n.children[i], name); if (r) { return r; } }
  return null;
}
function text(n) { return n.textContent + n.children.map(text).join(''); }
function tick() { return new Promise(function (r) { setImmediate(r); }); }
function submit(box) { find(box, 'hd-dd__form').listeners.submit({ preventDefault: function () {} }); }

// ---- Pure helpers ---------------------------------------------------------------------
assert.strictEqual(RS.cleanEmail('  Jo@Example.com '), 'Jo@Example.com');
['jo@example.com', ' Jo@Example.co.uk ', 'a.b+c@d-e.org'].forEach(function (e) { assert.ok(RS.validEmail(e), e); });
['', 'jo', 'jo@', 'jo@example', 'jo example@x.com', '@x.com', null, undefined].forEach(function (e) { assert.ok(!RS.validEmail(e), String(e)); });
assert.strictEqual(RS.designKey({ A: { label: 'x' }, _ui: 1 }), RS.designKey({ A: { label: 'x' } }), 'UI-only keys do not count as a change');
assert.notStrictEqual(RS.designKey({ A: { label: 'x' } }), RS.designKey({ A: { label: 'y' } }));
assert.strictEqual(RS.COPY.saveButton, 'Email me my design');
assert.strictEqual(RS.COPY.quoteButton, 'Get my exact price');

function harness(over) {
  var h = { calls: [], saved: [], quoted: [], design: { 'Door Design': { label: 'Ketu', id: 1 } }, reply: null };
  h.api = function (path, opts) {
    h.calls.push([path, JSON.parse(opts.body)]);
    var r = typeof h.reply === 'function' ? h.reply(path) : h.reply;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  var o = {
    api: h.api, cfg: { restUrl: 'https://example.test/wp-json/x/' }, flow: 'swipe2',
    getDesign: function () { return h.design; }, getCanvas: function () { return null; },
    experiment: function () { return { experimentId: 'exp_1', visitorId: 'v', arm: 'challenger' }; },
    onSaved: function (r) { h.saved.push(r); }, onQuoted: function (r, img) { h.quoted.push([r, img]); }
  };
  Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
  h.rs = RS.create(o);
  h.box = node('div');
  h.rs.render(h.box);
  return h;
}
var OK_SAVE = { ok: true, status: 201, body: { ok: true, reference: 'HD-1', token: 'tok1234567890' } };
var OK_QUOTE = { ok: true, status: 200, body: { ok: true, reference: 'HD-1', token: 'tok1234567890' } };

(async function () {
  // ---- Step 1 shows one field ---------------------------------------------------------
  var h = harness();
  assert.ok(input(h.box, 'email'), 'step 1 has an email field');
  assert.strictEqual(input(h.box, 'name'), null, 'and no name field yet');
  assert.strictEqual(find(h.box, 'hd-dd__submit').textContent, 'Email me my design');
  assert.strictEqual(h.rs.saved(), false);

  // A bad address: a message, no request.
  input(h.box, 'email').value = 'not-an-email';
  submit(h.box);
  assert.strictEqual(h.calls.length, 0);
  assert.strictEqual(find(h.box, 'hd-dd__form-error').textContent, 'Please enter a valid email address.');

  // A good address with stray spaces: one POST, trimmed, with flow, design and experiment.
  h.reply = OK_SAVE;
  input(h.box, 'email').value = '  Jo@Example.com ';
  submit(h.box);
  submit(h.box); // double tap while the first is in flight
  assert.strictEqual(h.calls.length, 1, 'a double tap sends one request');
  assert.strictEqual(find(h.box, 'hd-dd__submit').disabled, true, 'button disabled while sending');
  assert.strictEqual(h.calls[0][0], 'save');
  assert.strictEqual(h.calls[0][1].email, 'Jo@Example.com');
  assert.strictEqual(h.calls[0][1].flow, 'swipe2');
  assert.strictEqual(h.calls[0][1].pageUrl, 'https://example.test/door-designer/');
  assert.deepStrictEqual(h.calls[0][1].design, { 'Door Design': { label: 'Ketu', id: 1 } });
  assert.strictEqual(h.calls[0][1].experiment.arm, 'challenger');
  await tick();
  assert.strictEqual(h.saved.length, 1);
  assert.strictEqual(h.rs.saved(), true);

  // ---- Step 2 replaces step 1 -----------------------------------------------------------
  assert.strictEqual(input(h.box, 'email'), null, 'the email field is gone');
  assert.ok(input(h.box, 'name') && input(h.box, 'postcode') && input(h.box, 'telephone'));
  assert.strictEqual(find(h.box, 'hd-dd__submit').textContent, 'Get my exact price');
  assert.ok(text(h.box).indexOf('We\u2019ll send it within one working day.') !== -1);
  assert.ok(text(h.box).indexOf('Saved.') !== -1);

  // Empty name: a message, no request.
  submit(h.box);
  assert.strictEqual(h.calls.length, 1);

  // Server rejects the postcode: the message lands on that field and the typed values stay.
  h.reply = { ok: false, status: 422, body: { message: 'Please check the highlighted fields.', data: { fields: { postcode: 'Please enter a valid UK postcode.' } } } };
  input(h.box, 'name').value = 'Jo Bloggs';
  input(h.box, 'postcode').value = 'nope';
  submit(h.box);
  await tick();
  assert.strictEqual(h.calls[1][0], 'save/tok1234567890/quote');
  assert.strictEqual(input(h.box, 'name').value, 'Jo Bloggs', 'typed values survive a failure');
  assert.ok(text(h.box).indexOf('Please enter a valid UK postcode.') !== -1);
  assert.strictEqual(h.quoted.length, 0);
  assert.strictEqual(find(h.box, 'hd-dd__submit').disabled, false, 'button re-enabled after a failure');

  // The network drops: a plain message, values kept.
  h.reply = new Error('offline');
  input(h.box, 'postcode').value = 'AL1 1AA';
  submit(h.box);
  await tick();
  assert.ok(text(h.box).indexOf('Something went wrong') !== -1);
  assert.strictEqual(input(h.box, 'postcode').value, 'AL1 1AA');

  // Success: onQuoted, with what was typed.
  h.reply = OK_QUOTE;
  input(h.box, 'telephone').value = '01234 567890';
  submit(h.box);
  await tick();
  var last = h.calls[h.calls.length - 1];
  assert.deepStrictEqual(last, ['save/tok1234567890/quote', { name: 'Jo Bloggs', postcode: 'AL1 1AA', telephone: '01234 567890', pageUrl: 'https://example.test/door-designer/' }]);
  assert.strictEqual(h.quoted.length, 1);

  // ---- The design changed after saving: the same record is updated, once -------------------
  h = harness();
  h.reply = OK_SAVE;
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  await tick();
  h.rs.render(h.box);
  assert.strictEqual(h.calls.length, 1, 'no update when nothing changed');
  h.design = { 'Door Design': { label: 'Vinson', id: 2 } };
  h.reply = { ok: true, status: 200, body: { ok: true } };
  h.rs.render(h.box);
  assert.strictEqual(h.calls[1][0], 'save/tok1234567890');
  assert.deepStrictEqual(h.calls[1][1].design, { 'Door Design': { label: 'Vinson', id: 2 } });
  await tick();
  h.rs.render(h.box);
  assert.strictEqual(h.calls.length, 2, 'the update is sent once');
  assert.ok(input(h.box, 'name'), 'still on step 2');

  // ---- Save fails: stay on step 1 with the address still typed -----------------------------
  h = harness();
  h.reply = { ok: false, status: 422, body: { message: 'Please check the highlighted fields.', data: { fields: { email: 'Please enter a valid email address.' } } } };
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  await tick();
  assert.strictEqual(h.rs.saved(), false);
  assert.strictEqual(input(h.box, 'email').value, 'jo@example.com');
  assert.strictEqual(find(h.box, 'hd-dd__form-error').textContent, 'Please enter a valid email address.');
  assert.strictEqual(h.saved.length, 0);

  // ---- A returning saver starts at step 2 -------------------------------------------------
  h = harness({ token: 'tokreturning1234' });
  assert.strictEqual(h.rs.saved(), true);
  assert.ok(input(h.box, 'name'));
  assert.strictEqual(h.calls.length, 0, 'opening a saved design sends nothing');
  assert.ok(text(h.box).indexOf('Saved.') === -1, 'no "just saved" line for a return visit');
  h.rs.focus();
  assert.strictEqual(input(h.box, 'name').focused, 1);

  // ---- "Design another door": back to step 1 with what we know already filled in ------------
  h = harness();
  h.reply = OK_SAVE;
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  await tick();
  h.rs.reset();
  h.rs.render(h.box);
  assert.strictEqual(h.rs.saved(), false);
  assert.strictEqual(input(h.box, 'email').value, 'jo@example.com');

  // ---- QA harness (no REST URL): nothing is posted -----------------------------------------
  h = harness({ cfg: {} });
  input(h.box, 'email').value = 'jo@example.com';
  submit(h.box);
  assert.strictEqual(h.calls.length, 0);

  console.log('review-save.test.js: all assertions passed');
})().catch(function (e) { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run to verify it fails** — `node tests/js/review-save.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `assets/js/swipe/review-save.js`:

```js
// assets/js/swipe/review-save.js
// The Review step's form in the swipe flow, in two small steps on one record:
//   1. "Email me my design" — an email address only. The design is saved at once.
//   2. "Get my exact price" — name and postcode (phone optional). This is the enquiry.
// If the design is changed after step 1, the saved record is updated the next time the
// form is drawn. What the visitor typed is kept through failures and re-draws.
//
//   var rs = HD_DD_ReviewSave.create({ api, cfg, flow, token, getDesign(), getCanvas(),
//     experiment(), onSaved(result), onQuoted(result, imageDataUrl) });
//   rs.render(container); rs.saved(); rs.focus(); rs.reset();
(function (root, factory) {
	if (typeof module === 'object' && module.exports) { module.exports = factory(require('../enquiry.js')); }
	else { root.HD_DD_ReviewSave = factory(root.HD_DD_Enquiry); }
}(typeof self !== 'undefined' ? self : this, function (Enquiry) {
	'use strict';

	var COPY = {
		saveTitle: 'Email me my design',
		saveButton: 'Email me my design',
		saveNote: 'We\u2019ll send a link so you can come back to it any time.',
		savedLine: 'Saved. We\u2019ve emailed you the link.',
		quoteTitle: 'Want your exact fitted price? We\u2019ll send it within one working day.',
		quoteButton: 'Get my exact price',
		postcodeHint: 'So we can check we cover you and price the fitting.',
		consent: 'By asking for a price you\u2019re agreeing we can use your details to send it and get in touch about your door.',
		badEmail: 'Please enter a valid email address.',
		noName: 'Please enter your name.',
		noPostcode: 'Please enter your postcode.',
		failed: 'Something went wrong. Please try again.',
		expired: 'Your session had expired. Please reload the page and try again.',
		preview: 'Preview mode \u2014 not sent.'
	};

	function el(tag, cls, txt) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (txt != null) { n.textContent = txt; }
		return n;
	}

	function cleanEmail(s) { return String(s == null ? '' : s).trim(); }
	function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail(s)); }
	function designKey(design) { return JSON.stringify(Enquiry.cleanDesign(design || {})); }

	// One labelled input with its own error line.
	function field(form, label, type, name, autocomplete, value, hint) {
		var row = el('label', 'hd-dd__form-row');
		row.appendChild(el('span', 'hd-dd__form-label', label));
		var input = document.createElement('input');
		input.className = 'hd-dd__form-input';
		input.type = type;
		input.name = name;
		input.value = value || '';
		input.setAttribute('autocomplete', autocomplete);
		row.appendChild(input);
		if (hint) { row.appendChild(el('span', 'hd-sw-save__hint', hint)); }
		var error = el('span', 'hd-dd__form-error');
		row.appendChild(error);
		form.appendChild(row);
		return { input: input, error: error };
	}

	function create(o) {
		var cfg = o.cfg || {};
		var token = o.token || null;
		var savedKey = token ? designKey(o.getDesign()) : null;
		var justSaved = false;   // saved in this visit (as opposed to opened from the emailed link)
		var busy = false;
		var box = null;
		var first = null;        // the first input on screen, for focus()
		var image = null;        // the door snapshot sent with the save, for the thank-you screen
		var values = { email: '', name: '', postcode: '', telephone: '' };

		function pageUrl() { return o.pageUrl || (window.location.origin + window.location.pathname); }
		function post(path, body) { return o.api(path, { method: 'POST', body: JSON.stringify(body) }); }
		function snapshot() {
			var s = Enquiry.snapshot(o.getCanvas ? o.getCanvas() : null);
			if (s) { image = s; }
			return s;
		}

		function form(title) {
			var f = document.createElement('form');
			f.className = 'hd-dd__form';
			f.setAttribute('novalidate', 'novalidate');
			f.appendChild(el('div', 'hd-sw-save__title', title));
			return f;
		}

		function button(f, label) {
			var b = el('button', 'hd-dd__submit', label);
			b.type = 'submit';
			f.appendChild(b);
			return b;
		}

		function status(f) {
			var s = el('div', 'hd-dd__form-status');
			s.setAttribute('role', 'status');
			s.setAttribute('aria-live', 'polite');
			f.appendChild(s);
			return s;
		}

		// Show what went wrong: field messages where the server named a field, else one line.
		function fail(res, fields, statusEl) {
			var errs = res && res.body && res.body.data && res.body.data.fields;
			var shown = false;
			if (errs) {
				Object.keys(errs).forEach(function (k) {
					if (fields[k]) { fields[k].error.textContent = errs[k]; shown = true; }
				});
			}
			if (shown) { return; }
			var expired = !!(res && typeof window !== 'undefined' && window.HD_DD_ApiClient && window.HD_DD_ApiClient.isNonceFailure && window.HD_DD_ApiClient.isNonceFailure(res));
			statusEl.textContent = expired ? COPY.expired : ((res && res.body && res.body.message) || COPY.failed);
		}

		// Send one request with the button locked, then hand the reply to done(ok, res).
		function send(btn, statusEl, path, body, done) {
			if (!cfg.restUrl) { statusEl.textContent = COPY.preview; return; }
			busy = true;
			btn.disabled = true;
			statusEl.textContent = '\u2026';
			function finish(res) {
				busy = false;
				btn.disabled = false;
				statusEl.textContent = '';
				done(!!(res && res.ok && res.body && res.body.ok), res);
			}
			post(path, body).then(finish, function () { finish(null); });
		}

		// ---- Step 1: email only -----------------------------------------------------------
		function stepOne(container) {
			var f = form(COPY.saveTitle);
			var email = field(f, 'Email', 'email', 'email', 'email', values.email);
			first = email.input;
			var hp = document.createElement('input'); // honeypot: bots fill it, people never see it
			hp.type = 'text'; hp.name = 'hd_hp'; hp.className = 'hd-dd__hp'; hp.tabIndex = -1;
			hp.setAttribute('autocomplete', 'off');
			hp.setAttribute('aria-hidden', 'true');
			f.appendChild(hp);
			var btn = button(f, COPY.saveButton);
			f.appendChild(el('div', 'hd-dd__form-trust', COPY.saveNote));
			var statusEl = status(f);

			f.addEventListener('submit', function (e) {
				e.preventDefault();
				if (busy) { return; }
				values.email = cleanEmail(email.input.value);
				email.error.textContent = '';
				if (!validEmail(values.email)) { email.error.textContent = COPY.badEmail; return; }
				var body = { email: values.email, design: Enquiry.cleanDesign(o.getDesign()), pageUrl: pageUrl(), flow: o.flow || '', hd_hp: hp.value || '' };
				var exp = o.experiment ? o.experiment() : null;
				if (exp) { body.experiment = exp; }
				var shot = snapshot();
				if (shot) { body.image = shot; }
				var key = designKey(o.getDesign());
				send(btn, statusEl, 'save', body, function (ok, res) {
					if (!ok || !res.body.token) { fail(res, { email: email }, statusEl); return; }
					token = res.body.token;
					savedKey = key;
					justSaved = true;
					if (o.onSaved) { o.onSaved(res.body); }
					if (box) { render(box); }
				});
			});
			container.appendChild(f);
		}

		// ---- Step 2: the details for an exact price ------------------------------------------
		function stepTwo(container) {
			if (justSaved) { container.appendChild(el('div', 'hd-sw-save__done', COPY.savedLine)); }
			var f = form(COPY.quoteTitle);
			var fields = {
				name: field(f, 'Your name', 'text', 'name', 'name', values.name),
				postcode: field(f, 'Post code', 'text', 'postcode', 'postal-code', values.postcode, COPY.postcodeHint),
				telephone: field(f, 'Phone (optional)', 'tel', 'telephone', 'tel', values.telephone)
			};
			first = fields.name.input;
			var btn = button(f, COPY.quoteButton);
			f.appendChild(el('div', 'hd-dd__form-consentline', COPY.consent));
			var statusEl = status(f);

			f.addEventListener('submit', function (e) {
				e.preventDefault();
				if (busy) { return; }
				Object.keys(fields).forEach(function (k) {
					values[k] = String(fields[k].input.value || '').trim();
					fields[k].error.textContent = '';
				});
				if (!values.name) { fields.name.error.textContent = COPY.noName; return; }
				if (!values.postcode) { fields.postcode.error.textContent = COPY.noPostcode; return; }
				var body = { name: values.name, postcode: values.postcode, telephone: values.telephone, pageUrl: pageUrl() };
				send(btn, statusEl, 'save/' + encodeURIComponent(token) + '/quote', body, function (ok, res) {
					if (!ok) { fail(res, fields, statusEl); return; }
					if (o.onQuoted) { o.onQuoted(res.body, image); }
				});
			});
			container.appendChild(f);
		}

		// The design was changed after it was saved: bring the saved record up to date.
		function sync() {
			var key = designKey(o.getDesign());
			if (key === savedKey || busy || !cfg.restUrl) { return; }
			savedKey = key;
			var body = { design: Enquiry.cleanDesign(o.getDesign()) };
			var shot = snapshot();
			if (shot) { body.image = shot; }
			function retryLater() { savedKey = null; }
			post('save/' + encodeURIComponent(token), body).then(function (res) { if (!(res && res.ok)) { retryLater(); } }, retryLater);
		}

		function render(container) {
			box = container;
			container.innerHTML = '';
			if (token) { sync(); stepTwo(container); } else { stepOne(container); }
		}

		return {
			render: render,
			saved: function () { return !!token; },
			focus: function () { if (first && first.focus) { first.focus(); } },
			// "Design another door": a new design starts unsaved; what we know stays filled in.
			reset: function () { token = null; savedKey = null; justSaved = false; image = null; }
		};
	}

	return { create: create, COPY: COPY, cleanEmail: cleanEmail, validEmail: validEmail, designKey: designKey };
}));
```

- [ ] **Step 4: Run** `node tests/js/review-save.test.js` → PASS. Then `node tests/js/copy-rule.test.js` → PASS.

- [ ] **Step 5: Register the script**

In `includes/class-hd-assets.php`, after the `foreach ( $swipe as … )` loop add:

```php
		// The Review step's two-step form (email first, then the details for a price).
		wp_register_script( self::HANDLE . '-reviewsave', HD_DD_URL . 'assets/js/swipe/review-save.js', array( self::HANDLE . '-enquiry' ), $ver_js, true );
```

and add `self::HANDLE . '-reviewsave'` to the `-swipeview` dependency list.

- [ ] **Step 6: Commit**

```bash
git add assets/js/swipe/review-save.js tests/js/review-save.test.js includes/class-hd-assets.php
git commit -m "feat(swipe): two-step save form — email first, then details for an exact price"
```

---

### Task 10: The new Review screen

**Files:**
- Modify: `assets/js/swipe/swipe-parts.js`, `assets/js/trust.js`, `assets/js/enquiry.js` (`renderSuccess` only), `assets/js/swipe/swipe-view.js`, `assets/js/swipe/swipe-app.js`, `assets/css/hd-swipe.css`
- Rewrite: `tests/js/trust.test.js`
- Create: `tests/js/review-summary.test.js`
- Modify: `tests/js/swipe-wiring.test.js`, `tests/js/control-arm.test.js`, `tools/swipe-test.html` (script tags)

**Interfaces:**
- Consumes: `HD_DD_ReviewSave.create`, `HD_DD_CONFIG.trust.guidePrice`, funnel step `saved`, `GET design/{token}` → `{ design, flow, kind }`.
- Produces: `HD_DD_SwipeParts.reviewSummary(rows) → string`; `HD_DD_Trust.renderProof(container, trust, rand)`; `HD_DD_Enquiry.create(...).renderSuccess(container, result, onAgain, image)` (4th argument optional); `app.savedToken`, `app.focusSave`.

- [ ] **Step 1: Write the failing tests**

Create `tests/js/review-summary.test.js`:

```js
// The one-line summary at the top of the Review step. `node tests/js/review-summary.test.js`
var assert = require('assert');
global.document = { createElement: function () { return {}; } };
var P = require('../../assets/js/swipe/swipe-parts.js');

var rows = [
  { name: 'Design', value: 'Abbott' }, { name: 'Door type', value: 'Single' }, { name: 'Hinge', value: 'Hinges on Left' },
  { name: 'Colour', value: 'Anthracite Grey' }, { name: 'Inside colour', value: 'White' }, { name: 'Glass', value: 'Satin' },
  { name: 'Hardware', value: 'Chrome' }, { name: 'Handle', value: 'Lever/Lever' }
];
assert.strictEqual(P.reviewSummary(rows), 'Abbott \u00b7 Anthracite Grey \u00b7 Satin glass \u00b7 Chrome hardware');
// A solid door has no glass to name.
assert.strictEqual(P.reviewSummary([{ name: 'Design', value: 'Ben Nevis' }, { name: 'Colour', value: 'Sage' }, { name: 'Glass', value: 'Unglazed' }]), 'Ben Nevis \u00b7 Sage \u00b7 Solid');
// Missing rows are skipped, not shown as blanks.
assert.strictEqual(P.reviewSummary([{ name: 'Design', value: 'Ketu' }]), 'Ketu');
assert.strictEqual(P.reviewSummary([{ name: 'Design', value: 'Ketu' }, { name: 'Colour', value: '' }]), 'Ketu');
assert.strictEqual(P.reviewSummary([]), '');
assert.strictEqual(P.reviewSummary(undefined), '');

console.log('review-summary.test.js: all assertions passed');
```

Replace `tests/js/trust.test.js` with:

```js
// Review-step social proof: the rating line and one real customer quote. `node tests/js/trust.test.js`
var assert = require('assert');

function node(tag) {
  return {
    tag: tag, className: '', textContent: '', children: [], attrs: {},
    appendChild: function (c) { this.children.push(c); return c; },
    setAttribute: function (k, v) { this.attrs[k] = v; }
  };
}
global.document = { createElement: node };
var Trust = require('../../assets/js/trust.js');

function find(n, cls) {
  if (n.className === cls) { return n; }
  for (var i = 0; i < n.children.length; i++) { var r = find(n.children[i], cls); if (r) { return r; } }
  return null;
}
function text(n) { return n.textContent + n.children.map(text).join(''); }

var full = { rating: '10', count: '79', url: 'https://www.checkatrade.com/trades/x', quotes: [{ text: 'Tidy job', by: 'Checkatrade review, Hitchin' }, { text: 'Lovely door', by: '' }] };

// Rating line needs both a rating and a count; only http(s) links are used.
assert.deepStrictEqual(Trust.ratingLine(full), { text: '\u2605 10/10 on Checkatrade \u00b7 79 reviews', url: 'https://www.checkatrade.com/trades/x' });
assert.strictEqual(Trust.ratingLine({ rating: '10', count: '' }), null);
assert.strictEqual(Trust.ratingLine({ rating: '', count: '79' }), null);
assert.strictEqual(Trust.ratingLine(undefined), null);
assert.strictEqual(Trust.ratingLine({ rating: '10', count: '79', url: 'javascript:alert(1)' }).url, '');

// One quote, chosen by the random source; never out of range; junk entries skipped.
assert.strictEqual(Trust.pickQuote(full, function () { return 0; }).text, 'Tidy job');
assert.strictEqual(Trust.pickQuote(full, function () { return 1; }).text, 'Lovely door');
assert.strictEqual(Trust.pickQuote({ quotes: [] }), null);
assert.strictEqual(Trust.pickQuote(undefined), null);
assert.strictEqual(Trust.pickQuote({ quotes: [null, { text: '' }, { text: 'Good', by: '' }] }, function () { return 0; }).text, 'Good');

// Proof block: linked rating and a quote with its attribution — and nothing else.
var c = node('div');
var box = Trust.renderProof(c, full, function () { return 0; });
assert.strictEqual(box.className, 'hd-dd__trust');
var rating = find(c, 'hd-dd__trust-rating');
assert.strictEqual(rating.tag, 'a');
assert.strictEqual(rating.href, 'https://www.checkatrade.com/trades/x');
assert.strictEqual(rating.rel, 'noopener');
assert.ok(text(find(c, 'hd-dd__trust-quote')).indexOf('Tidy job') !== -1);
assert.ok(text(find(c, 'hd-dd__trust-quote')).indexOf('Checkatrade review, Hitchin') !== -1);
assert.strictEqual(find(c, 'hd-dd__trust-benefits'), null, 'the old benefits list is gone');

// No attribution: no attribution line. No link: plain text.
c = node('div');
Trust.renderProof(c, full, function () { return 0.99; });
assert.strictEqual(find(c, 'hd-dd__trust-quote').children.length, 1);
c = node('div');
Trust.renderProof(c, { rating: '10', count: '79', url: '', quotes: [] });
assert.strictEqual(find(c, 'hd-dd__trust-rating').tag, 'div');
assert.strictEqual(find(c, 'hd-dd__trust-quote'), null);

// Nothing configured: nothing is added to the page at all.
[undefined, {}, { rating: '', count: '', url: '', quotes: [] }].forEach(function (t) {
  var b = node('div');
  assert.strictEqual(Trust.renderProof(b, t), null);
  assert.strictEqual(b.children.length, 0);
});

assert.strictEqual(Trust.render, undefined, 'the benefits block is retired');
assert.strictEqual(Trust.renderSaveBar, undefined, 'the top save bar is retired');

console.log('trust.test.js: all assertions passed');
```

Append to `tests/js/swipe-wiring.test.js` before its final `console.log`:

```js
// ---- Review screen: reveal, summary, price, proof, two-step form ------------------------
assert.ok(view.indexOf('window.HD_DD_ReviewSave.create(') !== -1, 'Review uses the two-step form');
assert.ok(view.indexOf('P.reviewSummary(') !== -1, 'one-line summary');
assert.ok(view.indexOf('See all options / edit') !== -1, 'the full list is one tap away');
assert.ok(view.indexOf('guidePrice') !== -1, 'guide price is shown');
assert.ok(view.indexOf('HD_DD_Trust.renderProof(') !== -1, 'rating and quote');
assert.ok(view.indexOf('renderSaveBar') === -1 && view.indexOf('savebar') === -1, 'no button above the door');
assert.ok(view.indexOf("'Email me my design'") !== -1, 'floating button on phones');
assert.ok(view.indexOf("app.funnel.step('saved')") !== -1, 'saved is reported');
assert.ok(view.indexOf('app.funnel.lead()') !== -1, 'the quote request is the lead');
assert.ok(app.indexOf("'form'") === -1 && app.indexOf("'details'") === -1, 'the separate form screen is gone');
assert.ok(app.indexOf('self.savedToken = token') !== -1, 'a returning saver goes straight to step 2');
assert.ok(css.indexOf('.hd-sw-summary') !== -1 && css.indexOf('.hd-sw-price') !== -1 && css.indexOf('.hd-sw-savebox') !== -1, 'review styles');
assert.ok(css.indexOf('hd-dd__savebar') === -1, 'the save bar styles are removed');
assert.ok(assets.indexOf("'-reviewsave'") !== -1, 'review-save.js is registered');
```

In `tests/js/control-arm.test.js` replace the final block (the `['HD_DD_Trust.render(', …].forEach(…)` assertion) with:

```js
// And the swipe flow is the one carrying the new work.
['HD_DD_Trust.renderProof(', 'window.HD_DD_ReviewSave.create(', 'window.HD_DD_Enquiry.create('].forEach(function (s) {
  assert.ok(swipe.indexOf(s) !== -1, 'swipe flow has ' + s);
});
// The control never reports anything but its own funnel's steps from its own files.
['HD_DD_ReviewSave', 'door-designer-v3', "'browsed'"].forEach(function (s) {
  assert.ok(classic.indexOf(s) === -1 && review.indexOf(s) === -1 && quote.indexOf(s) === -1, 'classic has no "' + s + '"');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/js/review-summary.test.js; node tests/js/trust.test.js; node tests/js/swipe-wiring.test.js; node tests/js/control-arm.test.js`
Expected: all four FAIL.

- [ ] **Step 3: `swipe-parts.js` — the summary line**

Add before `// A cheap still thumbnail…`:

```js
	// "Abbott · Anthracite Grey · Satin glass · Chrome hardware" — the Review step's one-line
	// summary, from the same rows the full list shows.
	function reviewSummary(rows) {
		var by = {};
		(rows || []).forEach(function (r) { if (r && r.value) { by[r.name] = String(r.value).trim(); } });
		var parts = [];
		if (by['Design']) { parts.push(by['Design']); }
		if (by['Colour']) { parts.push(by['Colour']); }
		if (by['Glass']) { parts.push(/^(solid|unglazed)$/i.test(by['Glass']) ? 'Solid' : by['Glass'] + ' glass'); }
		if (by['Hardware']) { parts.push(by['Hardware'] + ' hardware'); }
		return parts.join(' \u00b7 ');
	}
```

and add `reviewSummary: reviewSummary,` to the returned object.

- [ ] **Step 4: `trust.js` — proof only**

Replace the file's header comment with:

```js
// assets/js/trust.js
// Social proof on the swipe flow's Review step: the Checkatrade rating line and one real
// customer quote, from wp-admin settings via HD_DD_CONFIG.trust. With nothing set, nothing
// is drawn. Copy rule: nothing here may make a promise about phone calls
// (tests/js/copy-rule.test.js scans every line of this file, comments included).
//
//   HD_DD_Trust.renderProof(container, HD_DD_CONFIG.trust);
```

Delete the `COPY` object, `render` and `renderSaveBar`. Add:

```js
	// The rating line and a quote. Returns the block, or null when there is nothing to show.
	function renderProof(container, trust, rand) {
		var line = ratingLine(trust);
		var quote = pickQuote(trust, rand);
		if (!line && !quote) { return null; }
		var box = el('div', 'hd-dd__trust');
		if (line) {
			var rating = el(line.url ? 'a' : 'div', 'hd-dd__trust-rating', line.text);
			if (line.url) { rating.href = line.url; rating.target = '_blank'; rating.rel = 'noopener'; }
			box.appendChild(rating);
		}
		if (quote) {
			var fig = el('figure', 'hd-dd__trust-quote');
			fig.appendChild(el('blockquote', null, '\u201c' + quote.text + '\u201d'));
			if (quote.by) { fig.appendChild(el('figcaption', null, '\u2014 ' + quote.by)); }
			box.appendChild(fig);
		}
		container.appendChild(box);
		return box;
	}
```

Change the return to `return { ratingLine: ratingLine, pickQuote: pickQuote, renderProof: renderProof };`.

- [ ] **Step 5: `enquiry.js` — the thank-you screen takes the picture and the price**

In `renderSuccess`, change the signature to `function renderSuccess(container, result, onAgain, image) {`, replace `if (designImage) {` with `var shot = image || designImage;` followed by `if (shot) {`, and `pic.src = designImage;` with `pic.src = shot;`. Replace the `hd-dd__thanks-price` line with:

```js
			var guide = (CFG.trust && CFG.trust.guidePrice != null) ? CFG.trust.guidePrice
				: 'Fitted doors typically cost \u00a31,500 to \u00a34,000. Most of our customers pay around \u00a32,000.';
			if (guide) { wrap.appendChild(el('div', 'hd-dd__thanks-price', guide)); }
```

Change the header comment line that begins `// used by the swipe flow.` to add: `The swipe flow now draws its form with swipe/review-save.js and uses this module for the door snapshot and the thank-you screen; the form below is kept only until it is removed in a follow-up.` Run `node tests/js/enquiry-form.test.js` → still passes.

- [ ] **Step 6: `swipe-app.js` — no separate form screen; returning savers**

- In the file header comment change `→ your door → enquiry form` to `→ your door (save by email, then ask for a price)`.
- In `reset()` change the `this.screen` comment to `// 'design' | screen key | 'review' | 'done'` and add `this.reviewOpen = false;   // the full options list on Review is expanded`.
- In `go()`, replace the four lines from `if (key === 'review') { this.funnel.step('review'); }` to the end of the `if (key !== 'form') { … }` block with:

```js
		if (key === 'review') { this.funnel.step('review'); }
		try { this.root.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* older browsers */ }
```

- In `back()` delete the line `if (this.screen === 'form') { return this.go('review'); }`.
- In `loadSaved`, replace `self.go('review');` with:

```js
			// Saved but no price asked for yet: carry on from step 2 on the same record.
			if (res.body.kind === 'save') { self.savedToken = token; }
			// The email's "Get my exact price" button lands on the form itself.
			self.focusSave = /[?&]price=1(&|#|$)/.test(String(window.location.search || ''));
			self.go('review');
```

- [ ] **Step 7: `swipe-view.js` — the Review layout**

1. In `create()` change the declarations to `var shell = null, back, progressEl, counter, stage, stageCanvas, body, cta;` and `var carousel = null, compositor = null, enquiry = null, hint = null, save = null, watch = null;`.
2. In `build()` delete the three `saveBar` lines and change the append line to `shell.appendChild(head); shell.appendChild(stage); shell.appendChild(body); shell.appendChild(cta);`.
3. Delete `renderSaveBar` and the old `review(formOpen)` function (and its comment). Add in their place:

```js
		// The Review step's two-step form (assets/js/swipe/review-save.js).
		function saver() {
			if (!save) {
				save = window.HD_DD_ReviewSave.create({
					api: app.api, cfg: CFG, flow: app.flow, token: app.savedToken || null,
					getDesign: function () { return app.design(); },
					getCanvas: function () { return stageCanvas; },
					experiment: function () { return app.experiment; },
					onSaved: function (result) {
						app.savedToken = result.token;
						app.funnel.step('saved');
						app.track('door_saved');
						setCta(null);
					},
					onQuoted: function (result, image) {
						app.track('door_quote_submitted'); // the conversion event
						app.funnel.lead();
						app.lastResult = result;
						app.lastImage = image;
						app.go('done');
					}
				});
			}
			return save;
		}

		// On phones the form can start below the fold: a floating button takes them to it,
		// and steps aside once the form itself is on screen.
		function floatingSave(box) {
			if (saver().saved()) { setCta(null); return; }
			setCta('Email me my design', function () {
				window.HD_DD_Enquiry.scrollToForm(box, app.root);
				saver().focus();
			});
			if (!('IntersectionObserver' in window)) { return; }
			watch = new window.IntersectionObserver(function (entries) {
				cta.hidden = saver().saved() || entries[entries.length - 1].isIntersecting;
			}, { threshold: 0.35 });
			watch.observe(box);
		}

		// Reveal, one-line summary (full list a tap away), guide price, proof, then the form.
		function review() {
			heading('Your door is ready', 'Send it to yourself to keep, or change anything first.');
			var rows = reviewRows();
			var summary = el('div', 'hd-sw-summary');
			summary.appendChild(el('span', 'hd-sw-summary__text', P.reviewSummary(rows)));
			var more = el('button', 'hd-sw-summary__more', 'See all options / edit');
			more.type = 'button';
			var list = P.reviewList(rows, function (key) { app.go(key); });
			list.hidden = !app.reviewOpen;
			more.setAttribute('aria-expanded', app.reviewOpen ? 'true' : 'false');
			more.addEventListener('click', function () {
				app.reviewOpen = !app.reviewOpen;
				list.hidden = !app.reviewOpen;
				more.setAttribute('aria-expanded', app.reviewOpen ? 'true' : 'false');
			});
			summary.appendChild(more);
			body.appendChild(summary);
			body.appendChild(list);

			var guide = CFG.trust && CFG.trust.guidePrice;
			if (guide) { body.appendChild(el('p', 'hd-sw-price', guide)); }
			if (window.HD_DD_Trust) { window.HD_DD_Trust.renderProof(body, CFG.trust); }

			var box = el('div', 'hd-sw-savebox');
			body.appendChild(box);
			saver().render(box);
			body.appendChild(el('div', 'hd-dd__disclaimer', 'We make every effort to show your door accurately, but this preview is an impression, not a perfect representation of the finished product.'));

			floatingSave(box);
			if (app.focusSave) {
				app.focusSave = false;
				window.HD_DD_Enquiry.scrollToForm(box, app.root);
			}
		}
```

4. Replace `v.render` with:

```js
		v.render = function (quiet) {
			if (!shell) { build(); }
			if (carousel) { carousel.destroy(); carousel = null; }
			if (hint) { hint.dismiss(); hint = null; }
			if (watch) { watch.disconnect(); watch = null; }
			body.innerHTML = '';
			var scr = app.screen;
			shell.className = 'hd-dd hd-sw hd-sw--' + (scr === 'design' || scr === 'review' || scr === 'done' ? scr : 'option');
			back.hidden = scr === 'design' || scr === 'done';
			renderProgress();
			stage.hidden = scr !== 'review';
			if (scr === 'design') { showcase(); }
			else if (scr === 'review') { paintStage(); review(); }
			else if (scr === 'done') {
				setCta(null);
				enquiryCtl().renderSuccess(body, app.lastResult, function () {
					if (save) { save.reset(); }
					app.savedToken = null;
					enquiryCtl().reset();
					app.reset();
					v.render();
				}, app.lastImage);
			} else {
				var screen = app.currentScreen();
				if (screen) { optionScreen(screen); } else { app.go('review'); return; }
			}
			if (!quiet) {
				body.classList.remove('is-entering');
				void body.offsetWidth; // restart the entry animation
				body.classList.add('is-entering');
				if (scr === 'review') { stage.classList.remove('is-revealing'); void stage.offsetWidth; stage.classList.add('is-revealing'); }
			}
		};
```

5. In the file header comment, change "the review" to "the review (summary, guide price and the two-step save form)". In `enquiryCtl()` change its `onSuccess` comment-free line to stay as is (the old form is no longer drawn, the controller is used for the thank-you screen only) and add above the function: `// Used for the thank-you screen and the form scroll helper.`

- [ ] **Step 8: CSS**

In `assets/css/hd-swipe.css` delete the whole of section 10 ("Review save bar": every `.hd-dd__savebar*` rule and the `hd-sw-savepulse` keyframes) and the line `.hd-sw--form .hd-sw-stage__door { width: min(30vw, 130px); }`. Append:

```css
/* 12. Review step: summary line, guide price, the two-step form ---------------------------- */
.hd-sw-summary { margin: 4px 0 10px; text-align: center; }
.hd-sw-summary__text { display: block; font-weight: 700; font-size: 1rem; line-height: 1.4; }
.hd-sw-summary__more {
  margin-top: 4px; padding: 6px 8px; border: 0; background: none; cursor: pointer;
  font: inherit; font-size: .9rem; font-weight: 600; color: var(--sw-accent); text-decoration: underline;
}
.hd-sw-review[hidden] { display: none; }
.hd-sw-price {
  margin: 12px 0; padding: 12px 14px; border-radius: 12px; background: var(--sw-soft);
  color: #1c2a25; font-size: 1rem; font-weight: 600; line-height: 1.45; text-align: center;
}
.hd-sw-savebox { margin: 14px 0 6px; padding: 16px; border: 1px solid #dfe5e1; border-radius: 14px; background: #fff; }
.hd-sw-save__title { font-weight: 700; font-size: 1.08rem; line-height: 1.35; margin-bottom: 10px; }
.hd-sw-save__done { margin-bottom: 10px; padding: 8px 12px; border-radius: 10px; background: var(--sw-soft); color: #1d4f3f; font-weight: 600; font-size: .95rem; }
.hd-sw-save__hint { display: block; margin-top: 4px; font-size: .82rem; color: var(--muted, #8a8e96); }
.hd-sw-savebox .hd-dd__submit { width: 100%; }
.hd-sw--review .hd-dd__disclaimer { margin-top: 10px; font-size: .78rem; }
```

- [ ] **Step 9: Run every JS test**

Run: `for f in tests/js/*.test.js; do node "$f" || exit 1; done`
Expected: all pass, including `control-arm.test.js` and `copy-rule.test.js`.

- [ ] **Step 10: Look at it**

Add `<script src="../assets/js/swipe/review-save.js"></script>` before `swipe-view.js` in `tools/swipe-test.html` (after `enquiry.js`). Open it at phone width and step through to Review. Confirm in order: door, one-line summary with the expand link, guide price (set `HD_DD_CONFIG.trust.guidePrice` in the harness config if it is not there), email box, small-print disclaimer; the floating "Email me my design" button shows while the box is off-screen and hides once it is visible. Submitting shows "Preview mode — not sent." because the harness has no REST URL.

- [ ] **Step 11: Commit**

```bash
git add assets tests/js tools/swipe-test.html
git commit -m "feat(swipe): Review shows the door, a summary, a guide price and the two-step save form"
```

---

### Task 11: Saves in wp-admin

**Files:**
- Modify: `includes/class-hd-admin.php` (`render_list()` lines 187–245, `render_detail()` near line 343)
- Create: `tests/php/admin-kind.test.php`

**Interfaces:**
- Consumes: `HD_DD_Repository::count_by_kind()`, `list( $limit, $offset, $kind )`.
- Produces: `HD_DD_Admin::kind_badge( $kind ) : string` (escaped HTML, '' for an enquiry); `HD_DD_Admin::list_kind( $raw ) : string` ('' | 'save' | 'enquiry').

- [ ] **Step 1: Write the failing test**

Create `tests/php/admin-kind.test.php`:

```php
<?php
/**
 * Saved designs are told apart from enquiries in wp-admin.  Run: php tests/php/admin-kind.test.php
 */
require __DIR__ . '/wp-stubs.php';
hd_test_reset();

check( '' === HD_DD_Admin::kind_badge( 'enquiry' ), 'an enquiry has no badge' );
check( '' === HD_DD_Admin::kind_badge( null ), 'a row from before the column existed has no badge' );
$badge = HD_DD_Admin::kind_badge( 'save' );
check( false !== strpos( $badge, 'Saved, no price requested' ), 'a save is labelled (got ' . $badge . ')' );
check( 0 === strpos( $badge, '<br><span' ), 'the badge is markup the list can print as is' );

check( 'save' === HD_DD_Admin::list_kind( 'save' ), 'filter: saves' );
check( 'enquiry' === HD_DD_Admin::list_kind( 'ENQUIRY' ), 'filter: enquiries, any case' );
check( '' === HD_DD_Admin::list_kind( 'drop table' ), 'anything else means everything' );
check( '' === HD_DD_Admin::list_kind( array( 'save' ) ), 'an array means everything' );

hd_test_done( 'admin-kind.test.php' );
```

- [ ] **Step 2: Run to verify it fails** — `php tests/php/admin-kind.test.php` → FAIL.

- [ ] **Step 3: Implement**

Add to `HD_DD_Admin` (next to `status_badge`):

```php
	/** The list's label for an email-only save, or '' for an enquiry. Escaped. */
	public static function kind_badge( $kind ) {
		if ( 'save' !== $kind ) {
			return '';
		}
		return '<br><span style="display:inline-block;margin-top:3px;padding:1px 7px;border-radius:9px;background:#e7f0ec;color:#1d4f3f;font-size:11px;font-weight:600;">' . esc_html__( 'Saved, no price requested', 'hd-door-designer' ) . '</span>';
	}

	/** The list filter from the URL: 'save', 'enquiry', or '' for everything. */
	public static function list_kind( $raw ) {
		$kind = is_string( $raw ) ? sanitize_key( $raw ) : '';
		return in_array( $kind, array( 'save', 'enquiry' ), true ) ? $kind : '';
	}
```

In `render_list()` replace the two lines `$rows = …; $total = …;` with:

```php
		$kind   = self::list_kind( isset( $_GET['kind'] ) ? wp_unslash( $_GET['kind'] ) : '' ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- read-only filter, sanitised in list_kind().
		$rows   = $this->repository->list( 200, 0, $kind );
		$counts = $this->repository->count_by_kind();
		$base   = admin_url( 'admin.php?page=' . self::MENU_SLUG );
```

Replace the `<h1>…</h1>` block with:

```php
			<h1><?php esc_html_e( 'Door Enquiries', 'hd-door-designer' ); ?></h1>
			<ul class="subsubsub" style="float:none;margin:6px 0 10px;">
				<li><a href="<?php echo esc_url( $base ); ?>" <?php echo '' === $kind ? 'class="current"' : ''; ?>><?php esc_html_e( 'All', 'hd-door-designer' ); ?> <span class="count">(<?php echo (int) ( $counts['enquiry'] + $counts['save'] ); ?>)</span></a> |</li>
				<li><a href="<?php echo esc_url( $base . '&kind=enquiry' ); ?>" <?php echo 'enquiry' === $kind ? 'class="current"' : ''; ?>><?php esc_html_e( 'Enquiries', 'hd-door-designer' ); ?> <span class="count">(<?php echo (int) $counts['enquiry']; ?>)</span></a> |</li>
				<li><a href="<?php echo esc_url( $base . '&kind=save' ); ?>" <?php echo 'save' === $kind ? 'class="current"' : ''; ?>><?php esc_html_e( 'Saved designs', 'hd-door-designer' ); ?> <span class="count">(<?php echo (int) $counts['save']; ?>)</span></a></li>
			</ul>
```

In the reference cell (line ~243), directly before `<?php echo self::status_badge(` add:

```php
<?php echo self::kind_badge( isset( $row->kind ) ? $row->kind : '' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in kind_badge(). ?>
```

In the customer cell, show a dash when there is no name yet: replace `<?php echo esc_html( $row->customer_name ); ?><br>` with `<?php echo '' === (string) $row->customer_name ? '&mdash;' : esc_html( $row->customer_name ); ?><br>`.

In `render_detail()`, directly after the `Received` table row (line ~343) add:

```php
							<?php if ( isset( $row->kind ) && 'save' === $row->kind ) : ?>
								<tr><th><?php esc_html_e( 'Type', 'hd-door-designer' ); ?></th><td><?php esc_html_e( 'Saved design. They gave an email address only and have not asked for a price yet.', 'hd-door-designer' ); ?></td></tr>
							<?php endif; ?>
```

- [ ] **Step 4: Run** `php tests/php/run.php` → all pass. `node tests/js/copy-rule.test.js` → pass.

- [ ] **Step 5: Commit**

```bash
git add includes/class-hd-admin.php tests/php/admin-kind.test.php
git commit -m "feat(admin): saved designs are labelled, counted and filterable"
```

---

### Task 12: Docs, version, full run

**Files:**
- Modify: `README.md`, `hd-door-designer.php` (two version lines), `docs/superpowers/specs/2026-10-09-swipe-2-review-and-swipe-helpers-design.md` (status line)

- [ ] **Step 1: README**

In the tests list (around line 270) remove the `funnel-v2.test.js` line and add:

```
node tests/js/funnel-v3.test.js       # door-designer-v3 funnel: opened, browsed, saved
node tests/js/swipe-hint.test.js      # the swipe hint pill
node tests/js/review-save.test.js     # two-step save form (email, then quote details)
node tests/js/review-summary.test.js  # Review one-line summary
node tests/js/swipe-wiring.test.js    # swipe screens carry the helpers and the new Review
```

In the section that describes the flows (around line 249), replace the description of the swipe flow's Review with: "Swipe 2 (`swipe2`, funnel `door-designer-v3`) shows the door, a one-line summary, a guide price (Door Enquiries → Settings → Review step) and a two-step form: an email-only save (`POST /save`, stored with `kind = save`, not a lead), then name and postcode for an exact price (`POST /save/{token}/quote`, the same row becomes an enquiry and counts as the A/B conversion). `?flow=swipe` is an alias of `swipe2`. Both flows report an `opened` step when the designer first draws."

- [ ] **Step 2: Version**

In `hd-door-designer.php` change ` * Version:           0.3.3` to `0.4.0` and `define( 'HD_DD_VERSION', '0.3.3' );` to `'0.4.0'`.

- [ ] **Step 3: Spec status**

Change the spec's status line to `**Status:** Implemented on \`feat/swipe-2\` (v0.4.0), not yet released.` and, under "Analytics", replace the sentence "Whether the site's hd-analytics plugin passes the new keys through unchanged is to be confirmed in the plan." with "The site's hd-analytics plugin accepts any step key and clamps `order` to 0–99, so `opened` at order 0 needs no change there. The manager's push validator already accepts free-form steps; the manager change is only so `opened`/`browsed` are not mistaken for \"started\"."

- [ ] **Step 4: Run everything**

Run: `for f in tests/js/*.test.js; do node "$f" || exit 1; done && php tests/php/run.php`
Expected: every JS file prints "all assertions passed"; PHP prints "all PHP tests passed".

- [ ] **Step 5: Commit**

```bash
git add README.md hd-door-designer.php docs/superpowers/specs/2026-10-09-swipe-2-review-and-swipe-helpers-design.md
git commit -m "docs: Swipe 2, save endpoints and the new tests; version 0.4.0"
```

---

### Task 13: Check it in a real WordPress before release

This plugin's tests run against stubs. The schema change, the emails and the return link need a real site. Use the Local by Flywheel install under `C:\Users\Danny\Local Sites\` if one has this plugin; otherwise ask Daniel which site to use. Do not use the live site for this task.

- [ ] **Step 1:** Copy the branch into the test site's `wp-content/plugins/` folder and load any wp-admin page. Confirm the `hd_enquiries` table has `kind` and `flow` columns (Tools → Site Health → Info is not enough: check with the site's database tool, `SHOW COLUMNS FROM wp_hd_enquiries`).
- [ ] **Step 2:** Start a Classic vs Swipe test on the old version first if you can (to prove the migration), update, and confirm Door Enquiries → Experiments shows it under Finished tests as "Stopped" and offers "Swipe 2" as a flow.
- [ ] **Step 3:** Open the designer page with `?flow=swipe2&notrack=1` at phone width. Check the hint, arrows and floating button, then on Review save with a real mailbox you control. Confirm: one row labelled "Saved, no price requested"; the saver email arrives with picture, guide price and both buttons; the owner gets "New saved design — …".
- [ ] **Step 4:** Change the colour via "See all options / edit", return to Review, and confirm the same row now shows the new colour and no second email arrived.
- [ ] **Step 5:** Click "Get my exact price" in the email in a different browser. Confirm it opens the swipe designer on Review at step 2 and scrolls to the form. Submit name and postcode. Confirm: the same row is now an enquiry with the same reference, "New door enquiry HD-…" arrives, and the customer acknowledgement shows the £1,500 sentence.
- [ ] **Step 6:** Open the page with `?flow=classic&notrack=1` and submit the classic quote form. Confirm the form, validation messages and both emails are exactly as before (the acknowledgement still says £1,000 to £4,000).
- [ ] **Step 7:** Record what was checked and any problem found in the PR description or to Daniel. Fix problems with a failing test first.

---

### Task 14: Release

Releasing changes the live site for every visitor and ends the running A/B test, so each step needs Daniel's go-ahead.

- [ ] **Step 1:** Confirm the manager-app plan's Task 3 is done (manager live, push reads OK).
- [ ] **Step 2:** With Daniel's go-ahead: merge `feat/swipe-2` to `main`, commit `chore(release): v0.4.0`, `git tag v0.4.0`, push, and `gh release create v0.4.0` with notes and no asset (the updater uses GitHub's source archive).
- [ ] **Step 3:** Daniel updates the plugin in wp-admin → Plugins. Confirm the live page source shows `"version":"0.4.0"` in `HD_DD_CONFIG` and `flow.experiment` is `null` (the old test was ended).
- [ ] **Step 4:** Daniel tries `https://hertfordshiredoors.co.uk/door-designer/?flow=swipe2&notrack=1` on his phone, and adds customer quotes and checks the guide price in Door Enquiries → Settings → Review step.
- [ ] **Step 5:** Daniel starts Classic vs Swipe 2 on Door Enquiries → Experiments.
- [ ] **Step 6:** After the next nightly push (00:20) or "Push to dashboard now", confirm the Marketing page shows a "Door designer v3" block and an "Opened the designer" line for both designers, and that "Door designer v2" is unchanged.
