# Hertfordshire Doors — Configurator UX Redesign (Guided Visual Wizard)

**Date:** 2026-06-26
**Status:** Design — awaiting review
**Scope:** Front-end presentation layer only. The data/rendering engine and PHP backend are reused unchanged.

## 1. Context & goal

The door configurator's data and rendering engine are complete: the Endurance catalogue is captured, projected to a compact `customer_view`, compiled to a `render-model`, and composited on a canvas (door body, colour, glazing, frame, handle, knocker, **sidelights**, hinge-flip). All three real client doors reproduce field-for-field.

The current front end (`assets/js/hd-door-designer.js`) is a **flat, single-page cascade of text buttons** — functional but not premium, not guided, and shows cryptic option names. Because the designer is itself a **Dreamfree selling point** (demo-first outreach: prospects judge Dreamfree's quality by it), the experience must feel high-end and lead a layperson by the hand.

This spec redesigns **only the front-end presentation** as a guided, visual, mobile-first **wizard**. The backend, REST endpoints, DB, enquiry email, admin, updater, data capture, render-model, and compositor are **reused as-is**.

## 2. UX principles (agreed)

1. **Premium** — looks and feels expensive; the designer is a showcase.
2. **Guided wizard** — one decision at a time; door jargon and complexity hidden.
3. **Show, don't name** — visual tiles (see the door/colour/glass), never name-only dropdowns.
4. **Mobile-first** — designed for phones first; scales up.
5. **Live door preview** — the composited door updates in real time as choices are made.
6. **Progress bar** — shows position in the journey (counts only steps that apply to *their* door).
7. **Back/edit anytime** — non-linear; revisit any earlier choice freely.

## 3. Non-goals (YAGNI)

- No pricing, basket, or sizes (enquiry-only — unchanged).
- No accounts, no save/share of designs (not requested).
- No changes to extraction/capture, REST shape, DB schema, enquiry email, admin, or updater.
- No new door data; uses what's captured.

## 4. The journey

Chosen layout: **C — one choice at a time** (live preview on top, a single large swipeable choice per step). Steps are plain-English; jargon is hidden. Single Door shown; the flow adapts per type (§7).

1. **What kind of door?** — Single · Double · Stable · Aluminium *(icon tiles; never the word "Avantal")*
2. **Just the door, or side panels too?** — frame shape / sidelights *(**skipped for Double**, which supports only "No Sidelights")*
3. **Pick your style** — the door designs *(88 styles → **category-first**, see §5)*
4. **Choose your colour** — outside colour *(visual swatches; updates the live door)*
5. **Inside colour** — *defaults to White; one tap to change or skip. Absent for Aluminium.*
6. **Choose your glass** — glazing *(**skipped on solid styles**; if side panels were chosen, also asks the sidelight glass / solid-slab option)*
7. **Hardware finish** — chrome, black, gold… *(the "Hardware Type" field)*
8. **Choose your handle**
9. **Add a letterplate?** — No / pick one
10. **Add a knocker?** — No / pick one *(**skipped on styles that offer none**, and for Double/Aluminium)*
11. **Hinge side** — left or right *(simple; near the end)*
→ **Review your door** — full live preview + a plain-English summary of every choice; each line tappable to jump back and edit.
→ **Get my free quote** — the enquiry form (name, telephone, email, postcode + consent). Existing submit logic, restyled.

**Baked in:** back/edit via both the progress bar and the Review screen; smart defaults on optional steps (inside colour, letterplate, knocker) so nothing blocks completion; the progress bar reflects only the steps applicable to the chosen type.

## 5. Style step — category-first

Swiping 88 doors one-by-one is exhausting, so step 3 is two-stage: **pick a category → short visual list within it.**

Working category set (to be finalised): **Solid · Glazed · Georgian / Traditional · Contemporary.**

Categories are **not** in the captured data, so a **style → category map** must be produced — derived heuristically (solid = styles with zero glazing; "Georgian" by name; glazed vs contemporary by aperture/pattern) and **curated by Daniel**. This is a small content task tracked as a dependency (§10). The map lives in a versioned config file alongside the step config, so it's editable without touching logic.

## 6. Visual design system — "Architectural Mono"

Crisp white, charcoal ink, generous whitespace, system sans, thin hairline rules, small radii. Brand accent colour(s) to be sampled from hertfordshiredoors.co.uk (§10).

- **Tokens (CSS custom properties, namespaced under `.hd-dd`):** `--ink:#161616`, `--paper:#ffffff`, `--line:#e6e6e6`, `--muted:#8a8e96`, `--stage:#f3f3f1`, `--brand:<TBD>`, spacing scale, `--radius` (small), type scale.
- **Layout C structure:** progress bar + back at top → **door stage** (~40% height) → step title → **carousel of large choice tiles** (active tile prominent, neighbours peeking, dots) → sticky **Continue** at the bottom. Mobile-first; on wider screens, a centred phone-width column (optionally a two-pane "stage left / steps right" at desktop — decided at build).
- **Components:** progress bar; choice **tile** with variants (colour swatch · door-thumbnail · glass-thumbnail · handle-image · icon); live preview stage; review summary list; enquiry form. Each small and self-contained.

All styles remain scoped (namespaced wrapper) so the plugin's CSS neither leaks into nor is broken by the host theme.

## 7. Conditional logic & defaults (per type)

| Step | Single | Double | Stable | Aluminium (Avantal) |
|---|---|---|---|---|
| Side panels (frame shape) | ✓ | — (hidden) | ✓ | ✓ |
| Inside colour | ✓ (def. White) | ✓ | ✓ | — |
| Glass | ✓ (skip if solid) | ✓ | ✓ | ✓ |
| Sidelight glass/slab | if side panels | — | if side panels | if side panels |
| Knocker | ✓ (skip per-style) | — | ✓ (skip per-style) | — |
| Hinge side field | `Door Hinged On` | `Master Leaf` | `Door Hinged On` | `Door Hinged On` |

Per-style knocker availability comes from `knockerByStyle`; per-style glazing from `glazingByStyle`. The wizard re-prunes downstream selections when an upstream choice changes (as the current cascade does).

## 8. Architecture / modules

**Reused unchanged:** PHP backend (activation, REST, DB, enquiry, admin, updater); `/catalogue` (`customer_view`) and `/render-model` endpoints; `assets/js/render-model.js` (layer assembler); `assets/js/preview.js` (compositor).

**Rebuilt — replaces `hd-door-designer.js`** with small, focused modules:
- **`wizard-controller.js`** — state machine: ordered applicable steps, current index, design state, progress, `next`/`back`/`jumpTo`, defaults, review handoff.
- **`step-config.js`** — declarative step definitions: `{ key, label, heading(s), source, visibleWhen, default, tileType }`. Plus the **style category map**. Data-driven (an evolution of today's `STEPS`).
- **`step-renderer.js`** — renders the active step's tiles; hosts the style category sub-flow.
- **`review.js`** — review screen (summary + tap-to-edit).
- **Enquiry form** — existing REST submit, restyled.
- **`assets/css/hd-door-designer.css`** — replaced with the Mono design system, mobile-first.

Keep files short and single-purpose (the existing repo convention).

## 9. Data & imagery

`customer_view` already supplies labels/ids per step. **Tiles need thumbnails:**
- Style → door-blank thumbnail (captured).
- Colour → door-in-colour thumbnail or a colour chip (captured blanks; chip fallback).
- Glass → glazing thumbnail (captured).
- Hardware finish → colour chip (derived from the finish name).
- Handle → handle image (captured).

This makes **image mirroring a production dependency**: download the captured Endurance thumbnails (`_imageUrls`, ~376) into the plugin/CDN and serve locally; dev may hotlink via the `asset_base` setting. Sequenced into the implementation plan (§10).

## 10. Open items / dependencies

1. **Style category map** — heuristic + Daniel's curation (content task).
2. **Image mirroring** — production image hosting (already chosen: mirror). Blocks production preview, not dev.
3. **Brand accent colour(s)** — sample hertfordshiredoors.co.uk.
4. **Friendly-label copy** — final wording review (e.g. "Aluminium" vs "Avantal", step titles).
5. **GitHub repo URL** — still outstanding, for the updater.

## 11. Error / edge handling

- Catalogue or render-model absent → graceful "designer is being set up" state.
- Missing image → tile falls back to its label; compositor already tolerates a missing layer.
- Enquiry validation unchanged (nonce, sanitise, UK postcode, consent, honeypot).
- Back/edit must keep downstream selections valid via the existing pruning rules.

## 12. Testing

- **Node unit tests** for `step-config` + `wizard-controller`: applicable-steps-per-type, default application, downstream pruning, progress count — browser-free, like the existing extractor/cascade simulations.
- **Visual QA** via the existing standalone harness (extended to the wizard), images hotlinked.
- **Real-WordPress** manual click-through end-to-end (cascade → preview → enquiry email).
