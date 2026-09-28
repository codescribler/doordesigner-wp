# Swipe designer flow + A/B experiments — Design

**Date:** 2026-09-28
**Status:** Implemented on `feat/swipe-flow-experiments` (2026-09-28); Daniel skipped the spec review and asked for implementation directly
**Repo:** `codescribler/doordesigner-wp` (this plugin). No manager-app changes.

## Goal

Change how customers build a door so more of them finish and send an enquiry, and prove
it: run the new flow against the current one as a live A/B test, email Daniel when there
is a clear winner, and let him make the winner the default with one click — leaving the
facility ready for the next test.

Success = more **leads** (unique visitors who submit an enquiry). Individual step
completion is diagnostic only.

## Current numbers (last 8 weeks, manager API, 2026-09-28)

- 148 designer starters (`type` step), 31 leads → ~21% completion; ~18 starters and ~4
  leads a week.
- Gmail history: ~36 real enquiries since 10 July from ~28 distinct people — several
  people submit 2–3 times, so experiments count **unique visitors**, never submissions.
- The analytics pipeline lower-cases step keys (`extColour` arrives as `extcolour`).

## Part 1 — The swipe flow

### Journey

Every step uses one interaction: a **cover-flow carousel**. The current option is a large
door in the centre; options already seen shrink off to the left, upcoming ones peek in on
the right. Under it: the option name, "5 of 21", and a dot track (tap to jump). Swipe,
tap a neighbour, tap a dot, or arrow keys. A one-line helper sits at the top of each step
and the button names what comes next ("Love it — next: glass →"). Each card is the
customer's actual door with that option applied (rendered from the existing layer model).

| # | Step | Content | Skipped when |
|---|------|---------|--------------|
| 1 | Design | Showcase of all designs (88 composite + 5 Avantal) in a default colour, filter chips (All / Glazed / Solid / Contemporary / Georgian / Aluminium), thumbnail strip, "Comes as Single · Double · Stable" | — |
| 2 | Door type | Single / Double / Stable cards; hinge-side toggle underneath (door mirrors; "which leaf opens first" on double) | Avantal (single only) |
| 3 | Colour | All outside colours; "Inside: White · change" beneath. Avantal: its 5 finishes + cassette choice | — |
| 4 | Glass | Glass options for the design | Only one option |
| 5 | Handle | Hardware-finish chips above; handles not made in that finish hidden; centre card adds a handle close-up | — |
| 6 | Letterplate | "No letterplate" first; Middle/Bottom toggle appears where the design allows | — |
| 7 | Knocker | "No knocker" first | Avantal, or design has none |
| 8 | Side panels | Just the door / Side panels / Window above → variant → glazed/solid → side glass | Double door |
| 9 | Your door | Finished door, review list with Edit links, "Get my free quote" → existing contact form | — |

Stable is only offered for the 30 designs that come as a stable door (`X Stable` maps to
base design `X`; verified all 30 bases exist in the single range). Single and Double share
the same 88 designs.

**Default showcase colour:** Anthracite Grey (constant in `flow-steps.js`).

### Motion

- First visit: the carousel nudges once to show it swipes.
- The door cross-fades on every change; steps slide between each other.
- Review: a short "door swings open" reveal.
- All motion is disabled under `prefers-reduced-motion`.

### Kept from today

- `?door_type=` deep link pre-fills the type; `Avantal` opens the showcase filtered to
  Aluminium.
- Saved-design reloads land on the review step.
- Enquiry payload is unchanged: exact Endurance headings and labels.

### Modules (UMD, like the existing wizard modules; each under ~250 lines)

| File | Responsibility |
|------|----------------|
| `assets/js/swipe/design-index.js` | Pure data: showcase list of base designs → types offering them + category; groups Avantal's 13 entries into 5 designs with cassette variants |
| `assets/js/swipe/flow-steps.js` | New step order, helper copy, which small choices share a screen; wraps `HD_DD_StepConfig.applicableSteps()` for choice lists |
| `assets/js/swipe/carousel.js` | Generic cover-flow: pointer/touch swipe, neighbour tap, dots, keys; renders only visible ±2 cards; listbox semantics + live-region name; reduced motion |
| `assets/js/swipe/door-card.js` | One card: a small `HD_DD_Preview` compositor for a hypothetical design, plus close-up crop of handle/letterplate/knocker from that layer's geometry |
| `assets/js/swipe/swipe-app.js` | Runs the flow: design first → `wiz.selectType()` → `wiz.select('Door Design', …)` → remaining steps through `HD_DD_Wizard`; transitions and helper text |
| `assets/js/enquiry.js` | Enquiry form, submit, success screen and door snapshot, **extracted** from `hd-door-designer.js` (1,109 lines) so both flows share them |
| `assets/css/hd-swipe.css` | Swipe flow styles, scoped under `.hd-dd` |

