# Designer 3: a finished door after two choices, then save, then quote

Date: 2026-10-21. Status: draft for Daniel's review.
Repos: designer plugin (this repo), manager app (`../manager-app`), and the analytics plugin inside it (`manager-app/integrations/wordpress/hd-analytics`).

## Why

The live test (Classic vs Swipe 2, started 2026-10-09) showed two things after 11 days. The numbers are tiny, so treat them as hints:

- **Classic starts well and ends badly.** 4 of 21 visitors leave before starting. But only 5 of 12 who reach Review open the form, and both Classic leads failed at least once on the form first (required phone, consent tick). One then gave an all-zeros phone number.
- **Swipe 2 starts badly and ends well.** 8 of 14 visitors leave at the opening gallery without choosing a design. But 4 of 5 starters reach the end, and both visitors who saved went on to ask for a price.

Designer 3 takes Classic's easy start and Swipe 2's save-then-quote ending. It shows a complete door after two choices instead of about twelve, makes customising obvious, nudges people to save, and then pushes for a quote.

**Success:** more quote and call-back requests per visitor who opens the designer than Classic. This is measured by a new A/B test, Classic vs Designer 3.

## Goals

1. A visitor sees a complete, good-looking door after choosing **door type** and **style**.
2. Every part they can change is visibly marked on the door, and is one tap away.
3. Saving (email only) is always available, with a gentle nudge after a few changes.
4. After saving, the priority is a quote. Side and top lights are offered first, as an encouraged but optional step.
5. Daniel can follow the new test, and the step-by-step paths, in the manager app.
6. The current test's data is preserved in full before it is stopped.

## Non-goals

- No changes to the Classic flow. It is the control. `tests/js/control-arm.test.js` must still pass unchanged.
- No changes to Swipe 2 beyond keeping it working through `?flow=swipe2` and saved-design links.
- No three-way test. The experiment engine stays two-armed.
- No change to the site-wide Thrive call-back lightbox.
- Release 2 and 3 work (My designs, access codes, estimates) is not part of this.

## Anti-goals (would count as failure even if it works)

- Pre-picked furniture that collides with glass, or a letterplate or knocker in a position the style doesn't allow.
- Any customer-facing text that says or implies we won't phone (`tests/js/copy-rule.test.js` must cover the new files).
- Losing any data from the Classic vs Swipe 2 test.
- A saved Designer 3 link reopening in Classic or Swipe 2 (the bug seen on 2026-10-05).
- Large files. Daniel wants code files kept short and easy to read; follow the Swipe 2 split into small modules.

## The visitor journey

### 1. Door type

Same choice as Classic's first step (Single, Double, Stable, Avantal, as the catalogue offers), same look. Fires funnel step `type`.

### 2. Style

A grid of the styles for that type. Picking one fires `style` (with the style name as the choice) and goes straight to the door screen. Side and top lights are **not** asked here (Classic asks for them before style).

### 3. The door screen (customise)

The complete door is drawn immediately with the existing canvas compositor (`assets/js/preview.js` and `render-model.js`). Fire `shown`.

**Pre-picked parts.** Colour, handle (and hardware finish), letterplate and knocker are pre-picked per style:
- Use the most popular choice for that style, taken from past enquiries plus the funnel `choices` data.
- Where a style has too little data, use a best guess. That means the style's own default where the catalogue or render model has one, otherwise a plain chrome lever, a chrome letterplate, no knocker, and the most popular colour overall.
- **Positions must respect the style.** The letterplate goes in the style's default position (`letterplatePosDefault` / `letterplateDefaultBottom`), only among positions `letterplatePosStyles` allows. The knocker is only pre-picked where `knockerByStyle` offers one, and is placed at the style's `knockerCy`.
- Hinge side, inside colour and door glass take Classic's existing defaults for that style.
- The defaults ship as a static data file that a tool in `tools/` builds, so they can be refreshed later. How the popularity data is gathered is left to the builder (an export from wp-admin enquiry JSON is fine).

