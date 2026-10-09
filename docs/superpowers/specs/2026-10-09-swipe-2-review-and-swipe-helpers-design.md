# Swipe 2: swipe helpers and a two-step Review — Design

**Date:** 2026-10-09
**Status:** Implemented on `feat/swipe-2` (v0.4.0), not yet released.
**Repos:** `codescribler/doordesigner-wp` (this plugin) and a small change in the manager app
for the new "opened" figure (see Analytics). The manager is released first.

## Goal

More quote requests from the designer. Two problems are being addressed in one release:

1. **Review leaks twice.** Read from the manager Marketing page on 2026-10-09 (data from 11 Jul):

   | Flow | Reached Review | Opened the form | Enquired | Review → lead |
   |---|---|---|---|---|
   | Classic | 136 | 63 (46%) | 35 | 26% |
   | Swipe | 23 | 11 (48%) | 3 | 13% |

   About half never open the form, and 40 to 55% of those who do abandon it with nothing captured.
2. **The swipe screens are not self-explanatory on a phone.** Watching a first-time user, Daniel saw
   that she did not realise the doors swipe, and did not see the bottom bar as the button that
   selects the door in view.

Success = for the new version, a higher Review → lead rate than swipe's 13% and classic's 26%,
with Review → saved and saved → lead as the early signals (leads arrive at about four a week, so
the lead count alone takes months).

## Decisions made with Daniel (2026-10-09)

| Question | Decision |
|---|---|
| Scope | Swipe helpers and the Review rework together, in one release. |
| How it is tested | As a **new version and a new experiment**: Classic (control) vs the new version. The old Swipe's statistics are kept, untouched. Old Swipe is retired. |
| Guide price | One line for every door: "Fitted doors typically cost £1,500 to £4,000. Most of our customers pay around £2,000." Shown on Review before any ask. |
| Save vs quote | Two steps. Step 1: email only, saves at once. Step 2: name and postcode (phone optional) for the exact fitted price. |
| Email-only save | Stored, marked as a save, emailed to Daniel. **Not** a lead in the A/B test or the funnel. |
| Saver email | One email straight away: door picture, link back, guide price, "Get my exact price" button. No reminder. |
| Turnaround promise | "within one working day". |
| Spec list on Review | One-line summary with a link that expands the full list with Edit. |
| Top save button | Removed. The door is shown first. |
| Design name field | Removed. Designs are named automatically. |
| Return link | A saved design reopens in the flow it was saved from and is not counted as a new visitor. |
| Swipe helpers | All four: hint on the door, arrows, restyled button, pulse and prompt. |
| Visitors who never start | Count everyone who opens the designer, in **both** flows, so the dashboard shows how many arrive and do not start. Tracking only; nothing visible changes in classic. |
| Standing rules | Classic is the control and what its visitors see must not change. Nothing customer-facing may say or imply we won't phone (`tests/js/copy-rule.test.js`). |

## The new version as its own flow

- New flow key **`swipe2`**, labelled "Swipe 2" in wp-admin. It is the existing swipe code plus
  the changes below; the old `swipe` flow is not kept as a second copy.
- It reports to a new analytics funnel **`door-designer-v3`**, so `door-designer-v2` stops
  receiving events and stays on the dashboard as the old version's record.
- `?flow=swipe` and `flow="swipe"` keep working as an alias for `swipe2` (forced, never counted).
- **On upgrade**, a running experiment that names `swipe` is stopped automatically and moved to
  Finished tests with its final numbers, because its challenger no longer exists. If the site
  default flow is `swipe` it becomes `swipe2`.
- Daniel then checks `?flow=swipe2&notrack=1` on his phone and starts **Classic vs Swipe 2** from
  the Experiments page. A new experiment id means every visitor is assigned afresh.

## Swipe helpers (every carousel screen)

- **Hint on the card.** A pill over the lower part of the first card with a moving hand:
  "Swipe to see more doors" on touch devices, "Use the arrows to see more" otherwise. It is
  removed on the first swipe, arrow tap or thumbnail tap. If none happens within 4 seconds the
  existing card wobble plays and the pill stays. It replaces the once-per-browser wobble
  (`hd_sw_nudged`); the hint shows on the first carousel screen of each visit only.
- **Arrows.** Previous and next buttons on the carousel edges, 44px touch targets, hidden at the
  ends of the list, labelled for screen readers.
- **Button.** On phones the action button becomes a rounded pill with a margin all round,
  floating over a pale strip with a soft shadow, instead of a square bar flush with the screen
  edge. Label on the showcase: "Choose this door: Abbott →". Later screens keep their
  "Next: …" labels in the new style.
