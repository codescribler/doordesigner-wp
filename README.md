# Hertfordshire Doors — Door Designer (WordPress plugin)

An **enquiry-only** composite-door configurator for Hertfordshire Doors. A customer
visually designs an Endurance composite door; the chosen spec is captured in
Endurance's **exact option vocabulary** and sent to the business as an enquiry
(emailed + stored in wp-admin). It deliberately shows **no price**, asks for **no
sizes**, and does **not** let the customer pick a lock/cylinder — those belong to
the survey/quoting step.

The captured spec feeds an existing downstream "quote-creator" workflow that
re-creates the design in Endurance's trade portal to price it, so label strings are
preserved exactly.

## Status

| Area | State |
|------|-------|
| Plugin backbone (activation, shortcode, scoped assets, REST, DB, admin, updater) | ✅ built |
| Enquiry capture → validate → save → email (with structured payload) | ✅ built |
| GitHub auto-update wiring | ✅ wired (needs the library vendored + repo URL set) |
| Guided visual wizard (one step at a time, category-first styles, live preview, progress, back/edit) | ✅ built — `assets/js/wizard/` implements Layout C flow; `tools/tests/test-wizard-controller.js` validates controller logic; step-config resolves per-type rules (Double=no frame-shape/+Master Leaf; Avantal=no internal-colour/knocker) |
| Funnel analytics | ✅ built — every wizard step and the final submit are reported to the site's `hdAnalytics` beacon (`assets/js/wizard/funnel.js`), stamped with the plugin version so the manager's Marketing page shows completion per release |
| Compact "customer view" catalogue (REST) | ✅ built — serves 176 KB instead of the 1.2 MB full file |
| Layer model + assembler (`tools/build-render-model.js`, `assets/js/render-model.js`) | ✅ built & validated across all 4 types — shared Node/browser assembler resolves style/colour/cassette/glazing/frame/handle/knocker + double-door leaves into geometry-placed layers (`data/render-model.json`, 253 KB) |
| Browser compositor (canvas) + UI wiring | ✅ built — `assets/js/preview.js` paints the layers; app fetches `/render-model`, renders on every change; `/preview-test.html` is a standalone QA harness (no WordPress needed) |
| Sidelight rendering | ✅ built — door shifts into the centre, frame swaps to the wide variant, side panels drawn (Left/Right/Double + midrail/half-flag). Approximation: side glass uses the captured representative pattern (per-glass/solid-slab fidelity is a fast-follow); toplight shapes not yet captured |
| Image mirroring (download Endurance assets, serve locally) | ✅ built (`tools/mirror-images.js`) — downloads all captured image URLs to `assets/img/endurance/`; set **Preview image base URL** in Settings to the mirror |
| Handle/knocker hardware-colour recolour | ⚙️ best-effort (uses captured baseline colour); full recolour is a fast-follow |
| Brand styling (fonts/colours of hertfordshiredoors.co.uk) | ⚙️ brand accent colour + Glazed/Contemporary category split are tunables in `assets/css`; base templates shipped |

## Installation

1. Copy this folder into `wp-content/plugins/hd-door-designer/` (or install the
   release zip) and activate it.
2. Vendor the update library (one-off): `composer require yahnis-elsts/plugin-update-checker`
   (or drop it into `vendor/plugin-update-checker/`).
3. Drop the catalogue data file into `data/endurance-catalogue-full.json`
   (see **Catalogue data** below).
4. Create a page, add the shortcode `[hd_door_designer]`, and point your site's
   "Design your door" button at that page's URL.
5. Under **Door Enquiries → Settings**, set the recipient email and the GitHub repo URL.

### Shortcode

```
[hd_door_designer]
[hd_door_designer door_type="Single Door"]   // optional pre-seed
[hd_door_designer flow="swipe"]              // force a designer flow (not counted in A/B tests)
```

You can also pre-seed via URL: `…/door-designer/?door_type=Avantal`.
Any element on the site can launch the flow by linking to the page URL — the launch
button does **not** live in the plugin.

## Catalogue data (the data backbone)

The entire option catalogue — labels, Endurance option **IDs**, render **image
layers** (with geometry) and the **per-style glazing matrix** — is generated from
the live designer's own client-side state, not hand-built.