**Hotspot dots.** Orange "+" dots sit on the door over each part that can be changed: glass, handle, letterplate, knocker (where the style offers one), and one on the door panel for colour. Place them from the render-model layer geometry (`geom.cx/cy`, the style's `letterplateCy`, `knockerCy`), so they follow each style. A banner above the door reads, roughly, "Here's your door. Tap a dot to change any part of it."

**Toolbox (desktop: right-hand column).** Rows in this order: **Colour, Door style, Handle, Letterplate, Knocker**. There is **no spy hole** row or dot; Daniel dropped it on 2026-10-21. The catalogue has no spy-hole option, only the knockers with one built in. Each row shows its current choice. Clicking a row, or the matching dot, opens that section's options in place, with pictures. Changes redraw the door at once.
- *My call:* the options Daniel didn't list (hinge side, inside colour, door glass, hardware finish, letterplate position) sit under a final "More options" row. The glass dot opens door glass directly. They are needed for an accurate quote but shouldn't crowd the main list.
- "Door style" swaps the style but keeps the other choices where the new style allows them, and re-applies that style's defaults where it doesn't.

**Phone layout (Daniel chose option B).** The door at the top. Tapping a dot, or a row in a short strip of tabs under the door, slides up a panel with large option pictures. The door shrinks above the panel. "Save my design" is in the panel and on the screen at all times.

**Save.** A "Save my design" button is always visible, with the note "Just your email. We'll send you a link to it." It uses the existing `POST /save` (kind `save`, flow `designer3`). Fires `saved`.

**Gentle nudge.** After the visitor's **third** change (my call on the number), show a small dismissible prompt by the save button, for example "Looking good. Save it so you don't lose it?". Show it once per visit. If dismissed, it does not come back, but the save button stays.

Fire a funnel step for each toolbox section the visitor opens (`colour`, `handle`, `letterplate`, `knocker`, `more`), with the chosen option as the choice.

### 4. After saving: side and top lights

The saved screen confirms "Saved. We've emailed you a link to your design." It then asks: "Does your doorway have glass at the side or top? It helps us price it properly." Fire `frame`.

All 21 Endurance frame layouts are offered, as three small choices:

| 1 · Where | 2 · Side panel style | Endurance layout |
|---|---|---|
| Left / Right | Full glass · Midrail · Half flag | Sidelight Left/Right · …with Midrail · Half Flag Sidelight Left/Right |
| Both sides | Full glass · Midrails · Half flags | Double Sidelight · …with Midrails · …with Half Flags |
| Top + left / right | same three | Toplight with Sidelight Left/Right · …with Midrail · Toplight with Half Flag Left/Right |
| Top + both | same three | Toplight with Sidelight Both · …with Midrails · Toplight with Half Flag Both |
| Top only | (style row hidden) | Toplight, or Toplight (full) shown as "Full-width top light" |
| Just the door | — | No Sidelights |

- The "Where" choice is two rows of chips: sides (just the door / left / right / both) and top (none / top light / full-width).
- **Glass:** the side-light glass choice, plus glazed or solid panels where the catalogue offers both. These are Classic's `Sidelight type` and `Sidelight glass` fields.
- **"Just the door" acts as Next.** Tapping it saves the answer and moves straight to the quote.
- Nothing is pre-selected.
- The door picture updates as they choose, and the saved design is updated with `POST /save/{token}`.
- **Drawing top lights (Daniel's choice).** `data/render-model.json` has side-panel artwork for only 9 layouts and no top-light artwork at all. Capture the real top-light artwork and geometry from the logged-in Endurance designer, the same way the style slabs were captured (see the endurance-is-source-of-truth memory). Extend `tools/build-render-model.js` so all 21 layouts render.
  - Classic's rendering must not change. Either keep the new layers out of the paths Classic uses, or prove with a test that Classic's output is identical.
  - **Stopgap only if the capture fails:** draw an approximate glazed top light in Designer 3 only, from the frame geometry, and say so in the release notes.
- Double doors skip this step, because the catalogue offers only No Sidelights for them.
- Interpretation to check with Endurance: "Toplight (full)" is assumed to be a top light spanning the whole frame width.

"Keep customising the door" (a text link) returns to the door screen. The design stays saved, and further changes update it.

### 5. Quote or call back

Visitors must have saved (given an email) before either button appears. There is no quote button on the door screen, because Daniel described save first, then quote or call back.

- **Get a no-obligation quote (primary button).** Swipe 2's second step: name and UK postcode, phone optional, no consent tick, through `POST /save/{token}/quote`. It converts the saved row to kind `enquiry` and fires `hd_dd_enquiry_submitted`, which counts as the A/B conversion. Fire `quoteform` when the form opens and `lead` on success.
- **Request a call back about this door (secondary button).** A new short form (name, phone required) through a new `POST /save/{token}/callback`. It stores kind `callback` (fits the existing `kind` VARCHAR(10)), emails the business like an enquiry with the subject marked as a call back, and sends the customer its own short confirmation email. The copy must not reuse the quote's "your price is on its way", and must follow the copy rule.
  - **It is a lead for the business but not an A/B conversion (Daniel, 2026-10-21).** Classic visitors' call backs come through the Thrive lightbox and are never credited to Classic, so counting Designer 3's would tilt the test.
  - So the route must not mark `converted_at`. Use a separate hook such as `hd_dd_callback_requested`, or have `on_enquiry` skip kind `callback`; the builder decides.
  - It must not call `hdAnalytics.lead()`. Fire the funnel step `callback` instead.
  - Store the experiment ref in the payload, so the scoreboard can show call backs per arm as a separate figure.
- Reuse Swipe 2's guide price line on this screen: "£1,500 to £4,000, most pay around £2,000".
- Reuse Swipe 2's trust block.
- The one-working-day turnaround copy applies here too.
- wp-admin's enquiry list should label call-back rows clearly, and the "Saved designs" filter should not swallow them.

### Returning savers

The emailed `?design=` link reopens **Designer 3**, whatever arm the visitor would otherwise get, using the stored flow (`storedFlow` in `experiment.js`). It opens on the saved screen. The existing `price=1` link focuses the quote form. A design that has already become an enquiry or call back shows Swipe 2's "already sent" state.

## Technical shape (decided)

- **New flow key `designer3`, label "Designer 3",** registered in `HD_DD_Experiments::flows()` next to `classic` and `swipe2`. Not added to `RETIRED`: Swipe 2 must stay reachable for its saved links and `?flow=swipe2`.
- **Funnel name `door-designer-v4`.** `door-designer-v3` is Swipe 2's, and one funnel per flow keeps the manager's step ordering correct (see the swipe A/B memory). Add `FUNNELS.designer3` and a new step order in `wizard/funnel.js`:
  1. `opened`
  2. `type`
  3. `style`
  4. `shown`
  5. `colour`
  6. `handle`
  7. `letterplate`
  8. `knocker`
  9. `more`
  10. `saved`
  11. `frame`
  12. `quoteform`
  13. `callback`
  14. `lead`

  Keys must be lower-case, because the analytics pipeline lower-cases them.
- **New files** under `assets/js/designer3/` and `assets/css/hd-designer3.css`, enqueued in `class-hd-assets.php` like Swipe 2. Reuse the shared modules (`preview.js`, `render-model.js`, `design-shared.js`, `enquiry.js`, `trust.js`, `review-save.js` where it fits) without changing what Classic renders.
- `canRunSwipe`-style fallback: if Designer 3 can't run (for example, no canvas), fall back to Classic and say so in the console.
- Tests in the plugin's existing style (`node tests/js/*.test.js`, `php tests/php/run.php`). At minimum, cover:
  - the defaults resolver, including the position rules
  - the frame mapping (all 21 layouts reachable, each "Where" and "Style" pair mapping to exactly one layout)
  - the callback route
  - flow registration and return-link flow
  - the copy rule extended to the new folder
  - the control-arm test, untouched and passing

## Changing over the test

On release day, in this order:

1. **Capture everything first.** Add a wp-admin "Download test data" action on the Experiments page. It produces one JSON file with:
   - the current experiment option
   - the full history option
   - every `hd_dd_experiment_visitors` row for all experiment ids
   - the enquiries whose payload carries an experiment id (reference, kind, flow, arm, timestamps; no other customer details are needed)

   Save that file outside WordPress (Daniel's Drive or the repo's `docs/reports/`, not committed if it holds personal data). Visitor rows already survive a stop, so this is a belt-and-braces copy.
2. Push the final Classic vs Swipe 2 numbers to the manager app (see below).
3. **Stop** Classic vs Swipe 2. `end()` writes its stats, decision and outcome to history.
4. **Start** Classic (control) vs Designer 3 (challenger) at 50%.
5. Daniel checks Designer 3 on his phone with `?flow=designer3&notrack=1` **before** step 3. One real save plus one quote request, deleted afterwards as before.

Release order: manager app first, then the analytics plugin, then the designer plugin. Purge any page cache after the update.

## Manager app

### Paths

- Label `door-designer-v4` as "Designer 3".
- From the changeover date, `door-designer-v4` is the current designer funnel and `door-designer-v3` (Swipe 2) moves to the previous view. Implement this as the existing `RETIRED_DESIGNER_FUNNELS` / `CURRENT_DESIGNER_FUNNELS` and era split allow. The builder decides whether that needs a second era date.

### Scoreboard (new)

A "Designer A/B test" panel on the Marketing page showing:

- **The running test:**
  - flows, split, start date, days run
  - visitors, leads (quote requests, the test's conversion) and conversion rate per arm, plus **call backs per arm as a separate figure**
  - chance the challenger is better, and expected loss per arm
  - what is still needed before a winner can be called (the `guards`)
  - split changes
- **Finished tests:** dates, flows, final numbers, outcome. The previous three runs should appear once the history has been pushed.

How the data gets there:

- The designer plugin exposes a read-only snapshot: current experiment, `arms()`, `HD_DD_Experiment_Stats::evaluate()` output and history.
- The analytics plugin (which already holds the manager endpoint and API key) includes that snapshot in its push when the designer plugin's class exists. That covers the nightly push and "Push to dashboard now".
- The manager stores it through a new authenticated endpoint, or a new field on `web-metrics`. The builder decides which; the same Bearer key auth applies.
- The manager keeps the latest snapshot plus the finished history.
- *My call:* nightly plus on-demand freshness is enough. No real-time feed.
- Leads should also be pushed when they happen if that is cheap: the analytics plugin can schedule a single push a few minutes after `hd_dd_enquiry_submitted`. The builder decides.

Manager tests use the existing vitest setup.

## Left to the builder

- How popularity data for the defaults is gathered, and the exact fallback for each style.
- Exact dot styling and animation (subtle pulse is fine), banner wording within the copy rule, nudge wording.
- Whether the toolbox options open inline (desktop) or in a popover.
- The manager endpoint shape and Convex schema for experiment snapshots.
- Whether the scoreboard reuses the wp-admin wording ("Chance Swipe 2 beats Classic", "Still needed…").

## Decided in conversation

Daniel's decisions:
- Type, then style, then the finished door.
- Dots on the door plus a toolbox (colour, door style, handle, letterplate, knocker). No spy hole.
- Most popular furniture per style, or a best guess, respecting glass and positions.
- A gentle nudge after a few changes.
- After saving: side and top lights as an encouraged extra (all options, including half flags), with "Just the door" moving on.
- Quote as the priority, call back as the other option.
- Phone layout B.
- Stop Swipe 2, capture all its data, start Classic vs Designer 3.
- Scoreboard and paths in the manager app.
- Only quote requests count as the test's conversion; call backs are shown separately.
- Real Endurance top-light artwork, with an approximate drawing only as a stopgap.

My calls:
- The quote and call back as two buttons.
- The call-back confirmation email.
- The "More options" row.
- The nudge after the third change.
- The funnel name and step keys.
- Nothing pre-selected on the frame step.
- Nightly plus on-demand scoreboard freshness.
- The data export format.
