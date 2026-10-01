# Save your design and get a price — Design

**Date:** 2026-10-01
**Status:** Design agreed in conversation; written spec awaiting Daniel's review
**Repo:** `codescribler/doordesigner-wp` (this plugin). No manager-app changes.

## Goal

Most visitors who reach the Review step leave there, in both the classic and swipe flows.
Today the only way forward from Review is "Get my free quote", which opens a form that
demands name, phone, email, postcode and a consent tick.

Daniel's contention: if Review instead offers **"save this design and get your price"**,
with less to fill in and visible reassurance, more people will carry on.

Success = a higher share of visitors who reach `review` going on to become a **lead**,
compared per designer version in the manager's version cohorts. Release 1 alone tests the
contention.

## Decisions made with Daniel

| Question | Decision |
|---|---|
| What is a save? | Saving **is** requesting an estimate. The price is presented as a benefit of saving. Every save is a lead and notifies Daniel exactly as an enquiry does now. |
| Required fields | Name, email, postcode. Phone is optional. |
| Attaching an estimate | A wp-admin form **and** a key-protected API for the quote workflow. |
| Social proof | Checkatrade rating line plus real customer quotes that Daniel supplies. No invented quotes. |
| Reassurance | Say we will look after them and there is no hard sell. **Do not promise that we won't call.** |
| Consent tick | Removed; replaced by a plain line under the button. |
| Link lifetime | 90 days, renewed by each save or unlock. |

## What already exists

- Every enquiry row has an unguessable `token`; `?design=<token>` reloads the design onto
  Review in both flows (`GET /design/{token}`, design choices only, never personal data).
- The customer gets an acknowledgement email with a "Revisit or tweak this design" button.
- The thank-you screen has "Design another door" and pre-fills the form from memory.
- The form, submit and thank-you screen are shared by both flows in `assets/js/enquiry.js`.
- Funnel steps `review` (15) and `details` (16), then `lead`, in both `door-designer` and
  `door-designer-v2`.

## Approach

Extend the existing `hd_enquiries` table rather than add a customers/designs model. A
save is an enquiry row, so the admin list, the notification email, the quote payload and
A/B conversion counting carry on unchanged. "My designs" is every row sharing an email
address.

Rejected: a separate customers table (a migration and a second pipeline for little gain)
and a browser-only list (it would not follow someone from phone to laptop).

## Release 1 — Review rework

This is the release that tests the contention. It ships alone.

### Review step

```
[ door preview ]
Your door                         (rows with Edit, as now)
------------------------------------------------------
★ 4.9 on Checkatrade · 321 reviews
"Short real customer quote" — Name, Town
------------------------------------------------------
Save this design and get your price
 • We'll email you a link so you can come back to it any time
 • We'll work out a price for this exact door and send it to you
 • No pressure and no obligation. You decide what happens next.
[ Save my design & get my price ]
```

- The button reveals the form **in place** on the Review screen and scrolls to it; there
  is no separate form screen. `details` fires when the form is revealed, so the funnel
  keeps its current shape and meaning (`review` → pressed the button → `lead`).
- The existing disclaimer about the preview being an impression stays.
- The old `review-note` line ("Free, no-obligation quote…") is replaced by the block above.

### Form

| Field | Required | Notes |
|---|---|---|
| Design name | yes | Pre-filled from the design, e.g. "Ketu in Anthracite Grey"; max 80 characters |
| Name | yes | |
| Email | yes | |
| Postcode | yes | UK format check as now |
| Phone | no | Labelled "Phone (optional)" |

- Honeypot stays exactly as now (flag, never discard).
- Under the button, in place of the tick box: *"By saving you're asking us for a price.
  We'll use your details to send it and may get in touch about your door."*
- Button: "Save my design & get my price".

### Copy rule

Nothing in the designer, the thank-you screen or the emails may say or imply that we will
not phone. Allowed: "no pressure", "no obligation", "no hard sell", "no spam". The
existing "No spam, ever" trust line stays.

### Thank-you screen

- Title: "Saved — and your price is on its way."
- Text: we've emailed a link to come back to this design, and we'll send a price, usually
  within one working day.
- The guide price range paragraph and "Design another door" stay.

### Social proof

A new small module renders the rating line and one quote, in both flows.

New settings (wp-admin → Door Designer → Settings → "Review step"):