Reused unchanged: `render-model.js`, `preview.js`, `step-config.js`, `wizard-controller.js`.

## Part 2 — Analytics

### Funnel `door-designer-v2`

The swipe flow reports to a **new funnel name**. The manager's version cohorts define
"started" as the funnel's lowest-ordered step across the whole date range and merge step
order by maximum, so re-ordering steps inside `door-designer` would miscount. A separate
funnel keeps both clean with no manager change.

Step keys are lower-case (the pipeline lower-cases anyway):

| order | step | choice |
|---|---|---|
| 1 | `design` | design name |
| 2 | `type` | door type |
| 3 | `hinge` | hinge side / master leaf |
| 4 | `colour` | outside colour |
| 5 | `intcolour` | inside colour |
| 6 | `glazing` | glass |
| 7 | `hardware` | finish |
| 8 | `handle` | handle |
| 9 | `letterplate` | letterplate |
| 10 | `letterplateposition` | Middle / Bottom |
| 11 | `knocker` | knocker |
| 12 | `frame` | frame design |
| 13 | `sidelighttype` | Glazed / Unglazed |
| 14 | `sidelightglass` | side glass |
| 15 | `review` | — |
| 16 | `details` | — |
| — | lead | on successful enquiry save |

Rules match today's: a step fires on forward advance (so accepted defaults are recorded),
sub-choices sharing a screen fire alongside their host step, skipped steps send nothing,
every event carries `version`.

`funnel.js` becomes a factory: `HD_DD_Funnel.create(name, orderMap)`. The existing
`door-designer` funnel's calls and tests are byte-for-byte unchanged.

Clarity: per-step `door_step_*` events continue; the flow arm is set as tag `hd_flow`
(`classic` / `swipe`); the number of designs viewed before choosing is a Clarity tag
(never an hdAnalytics field — the manager's strict validator would reject it).

## Part 3 — Experiments

### Flows and assignment

- **Flows** are registered in code: `classic`, `swipe`. A future test adds a new flow (or
  variant) in code and registers it.
- **Setting "Default flow"** (wp-admin): the flow everyone gets when no experiment runs.
- **Experiment**: control flow, challenger flow, % to challenger (default 50), started
  date, status (`running` / `winner_found` / `no_difference` / `ended`).
- **Assignment** happens in the browser on arrival: random, weighted by the %, stored in
  `localStorage` as `{experimentId, arm, visitorId}` for 90 days so a returning visitor
  always sees the same flow. If storage is unavailable the visitor is assigned per page
  load. A new experiment id invalidates old assignments. The visitor id is random, carries
  no personal data, and is only used for counting.
- **Overrides**: shortcode `flow="swipe|classic"` and `?flow=` force a flow and are
  **excluded** from experiment counting (so Daniel's testing never skews results).
- Both flows' assets are always enqueued (so `?flow=`, a shortcode `flow=""` or an A/B arm
  can start either); only the chosen flow boots. `HD_DD_CONFIG` is localised onto the
  render-model script, the first in every flow's dependency chain.

### Counting (server side, in this plugin)

New table `{prefix}hd_dd_experiment_visitors`:

| column | notes |
|---|---|
| `experiment_id` | |
| `visitor_id` | random id from the browser (char 32) |
| `arm` | flow key |
| `exposed_at` | first time the designer opened for this visitor |
| `converted_at` | NULL until a lead; set once |

Unique key `(experiment_id, visitor_id)` — so a visitor counts once however many times
they visit or submit.

- **Exposure**: when the designer mounts for an assigned visitor, the browser POSTs
  `/hd-door-designer/v1/experiment/expose` once per visitor (`{experimentId, visitorId,
  arm}`), public, rate-limited per IP, ignored if the experiment isn't running or the arm
  isn't one of its two flows. The unit is "opened the designer", the same for both arms,
  so neither flow's notion of "started" can bias the comparison.
- **Conversion**: the enquiry POST carries `experiment: {experimentId, visitorId, arm}`;
  it is stored in the enquiry payload (visible in wp-admin), and a listener on the existing
  `hd_dd_enquiry_submitted` action sets `converted_at` if that visitor has an exposure row
  for a running experiment. Flagged (honeypot) enquiries count; failed ones don't.
- Admin-page views and requests with an override never count.

### Deciding a winner

A daily WP-cron job evaluates each running experiment. The decision rule is in the
"Win rule" section below (from the research). When it fires:

- **Winner** → status `winner_found`, email Daniel once: arm results (visitors, leads,
  rate), the probability the winner is better, days run, and a link to the Experiments
  page. The experiment **keeps running** until he acts.
- **No meaningful difference** after the maximum duration → status `no_difference`,
  email once recommending he keeps whichever he prefers.

Email goes to the existing enquiry recipient setting via `wp_mail()` (same sender as
enquiry notifications).

### wp-admin → Door Designer → Experiments

- Running experiment: per arm visitors, leads, conversion rate; probability challenger
  beats control; days run; guard status ("needs 9 more days", "needs 6 more leads in
  classic"); buttons **Make [flow] the default** (ends the experiment and sets Default
  flow) and **Stop test** (ends it, default unchanged).
- **Start a new test**: pick control and challenger from registered flows, set the %.
  Only one experiment runs at a time.
- History: finished experiments with their final numbers and outcome.

### Engine files

| File | Responsibility |
|------|----------------|
| `includes/class-hd-experiments.php` | Experiment state (option), table create/migrate, REST expose route, enquiry listener, cron scheduling |
| `includes/class-hd-experiment-stats.php` | Pure maths: posterior probability, expected loss, guard checks → decision. No WordPress calls, unit-testable |
| `includes/class-hd-experiments-admin.php` | The Experiments admin page and its actions (nonce + `manage_options`) |
| `assets/js/experiment.js` | Browser assignment (pure `assign()` for tests), exposure beacon, override detection |

## Win rule

From simulations of this site's traffic (≈18 starters / 4 leads a week, 21% completion; and
an "opened" baseline of ~10% on ~37 a week), checked daily, 3,000 runs per scenario:

- **Winner** when P(one arm beats the other) ≥ **97.5%** (Beta(1,1) priors, Evan Miller's exact
  closed form) **and** each arm has ≥ **15** converting visitors **and** ≥ **14 days** have run.
- **No clear difference** after **182 days** (26 weeks).
- Expected loss is reported (email + admin) but never decides — alone it always declares
  something; with the guards it changed nothing.

Measured error rates: with no real difference, ≈8% chance per direction of a false winner
(a naive 95% daily check with no guards: 28% per direction); with a real difference, ≈1% chance
of promoting the worse flow. Typical time to a decision: a doubling ≈2 months, +50% ≈2.5–3
months (15–24% undecided at 6 months), +25% usually never. Sources: Evan Miller (Bayesian
formulas; "How Not To Run an A/B Test"), VWO SmartStats whitepaper (Stucchio), Dynamic Yield
Probability to Be Best, Johari et al. (always-valid inference). Thresholds live in
`HD_DD_Experiment_Stats::default_rule()`, filterable via `hd_dd_experiment_rule`.

## Error handling

- Analytics or experiment calls never block the designer: all best-effort, try/caught.
- Expose endpoint failures are silent client-side; a missing exposure means a lead can't
  be attributed (logged in the experiment's `unattributed` counter shown in admin).
- Cron not firing (low-traffic WP-cron) delays the email only; the admin page computes
  live on view.
- Deleting an enquiry in wp-admin does not un-count its conversion (experiments are
  historical).

## Testing

Node (`tests/js`):
- `design-index`: 88 composite designs; all 30 stable designs map to a base; Avantal → 5
  designs with correct cassette variants; every design has a category.
- `flow-steps`: step lists for single, double, stable, Avantal.
- `funnel`: `door-designer-v2` orders + version; `door-designer` unchanged.
- `carousel` maths: index clamp, visible window, swipe threshold.
- `experiment.assign`: weighting, stickiness, new experiment resets, overrides, storage
  unavailable.

PHP (`tests/php`):
- `experiment-stats`: known posterior probabilities, guards, decision outcomes.
- expose route: dedupe, ignores non-running/foreign arms, rate limit.
- enquiry listener: sets `converted_at` once; ignores unexposed visitors and overrides.
- flow resolution: default / experiment / override precedence.

Manual (Chrome at 390px, 360px, desktop; hdAnalytics console stub): full runs for
single, double, stable, Avantal, single with side panels — each analytics step fires once
in order with the right choice, lead only after a successful submit, and the submitted
payload matches classic for the same door. Both arms under a 50/50 experiment: each
reports only to its own funnel, exposure and conversion rows appear once.

## Rollout

1. Release with Default flow = Classic and no experiment. Nothing changes for visitors.
2. Daniel tests with `?flow=swipe` on his phone (not counted).
3. Start experiment: control Classic, challenger Swipe, 50%.
4. Winner email arrives → **Make [winner] the default**. Start the next test when ready.

## Out of scope

Pricing; enquiry form fields; manager-app changes; more than two arms per experiment;
multiple concurrent experiments.
