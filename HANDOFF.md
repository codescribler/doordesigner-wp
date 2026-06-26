# Handoff: Hertfordshire Doors — enquiry-only door configurator

You're picking this up mid-project. Read this whole file before doing anything. Confirm the open questions at the bottom with the user (Daniel) before writing code.

## What we're building

A **custom enquiry-only door configurator** for Hertfordshire Doors Ltd (an Endurance composite-door reseller), replacing a clunky paid third-party designer currently embedded on their website.

A customer visually designs a composite door (type, style, colour, glazing, hardware, etc.); the tool captures that design as a structured spec and sends it to Hertfordshire Doors as an **enquiry**. It does **not** show a price. The captured spec uses **Endurance's exact option vocabulary** so it feeds an existing downstream "quote-creator" workflow that re-creates the design in Endurance's trade portal to price it.

Why this scope is tractable (do not re-expand it):
- **No pricing.** No price engine, no price feed, no basket. Enquiry only.
- **No dimensions.** The customer never enters sizes — they're set at survey. Do not add size inputs.
- **No lock/cylinder selection.** See the dedicated section below.

So the tool is a **clean 12-field visual picker** that ends in an enquiry form. That's it.

## V1 delivery: a WordPress plugin

The Hertfordshire Doors site is WordPress, so v1 ships as a **self-contained WordPress plugin**. It is going to be iterated on heavily once live, so build for maintainability and easy updates from the very first commit.