| Setting | Default | Behaviour |
|---|---|---|
| Rating | `4.9` | Rating line hidden if rating or count is empty |
| Review count | `321` | |
| Profile link | empty | Rating line links to it when set |
| Customer quotes | empty | One per line: `Quote text \| Name, Town`. Block hidden until at least one exists |

The defaults are the figures the site rebuild already uses; Daniel confirms them against
Checkatrade before release. When there are several quotes, one is picked at random per
page load.

### Server changes

- `POST /enquiry`: `telephone` and `consent` no longer required; accepts `designName`.
- Table (`DB_VERSION` 3): add `design_name VARCHAR(120) NOT NULL DEFAULT ''`.
- Payload: adds top-level `designName`. `customer.telephone` may now be an empty string.
- Owner email: shows the design name; an empty phone prints as "(not given)".
- Customer email: subject "Your saved door design: <name> (<reference>)"; intro says the
  design is saved and a price will follow; button "Open my design".
- wp-admin list and detail show the design name.

### Risk to check during the build

The quote workflow reads the JSON payload from the notification email. It must tolerate
an empty `customer.telephone` and the extra `designName` key. Verify against the
quote-from-request skill before release.

## Release 2 — My designs

### Access key

A person (an email address) gets an **access key** that proves they own the designs
saved under that address.

- 32 random URL-safe characters; only its SHA-256 hash is stored.
- New table `{prefix}hd_dd_access`: `id`, `email`, `key_hash` (unique), `created_at`,
  `expires_at`. Several keys per email are normal (one per emailed link or unlock).
- Valid for 90 days. Each save or unlock issues a fresh key; expired rows are purged by
  the existing daily cron.
- The emailed link becomes `?design=<token>&k=<key>`. On arrival the browser stores the
  key in `localStorage` and removes `k` from the address bar, so copying the URL from the
  browser shares the door but not the key.
- The key travels to the server in an `X-HD-Access` header.
- `POST /enquiry` returns the new key so the thank-you screen works without the email.

### What a key unlocks

| | No key / expired key | Valid key |
|---|---|---|
| Open the door from its link | yes, as today | yes |
| Tweak it and save | saves as a new design through the full form | "Save changes" or "Save as a new design", no form |
| See the price | no | yes |
| See and rename the other designs | no | yes |

Old links already in customers' inboxes carry no key and keep working as today.

A forwarded link that still carries `k` gives the recipient the design names and prices
for that address. No endpoint ever returns name, email, phone or postcode.

### Unlock by code

When a design is opened without a valid key, the page shows "See your price and your
other designs — email me a code".

- `POST /access/code` `{token}`: emails a 6-digit code to the address on that design.
  The response is always the same generic "if that design exists we've emailed a code",
  and never reveals the address.
- `POST /access/verify` `{token, code}`: returns a fresh 90-day key.
- A code lasts 15 minutes and allows 5 attempts, then is void. Stored hashed in a
  transient keyed by the email hash.
- Limits: 3 codes per email per hour and 10 requests per IP per hour, using the same
  transient pattern as the experiment expose route.

### My designs panel

- `GET /designs` (key required): for each design the token, name, saved date, thumbnail
  URL and price status.
- A list with thumbnail, name, saved date and "Price on its way" or the figure. Reached
  from the thank-you screen and from a "My designs" link on Review when a key is present.
- Rename in place: `POST /design/{token}` `{name}`.

### Editing a saved design

- **Save changes** — `POST /design/{token}` `{design, image}`: same row and reference,
  preview image replaced, `updated_at` set. Daniel gets an "Updated design <reference>"
  email with the new payload. Fires a new action `hd_dd_design_updated` (Release 3 hooks
  it to mark an existing price out of date); it does **not** fire
  `hd_dd_enquiry_submitted`, so it is never a second A/B conversion or a second lead.
- **Save as a new design** — `POST /enquiry` with the key instead of contact fields: a new
  row copying name, email, phone and postcode from the person's most recent row. Counts
  as a new enquiry, as "Design another door" does today.
- **Design another door** from the thank-you screen works the same way: no form.

Table additions: `updated_at DATETIME NULL`.

## Release 3 — Estimates

### Data

Columns on `hd_enquiries`: `estimate_low INT UNSIGNED NULL`, `estimate_high INT UNSIGNED
NULL` (whole pounds; `high` NULL for a single figure), `estimate_note TEXT NULL`,
`estimate_sent_at DATETIME NULL`, `estimate_stale TINYINT(1) NOT NULL DEFAULT 0`.

### wp-admin

