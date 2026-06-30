# Orderability Audit — can our designer build a door Endurance can't make?

Goal: find every place our simplified wizard lets a customer pick a combination that Endurance
does not offer / cannot manufacture, so a quote never goes out for an unorderable door.

Method: compare what our wizard offers/allows against the captured Endurance catalogue + the
furniture-finish data. "Confirmed" = our OWN data already says the combo is invalid yet the wizard
allows it. "Needs live check" = depends on an Endurance rule we haven't captured.

---

## Status: F1 + F2 + F3 RESOLVED (v0.2.42 heuristic → v0.2.43 exact per-finish lists)

v0.2.43 captures Endurance's exact per-finish Handle + Letterplate lists
(`data/endurance-finish-furniture.json` → `model.finishFurniture`) and constrains the wizard
tiles to them — so every finish×furniture pair it offers is one Endurance actually offers. This
both fixed the over-permits (F1/F2) AND corrected heuristic mistakes (Heritage letterplate IS
offered at Antique Black; the generic letterplate is NOT offered at Stainless Steel — distinct
product there; Touch Key Handle is Chrome-only). Verified live below.

**Completeness gap (NOT orderability):** Endurance offers finish-specific letterplate products we
don't model — "Stainless Steel Letterplate", "Premium Matt Black Letterplate", "Premium Satin Brass
Letterplate". We simply don't offer them (safe: under-offer), so a customer can't pick a matching
letterplate at those finishes. Adding them needs a render-geometry capture — separate follow-up.

---

## Findings

### F1 — Letterplate × finish not constrained  *(Confirmed · Medium)*
Architectural and Heritage letterplates only exist in **Chrome / Gold / Graphite**. The wizard greys
out *handles* that don't come in the chosen finish, but **not letterplates** — so a customer can pick:
- "Architectural Letterplate" or "Heritage Letterplate" + **Black / Stainless Steel / Antique Black / Bronze**

…none of which is a real product. Fix: constrain letterplate tiles by finish, exactly like handles.

### F2 — Handle × finish unconstrained for specialty finishes + fixed handles  *(Confirmed gap · High · exact rule needs live check)*
Only 7 of the 11 finishes carry a recolour token in our model. The 4 specialty finishes
(**Forged Black, Pewter, Matt Black, Satin Brass**) have none, so the grey-out is a no-op for them →
**all 26 handles show**. And the 19 fixed/specialty handles (pull bars, Pewter/Forged products,
stainless levers) always show regardless of finish. Selectable-but-incoherent examples:
- Forged Black finish + "Lever/Lever" (chrome lever)
- Chrome finish + "Pewter Monkey Tail" / "Forged Black Noble Handle"

Root question for the fix → **does Endurance filter the Handle list by finish, or allow any pair and
reject via ValidationErrors?** Needs a 2-finish live comparison (read Handle list at Chrome vs Forged
Black). Either way our model over-permits.

### F3 — Missing data: per-finish furniture availability  *(Root cause of F1/F2)*
We never captured which Handle / Letterplate (/ Knocker) each of the 11 finishes actually offers — the
finish↔furniture coupling. Capturing it (walk Hardware Type, record each furniture field's choices)
gives the real constraint to enforce, replacing the partial token-based grey-out.

### F4 — Sidelight glass under-specified  *(Medium)*
A glazed sidelight currently renders a generic obscure overlay and carries **no chosen side design /
side glass** in the enquiry. The order is therefore ambiguous (the team must pick a side design to
place it). Orderability-safe fix: offer explicit, valid side design + side glass (constrained), so the
enquiry fully specifies an orderable side. (Ties into the in-flight sidelight rebuild.)

---

## Enforced / low-risk (verified)
- **Glass × door style** — gated by `glazingByStyle` (per-style capture). Enforced.
- **Knocker × door style** — gated by `knockerByStyle`. Enforced.
- **Recolourable handle × finish** — grey-out via `furnitureColours` (+ MattSilver alias fix). Enforced.
- **Letterplate position × style** — gated by `letterplatePosStyles`. Enforced.
- **Internal colour / frame shape / knocker step** — gated by per-type `hasInternalColour` / `hasFrameShape` / `hasKnocker`.

## Still to audit
- Colours (external/internal) — all valid for all styles? (low risk — colour is a flat list)
- Glazing requiredness — can a glazed style be left with no glass, or a solid style be glazed? (gated; low risk)
- Cross-type (Double / Stable / Avantal) equivalents of F1–F4.

---

## How Endurance ACTUALLY enforces orderability  *(verified live)*
Read from `mJobState` on the live designer:
- **There is a `Job.ValidationErrors` array** and it is populated (currently: "overall width/height not
  input"). Endurance enforces orderability with a **validator on the assembled job**, not by hiding
  bad options.
- The **Handle list is a flat 26 regardless of finish** (no per-finish availability flag). Same for
  Letterplate (6). So Endurance does NOT pre-filter finish↔furniture — its UI lets you pick an
  incoherent pair and relies on the validator.
- It DOES pre-filter **glass + knocker by door style** (that's why `glazingByStyle`/`knockerByStyle`
  exist). We mirror that correctly.

**Consequences:**
1. Mirroring option lists alone can NEVER fully guarantee orderability — only checking the validator
   can. This is why a real guarantee = validate the finished design against Endurance (its
   ValidationErrors). The audit confirms it.
2. Our enquiry is also inherently incomplete for ordering — it has **no dimensions** (the team adds
   those in Endurance, where the validator runs). So the team's Endurance step is the current backstop.

## Fixes that DON'T need a capture (derivable now)
F1 + F2 are fixable from data we already have: a handle/letterplate is valid in the finishes it has a
recolour variant for; a specialty/product item is valid only in the finish its NAME embodies
("Pewter Monkey Tail" → Pewter; "Forged Black …" → Forged Black; stainless pulls → Stainless Steel;
"… Chrome" → Chrome). Build a furniture→valid-finishes map from variants + product names, then constrain
ALL furniture tiles (handles AND letterplates) by finish — replacing the partial token-only grey-out.

OPEN (1 quick live check): does an incoherent finish×handle actually raise a ValidationError, or does
Endurance accept it? Set Forged Black finish + a chrome lever and read `ValidationErrors`. Either way the
constraint is correct for coherence; the check just tells us if it's strictly an *orderability* bug.
