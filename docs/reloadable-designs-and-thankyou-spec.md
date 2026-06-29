# Reloadable Designs + Engaged Thank-You Screen — Design Spec

**Date:** 2026-06-29
**Status:** Awaiting approval to build

## Goal

Let a customer revisit and tweak a submitted door design from a link in their
acknowledgment email — **no accounts**. Replace the bland post-submission message with
a screen that works while they're most engaged.

Scope agreed: build Parts 1 & 2 now; defer "see your door in place" (photo + AI swap)
to a separate project.

---

## Part 1 — Reloadable design via email link

### Data model
- The enquiry row already stores the full, server-authoritative design as JSON
  (`design`: heading → `{label, id}`). We reuse it — no new table.
- `reference` (`HD-2026-000123`) is **sequential / guessable**, so it can't be the
  retrieval key. Add a `token CHAR(32)` column (random, `UNIQUE KEY`), generated at
  insert. Bump `HD_DD_Repository::DB_VERSION` 1 → 2; dbDelta adds the column on upgrade.

### Endpoint
- `GET /wp-json/hd-door-designer/v1/design/<token>` → returns **only the design
  choices** (`{ design: { <heading>: {label,id}, … } }`). **No customer PII** (name /
  email / phone / postcode are never returned), so a leaked link exposes nothing
  personal. `404` if the token is unknown. Public read (no nonce) — it's just a design.

### Reload (client)
- On load, the App checks the URL for `?design=<token>`. If present it fetches the
  design, then loads it into the wizard:
  1. Select the saved door type.
  2. Apply each saved choice **that still exists** in the current catalogue (validated
     by label against the live step choices — the same check `pruneInvalid` already uses).
  3. Collect any choices that no longer exist (retired style, renamed colour, removed glass).
  4. Drop the customer on the **review screen** — full door visible, every row editable.
- **Graceful failure (plain English).** If anything was dropped, show a notice at the
  top of the review, e.g.:
  > "A few things have changed since you saved this design:
  > • The 'Eiger' style is no longer available — please pick a new style.
  > • Your chosen glass 'Comete' has been retired — please choose glass again.
  > Everything else has loaded — just update the items above to continue."
- Invalid / unknown token → friendly "we couldn't find that saved design — let's start
  fresh" and the normal first screen.

### Acknowledgment email (new, to the customer)
- Sent **best-effort after the enquiry is saved** — a mail failure never fails the
  submission or the existing notification to Daniel.
- From **"Hertfordshire Doors"** (exact sending address confirmed during build; falls
  back to the site default address with that friendly name).
- Contains: a thank-you, a short summary of their door, and the **reload link**
  (`…/door-designer/?design=<token>`).
- The existing internal notification to Daniel is unchanged.

---

## Part 2 — Engaged thank-you screen

Replace "Thank you — your design has been sent. We will be in touch shortly." with:

- A warm confirmation + "we've emailed you a link to revisit or tweak this design."
- **"Design another door"** button — restarts the wizard but **keeps the contact
  details entered this session**, so a 2nd/3rd quote (multiple doors, alternative
  designs) is a couple of taps.
- A gentle **price-framing line**:
  > "As a guide, a fully fitted composite door installed by qualified fitters typically
  > ranges from £1,000 to £4,000 depending on the options you choose."

---

## Deferred (separate project)
- **"See your door in place"** — customer uploads a photo of their current door; AI
  composites the new design into it. Genuinely promising, but a much larger piece
  (segmentation, perspective/lighting). Not in this build.

## Privacy / safety
- Reload endpoint returns design only — never PII.
- Token is random and unguessable; the human `reference` is unchanged.
- Saving an enquiry is never blocked by an email send failure.

## Build order (incremental, each shipped + verified)
1. DB token column + migration + `get_by_token` + generate token at insert.
2. `/design/<token>` REST endpoint (design-only).
3. Client reload + validation + graceful-failure banner; lands on review.
4. Customer acknowledgment email with the reload link.
5. Thank-you screen (design-another + price line).
