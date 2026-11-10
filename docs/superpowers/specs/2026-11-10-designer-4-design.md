# Designer 4: the email is the price request

Date: 2026-11-10. Status: draft for Daniel's review.
Repos: designer plugin (this repo), manager app (`../manager-app`), the analytics bridge plugin inside it (`manager-app/integrations/wordpress/hd-analytics`), and the Clive task notes (`../agents/local-only.txt`).

Items marked *My call* were decided by Claude, not Daniel. Everything else is as Daniel said it on 2026-11-10.

## Why

Classic vs Designer 3 has run since 2026-10-21. Read on 2026-11-10 (tiny numbers, hints only):

| | Classic | Designer 3 |
|---|---|---|
| Visitors who opened the designer | 26 | 19 |
| Gave an email address | 6 (23%) | 6 (32%) |
| Asked for a quote | 6 (23%) | 2 (11%) |

- Designer 3 gets more people to a finished door and more email addresses, but only 2 of 6 savers went on to ask for a quote. After the email there are four more things to do (doorway question, price screen, "Get a quote" button, name and postcode form), and "✓ Saved" reads as the finish.
- The four email-only savers got the follow-up emails; none clicked.
- An email-only save is not something Daniel can act on: it never reaches the manager app, and it promised a link, not a price.
- One visitor sent 7 quote requests in 17 minutes for different doors. She wanted to compare.

Daniel's definition of a good lead is someone willing to put time into designing their door. An email address is the minimum he needs to send an estimate. So in Designer 4 **sending the email is the price request and the lead**. Everything after it improves the estimate and is never a gate.

**Success:** more leads per visitor who opens the designer than Classic, measured by a new A/B test, Classic vs Designer 4.

## Goals

1. Giving an email address beside the finished door creates a lead Daniel can estimate, in the manager app, straight away.
2. To the visitor, getting an estimate is one three-step process: the door, the doorway, their details. Stopping after step 1 still leaves a complete lead.
3. The visitor chooses their own handle; the door does not arrive with one.
4. A person's doors live on one "My designs" page, where they can adjust one, remove one or design another.
5. One person is one lead in the manager, holding all their doors, with removed doors marked so Daniel doesn't estimate them.
6. Daniel can see where people stall, especially on the doorway step.

## Non-goals

- No changes to Classic. It is the control; `tests/js/control-arm.test.js` must pass unchanged.
- No changes to Designer 3's behaviour. It stays reachable through `?flow=designer3` and existing saved links, and its savers keep their three follow-up emails.
- No estimate produced or sent by the website. Daniel makes each estimate by hand from the manager and sends it himself.
- No automatic emails to the visitor except the one with their link. No reminders, no sequence. Daniel will build a follow-up sequence for cold enquiries in the manager app separately.
- No passwords, accounts or emailed codes.
- No three-way test.

## Anti-goals (failure even if it works)

- A lead that exists on the website but never reaches the manager, or is lost because the manager was unreachable.
- Two deals in the manager for the same person, or Clive creating a second deal from the notification email.
- Any customer-facing text that says or implies we won't phone (`tests/js/copy-rule.test.js` must cover the new files).
- A saved link reopening in a different flow from the one it was made in.
- Any change that alters what Classic or Designer 3 visitors see.
- Large files. Keep modules short, as Swipe 2 and Designer 3 do.

## Names

*My call:* flow id `designer4`, label "Designer 4", funnel `door-designer-v5`, new code in `assets/js/designer4/` and its own stylesheet. Target plugin version 0.8.0. Designer 4 may reuse Designer 3's modules (type and style screens, toolbox, hotspots, frame mapping, preview) as long as Designer 3 behaves exactly as before.

## The visitor journey

Mockups from the design conversation are in `.superpowers/brainstorm/23829-1794304171/content/` (git-ignored; open the `.html` files directly, the frame drawings are beside them): `d4-door-handle.html`, `d4-door-handle-v2.html`, `d4-doorway-pictures.html`, `d4-estimate-steps.html`, `d4-my-designs-v2.html`, `d4-callouts.html` (part labels, desktop) and `d4-callouts-phone-v2.html` (part labels, phone; option B is the approved one). They are sketches of layout and wording, not of styling.

### 1. Door type, 2. Style

As Designer 3.

### 3. The door screen

As Designer 3 (complete door, toolbox, bottom sheet on phones), with these differences.

