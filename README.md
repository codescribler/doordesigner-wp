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
| Cascading 12-field picker | ✅ built against the real data, per-type rules (Double=no frame-shape/+Master Leaf; Avantal=no internal-colour/knocker; hinge-side targets the right field) |
| Compact "customer view" catalogue (REST) | ✅ built — serves 176 KB instead of the 1.2 MB full file |
| Layer model + assembler (`tools/build-render-model.js`, `assets/js/render-model.js`) | ✅ built & validated across all 4 types — shared Node/browser assembler resolves style/colour/cassette/glazing/frame/handle/knocker + double-door leaves into geometry-placed layers (`data/render-model.json`, 253 KB) |
| Browser compositor (canvas) + UI wiring | ✅ built — `assets/js/preview.js` paints the layers; app fetches `/render-model`, renders on every change; `/preview-test.html` is a standalone QA harness (no WordPress needed) |
| Sidelight rendering | ✅ built — door shifts into the centre, frame swaps to the wide variant, side panels drawn (Left/Right/Double + midrail/half-flag). Approximation: side glass uses the captured representative pattern (per-glass/solid-slab fidelity is a fast-follow); toplight shapes not yet captured |
| Image mirroring (download Endurance assets, serve locally) | ⏳ to build (Daniel chose mirror over hotlink) — enumerate combo URLs from the render model + catalogue; set **Preview image base URL** in Settings to the mirror |
| Handle/knocker hardware-colour recolour | ⚙️ best-effort (uses captured baseline colour); full recolour is a fast-follow |
| Brand styling (fonts/colours of hertfordshiredoors.co.uk) | ⚙️ placeholders in `assets/css` — sample the live site |

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
3. (Once mirroring is built) re-mirror any new image assets.

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

## Release / update flow (GitHub)

Updates surface in wp-admin via [`YahnisElsts/plugin-update-checker`](https://github.com/YahnisElsts/plugin-update-checker).

1. Make changes; bump the **Version** header in `hd-door-designer.php` **and** the
   `HD_DD_VERSION` constant (keep them in sync).
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. Create a **GitHub release** for that tag (attach a built zip if you use release assets).
4. Within the check interval, wp-admin → Plugins shows the update.

## Privacy / GDPR

The plugin stores customer contact details (name, phone, email, postcode) plus the
design. Notes:
- A consent checkbox is required on the form.
- The recipient email is configurable (**Settings**).
- A retention-days setting is exposed for a purge policy (auto-purge can be wired later).
- Uninstalling the plugin (Delete, not deactivate) drops the table and removes all stored PII.

## File layout

```
hd-door-designer.php        Main plugin file (header, constants, bootstrap)
uninstall.php               Clean teardown (drops table + options)
composer.json               Declares the update-checker dependency
includes/                   One class per concern (catalogue, enquiry, repo, mailer, admin, updater…)
assets/css, assets/js       Scoped front-end (compositor + app controller + styles)
data/                       endurance-catalogue-full.json lives here (the data backbone)
tools/                      The extractor + the structure/rules reference catalogue
```