**To (re)generate it:**
1. Log in to the Endurance trade portal and open the Door Designer (`Default.aspx`).
2. Open the browser console (F12 → Console).
3. Paste the whole of [`tools/endurance-catalogue-extractor.js`](tools/endurance-catalogue-extractor.js).
4. Run:
   ```js
   await EXT.captureAllTypes();   // walks all 4 door types + per-style glazing
   EXT.download();                // saves endurance-catalogue-full.json
   ```
5. Put the downloaded file at `data/endurance-catalogue-full.json`.

It only mutates the in-progress design — it never saves or requests a quote. Don't
click Quote/Order while it runs.

### Catalogue drift / sync

Endurance change options over time. To sync:
1. Re-run the extractor and replace `data/endurance-catalogue-full.json`.
2. Rebuild the preview layer model: `node tools/build-render-model.js` → writes
   `data/render-model.json` (run with `--test` to print a sample assembly).
3. Re-mirror any new image assets: `node tools/mirror-images.js` → downloads all
   captured image URLs to `assets/img/endurance/` (requires network access to Endurance).

A diff of the old vs new capture shows what changed. Logic never needs editing for
content changes — the data is fully decoupled.

### Data shape

```jsonc
{
  "Single Door": {
    "doorType": "Single Door",
    "fields": {
      "<Heading>": {
        "heading": "Door Design",
        "category": 12,
        "current": "Ketu",
        "currentId": 0,
        "choices": [
          { "label": "Ketu", "id": 0, "images": [ { "url": "…", "urlRight": "…", "cx": 0, "cy": 0, "w": 0, "h": 0, "rotation": 0, "flipH": false } ] }
        ]
      }
    },
    "glazingByStyle": { "Ketu": [ { "label": "Satin", "id": 0 } ] },
    "capturedAt": "…"
  },
  "Double Door": { … }, "Stable Door": { … }, "Avantal": { … }
}
```

Field order differs per door type — everything is keyed by **heading**, never index.

## Enquiry payload

Every stored enquiry and notification email carries a machine-readable payload in
Endurance's vocabulary, so the quote-creator (or Claude) can rebuild the door:

```json
{
  "reference": "HD-2026-000123",
  "submittedAt": "2026-06-26T10:00:00Z",
  "customer": { "name": "…", "telephone": "…", "email": "…", "postcode": "…" },
  "design": {
    "Door Type":  { "label": "Single Door", "id": 0 },
    "Door Design":{ "label": "Ketu", "id": 0 }
  },
  "derived": { "suggestedLock": "Guardian5 Lock" }
}
```

Labels are resolved **server-side from the catalogue by id**, so they match the
downstream portal exactly (including odd casing / trailing spaces). `suggestedLock`
is derived from the handle and is **non-binding** — the lock is decided at quoting.

## Nothing is ever silently dropped

Hard-won rules — a real enquiry was lost in September 2026 when browser autofill
filled the anti-spam field and the server answered with a fake success:

- **Honeypot hits are stored, not discarded.** A filled `hd_hp` field marks the enquiry
  `status = flagged`, adds `"flags": ["honeypot"]` to the payload and prefixes the
  notification subject with `[Possible bot]`. The customer still sees the normal
  thank-you and gets the acknowledgement email. Treat flagged rows as real unless the
  details look fake.
- **Failed submissions are recorded and emailed.** Any POST to `/enquiry` that does not
  end in a stored enquiry (consent missing, validation error, database error, or a nonce
  failure the browser could not heal) is stored as a `status = failed` row (reference
  `HD-F-…`, no reload token) with whatever the customer typed, written to the PHP error
  log, and emailed to the enquiry recipients as `Door designer: submission FAILED — …`.
  Failure emails are throttled to one per IP per 10 minutes; rows are always stored.
  See `includes/class-hd-failure-log.php`.
- **Stale nonces heal themselves.** A designer tab left open past the nonce lifetime used
  to fail with "Cookie check failed". `assets/js/api-client.js` fetches a fresh nonce from
  `GET /nonce` and retries once (header `X-HD-DD-Attempt: 2`); only a failure on that
  retry counts as a failed submission.

Flagged and failed rows carry a coloured badge in **Door Enquiries** and a notice on the
detail view.

## The two designer flows