**Part labels in place of the "+" dots.** Decided by Daniel on 2026-11-10 after seeing the built screen ("the dots are a little too imposing on the design"; mockup B approved). Designer 3's orange dots are not shown. Instead:
- Each changeable part the dots covered has a small named label, "Glass", "Handle", "Letterplate", "Knocker" (only where the style offers one) and "Colour", with a thin line to a small ring on that part. The label is a button that opens that part's choices exactly as its dot did (same funnel steps); its accessible name is "Change the handle" and so on. Lines and rings are decorative and do not catch taps.
- Desktop (720px and up): labels sit beside the door, outside the picture, on the side of the door the part is nearer; a part on the centre line goes to the side with fewer labels. Labels never overlap, and keep their parts' top-to-bottom order so lines do not cross. A door too wide for that (a double door) shrinks a little; failing that, its labels sit over its edges as on a phone.
- Phones (719px and below): the door keeps its size and the labels sit over its left or right edge, overlapping the picture a little, moved up or down to keep off the handle and other parts near that edge. Tap areas are 44px high. While the options sheet is open (small door) the labels and the bubble step aside.
- Labels are white with dark text and a soft shadow; lines are light with a thin dark edge, so both read on a white or a black door.
- While the door has no handle the Handle label reads "Handle: choose one" (desktop) or "Handle" (phone), is orange and glows (a solid ring with reduced motion); its line and ring are orange.
- During the handle preview the labels stay; only the handle's ring hides while a handle is drawn there.

**Handle preview.** When a style is picked and the door first appears:
- The door shows three handles in turn: a lever, a finger pull and a bar handle, about a second each, played once. The banner reads "Here's your door. Which handle suits it?"
- The door then settles with **no handle**. The banner changes to "Choose your handle next." and the Handle control (toolbox row or tab, and the Handle label) glows gently until a handle is chosen.
- Colour, letterplate and knocker stay pre-picked as in Designer 3. *My call* (Daniel only mentioned the handle).
- *My call:* which three actual handles are shown is the builder's choice per door type and hardware finish, from handles that are valid for that style. If a type has no finger pull or bar handle, show the ones it has. With reduced-motion set, skip the animation and go straight to the settled state.
- *My call:* the preview plays once per new door. It never plays on a door reopened from a link or from My designs, which always has a handle.

**The ask.** The always-visible box beside the door asks for an email address only:
- Button: "Email me this design and its price".
- Note under it: "We'll send a link to your design now. Your price follows by email within 1 working day."
- *My call:* the guide price (`trust.guidePrice`) is shown beside the door above the box, so the reward comes before the ask.
- *My call:* Designer 3's nudge after the third change is kept, reworded to point at the price ("Looking good. Want a price for it?").
- *My call:* Designer 3's separate "Request a call back" form is not in Designer 4. The phone number is asked for at step 3.