- **Pulse and prompt.** The button pulses once the first time the carousel settles on a card,
  and once more after the first swipe. The showcase shows one line above the button:
  "Happy with this one? Tap Choose."
- All motion is off under `prefers-reduced-motion`; the pill then shows without animation.

## Review screen

```
[ door reveal ]
Abbott · Anthracite Grey · Satin glass · Chrome      See all options / edit
------------------------------------------------------------------
Fitted doors typically cost £1,500 to £4,000.
Most of our customers pay around £2,000.
★ 10/10 on Checkatrade · 79 reviews
"Real customer quote" — Checkatrade review, Town        (when set in wp-admin)
------------------------------------------------------------------
Step 1   Email me my design
         [ email ]  [ Email me my design ]
         We'll send a link so you can come back to it any time.
------------------------------------------------------------------
Step 2   (replaces step 1 once saved)
         Saved. We've emailed you the link.
         Want your exact fitted price? We'll send it within one working day.
         [ name ] [ postcode ] [ phone (optional) ]  [ Get my exact price ]
         By asking for a price you're agreeing we can use your details to send it
         and get in touch about your door.
------------------------------------------------------------------
small print: preview is an impression, not a perfect representation
```

- The save bar above the door is removed. The progress counter shows the Review as the last
  step, as now.
- **Summary line:** design, colour, glass, hardware. "See all options / edit" expands the
  current full list with its Edit links.
- **Floating button on phones:** "Email me my design" while the email field is off-screen; it
  scrolls to and focuses the field. Hidden once the field is in view and after saving.
- **Step 1** validates the email, saves, and swaps to step 2 in place. Editing the design after
  saving and saving again updates the same record.
- **Step 2** explains the postcode ("so we can check we cover you and price the fitting").
  On success the existing thank-you screen shows, with its guide price corrected to match.
- The guide price text is a wp-admin setting (Door Enquiries → Settings → Review step) with the
  agreed sentence as the default. An empty setting hides the line.

## Server

Extend the existing `hd_enquiries` table; a save and its later quote request are one row.

- New column **`kind`**: `save` or `enquiry`. Existing rows are `enquiry`.
- New column **`flow`**: the flow the design was saved from.
- **`POST /save`** — email, design, snapshot image, page URL, flow, experiment reference,
  honeypot. Inserts a `save` row with the automatic design name, sends the saver email and a
  "New saved design" email to Daniel, returns the token. It does **not** fire
  `hd_dd_enquiry_submitted`, so it is not an A/B conversion. Same nonce, honeypot and
  failure-logging rules as `/enquiry`.
- **`POST /save/{token}`** — a changed design for an existing save; updates the row.
- **`POST /save/{token}/quote`** — name, postcode, optional phone. Turns the row into an
  `enquiry`, fires `hd_dd_enquiry_submitted` with the experiment reference stored on the row at
  save time, and sends Daniel the usual "New door enquiry" email and the customer the usual
  acknowledgement. Calling it twice changes nothing the second time.
- **`GET /design/{token}`** also returns `flow` and `kind` (still no personal data).
- `/enquiry` is unchanged: classic keeps posting to it.
- A quote request claims the saved record atomically, so two simultaneous requests send one set of emails; a 404 or 409 on a token route is not logged as a failed submission.

### Emails

- **To the saver, on save:** door picture, "Open my design" button, the guide price sentence, and
  a "Get my exact price" button linking to `?design=<token>&price=1`, which opens Review at
  step 2.
- **To Daniel, on save:** subject "New saved design — email address", clearly marked as a save
  with no price requested yet.
- **To Daniel, on quote:** unchanged subject and layout, so the Gmail history stays searchable.

### wp-admin

- Door Enquiries list: saves show a "Saved, no price requested" label and can be filtered; the
  heading count separates enquiries from saves.
- Settings → Review step: the guide price text.
- Experiments: "Swipe 2" is offered as a flow; "Swipe" remains only as a label in Finished tests.

## Return link