- **Classic** (`assets/js/hd-door-designer.js` + `assets/js/wizard/`): door type → frame → style
  → … one step at a time. Reports to the analytics funnel **`door-designer`**.
- **Swipe** (`assets/js/swipe/`): browse every design first (a cover-flow showcase with filter
  chips), then door type (+ hinge side), colour (+ inside colour), glass, handle (+ finish),
  letterplate, knocker and side panels. Every screen is a swipeable carousel of the customer's
  own door with that option applied, with a helper line and a "Love it · next: …" button.
  Reports to its own funnel **`door-designer-v2`** (lower-case step keys; order in
  `HD_DD_Funnel.ORDER_V2`), so the manager's per-funnel "started" and step order stay correct
  for both. Choices go through the same wizard controller and step rules as classic, so the
  enquiry payload is identical.

`assets/js/boot.js` starts whichever flow a visitor gets (forced by `?flow=` / shortcode
`flow=""`, else the running A/B test's arm, else the default flow). Shared by both:
`design-shared.js` (finish/furniture rules), `enquiry.js` (form, submit, thank-you).

**QA without WordPress** (`python -m http.server 8000` from the plugin root):
- `tools/swipe-test.html` — the swipe flow; `tools/phone.html` shows it at 390 and 360px.
- `tools/preview-test.html` — the classic flow.
- `tools/boot-test.html` — the real entry point with a stubbed WordPress and a running 50/50
  test; REST calls (exposure, enquiry) are logged to `window.__rest` instead of sent.

### Keeping your own visits out of the stats

Open the designer once with **`?notrack=1`** (e.g. `hertfordshiredoors.co.uk/door-designer/?notrack=1`)
on each phone/browser you use. From then on that browser sends no designer analytics: no
hdAnalytics funnel steps or leads, no Clarity events, and no A/B-test exposure or conversion
(its enquiries still arrive as normal). A small "Analytics off (you)" tag shows while it's on.
**`?notrack=0`** switches counting back on. Being logged in to WordPress already stops the
site-wide analytics plugin counting you.

## A/B experiments

The designer has more than one flow (`classic`, `swipe`; add more with the `hd_dd_flows`
filter). **Door Enquiries → Settings → Default designer flow** is what everyone sees
when no test is running.

**Start a test** under **Door Enquiries → Experiments**: pick the control (usually the
current default), the challenger, and the % of new visitors who get the challenger
(default 50). Only one test runs at a time. Each visitor is assigned in their browser
and kept on the same flow for 90 days; a visitor is counted once when the designer
opens, and converts once when they send an enquiry (flagged/honeypot enquiries count,
failed ones don't). Leads from visitors with no recorded designer visit are shown as
"unattributed" and not counted.

**Testing a flow yourself is never counted:** `?flow=swipe` in the URL or a shortcode
`flow="swipe"` forces that flow and skips the experiment entirely.

**The emails.** A daily check emails the enquiry recipients once when:
- **"Door designer A/B test: X is the clear winner"** — one flow has at least a 97.5%
  chance of genuinely converting better, after at least 14 days and 15 leads in each
  flow. The email gives each flow's visitors, leads and conversion rate, the chance the
  winner is better, the "expected loss if you pick" each flow (in conversion-rate
  points) and the days run.
- **"Door designer A/B test: no clear difference"** — 26 weeks (182 days) passed without
  a winner. That is a normal outcome: keep whichever flow you prefer.

The test **keeps running** after either email until you act on the Experiments page
(which always shows live numbers, whether or not the daily check has run):
- **Make X the default** ends the test and shows X to every visitor from then on.
- **Stop test** ends it and leaves the default unchanged.

Finished tests stay in the page's history with their final numbers.

**The win rule** lives in one place, `HD_DD_Experiment_Stats::default_rule()`, and can be
adjusted with the `hd_dd_experiment_rule` filter. Its thresholds came from simulations of
this site's traffic (≈18 designer starters and 4 leads a week): when there is no real
difference, about an 8% chance per direction of wrongly calling a winner; when there is
one, about a 1% chance of promoting the worse flow. With about 4 leads a week a doubling
usually shows within about 2 months and a +50% lift in about 3 months; smaller lifts
often never become clear. Expected loss is reported but never decides.

Files: `includes/class-hd-experiments.php` (state, `POST /experiment/expose`, conversion
listener, cron), `class-hd-experiment-stats.php` (the maths),
`class-hd-experiments-admin.php` (the page), `class-hd-experiment-notifier.php` (emails),
`assets/js/experiment.js` (browser assignment). Data: option `hd_dd_experiment`
(the live test), `hd_dd_experiment_history`, table `wp_hd_dd_experiment_visitors`.

## Review step: save your design and get a price

The Review step ends with "Save my design & get my price". A save is an enquiry: it is
stored, emailed to the recipients and counted as a lead, and the customer is emailed a
link back to the design. Required: a name for the design, name, email, postcode.

**Door Enquiries → Settings → Review step** holds the Checkatrade rating, review count,
profile link and customer quotes (one per line: `Quote text | Name, Town`). Leave the
rating or count empty to hide the rating line; with no quotes, no quote is shown.

Files: `includes/class-hd-trust-settings.php`, `assets/js/trust.js`, `assets/js/enquiry.js`.
Design: `docs/superpowers/specs/2026-10-01-save-design-and-price-design.md`.

## Tests

No framework — plain Node and PHP scripts that exit non-zero on failure:

```
node tests/js/api-client.test.js      # REST client: nonce self-heal
node tests/js/funnel.test.js          # hdAnalytics reporter
node tests/js/experiment.test.js      # A/B assignment, stickiness, overrides, exposure
node tests/js/funnel-v2.test.js       # door-designer-v2 funnel order
node tests/js/design-index.test.js    # swipe showcase: design → types, Avantal cassettes
node tests/js/flow-steps.test.js      # swipe screens per door type + funnel events
node tests/js/carousel.test.js        # cover-flow maths (settle, window, placement)
node tests/js/design-shared.test.js   # finish/furniture rules shared by both flows
node tests/js/trust.test.js           # Review-step rating / quote / benefits block
node tests/js/enquiry-form.test.js    # save form: fields, default design name, POST body
node tests/js/copy-rule.test.js       # no customer-facing text promises we won't phone
node tools/tests/test-*.js            # wizard, render model, step config…
php tests/php/run.php                 # saving (optional phone, design name), emails, review settings, honeypot, failure log, nonce, admin labels, experiments
php tools/tests/test-image-proxy.php  # image-proxy path validator
```

The PHP tests run the real enquiry pipeline against small WordPress stand-ins in
`tests/php/wp-stubs.php` — no WordPress install needed.

## Release / update flow (GitHub)

Updates surface in wp-admin via [`YahnisElsts/plugin-update-checker`](https://github.com/YahnisElsts/plugin-update-checker).

1. Make changes; bump the **Version** header in `hd-door-designer.php` **and** the
   `HD_DD_VERSION` constant (keep them in sync).
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. Create a **GitHub release** for that tag (attach a built zip if you use release assets).
4. Within the check interval, wp-admin → Plugins shows the update.
5. Nothing to note for the stats: each release becomes its own cohort on the manager's
   Marketing page from the first day the site serves it (design:
   `hertsdoorsmanager/docs/superpowers/specs/2026-09-15-designer-version-cohorts-design.md`).

## Privacy / GDPR

The plugin stores customer contact details (name, phone, email, postcode) plus the
design. Notes:
- There is no consent tick. The save form states, under the button, that saving asks us
  for a price and that we will use the details to send it and may get in touch. Phone is
  optional. Customer-facing copy must never promise that we won't phone
  (`tests/js/copy-rule.test.js` enforces this).
- The recipient email is configurable (**Settings**).
- A retention-days setting is exposed for a purge policy (auto-purge can be wired later).
- Uninstalling the plugin (Delete, not deactivate) drops the table and removes all stored PII.

## File layout

```
hd-door-designer.php        Main plugin file (header, constants, bootstrap)
uninstall.php               Clean teardown (drops table + options)
composer.json               Declares the update-checker dependency
includes/                   One class per concern (catalogue, enquiry, repo, mailer, failure log, admin, updater…)
assets/css, assets/js       Scoped front-end (compositor + app controller + REST client + styles)
tests/                      Node + PHP unit tests (see Tests above)
data/                       endurance-catalogue-full.json lives here (the data backbone)
tools/                      The extractor + the structure/rules reference catalogue
```