On the enquiry detail page: price (or from/to), optional note, **Send estimate**.
Re-sending replaces the figure and clears "out of date". The list shows a "Priced" or
"Price out of date" badge.

### API

`POST /estimate` `{reference, low, high?, note?}` with header `X-HD-Api-Key`.

- The key is generated in Settings, shown once, and stored hashed. Regenerating revokes
  the old one. With no key set the route returns 403.
- Does exactly what the admin button does. Returns the reference and the customer link.

### Customer

- Email "Your price is ready": the figure, the note, the door picture, a button to the
  design.
- On the design and in My designs: "£1,850 fitted" or "£1,700 – £1,950 fitted", with
  "Estimate, subject to survey."
- If the design changed after pricing: "This price was for an earlier version — we'll
  send an updated one."

## Measuring it

- **Funnel:** `review` → `details` → lead is unchanged in both funnels, so before and after
  compare directly through the designer version cohorts.
- **A/B engine:** unchanged. A save is the conversion.
- **Caveat:** if the Classic vs Swipe experiment is running when Release 1 ships, both
  arms get the new Review step at once. The comparison between arms stays fair, but the
  absolute rates shift mid-test.

## Files

Kept small, one job each.

| File | Release | Responsibility |
|---|---|---|
| `assets/js/trust.js` (new) | 1 | Rating line, customer quote, benefits block |
| `assets/js/enquiry.js` | 1, 2 | New field set, design name, consent line, thank-you copy; keyed saves |
| `assets/js/wizard/review.js`, `assets/js/swipe/swipe-view.js` | 1 | Call the trust module; reveal the form in place |
| `includes/class-hd-enquiry.php` | 1, 2 | Optional phone, no consent gate, design name, key-based save |
| `includes/class-hd-mailer.php` | 1 | Revised owner and customer emails |
| `includes/class-hd-trust-settings.php` (new) | 1 | Review-step settings and their output to `HD_DD_CONFIG` |
| `includes/class-hd-access.php` (new) | 2 | Keys, codes, rate limits, table, purge |
| `includes/class-hd-designs.php` (new) | 2 | `/designs`, rename, save changes, `/access/*` routes |
| `assets/js/access.js` (new) | 2 | Key storage, strip `k` from the URL, request header |
| `assets/js/my-designs.js` (new) | 2 | List panel, locked state, unlock by code |
| `includes/class-hd-estimates.php` (new) | 3 | Admin form handler, `/estimate` route, API key, email |
| `uninstall.php` | 2 | Drop the access table |

## Error handling

- A failed customer email never affects a saved design (as now). The thank-you screen
  always carries a working link.
- Access, list and estimate failures never block opening or saving a door; the page falls
  back to the keyless behaviour.
- `localStorage` unavailable: the key is used for that page view only.
- A save from a cached page running the old script (still sends `consent` and a required
  phone) keeps working.
- Failed submissions are still captured by the failure log.

## Testing

PHP (`tests/php`):
- Enquiry: saves without a phone and without `consent`; rejects a missing name, email or
  postcode; stores `designName`; honeypot still flags.
- Access: key issue and verify, expiry, hash-only storage; code expiry, 5-attempt lockout,
  per-email and per-IP limits; generic response for unknown tokens.
- Designs: list returns only the caller's rows and no personal fields; rename and save
  changes reject a key for another email; an update does not fire `hd_dd_enquiry_submitted`.
- Estimates: bad or missing API key → 403; figure stored; email sent; a later design
  update marks the price out of date; re-sending clears it.

Node (`tests/js`):
- Form: field set, optional phone, design-name default, no consent control.
- Trust: hidden with no rating; quote block hidden with no quotes; quote line parsing.
- Access: key captured from the URL and stripped; header sent.
- My designs: list, price states, locked state.
- A copy test that fails if any customer-facing string promises not to call.

Manual (with `?notrack=1`, Chrome at 390px and desktop, both flows): one real save on the
live site named "TEST (please delete)"; open the emailed link on a second device; rename;
save changes; unlock by code with a cleared browser; send an estimate from wp-admin and
from the API.

## Rollout

1. **Release 1.** Daniel confirms the Checkatrade figures and pastes in two or three real
   quotes. Record the review → lead rate for the previous version from the manager first.
2. **Release 2**, then **Release 3**, each after the previous one has been used on the
   live site.

## Out of scope

Automated reminder emails to people who saved; customer accounts or passwords; uploading
quote PDFs; online payment or ordering; manager-app changes; fitted-door photos on Review.
