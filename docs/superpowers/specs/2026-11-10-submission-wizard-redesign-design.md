# Submission wizard redesign — design

Date: 2026-11-10. Follows `2026-10-22-submission-flow-design.md` (M3), which
this document changes the screens of and nothing else.

## Why

The M3 wizard works but reads as a plain form. A review of the merged flow
found it minimal where a customer needs reassurance: the service picker is a
thin strip, the service level hides in a dropdown, options disappear without
explanation, and the Next button is disabled without saying why.

The customer we design for is **a collector sending one or two valuable
cards** (the user's words). That person is not in a hurry; they want to see
what they are buying, what it costs, what limits apply, and that their card
was recorded correctly. The reference they named is **PSA's submission flow**:
numbered steps, service levels as cards with price, turnaround and value
limit, an order summary always in view, a full review before paying.

## Decisions the user made

- The typical customer is a collector with one or two valuable cards.
- The look to aim for is PSA's submission flow.
- **Each card keeps its own service and service level.** PSA picks one level
  per submission; we deliberately do not. The order model, the database and
  pricing stay exactly as M3 built them.
- Colours and fonts are fixed (the brand manual). This is layout and
  components only.
- The Cards step mockup is approved as shown:
  `assets/2026-11-10-submission-wizard-cards-step.html` (open it in a
  browser). It is the visual reference for every screen in this document;
  where this text and the mockup differ on the Cards step, the mockup wins on
  appearance and this text wins on behaviour.

Everything below that is not in that list is the author's call, marked
**(call)** where a different choice would be reasonable.

## Goals

1. Every choice that costs money is visible with its price before it is made.
2. No service level disappears silently; one the declared value rules out
   stays on screen and says why. (Signed-only services are the deliberate
   exception — see Service cards.)
3. The customer always knows what is still missing and can get to it in one
   click.
4. The photo is a first-class part of the card, not a pill at the bottom.
5. The review page shows everything the customer entered.

## Non-goals

- One service level per order (PSA's structure). Decided against, above.
- Duplicate card, bulk entry, card search or autocomplete. They serve a
  dealer entering forty cards, not this customer. **(call)**
- More than one photo per card. Still one (`MAX_PHOTOS_PER_CARD`).
- Any change to prices, pricing rules, the order state machine, RLS, or the
  database. **No migration is part of this work.**
- The pages under `/account/orders/*` (order page, test payment page, label,
  form) and `/pricing`.
- New business copy. Service and tier descriptions already exist under
  `catalog.*` in `messages/en.json` and are reused as they are.

## Anti-goals

- A wizard that looks finished while the price list, insurance wording and
  drop-off copy are still placeholders, with nothing saying so. The
  placeholders stay listed in `docs/content-requests.md`; this work adds any
  new placeholder-dependent copy to that file.
- Client-side prices that could be mistaken for the server's. The rule from
  M3 holds: `lib/orders/pricing.ts` is a display mirror; the review page shows
  only `quote_order`'s figures.

## Constraints

- All copy in `messages/en.json`; numbers and money through `useFormatter()`.
- Tokens only (`bg-surface`, `border-gold`, `text-gold-ink`, `rounded-card`
  …). Never `text-gold`. Both themes must work with no `dark:` unless a
  difference cannot be expressed as a token.
- Base UI supplies behaviour (radio group, dialog, alert dialog); every
  visual is ours. Native `<select>` stays for language and country.
- New primitives go in `components/ui/` and into the `/design` gallery.
- Tests are colocated, go through `renderWithIntl`, and assert copy from
  `messages/en.json`, never literals.

## The screens

### Stepper (all three wizard pages)

Numbered circles joined by a line: **1 Cards — 2 Shipping — 3 Review — 4
Payment**. The current step has a gold-filled circle and its name in ink.
Completed steps show a check instead of the number and are links back.
Later steps are plain text, never links (unchanged rule: no skipping ahead).

Payment is shown as a fourth step so the customer sees the whole journey
**(call)**. It is never a link and never current inside `/submit`; the
payment page itself is out of scope and does not get the stepper. The step
key `summary` and its URL stay; only its label becomes "Review".

Below `sm`, only the current step shows its name; the others are circles.

### Step 1 — Cards

One card is open at a time; the others are collapsed rows. Unchanged: each
card autosaves on its own, 50-card limit, the first card opens by default.

**Open card.** A header (card number label, the card's name as title, a
quiet "Remove" action on the right) and four numbered sections separated by
hairlines:

1. **Photo and identification.** Left: the photo zone. Right: "Who
   identifies this card?" as two choice cards — "I'll enter the details"
   (marked as included) and "ART identifies it" (showing the identification
   fee from the catalog).
2. **Card details.** Card name, brand or game, set name, card number, release
   year, language, surface (optional), then Signed and Numbered. Field order
   changes to lead with the name **(call)**; rules, limits and which fields
   are required do not change.
3. **Declared value.** The one field and its hint.
4. **Service.** Service cards, then service level, then extras.

**Photo zone.** Card-shaped (5:7). Empty: dashed gold-line border, upload
icon, "Add a photo", and it accepts a click, keyboard activation, or a
dropped file. With a photo: the image fills the zone, with a "Remove photo"
control. While compressing and uploading: the zone shows "Uploading…"
(`cards.photo.uploading`, which exists and is unused today) and is locked.
Errors appear under the zone. Same types and limits as today
(`lib/photos/limits.ts`).

Three behaviour fixes ride along:

- **A photo can be added to a brand-new card.** Today the control is disabled
  until the card's first autosave lands, so on a blank card it does nothing.
  Instead, choosing a photo first saves the card if it has never been saved,
  then uploads. The hint "Available once the card has been saved" goes away.
- **The browser keeps the photo under the server's limit.** After resizing,
  if the encoded file is over `PHOTO_MAX_BYTES`, re-encode at lower quality
  (0.85, then 0.7, then 0.5) before giving up with `photoTooLarge`.
- **Storage failures are diagnosable.** `uploadPhoto` reports the storage
  error's name (for example `NoSuchBucket`) as the Sentry code instead of the
  bare word `storage`. The name only — never the message, which can carry a
  bucket or key.

**Service cards.** One card per service the card may use
(`availableServices`), two columns from `sm`. Each shows an icon, the
service's label, its description, and "from {price}" — the lowest tier price
of that service. Selected: gold border, soft gold fill. Services are data,
so icons are a small map from service key to icon in code with a neutral
default for keys the map does not know. The shield is reserved for the
gas-fill feature and must not be used here.

Signed-only services (autograph, dual) stay **hidden** until Signed is
ticked, as in M3 and in the approved mockup, and unticking Signed still
clears such a service through `normalizeCard`, unchanged — that function
also runs on the server and is not touched **(call)**. So the customer can
find them, an unsigned card shows one quiet line under the service cards
saying that signed cards have further services, pointing at the Signed
checkbox.

**Service level.** Every tier of the chosen service, as a radio list — not
a dropdown. Each row: label, description, price, turnaround. A tier with a
value limit says so ("for cards declared up to {amount}"). A tier whose limit
the declared value exceeds stays visible, **disabled, with the reason in
ink**, naming both the limit and the card's declared value. If the customer
raises the declared value after choosing such a tier, the choice is kept
(unchanged M3 rule: `normalizeCard` never silently changes it), the row shows
as selected and over its limit, and the existing `overCap` message is shown
at once, without waiting for a blur.

**Extras.** Each add-on as a checkbox card: label, description, "+{price}".

**Collapsed card row.** Thumbnail (the photo, or a neutral card-shaped
placeholder), card number label, name, one line of "set · number · service ·
level", a "Needs details" badge while the card has problems, its price, and
Edit. No duplicate action.

**Remove.** In the open card's header. A card with nothing entered is removed
at once; a card with anything entered (any field, a service, or a photo) asks
for confirmation in an alert dialog first **(call)**. The server-side removal
and its error handling are unchanged.

**Add card.** A full-width dashed button under the list.

### Order panel (steps 1 and 2)

Sticky side panel from `lg`.

- A line per card: name, "service · level", price. A card with no level yet
  shows a dash, not €0.00.
- ART identification as its own line when any card uses it (the summed fee),
  so a total made only of that fee is explained **(call)**.
- Shipping: on step 1, "Added in the next step"; on step 2, the inbound and
  return fees once a country is chosen.
- **Estimated total.** It shows a dash only while the total is zero and no
  card has a price. As soon as anything costs money — including an
  identification fee on a card with no level yet — it shows the amount.
- Estimated turnaround, as today.
- The Next button, **always enabled** unless a save is in flight.
- Under it, when something is missing: "N things to finish" with a link per
  problem (at most three, then "and N more"), each naming the card and the
  field. Following a link opens that card, scrolls to the field and focuses
  it.

**Next with problems.** Clicking Next while anything is missing does not
navigate. It reveals every field error on the first card that has problems
(not only fields the customer has touched), opens that card, and moves focus
to its first invalid control. With no problems it behaves as today: flush
every autosave, navigate only if all succeeded.

**Below `lg`.** A compact bar fixed to the bottom: the total (or dash) and
turnaround on the left, the Next button on the right, and a "Show details"
toggle that opens the full panel content in place above the bar. As built it
is a disclosure (`aria-expanded`), not a modal sheet: nothing is duplicated in
the DOM and no focus trap is needed. The page keeps bottom padding so the bar
never covers the last control.

### Step 2 — Shipping

Same shell and order panel. The form becomes numbered sections like the card
form:

1. **How will you send your cards?** Two choice cards, "Send by post" and
   "Drop off in person", replacing the segmented strip.
2. **Contact details.** First name, last name, phone.
3. **Address** (post only). Country, postcode, city, address.
4. **Insurance** (post only). The acknowledgement checkbox and its wording.

In person shows the drop-off information in place of sections 3 and 4.
Prefill, autosave, locking while leaving, and every rule are unchanged. Next
behaves as on step 1: always enabled, and with problems it reveals them and
focuses the first. Two problems have no message today and need one:
`methodMissing` and `insuranceUnconfirmed`.

### Step 3 — Review

Titled "Review your order". Same content as today's summary, plus:

- Each card shows its thumbnail, name, and a details line with set, card
  number, year and language; its declared value; service, level and extras;
  the identification fee where it applies; and its price.
- The Cards block gets an Edit link to `/submit`, like Contact has.
- Totals, terms checkbox, submit and its error handling are unchanged, and
  every figure still comes from `quote_order`.

### Dropdowns

`FieldSelect` is meant to draw a chevron and does not: its arbitrary
background-image class does not survive compilation, so selects look like
text inputs. Draw the chevron as a real element positioned over the control,
in the muted colour, so it follows the theme.

## New and changed parts

| Part | What it is |
|---|---|
| `components/ui/choice-cards.tsx` | New primitive: a radio group drawn as cards. Options carry a title, optional description, icon, right-aligned figure and second line, and a disabled state with a reason. One or two columns. An uncommitted first draft exists on the branch; treat it as a sketch. |
| A checkbox-card variant | For extras: the same card look around the existing `Checkbox`. |
| `components/ui/photo-input.tsx` | Becomes the photo zone: drop target, card-shaped preview, busy label. |
| `components/ui/field.tsx` | Chevron fix for `FieldSelect`. |
| `components/submit/step-indicator.tsx` | The numbered stepper. |
| `components/submit/running-total.tsx` | The order panel: card lines, problem links, dash for unpriced, mobile bar and sheet. |
| `components/submit/card-editor.tsx`, `cards-step.tsx` | Sections, choice cards, collapsed row, remove with confirm, reveal-problems, photo on an unsaved card. |
| `components/submit/shipping-step.tsx` | Sections, method cards, reveal-problems. |
| `components/submit/summary-step.tsx` | Richer card rows, Edit link. |
| `lib/photos/compress.ts` | The quality ladder. |
| `app/[locale]/submit/actions.ts` | The storage error name in `uploadPhoto`'s report. Nothing else server-side. |
| `lib/orders/card-rules.ts` | Small pure helpers the screens need (for example the lowest tier price of a service, and a tier's availability with its reason). `availableTiers`' existing behaviour stays for its other callers. |
| `app/[locale]/design/` | Gallery entries for the new primitives. |
| `messages/en.json` | New keys for the copy above; `steps.summary` becomes "Review". |

`CLAUDE.md`'s notes on the design system and orders are updated where this
changes what they say (the photo-before-save rule, the select chevron, the
new primitive).

## Accessibility

- Choice cards are a real radio group: arrow keys move, each radio is named
  by its title and described by the rest; a disabled option's reason is part
  of its description.
- The stepper keeps `aria-current="step"`; completed steps are links with
  their name as the accessible name.
- Problem links move focus to the control they name. Revealed errors are
  wired to their controls as today (`FieldError`).
- The photo zone is operable by keyboard and has a visible focus ring; drag
  and drop is an addition, never the only way.
- The remove confirmation traps focus and closes on Escape (Base UI). The
  mobile order details are a disclosure and need neither.

## Testing

Component tests are updated alongside each part. The behaviours that must
be covered:

- A tier over its limit is rendered, disabled, with its reason; a chosen
  tier that becomes over-limit stays chosen and shows `overCap` immediately.
- Service cards show the lowest tier price; unknown service keys render with
  the default icon.
- A photo chosen on a never-saved card saves the card first, then uploads;
  if that save fails nothing is uploaded and the error shows.
- The quality ladder stops at the first encoding under the limit and throws
  `photoTooLarge` after the last.
- Next with problems does not navigate, reveals errors and focuses the first
  invalid control — on both steps.
- The total shows a dash when it is zero and nothing is priced, and the
  amount (with an identification line) when only an identification fee
  applies.
- Signed-only services are absent on an unsigned card, which shows the
  signed-cards line instead.
- Remove asks for confirmation only when the card has content.
- The stepper links completed steps only.

Existing tests that assert the old shapes (service buttons with
`aria-pressed`, the tier `<select>`, Next disabled while incomplete, the
photo input disabled until saved) are rewritten to the new behaviour, not
deleted. End-to-end coverage of the wizard remains M8's.

## Left to the builder

- Exact spacing, icon drawings, and the bottom sheet's motion.
- Whether the order panel is one component with two layouts or two
  components sharing a hook.
- How reveal-and-focus is wired between the step and the editor.
- The order of work, provided each commit leaves the wizard usable.

## Scope note

`docs/01-project-estimation.md` budgets M3 at 88 hours and names scope creep
as the top risk. This redesign was not in M3's scope; it is polish the user
asked for after reviewing the merged flow. Rough size: 24–32 hours. The user
decided (2026-11-10) that it is **not booked against any milestone and is not
a change request**: it is done as part of getting M3 right.