### Plugin shape
- A proper WP plugin (main plugin file with header, activation/deactivation hooks, uninstall cleanup).
- Renders via a **shortcode** (e.g. `[hd_door_designer]`). Because the flow is complex and multi-step, it sits on **its own dedicated page** — Daniel will create a page and drop the shortcode on it.
- The configurator front end is an interactive JS app mounted into the shortcode's container. Keep the build simple and self-contained (vanilla JS or a small bundled component — avoid heavyweight framework setup that complicates WP embedding). The catalogue JSON is bundled as a plugin asset (or served via a small REST endpoint).
- Enqueue **scoped** CSS/JS only on the page that contains the shortcode (don't load assets site-wide).

### Look and feel
It must broadly **look and feel like part of the existing Hertfordshire Doors site** (hertfordshiredoors.co.uk), not like a bolted-on widget. Sample the live site's fonts, colours, spacing and button styles and match them. Scope all styles (namespaced classes / a wrapper) so the plugin's CSS neither leaks into nor is broken by the theme. When in doubt, inherit the theme's typography and use the site's brand colours for the primary CTA.

### The trigger (the launch button is NOT part of the plugin)
The button that starts the journey lives elsewhere on the site (in the theme/another page), so the plugin can't own it. Handle it like this:
- **Primary approach:** the configurator lives on its own page (the shortcode page). The external CTA is simply a **link (`<a href>`) to that page's URL**. Nothing clever needed — clicking it navigates the customer to the configurator page. This is the recommended v1 mechanism; tell Daniel the page URL to point his button at.
- **Optional flexibility (nice-to-have):** the plugin can also expose a JS hook so any element on the site with a known class or data-attribute (e.g. `.hd-open-designer` or `[data-hd-designer]`) launches the flow — either by navigating to the page or opening it. Use this only if Daniel wants buttons in multiple places without hand-editing each link.
- **Optional deep-link:** support a URL query param (e.g. `?door_type=Avantal`) so a specific button can pre-seed the starting door type. Optional.

### Updates via GitHub (build this in from the start — not later)
Daniel will push frequent changes and needs the live site to update easily. From the first commit:
- Develop the plugin **in a Git repo** (Daniel will host it on GitHub).
- Integrate a **GitHub-based update mechanism** so a tagged GitHub release surfaces as an available update in wp-admin. Use the well-established `YahnisElsts/plugin-update-checker` library pointed at the repo/releases (or GitHub Updater if Daniel prefers). Wire this on day one and document the release flow (bump version header → tag/release → update appears in wp-admin).
- Keep **catalogue data and configuration separate from logic** so content tweaks (new styles, changed options, the recipient email, copy) don't require touching core code. Version the catalogue file.
- Favour small, well-named modules over one big file, so iterative edits are low-risk.

## CRITICAL FIRST STEP — get the full data

`endurance-catalogue.json` (in this folder) has the option **labels and structure** and the conditional rules, but NOT the Endurance option **IDs**, the **image URLs**, or the complete **per-style glazing matrix**. A real build needs those, and they only come from running the extractor in a browser (which you, a terminal agent, can't do).

So: **check whether `endurance-catalogue-full.json` exists in this folder.**
- If it does, build the data layer against it (per-type fields with `id` + `images[]` per choice, plus `glazingByStyle`).
- If it does **not**, ask Daniel to run `endurance-catalogue-extractor.js`: log into the Endurance trade portal, open the Door Designer (Default.aspx), open the browser console, paste the script, run `await EXT.captureAllTypes()` then `EXT.download()`, and drop the resulting `endurance-catalogue-full.json` here. You can scaffold the plugin shell while waiting, but don't hardcode option data until the full file is in.

## The data model (the 12 customer fields)

1. Door Type — Single Door, Double Door, Stable Door, Avantal
2. Frame Shape — 21 shapes (sidelight / midrail / half-flag / toplight combinations)
3. Frame Colour — 29 paired (external/internal) options
4. Door Style — type-dependent
5. Door Colour — type-dependent
6. Sidelight Type — only when the frame shape has a sidelight
7. Glazing — style-dependent
8. Hinge Side — Left / Right
9. Hardware Colour — 11 options
10. Handle — type-dependent
11. Letter Plate — 6 options
12. Knocker — 31 options, conditionally available

Conditional rules (in `endurance-catalogue.json` under `conditionalRules`) — these drive the cascading UI:
- **Style depends on door type.** Single and Double Door share the same 88 composite styles; Stable Door has its own 30 ("X Stable"); Avantal has 13 (5 aluminium styles × cassette colours).
- **Colour model depends on type.** Single/Double/Stable use the same 21-colour palette (external and internal). Avantal external = 5 cassette finishes, and Avantal has **no internal-colour field**.
- **Glazing depends on style** — a per-style subset of a ~59-design vocabulary (≈31 distinct sets across the Single range). Store glazing per style (use `glazingByStyle`).
- **Sidelight options only appear when the frame shape includes a sidelight.**
- **Knocker availability depends on the style** (greyed on some).
- Handle, cylinder, hinge and threshold lists are partly type-dependent.

Type-structure differences confirmed by a live field-by-field audit (these change which steps the configurator shows):
- **Double Door has NO frame-shape choice** — only "No Sidelights". Hide the Frame Shape and Sidelight steps when Double Door is selected. (It also adds a Master Leaf = Left/Right field.)
- **Avantal is structurally reduced:** no internal colour, **no knocker**, no spyhole/security chain/lock, Frame Colour limited to **3** (not 29), 5 external colours, 4 hinges, 25 handles, 13 style×cassette combos. Hide knocker + internal colour for Avantal.
- **Hinge Side maps to a different field per type:** "Door Hinged On" (Left/Right) for Single/Double/Stable, but **"Master Leaf" (Left Leaf/Right Leaf) for Avantal**. The Hinge Side control must target the right field.
- Frame shapes are the same 21 for Single/Stable/Avantal; hinge *colour* counts differ by type (Single 16, Double/Stable 8, Avantal 4) but hinge colour isn't one of the 12 customer fields.

Field order differs per door type, so key everything by field name/heading, never by array index.

## Why there's no lock/cylinder in the customer flow

This is deliberate, not an omission. Three reasons:
1. **The retail designer doesn't expose it.** The live customer designer presents exactly the 12 categories above — lock and cylinder are not among them. (They exist in the designer's underlying data model with defaults, but are never shown to the customer.) A faithful mirror omits them too.
2. **The lock is derived from the handle, not chosen.** Fixed rule: lever handles → Guardian 5; non-operating handles (pull bars, knobs, slam-shut) → an automatic lock (AV2, or AV4 where a night latch is needed; a stainless flat pull forces AV4); rim pull → Heritage. Since the lock follows mechanically from the handle and door type, there is nothing for the customer to decide.
3. **It's an enquiry, not an order.** The lock decision belongs to the quoting step, when Hertfordshire Doors re-creates the design in the Endurance trade portal (via the quote-creator workflow). That portal already enforces handle→lock compatibility. Duplicating it in the customer tool would be redundant and would expose customers to a technical choice they don't make.

Practical consequence for the build: **capture the Handle accurately** (it's what the lock is derived from downstream). Optionally, you may attach a computed `suggestedLock` to the enquiry payload by applying the rule above — but it's optional; leave the authoritative lock decision to the quoting step.

## The door preview (the one genuinely fiddly UI part)

The real designer renders the door by compositing **layered PNGs**. In the data, every choice has `Images[]`, each with an `ImageURL` (plus `OnRightImageURL` for the second leaf of a double door) and layout geometry: `CX, CY, W, H, Rotation, FlipH`. The live preview stacks these layers.

For v1, confirm with Daniel which he wants:
- (a) **Composite the layers** faithfully (accurate, more work), or
- (b) Show a **single representative render per style+colour** (simpler; usually fine for an enquiry tool).

## After the design: the enquiry CTA + form

When the customer has finished designing, show a **prominent CTA** (styled as the site's primary call-to-action). It opens a short form capturing:
- **Name**
- **Telephone**
- **Email**
- **Post code**

On submit:
- Validate and sanitise (WP nonce, sanitise/escape all inputs, basic email/phone/postcode validation).
- **Save locally** — persist every enquiry in WordPress (a dedicated custom DB table is cleanest; a custom post type is acceptable). Store the full door spec plus the contact fields, a timestamp, and a generated reference.
- **Email it to `daniel@dreamfree.co.uk`** via `wp_mail()` (make the recipient a configurable setting, defaulting to that address).
- Add a simple **wp-admin screen** listing enquiries, each with its details and a copyable structured payload.

### The data must be easy for Claude / the quote-creator to consume
Both the stored record and the email must carry the design as a **structured, machine-readable spec in Endurance's vocabulary**, so the quote-creator workflow (and Claude) can rebuild the door in the trade portal directly. Concretely:
- Key the design by the **exact Endurance field headings** and chosen **labels** (and `id`s where available). Preserve label strings exactly — the downstream quoting step matches on these strings.
- The email should contain a human-readable summary for Daniel **and** a fenced JSON block he/Claude can copy straight into the quoting workflow.

Suggested payload shape (use the real catalogue headings as keys):
```json
{
  "reference": "HD-2026-000123",
  "submittedAt": "2026-06-26T10:00:00Z",
  "customer": { "name": "...", "telephone": "...", "email": "...", "postcode": "..." },
  "design": {
    "Door Type":              { "label": "Single Door", "id": 0 },
    "Frame Design":           { "label": "No Sidelights", "id": 0 },
    "Door Design":            { "label": "Ketu", "id": 0 },
    "Door Colour (External)": { "label": "Irish Oak", "id": 0 },
    "Door Colour (Internal)": { "label": "White", "id": 0 },
    "Door Glass":             { "label": "Satin", "id": 0 },
    "Hardware Type":          { "label": "Black", "id": 0 },
    "Handle":                 { "label": "Lever/Lever", "id": 0 },
    "Letterplate":            { "label": "No Letterplate", "id": 0 },
    "Knocker":                { "label": "No Knocker", "id": 0 },
    "Door Hinged On":         { "label": "Hinges on Left", "id": 0 }
  },
  "derived": { "suggestedLock": "Guardian5 Lock" }
}
```

## Build plan

1. Confirm the full data file is present (see CRITICAL FIRST STEP).
2. Scaffold the WP plugin in a Git repo, with the GitHub update checker wired in and a documented release flow.
3. Register the shortcode; confirm the configurator page URL and how the external CTA links to it.
4. Build the front-end configurator: the cascading 12-field picker with the rules above and the door preview, styled to match the live site.
5. Build the enquiry CTA + form → validate → save to a local table → email to `daniel@dreamfree.co.uk` → include the structured Endurance-vocabulary payload.
6. Add the wp-admin enquiries list and a short README covering: the release/update flow, and catalogue-sync (re-run `endurance-catalogue-extractor.js` and diff to handle Endurance changing options upstream).

## Constraints and gotchas

- Do **not** build pricing, sizing inputs, or lock/cylinder selection into the customer flow.
- Field layout/indices differ per door type — map by heading.
- Preserve label strings exactly (including trailing spaces / odd casing like "BlackUlti-Matt") — the downstream quoting step matches on them.
- Avantal is the odd one out: cassette-based styles, 5 external colours, no internal colour, fewer hinges/thresholds.
- WordPress hygiene: nonces on the form, sanitise inputs, escape output, capability checks on the admin screen, clean uninstall.
- **PII / GDPR:** you're storing customer contact data. Include a privacy/consent line on the form, make the recipient email configurable, and keep storage minimal. Flag retention to Daniel.
- Sidelights: verified and fixed. They appear in the option data as `Sidelight Glass` (6 options) and `Sidelight Type` (Unglazed/Glazed) only when a sidelit frame shape is selected, and are the same across door types. The extractor's `captureAllTypes()` now captures them automatically per type (into each type's `sidelights`), and the verified lists are in `endurance-catalogue.json` under `sidelightAndToplight`.

## Business pre-checks (flag to Daniel, don't block on them)

- Whether Endurance offers a **reseller API or data feed** (a supported integration would beat scraping their option tree).
- The **terms-of-service / reseller-agreement** position on rebuilding their designer and using their option data and images.

## Open questions to confirm with Daniel before coding

1. Is `endurance-catalogue-full.json` present yet, or does he need to run the extractor first?
2. What's the configurator page URL, and is the external CTA a plain link to it (recommended) or does he want the JS data-attribute hook?
3. Door preview: composite the image layers, or one representative render per style+colour for v1?
4. The GitHub repo URL (needed to wire the update checker).
5. Beyond local save + email to daniel@dreamfree.co.uk, should enquiries also go anywhere else (CRM, Google Sheet, a second recipient)?
6. Any hosting/theme/plugin constraints, and the site's PHP/WordPress versions.