**A handle is required.** It is treated as a required field for the request to go through.
- Pressing the button with no handle sends nothing. A speech bubble pops up above the Handle label, pointing at it, kept inside the screen and clear of the email box: "How will you get in without a handle?"
- The plain message under the button reads: "Oops, your door needs a handle to be saved."
- The Handle control keeps glowing and the typed email is kept. *My call:* tapping the bubble or the Handle label opens the handle choices.
- The server also refuses a Designer 4 request whose design has no handle (missing, or the catalogue's "No Handle").

### Step 1 of 3: the email (this is the lead)

Submitting a valid email with a handle chosen:
- stores the door against that email (same honeypot, email checks and rate limit as today's save);
- creates or updates the lead in the manager (see "Manager");
- counts as the A/B conversion for this visitor, once;
- sends the visitor the one email (see "The email");
- sends the business a notification email;
- moves the visitor to step 2.

### Step 2 of 3: the doorway

Its own screen. A progress strip across the top shows "✓ 1. Your door · 2. Your doorway · 3. Your details", with step 1 already ticked, so it reads as carrying on.

- A green line confirms: "✓ We've got your door, and emailed a link to it to {email}."
- Heading "Now, what's around the door?" with "Glass beside or above the door changes the price. Grey is glass; the white gap is your door."
- **The doorway is picked by picture, never by trade terms.** Two rows, using the existing drawings in `assets/img/frames/`:
  1. "Which is closest? You'll pick the side and style next." Six drawings: Just the door · Glass above only · Glass on one side (left or right) · Glass on both sides · One side and above · Both sides and above.
  2. "Which one exactly?" The drawings in that group only (at most eight), each with a short plain caption. "Just the door" needs no second row.
- Between them the two rows reach all 24 Endurance `Frame Design` layouts, selected by id as `d3-frame.js` does. Group membership and captions are in `d4-doorway-pictures.html`. The captions are *my call* and Daniel has not checked them against the frames; ids 14/17/20 ("bar under the top glass") and 31/32/33 ("glass runs to the top") are the pairs most likely to need better words.
- After a doorway with side glass is picked, the side panel type and side glass choices appear as they do in Designer 3, including its rule that "Matches the door" is not offered with a top light.
- "Next: your details" is enabled once an exact doorway is picked. *My call:* a "Not sure? Skip this for now" link also goes to step 3.
- Each pick is saved to the door's record and passed to the manager as it is made.
- A door type that offers no side or top lights (Double Door) skips this step; the strip then shows two steps.
- The drawings are small sketches made for Designer 3's buttons. If they read badly at tile size, redrawing them larger is in scope.

### Step 3 of 3: details

- Heading "Last step: where's it going?"
- Name, postcode ("So we can check we cover you and price the fitting."), phone number ("Helps if we need to check a detail.").
- *My call:* none of the three is required to press Finish; a postcode that is entered must be a valid UK postcode. Whatever is given is added to the same lead.

### Finished

"✓ Your estimate is on its way. We'll email it to {email} within 1 working day. Your design is saved, and you can change it any time." Links: See my designs · Design another door · Keep customising this door.

### Leaving early

Nothing is lost at any point after step 1. There is no reminder email. The My designs page asks again for whatever is missing.

## My designs

The page the emailed link opens. It lists every Designer 4 door stored under that email address that has not been removed.

- Heading "Your designs", "Saved to {email}", and a line: "We'll email your price for each door here. Remove any you've gone off, and tell us about glass beside or above the door for a closer price."
- **A card per door:** picture (with its doorway glass once known), name ("Etna in French Navy"), when saved, a "Price on its way" tag (later "Estimate sent", see "Manager"), and "Open and adjust".
- **Every door left on the page gets an estimate.** Removing a door is how the visitor says not to price it.
- **Remove.** Each card has Remove; it asks "Remove {name}? We won't price this one." with Remove and Keep it. A removed door disappears from the page, is kept on our records marked as removed with the time, and the manager is told.
- **Doorway prompt.** A door with no doorway answer shows "Does your doorway have glass at the side or top? Tell us for a closer price", which opens step 2 for that door. Once answered the card shows the answer with a Change link.
- *My call:* if name, postcode or phone are still missing, one prompt on the page (not per card) offers step 3.
- **Design another door.** Starts a new door from the type screen, already tied to this email. On its door screen the email box is replaced by an "Add this door to my estimate" button (handle still required). It then goes to step 2 for that door, and to step 3 only if details are still missing. *My call:* no further email is sent to the visitor for doors added this way.
- **Open and adjust** opens that door's door screen. Changes save automatically and are passed to the manager.
- *My call, access:* the link carries the door's existing unguessable token. Opening it shows all that email's doors. No password or code. The page never shows the name, phone number or postcode, only the email address and the doors.
- *My call, typed addresses:* typing an email address at step 1 is not proof of owning it. A visitor who has only typed the address sees and can change the doors made in this browser session, nothing older, until they open the emailed link; My designs tells them the rest are behind the link in their email. Details given at step 3 from such a session fill blanks on the lead but never overwrite a name, phone number or postcode already there.
- *My call:* each time the email box at step 1 is used, the link email is sent (it is how they get back to their doors). The existing per-IP save limit stays.
- *My call:* a link to a removed door still opens My designs.
- Designer 3 and Swipe 2 saves under the same email are not listed; this is Designer 4 only.

## The email

One email to the visitor, sent at step 1, from the existing saver mailer's sender:
- the door picture and name, and the list of what they chose;
- "Your price is on its way. We'll email it within 1 working day.";
- one button, "Open my designs";
- *my call:* a short line that answering the doorway and details questions on that page gets a closer estimate;
- the guide price if one is set, as today.

No "Get my exact price" button, no follow-up emails, and Designer 4 leads never enter the saver follow-up sequence (`HD_DD_Follow_Up`).

## Manager

Daniel chose on 2026-11-10: **the website creates and updates leads in the manager directly**, and Clive steps back for Designer 4.

How it works today, for context: the plugin emails "New door enquiry HD-…" to the business inbox, and the local Clive task reads the inbox and calls `POST /api/v1/deals`. The website itself only pushes visitor and experiment statistics (`hd-analytics`).

What Designer 4 needs:

- **One lead per person.** At step 1 the site creates a deal with source `website_designer` and the customer's email. If an open deal already exists for that email, whatever its source (a Classic quote Clive picked up, a phone enquiry), the door is added to it instead. *My call:* matching is by email across all sources, and "open" means not won, lost or archived; the builder picks the exact stages.
- **Name.** A deal needs a customer name. Until step 3 supplies one, the email address is used as the name, and is replaced when a real name arrives. *My call.*
- **A list of doors on a deal.** New in the manager. Each door has: the website reference (HD-…), name and one-line summary, picture URL, link to open the design, the full list of choices, the doorway (frame id and label, side glass choices) or "not answered", state (live or removed, with the time removed), and when it was added and last changed.
- **Every later event updates the same lead:** doorway chosen or changed, details given, door changed, door added, door removed. Each one also writes a timeline entry on the deal, so Daniel can see what changed after he looked.
- **In the pipeline and on the deal page** Daniel sees all the person's doors, with removed ones clearly marked as not to be estimated, and a door changed since it was added shows when.
- **Daniel hears about later work** (agreed 2026-11-10). A door added after step 1 raises an item on the manager's Actions page and sends the business an email. A change to a door whose estimate has already been sent raises an Actions item. Doorway answers, details and removals are timeline entries only.
- **The manager tells the website about progress** (agreed 2026-11-10). This is a new direction of data: today nothing flows from the manager to the site. When a deal's estimate is marked sent, or the deal is closed (won, lost or archived), the site learns it.
  - Doors on a deal whose estimate has been sent show "Estimate sent" on My designs in place of "Price on its way". They can still be changed, which raises the Actions item above.
  - Doors on a closed deal stay visible on My designs but can no longer be changed or removed.
  - A door designed after the deal is closed starts a new lead.
  - Whether the manager calls the site or the site asks the manager is the builder's choice. The site must not queue an update forever against a closed deal: a refusal for that reason is final, not retried.
  - *My call:* the estimate is per deal, not per door, so "Estimate sent" applies to every door that was on the deal at that moment; a door added afterwards shows "Price on its way".
- **Nothing is lost if the manager is down.** The lead is stored on the website first. Events that fail to reach the manager are queued and retried, and applying an event twice must be harmless. The business notification email is still sent at step 1 regardless.
- **No duplicates from Clive.** The Designer 4 notification email gets its own subject, different from "New door enquiry HD-…", and `../agents/local-only.txt` is updated so Clive does not create a deal from it. That file is Daniel's live task prompt: change it only with his go-ahead, in the same release.
- *My call:* the API key and base URL live in WordPress settings, never in page source. The `hd-analytics` bridge already holds credentials for pushing to the manager; whether the designer plugin or the bridge makes these calls, and the exact endpoints, are the builder's choice. Keep `docs/api` and `convex/lib/apiEndpoints.ts` in step (`convex/apiDocs.test.ts` enforces it).
- wp-admin's Door Enquiries list shows Designer 4 doors with their state (live, removed) and which steps were completed.

## The experiment and statistics

- Export the current test's data, stop Classic vs Designer 3, and start **Classic vs Designer 4** at 50%. Designer 3's results stay in the finished list.
- **Conversion.** For Designer 4 the conversion is the step-1 email, once per visitor. For Classic it is the quote request, as now. The two asks are not the same size (Classic asks for name, email, phone, postcode and a consent tick), and Daniel accepts that: the test asks which flow produces more leads he can estimate.
- Win rule unchanged: P ≥ 97.5%, at least 15 leads per arm, at least 14 days. At about four leads a week a clear result takes a couple of months.
- **Stats Daniel asked for on the doorway step**, per flow in the manager beside the existing drop-out figures: reached it, picked a group, picked an exact doorway, skipped it, left there; which group was picked; how often people changed their pick; how many went on to finish step 3.
- *My call:* also count handle preview shown, handle chosen, pressed the button with no handle, My designs opened, door added, door removed.
- The places a new flow and funnel must be registered are known: `HD_DD_Experiments::flows()`, `class-hd-assets.php`, `boot.js` (`FUNNELS`, `launch`, capability checks, `storedFlow` caps), `experiment.js` (`storedFlow`, `knownFlows`), `funnel.js` (step order, `MILESTONES`), `class-hd-save.php` (`with_flow`), `class-hd-experiment-tracking.php` (`STEPS`, `backfill_saves`); in the manager `convex/lib/marketing.ts` (`CURRENT_DESIGNER_FUNNELS`, era start), `lib/experimentJourney.ts` (flow lists), `lib/webPathLabels.ts`, and the journey validator.

## Release

Manager first (its validators must accept the new fields before the site sends them), deployed with `npx vercel --prod` from a clean worktree; a push does not deploy it. Then the plugin release, update in wp-admin, purge the page cache, check on a phone with `?flow=designer4&notrack=1`, make one real test lead end to end and confirm it in the manager, then swap the experiment.

## Left to the builder

- How the three plans are split (plugin, manager, bridge) and their order within the release.
- Storage for doors-by-email and the removed state on the website (today's `hd_enquiries` table has neither a list-by-email query nor a soft delete).
- The manager's data model and endpoints for doors on a deal.
- Animation timing and the exact look of the glow, bubble and progress strip, matching the plugin's existing style.
- Phone layouts for steps 2 and 3 and My designs.

## Not decided here

- The four existing Designer 3 savers get nothing automatic from this work. Daniel can email them an estimate himself.
- The follow-up sequence for cold enquiries will be built in the manager separately.
