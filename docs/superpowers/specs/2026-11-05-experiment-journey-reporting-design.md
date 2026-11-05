# A/B test: saves, journey and device reporting

Date: 2026-11-05. Daniel asked for deeper A/B reporting and handed the display and plan to Claude ("you decide"), with approval to implement.

## Why

The Classic vs Designer 3 test decides on quote requests only. Daniel can't see:
- **Saves.** Designer 3 captures leads by save, and Classic has no save. The save already carries the visitor's arm (`hd_dd_design_saved`), but nothing counts it.
- **Where each arm loses people.** The hdAnalytics funnels count events per flow per day, not people. They include forced and returning visits, and the two flows have different steps, so "starts well, falls over later" is invisible.
- **Phone vs desktop.**

## Non-goals

- **The win rule stays as it is.** Quote requests per visitor still decide the test (P≥97.5%, ≥15 leads per arm, ≥14 days), so the running test isn't redefined midway.
- **Classic (the control) changes in no visible way.** No Classic file changes: milestones are read from the funnel calls Classic already makes, inside the shared `funnel.js`.
- **No lead-quality tracking** (quote → sale) in this release.

## What gets measured (per experiment visitor, in `wp_hd_dd_experiment_visitors`)

| Column | Set when | Classic | Designer 3 |
|---|---|---|---|
| `exposed_at` (exists) | designer opened | ✓ | ✓ |
| `started_at` | first choice | any choice step | type / style |
| `shown_at` | saw their finished door | reached Review | complete door shown (`shown`) |
| `form_at` | opened the quote form | `details` | `quoteform` |
| `saved_at` | saved by email | — | `hd_dd_design_saved` (server) |
| `converted_at` (exists) | asked for a quote | ✓ | ✓ |
| `callback_at` (exists) | asked for a call back | — | ✓ |
| `device` | at expose | phone (<768px) / desktop | same |

Rules:
- **Recorded once, never overwritten** (`COALESCE`).
- **Later milestones fill in earlier ones**, so a lost beacon can't make the funnel go backwards:
  - a save fills in started and shown;
  - a quote fills in started, shown and form;
  - a call back fills in started and shown.
- **Existing saves are backfilled once.** On upgrade, each experiment-tagged row from a save-first flow (swipe2 or designer3) gets `saved_at = created_at`.
- **The journey counts only visitors who arrived after tracking began.** That's `hd_dd_experiment_journey_since`, set on upgrade; earlier visitors have no milestones. Saves, any-lead and device totals cover all visitors.

## Transport

- **`POST experiment/step`** with `{experimentId, visitorId, arm, step: started|shown|form}`.
  - Public, like expose, with its own per-IP limit of 300 an hour.
  - Updates only an existing visitor row.
- **The browser fires each milestone at most once per page.** Steps are held until the expose call has finished, so the row exists first.
  - This only happens for counted visitors (not forced, muted or return links), because boot passes the assignment only then.
- **`expose` also sends `device`.**

## Snapshot (manager contract), added to each arm and optional in Convex

```
saves, anyLeads, savedThenQuoted,
journey: { since, opened, started, shown, saved, form, quoted, callbacks, anyLeads },
devices: { phone|desktop|unknown: { visitors, leads, anyLeads } }
```
- **Finished runs keep what they had.** History stores whatever `arms()` returned at the end; older runs simply lack the new fields.
- **The manager must be deployed first.** Convex validators are strict, so the new optional fields have to be accepted before the plugin sends them.

## Display (manager → Marketing → Designer A/B test)

1. **Scoreboard.** It keeps Visitors, Quote requests, Conversion (still the deciding figure) and Expected loss, and adds:
   - **Saves**;
   - **Call backs**;
   - **Any lead**: count and rate, where any lead means a quote, save or call back.
2. **"Where visitors drop out".** One row per milestone, one column per arm. Each cell shows the count and the % of openers.
   - "—" where the flow doesn't offer the step (Classic has no save or call back).
   - A note gives the start date and explains that "saw their finished door" means Review in Classic and the complete door in Designer 3.
3. **"Savers who went on to ask for a quote"**: one line per arm that offers saves.
4. **"Phone vs desktop"**: visitors, quote requests, conversion and any lead, per arm and device.
5. **The footnote is reworded**: quote requests decide; everything else explains *why*.

wp-admin's experiments table gains Saves and Any lead columns.

## Release order

1. Manager (Convex validators + UI), via `npx vercel --prod` from a clean worktree.
2. Plugin minor version (0.6.0): tag and GitHub release, then update in wp-admin and purge the page cache.
3. Press "Push to dashboard now" to check.

## Tasks

1. Plugin server: schema v4 (columns + backfill + since), `experiment/step` route, tracking listeners. Tests in `tests/php/experiment-tracking.test.php`.
2. Plugin server: `HD_DD_Experiment_Journey::summarise()` (pure), wired into `arms()` and the export. Tests.
3. Plugin client:
   - `funnel.js` milestone mapping and `attach()`;
   - `experiment.js` device on expose;
   - `boot.js` attaches after expose.

   Tests in `tests/js/milestones.test.js`.
4. wp-admin columns.
5. Manager: validators, view types and pure helpers (`lib/experimentJourney.ts` with tests), and the scoreboard plus new journey/device panels.
6. Version bump and README test list.