`boot.js` currently assigns a flow before it knows a saved design is being opened, so a swipe
saver returning on another device can land in classic's quote form (seen on 2026-10-05:
HD-2026-000055 then a duplicate, 000056). Change: when `?design=` is present, fetch the design
first and open it in its stored `flow` (`swipe` rows open in `swipe2`; rows with no flow use
today's behaviour). Such a visit makes no new assignment and no exposure. A quote request from
it converts for the arm recorded when the design was saved. This is the only change to code
shared with classic; a classic visitor without `?design=` sees nothing different.

## Analytics

### Visitors who open the designer but do not start (both flows)

Today a visitor first appears in the funnel when they make their first choice (Type in classic,
Choose a design in swipe). Anyone who arrives and leaves without doing that is invisible, so
the dashboard cannot say whether people are failing to start.

- New step **`opened`**, sent once per page load when the designer has drawn its first screen.
  It is sent from `boot.js` for whichever flow starts, to that flow's own funnel
  (`door-designer` for classic, `door-designer-v3` for Swipe 2). Classic's files and what its
  visitors see are untouched. Forced flows and `?notrack` visits follow the existing rules.
- New step **`browsed`**, Swipe 2 only, sent on the first swipe, arrow tap, thumbnail tap or
  filter tap. It separates "looked and left" from "browsed but never pressed Choose", which is
  the measure of whether the swipe hint and the new button work.
- **"Started" keeps its meaning.** The manager treats a funnel's lowest-ordered step as
  "started", so `opened` and `browsed` must not become that step or every cohort figure would
  shift. Manager-app change: accept these two step keys as pre-start steps, leave "Started"
  as the first choice, and show per funnel "Opened the designer: N · did not start: M (x%)"
  above the existing steps, with `browsed` between them for Swipe 2.
- The manager's push validator is strict, so the manager is released before the plugin sends
  the new steps (same order as the version-cohorts rollout). The site's hd-analytics plugin accepts any step key and clamps `order` to 0–99, so `opened` at order 0 needs no change there. The manager's push validator already accepts free-form steps; the manager change is only so `opened`/`browsed` are not mistaken for "started".
- History: there is no `opened` data before this release, so "did not start" is shown only
  from the release date. The Experiments page's "Visitors (opened the designer)" column is the
  only earlier evidence: since 1 Oct, about 17 of 18 classic visitors and 17 of 21 swipe
  visitors went on to start.

### Funnel and events

- Funnel `door-designer-v3`: the v2 step order up to `review` (15), then **`saved`** (16), then
  the lead. There is no `details` step because the form no longer opens as a separate view.
- Clarity events: `door_saved`, `door_quote_submitted` (unchanged name for the conversion).
- The manager dashboard draws funnels and steps from whatever names arrive (v2 appeared without
  a manager change). To verify after release: the "Door designer v3" block appears, the `saved`
  step is labelled sensibly, and the version cohort panel lists the new release. Any label
  tidy-up goes in with the manager change above.

## What does not change

- Classic: its Review step, quote form (`enquiry-quote.js`), server rules and emails.
  `tests/js/control-arm.test.js` must keep passing. The only additions that reach classic
  visitors are invisible: the `opened` count and the return-link fix.
- The enquiry reference counter, the token format and the 90-day link lifetime.
- Releases 2 and 3 of the save-design spec ("My designs", estimates via wp-admin and API).

## Out of scope

- Reminder emails to savers.
- A guide price per door type.
- A contact-preference choice (email, text or call): it risks implying we won't phone.
- Showing a "saved" count per arm on the Experiments page.

## Testing

- JS unit tests beside the existing swipe ones: hint show/dismiss/timeout, arrows at the list
  ends, button labels, step 1 → step 2 state, email validation, re-save updates the same token,
  `?design=&price=1` opens at step 2, `?flow=swipe` alias, return link opens the stored flow
  without an assignment.
- PHP: `kind`/`flow` migration, `/save`, `/save/{token}`, `/save/{token}/quote` (idempotent,
  fires the conversion once with the stored arm), `/design/{token}` fields, the upgrade stopping
  a running `swipe` experiment.
- `opened` fires once per load in each flow and not when muted; `browsed` fires once.
- Manager app: the two pre-start steps are accepted, "Started" is unchanged for existing data,
  and the "did not start" figure is right for a funnel with and without `opened` data.
- Copy-rule and control-arm tests pass.
- Before release, in a real WordPress: one save and one quote through `?flow=swipe2&notrack=1`,
  checking the row, both customer emails and both owner emails, marked TEST for deletion.

## Rollout

0. Release the manager app first and confirm "Push to dashboard now" still reads OK.
1. Release the plugin; Daniel updates it in wp-admin. The running Classic vs Swipe test stops
   and is archived.
2. Daniel tries `?flow=swipe2&notrack=1` on his phone and adds customer quotes in Settings.
3. Daniel starts Classic vs Swipe 2 on the Experiments page.
4. Check the dashboard shows the v3 funnel after the next nightly push.
