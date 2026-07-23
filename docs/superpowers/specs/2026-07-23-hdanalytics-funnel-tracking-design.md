# hdAnalytics Funnel Tracking — Design

**Date:** 2026-07-23
**Status:** Approved

## Goal

Report the door designer's funnel to the site's hdAnalytics plugin (`window.hdAnalytics`,
defined on every page before our code runs; calls are queued until the tracker loads, so
calling it is always safe when it exists). The existing Microsoft Clarity events
(`door_step_*`, `door_quote_submitted`) are untouched — this is additive.

API contract (from the analytics plugin's docs):

- `hdAnalytics.step(funnelName, stepName, { order, choice })` — visitor progressed in a funnel.
  `choice` is what they picked on this step; `order` positions the step on the dashboard.
- `hdAnalytics.lead(funnelName)` — the funnel converted.
- `tel:` clicks are tracked automatically by the plugin; nothing to do here.

## Funnel definition

Funnel name: **`door-designer`**.

Every step the visitor actually sees is tracked (agreed: richer choice data is worth the
distorted step-to-step drop-off on conditional steps). Orders are canonical — fixed per
step key regardless of which steps a given visitor is offered — so the dashboard draws a
stable sequence:

| order | step key | choice sent |
|-------|-------------------|-----------------------------------------|
| 1 | `type` | door type label (e.g. `Composite Door`) |
| 2 | `frame` | frame design label |
| 3 | `style` | door design label |
| 4 | `hinge` | hinge side / master leaf label |
| 5 | `extColour` | external colour |
| 6 | `intColour` | internal colour (often default `White`) |
| 7 | `sidelightType` | `Glazed` / `Unglazed` |
| 8 | `sidelightGlass` | side panel glass label |
| 9 | `glazing` | door glass label |
| 10 | `hardware` | hardware finish |
| 11 | `handle` | handle label |
| 12 | `letterplate` | letterplate label (default `No Letterplate`) |
| 13 | `letterplatePosition` | `Middle` / `Bottom` |
| 14 | `knocker` | knocker label (default `No Knocker`) |
| 15 | `review` | — (no choice) |
| 16 | `details` | — (no choice; the enquiry form view) |

Lead: fired once the enquiry POST succeeds.

## Event timing (the load-bearing decision)

**Wizard steps fire on *forward advance*, not on tile click.** Optional steps are
pre-filled by `applyDefaults()` and many visitors pass them by hitting Continue without
ever clicking a tile; firing when the visitor leaves the step forward captures the
effective choice (picked or default-accepted) exactly once per pass. A step viewed but
never advanced past fires nothing — that is the drop-off signal.

- `type` is the exception: the type chooser auto-advances on click (no Continue), so it
  fires at selection time.
- `review` and `details` have no choice, so they fire on arrival, reusing the existing
  `trackView` de-dup (the internal `form` view is reported as `details`).
- Re-editing from review and walking forward again re-fires steps with the new choice;
  the dashboard's unique counting absorbs repeats.
- A saved-design reload that lands straight on review fires `review`/`details`/lead only —
  no synthetic back-fill of steps the visitor never walked.

## Components

### New: `assets/js/wizard/funnel.js` (~40 lines, UMD like the other wizard modules)

Exports `HD_DD_Funnel`:

- `ORDER` — the canonical map above.
- `step(key, choice)` — calls `hdAnalytics.step('door-designer', key, opts)` where `opts`
  is `{ order: ORDER[key] }` plus `choice` only when truthy.
- `lead()` — calls `hdAnalytics.lead('door-designer')`.

Both are guarded (`typeof window.hdAnalytics !== 'undefined'`) and wrapped in try/catch —
same best-effort stance as the existing Clarity `track()`. No console noise when the
analytics plugin is absent.

### Changed: `assets/js/hd-door-designer.js` — four call sites

1. **`App.prototype.advance`** — in the forward branch, before `wiz.next()`: when not at
   review, read the current step and fire
   `HD_DD_Funnel.step(step.key, (design[step.heading] || {}).label)`.
2. **`App.prototype.onSelect`** — in the `Door Type` guard, fire
   `HD_DD_Funnel.step('type', choice.label)`. The type chooser's tile click handler is
   rerouted from `wiz.selectType(label)` to `self.onSelect('Door Type', { label: label })`
   so type picks have a single code path.
3. **`App.prototype.trackView`** — after the de-dup check: `review` → `step('review')`,
   `form` → `step('details')`.
4. **`App.prototype.submit`** — in the success branch, next to
   `track('door_quote_submitted')`: `HD_DD_Funnel.lead()`.

### Changed: `includes/class-hd-assets.php`

Register `assets/js/wizard/funnel.js` as `HANDLE . '-funnel'` (no deps, footer, same
`$ver_js` cache-buster as the other wizard modules) and add the handle to the app
bootstrap's dependency array.

## Error handling

- Analytics plugin missing/deactivated: guard makes every call a silent no-op.
- Design key unexpectedly absent on advance: `choice` is `undefined`, `step()` omits it —
  the step event still fires.
- All calls try/caught; analytics can never break the wizard.

## Testing

Manual, on the preview page with a console-logging stub pasted before the app boots:
`window.hdAnalytics = { step: console.log.bind(console, 'step'), lead: console.log.bind(console, 'lead') }`.

Walk-throughs to verify:

1. Full single-door run — steps fire in order with correct choices; Continue on defaulted
   optional steps sends the default; `review`/`details` fire on arrival; lead fires only
   after a successful submit (preview mode without `restUrl` must NOT fire lead).
2. Double door — `style` fires from the visual grid; `hinge` sends the master-leaf label.
3. Frame with sidelights — `sidelightType`/`sidelightGlass` fire with their orders.
4. Back/forward and review-edit — repeat passes re-fire with updated choices, nothing errors.
5. Stub removed — wizard behaves identically, no console errors.

## Out of scope

- Click-to-call tracking (automatic in the analytics plugin).
- Any change to Clarity events or the enquiry REST endpoint.
- Server-side/PHP-rendered pages other than registering the new script.
