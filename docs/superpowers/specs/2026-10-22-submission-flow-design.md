# Grading submission flow — cards, services, shipping, order summary

**Date:** 2026-10-22
**Status:** Approved 2026-10-26 · revised 2026-10-28 after the client call
**Module:** M3 — Grading submission flow (plus the R2 line of M0)

## Goal

Let a signed-in customer build an order of one or more cards, choose a service
for each, say how the cards travel, and submit an order summary with a price
and turnaround estimate. The order then waits for payment, which M7 adds, and
is tracked under `/account`.

**Stripe is M7 and FedEx is M6**, but the flow is built to be **testable end
to end now, and to look like the finished one** (decided). Where Stripe and
FedEx will plug in, M3 puts **stand-ins** behind the same boundaries (see
*Stand-ins for payment and shipping*). A test order goes through cards,
shipping, summary, test payment, *paid*, and the customer printing ART's QR
parcel label and submission form. It stops there, because receiving and
grading cards is staff work (M5/M6).

## Where the scope comes from

The estimate (`docs/01-project-estimation.md`, M3, 88 h) is **replaced and
extended** by the client's process document *ART – folyamat- és rendszerterv*
(`docs/kartyagrading_folyamat_IT.docx`, received 2026-10-22). Decided with
Geri: the document defines M3, and everything it adds beyond the estimate is
recorded below so it can be priced as a change request. **The additions are
committed** (decided): the plan lays the schema down once rather than building
the estimate's core first and layering the additions on.

Its M3-relevant content, checked item by item against this spec: card
category (TCG / sport), player or set name, signed and numbered flags, no
memorabilia; the inbound-insurance acknowledgement; service tiers with the
Digital Grade / Early Access add-on; postal or in-person shipping with country,
postcode and address; the return-shipping fee question; and an order review
listing the cards and their count, the customer's details, the shipping
method, the price lines, the total and the ToS acceptance. Everything is
covered below or listed as a non-goal.

**Two deliberate departures from the document's data-model sketch** (§6),
both decided with Geri: `service_tier` and `declared_value` sit on each
**card**, not on the order. The sketch's card fields are also extended with the
estimate's set, set number and release year, which M4's search relies on.

### The 2026-10-28 client call

A walkthrough of this flow with the client (the graders who will run the
service) changed four things. Where it conflicts with the process document,
the call wins, because it is newer:

- **How a card is identified.** A customer either **enters the card's
  details**, or adds it as an **unknown card that ART identifies**, for a
  per-card identification fee. The client named €2. The client also asked for
  a third way: a **search that suggests cards as the customer types**. That
  needs a card catalogue we have no data source for, so it is **deferred to a
  change request** (decided with Geri). The card row carries a nullable
  catalogue reference so search adds no schema rework.
- **Which details.** The client's list replaces the earlier field set: release
  year, brand, language, card name (the character or player on the card), set
  name, card number and surface finish (holo and the like).
- **Autograph services.** A signed card can have its **autograph** graded
  instead of the card, or **dual** (both), alongside plain card grading and
  authentication. The client demoed PSA's flow, where the service is picked
  once for the whole submission, but **the service stays per card** (decided
  with Geri). Autograph options appear only on a card marked *signed*.
- **What the customer prints.** After ordering, the order page gives packing
  instructions, a **parcel label with a QR code** to stick on the outside of
  the box, so ART can identify the parcel without opening it, and a
  **submission form**, generated from the order, that goes in the box with the
  cards. The customer writes nothing by hand. The client asked for a barcode;
  **a QR code was agreed** on the call, because a phone can read it.

Shipping and payment stay **skip-through** in this version, as Geri told the
client: the address step and the test payment page remain, and the fake
carrier label is dropped. ART's own QR label replaces it.

The document describes five steps: registration, card details, service
selection, shipping details, payment. This spec covers steps 2–4 and the order
summary. Registration exists (M2); payment is M7; the document's return
insurance offer happens after grading and gets its own design.

### Additions to the estimate

| Addition | Source | Rough size |
|---|---|---|
| The client's card fields (brand, language, surface), signed, numbered and declared value per card | document + call | small, inside the form budget |
| Unknown cards identified by ART, with a per-card identification fee | call | ~3–4 h |
| Service, tier and add-ons **per card**, services as data (autograph and dual for signed cards), with a generic add-on mechanism (Digital Grade first) | document + call + decision | ~6–8 h |
| QR parcel label, printable submission form and packing instructions | call | ~6–8 h |
| Shipping step: postal / in person, address, phone, accepted countries, fixed fees, inbound-insurance acknowledgement | document | ~10–12 h |
| Drafts saved on the server, resumable on another device, expiring | decision | ~6–8 h |
| Configurable price table: tiers, add-on, shipping fees, turnaround, currency-ready | decision (no price list yet) | ~4–6 h |
| Account deletion against real orders (refusal, draft removal, scrub) | contract from the M2 settings spec | ~3 h |
| The payment stand-in, the "Ship your cards" step, the full status timeline | decision | ~6–9 h |

Roughly **+44–58 h** on top of the 88. Part of the stand-in work is M7 work
done early: the payment boundary, the code that handles a successful payment,
and the "Ship your cards" step. M7 should shrink accordingly. The R2 bucket
wiring is M0 work that was always going to land here, so it is not an
addition. These are estimates for the change request, not commitments.

**Card search is not in this total.** It is a separate change request
whose size depends on the data source (see *Non-goals*).

## Non-goals

Each is either a later module or a change request; none is built here.

- **Real payment.** Stripe Checkout, the signed webhook, idempotency,
  refunds and the transaction log are M7. M3's test payment page moves money
  nowhere.
- **Real shipping.** Live FedEx rates, carrier labels, address validation and
  tracking are M6. M3 has no carrier label at all, real or fake. ART's QR
  parcel label is not a carrier label. It identifies the parcel at ART, and
  the customer ships it however they choose.
- **Card search.** Suggesting cards as the customer types needs a catalogue
  of every card. Free sources exist only for some games (the Pokémon TCG API,
  Scryfall for Magic), and there is none for sports cards. A change request
  settles the source, then builds the catalogue, its sync into Meilisearch, and
  the autocomplete. M3 leaves `catalog_ref` on the card for it.
- **Item types other than trading cards.** The PSA flow the client demoed
  starts with Trading Card, Oversized Card, Pack or Ticket. M3 accepts trading
  cards only; the rest is a question for the client.
- **Per-card QR codes** for ART's internal workflow (the client mentioned
  them). They are printed at intake, which is M5.
- **Return insurance offer** — the 72-hour window, the timed job, the insurer
  API (Shipsurance / U-PIC), the audit log. Starts after grading; its own
  design, after M5–M7 exist.
- **ART-arranged inbound insurance.** The document floats it as optional; it
  needs an insurance partner. Only the customer's self-insurance
  acknowledgement is recorded.
- **GLS.** The document names FedEx / GLS; the estimate names FedEx only. A
  change request against M6, not M3.
- **Google / Facebook login, username, phone number at registration.** M2
  changes from the document, listed for the change request.
- **Cardstrade profile and delivery of the Digital Grade image.** M3 sells the
  add-on; delivering it is M5.
- **Memorabilia cards.** Not accepted at launch (document). There is no
  memorabilia category, so nothing to block.
- **Order emails.** Submitting creates an *unpaid* order; the first order mail
  is the payment confirmation in M7. This moves the "transactional mail
  mechanism" that `2026-09-28-profile-settings-design.md` placed in M3 to M7.
  *(My call.)*
- **Admin views of orders.** M5. No admin policy on the order tables yet.
- **Editing a submitted order.** The customer can cancel an unpaid order and
  start again; they cannot edit it.

## Anti-goals

- **A pre-ticked paid add-on.** The document has Digital Grade ticked by
  default. The EU Consumer Rights Directive (Art. 22) forbids taking payment
  for an extra through a default option the consumer must untick. It starts
  **unticked**. Raised with the client (below).
- **Invented business rules.** No real prices, tiers, turnarounds, countries
  or VAT rates appear in code. They are table rows with values that are
  obviously placeholders, filled once the client supplies them.
- **A client-computed price that is trusted.** The browser may show a running
  total; the amount stored on the order is computed on the server at submit.
- **Losing a half-entered order.** A customer who closes the tab after fifteen
  cards finds them again, on any device.
- **Status writes scattered through the code.** `CLAUDE.md` requires one place
  for order transitions.

## The flow

`/submit`, signed in only. `requireUser({ next: "/submit" })` sends a visitor
to sign in and back. The two landing CTAs and the header link already point
here.

A **wizard, one step per screen** (decided), three steps:

1. **Cards & services**
2. **Shipping**
3. **Summary**

Back / Next between steps; each step validates before Next. A **running total**
sits in a side panel on desktop and a bottom bar on mobile, showing card count,
estimated total and estimated turnaround. The step indicator is clickable
backwards only.

### Step 1 · Cards & services

The customer adds cards one at a time with **"+ Add card"** and can remove or
edit any of them.

**Identification, per card** (2026-10-28 call). Each card has a two-way
choice, which the customer can switch at any time:

- **"I'll enter the details"**, the default. The identification fields below
  are required, and there is no extra charge.
- **"ART identifies it"**, which adds the **identification fee**, a price-table
  row the client put at €2. The identification fields become optional hints.
  Whatever the customer types still helps ART, and a photo helps most.

The fee is shown on the choice itself, so it is never a hidden default. The
declared value is **required in both modes**. The customer's declared value
stands for insurance and the return even when ART identified the card. The
client wants that in the terms (a question for the lawyer, below).

The fields, in the client's order:

| Field | Required | Notes |
|---|---|---|
| Release year | yes¹ | Integer, 1880 to next year *(my call)* |
| Brand | yes¹ | Free text: Pokémon, Topps, Panini… |
| Language | yes¹ | Chosen from a fixed list of ISO 639-1 codes, named with `Intl.DisplayNames` *(my call; list confirmed with the client)* |
| Card name | yes¹ | The character or player on the card |
| Set name | yes¹ | |
| Card number | yes¹ | Free text, because numbering schemes vary (`4/102`, `RC-23`) |
| Surface | no | Free text: holo, reverse holo, refractor… Empty means a standard finish *(my call; the client's list of finishes is a question)* |
| Signed | no | Checkbox. Unlocks the autograph services |
| Numbered | no | Checkbox (serial-numbered print run), from the process document |
| Declared value | yes | Money, > 0. Feeds tier caps now and insurance later |
| Photo | no | One image, uploaded to R2 (below) |

¹ Required when the customer enters the details. Optional when ART
identifies the card.

The process document's **category** (TCG / sport) is gone. Brand carries that
information, and it is not in the client's list.

**Service sits inside each card's form** (decided, and re-decided on
2026-10-28 against the client's PSA demo), not in a separate step:

- **Service**, chosen from the price table's active services, which are data
  like tiers (see *Prices*). Seeded: **card grading**, **autograph grading**
  (the signature only), **dual** (card and autograph) and **authentication**.
  A service can be marked *requires signed*, as autograph and dual are. It is
  offered only on a card ticked *signed*. Unticking *signed* clears such a
  service.
- **Tier:** chosen from the tiers the price table offers for that service. A
  tier may carry a maximum declared value; a card above it cannot pick it.
- **Add-ons:** zero or more optional extras per card, all unticked. The form
  lists whichever active add-ons apply to the card's chosen service (see
  *Add-ons* below). **Digital Grade is the first one.** It applies to card
  grading and dual, because it is an image of the grade.

Year, brand, card name, set name and card number are what the Pop Report (M4)
searches on. On a card ART identified, staff fill them in at intake (M5).

A per-order card limit exists so a runaway draft cannot grow without bound —
**50** *(my call)*, a named constant.

Collapsed cards show a one-line summary (name, set, service, price), or
"Unknown card — ART identifies it" so that a long order stays scannable.

### Step 2 · Shipping

- **Method:** *postal* or *in person*. In person means the customer hands the
  cards over at ART and collects them there — no shipping fee either way
  *(guess, confirmed by Geri as looking right; the location and opening hours
  are client copy)*.
- **Contact, every order:** first name, last name and phone are **required for
  both methods**. Postal needs them for the label; in person needs them to
  identify the customer at hand-over and to call when the cards are ready
  *(my call)*. FedEx/GLS labels need the phone.
- **Postal address,** on top of that: country, postcode, city, street address.
- **Prefill:** contact and address come from the customer's most recent
  submitted order, or the names come from their profile on a first order.
- **Names go back to the profile only when it has none.** The M2 settings spec
  promised that names, optional in settings, become required "at first
  submission". So submitting fills `profiles.first_name` / `last_name` when
  they are null and never overwrites names already there. The order keeps its
  own snapshot either way *(my call)*.
- The cards are returned to the **same address** *(guess, confirmed)*. No
  separate return address.
- **Countries** come from the price table's shipping zones. A country not in a
  zone is not offered. Country names are rendered with `Intl.DisplayNames` in
  the active locale, not stored as copy.
- **Fees:** a fixed **inbound** fee and a fixed **return** fee per zone, from
  the price table (decided for return; inbound is *my call*, because the
  document has ART generate the inbound label after payment — the client can
  set it to zero). M6 replaces both with live rates.
- **Inbound insurance (postal only):** a required checkbox — "I have insured the parcel
  myself" (wording is client copy). Recorded on the order with a timestamp;
  creates no charge.

### Step 3 · Summary

- One line per card: name, set, service, tier, any add-ons, the
  identification fee when ART identifies it, and the price.
- Shipping lines (inbound, return), the total, and the **total declared
  value**.
- **Estimated turnaround:** the longest turnaround among the order's tiers,
  as a number of business days from receipt *(my call; the estimate requires a
  turnaround estimate and tiers are where turnaround lives)*.
- Customer details and the shipping method.
- **Prices are shown VAT-inclusive**, labelled as such. EU price-indication
  rules require the final price for consumers; the rate and treatment are the
  client's. Placeholder prices are stored gross *(my call, pending the
  client)*.
- **Terms acceptance:** a required checkbox linking to `/terms`. The ToS is
  legal content, out of our scope, and does not exist yet — so `/terms` joins
  the deliberate-404 table in `CLAUDE.md` and is flagged as blocking launch.
  The order records the acceptance time and a terms version string.
- **"Continue to payment"** is the final button's label, as it will be in
  M7. It submits the order (→ *awaiting payment*) and hands the customer to
  the payment provider: in M3, the test payment page (see *Stand-ins*). With
  no provider configured it lands on the order's page instead, which says
  payment is not available yet.

## Drafts

Decided: progress survives closing the tab and works across devices, so the
draft lives **on the server**, not in browser storage.

- A draft **is an order** in status `draft` — the same tables, not a parallel
  shape. Submitting is a status transition, not a copy. *(My call.)*
- **One open draft per customer**, enforced by a partial unique index on
  `(user_id) where status = 'draft'`. `/submit` opens it; the draft row is
  created on the first save, not on page view, so browsing `/submit` creates
  nothing.
- **Autosave**, debounced, as the customer types; the step indicator and the
  running total read from what is saved. The goal is that at most the last
  second of typing is lost. The mechanism (per-card upsert through Server
  Actions, debounce length) is the builder's.
- **A draft untouched for 30 days is deleted**, with its photos *(my call)*.
- The open draft is listed first on `/account` with a "Continue" link.

## Photos (R2)

R2 is wired here — the M0 line "Cloudflare R2 objektumtároló bekötése" was
always going to land with the first upload.

- **One optional photo per card** — the estimate says one image *(my call;
  front-and-back is raised with the client)*. Photos are their **own table**,
  keyed to the card, with the UI allowing one. A "front and back" answer from
  the client then changes a limit, not the schema.
- **Compressed in the browser before upload**: longest edge capped (around
  2000 px) and re-encoded to JPEG or WebP, with a preview. Input above a hard
  limit (around 20 MB) is refused before any work. The exact numbers are the
  builder's.
- **Enforced on the server too**: accepted types `image/jpeg`, `image/png`,
  `image/webp`, a post-compression byte limit (around 2 MB). The browser's
  checks are convenience, not the boundary.
- **The bucket is private.** The owner sees their photos through short-lived
  signed URLs. Object keys never contain the customer's name or email.
- The photo uploads as soon as it is added, so it belongs to the draft.
  Whether the browser uploads straight to R2 with a presigned URL or through
  our server is the builder's call, under these constraints: our server
  decides the object key, the size limit cannot be bypassed by a modified
  client, and the R2 credentials never reach the browser.
- **R2 credentials are runtime env** (`R2_*`), never build args, per the
  secrets rule in `CLAUDE.md`. A local setup (a dev bucket or an S3-compatible
  local stand-in) and a hosted runbook, `docs/deployment/R2_SETUP.md`, are part
  of the work.
- Removing a card, cancelling an order or expiring a draft deletes its photos.
  What happens to photos of orders that complete is M5's question (they may
  feed the Pop Report's card detail).

## Prices — configurable data

There is no price list yet (decided), so pricing is **data, not code**.

The tables, with obviously-placeholder seed values:

- **Services:** key, display order, *requires signed* and an active flag.
  Seeded with card grading, autograph, dual and authentication. Dual has its
  own tiers and prices rather than being the sum of the other two, so the
  client can price a bundle *(my call)*. A service the client adds later, such
  as a grading-plus-authentication bundle, is a row, a message key and a
  deploy.
- **Tiers:** per service. Key, display order, price, optional maximum
  declared value, turnaround in business days, active flag.
- **Add-ons:** see the next section.
- **Card fees:** flat per-card charges the customer's own choices trigger.
  The first is the **identification fee** for a card ART identifies. It is a
  separate row from add-ons, because it follows from the identification
  choice rather than being a ticked extra. The client named €2 on the call,
  which goes in as the seed value pending the price list.
- **Shipping zones** — countries in each zone, inbound fee, return fee.

Every price row carries a **currency**. Amounts are **integer minor units**
(cents) plus an ISO 4217 code, everywhere — price table, order lines, order
totals. **EUR only at launch** (decided); a second currency is new price rows
plus choosing the customer's currency, with no schema change. All formatting
goes through next-intl's `useFormatter`/`getFormatter`.

Service, tier and add-on **labels and descriptions are message keys** in
`messages/en.json`, keyed by the row's key, not copy in the database — copy
belongs in the message files (`CLAUDE.md`). So a new add-on is a row, a
message key and a deploy. **Decided: acceptable for now; revisit at M5**, when
an admin area could let the business add add-ons without a developer. That
would move their copy into per-locale database rows, an exception to the rule.

**Editing** until the M5 admin area exists: by migration or in Supabase Studio
*(my call)*. The tables are readable by any signed-in user and writable by
nobody through the Data API.

**The submitted price is computed in Postgres, inside the submit transition.**
Customers write their own draft rows through the Data API, so any price a
client could write is forgeable; draft rows carry no prices the server trusts.
At submit, the database prices every line from the tables and stores the
result on the order — price per
line, fees, total, currency, and the turnaround. Later price changes do not
touch submitted orders. The running total in the wizard may be computed in the
browser from the same rows for responsiveness, but the summary step shows the
server's figure.

## Add-ons — a generic mechanism

Decided with Geri: add-ons are **generic**, not a Digital Grade feature.
Digital Grade is the first row. Whatever extras the business invents later
are added the same way, with no change to the form, the pricing or the schema.

- **An add-on is a row:** key, display order, active flag, and the services it
  applies to (any subset of the services).
- **Its price** is a flat amount per card, one row per currency, like every
  other price.
- **A card holds any number of add-ons** through a card ↔ add-on link table.
  Submit stores each chosen add-on's price on that link row, so later price
  changes leave submitted orders alone.
- **One applicability rule everywhere.** An add-on can be attached only if it
  is active and applies to the card's service. The form shows only those, the
  running total counts only those, and the submit function refuses anything
  else. If the customer switches a card's service, add-ons that no longer
  apply are dropped from the draft.
- **Never pre-ticked.** That holds for every add-on, not just Digital Grade
  (EU CRD Art. 22). It is a rule of the mechanism, not a per-row flag.
- **Deactivating** an add-on hides it from new drafts. Drafts that already
  carry it lose it at their next save. Submitted orders keep it.
- **Card-level only** *(my call)*. An order-level extra, such as priority
  return handling, would be a separate mechanism. Nothing here precludes one.
- **Selling an add-on is generic; delivering it is not.** Digital Grade's
  image is produced in M5. Each future add-on brings whatever fulfilment it
  needs in the module that does that work.

## Orders and the state machine

### Statuses

Defined now in full so later modules only add transitions, never statuses:

`draft` → `awaiting_payment` → `paid` → `received` → `grading` → `graded` →
`shipped_back` → `completed`, plus `cancelled`.

In M3 only these transitions exist:

| From | To | By |
|---|---|---|
| (none) | `draft` | customer, first save |
| `draft` | `awaiting_payment` | customer, submit |
| `draft` | `cancelled` | customer |
| `awaiting_payment` | `cancelled` | customer |
| `awaiting_payment` | `paid` | system: the payment-success handler (below) |

Every other transition belongs to staff or the system (M5–M7). **The customer
can never move an order to `paid`.** That transition is not callable by
`authenticated` at all, or a customer could mark their own order paid over the
Data API. *(My call.)*

### One place for transitions

Status changes happen **only in the database**, through functions that check
the transition is allowed, check the caller owns the order, and append to an
**order status log** (from, to, actor, timestamp). The customer has no grant to
write the status column directly. Submitting validates completeness on the
server — every required field, at least one card, a shipping method, the contact
details, the address for postal orders, the terms acceptance and, for postal
orders, the insurance acknowledgement — and prices the order in the same transaction, so a
half-filled draft cannot become an order. The exact function and trigger
layout is the builder's; the constraint is that no application code writes a
status.

### Shape

The builder designs the schema; the spec fixes these points:

- An **order** (owner, status, readable reference, currency, totals, turnaround
  estimate, shipping method, contact and address snapshot, the
  acknowledgements with timestamps, terms version, timestamps), **order
  cards** (the fields above, the identification choice, a nullable catalogue
  reference for the future search, service, tier, price per line and the
  identification fee), the **card ↔ add-on** link, and **card photos** (object
  key).
- **Payment attempts** (order, provider, provider reference, outcome, amount,
  currency, timestamp). Minimal now; M7 extends it rather than replacing it.
  Carrier shipments are M6's table: with no carrier label in M3, nothing would
  write one.
- The address lives **on the order** as a snapshot, so a later order with a
  new address does not rewrite history.
- The **reference** is a short readable code, not a database id, and not
  sequential — a sequence leaks order volume. E.g. `AG-` plus 8 characters of
  Crockford base32 *(my call)*.
- **RLS:** a customer reads and writes only their own orders and order cards,
  and writes cards only while the order is a draft. One policy per operation,
  `to authenticated`, naming permissions not roles — `CLAUDE.md`'s rules. pgTAP
  tests cover another user's orders being invisible and a submitted order
  being immutable to its owner.
- **`user_id` references `auth.users` `on delete set null`** — never cascade
  (`CLAUDE.md`).

## Stand-in for payment; shipping skipped through

Decided with Geri, and told to the client on 2026-10-28: payment and
shipping are **skip-through** in this version. The flow is testable end to
end without Stripe or FedEx and looks like the finished one. The payment
stand-in sits behind the boundary Stripe will use, so M7 swaps an
implementation rather than reworking the flow.

### Payment

- A **payment provider** boundary: "start a payment for this order" returns
  where to send the customer. M3 has one implementation, the **test payment
  page**; M7 adds Stripe Checkout.
- The test page is on our own site, labelled plainly "Test payment — no money
  is taken", showing the order's total. Three buttons:
  - **Pay** runs the **payment-success handler**: it records the attempt and
    moves the order to `paid`. M7's signed `checkout.session.completed`
    webhook calls this same handler. Only the trigger changes.
  - **Fail** records a failed attempt. The order stays *awaiting payment*.
  - **Cancel** goes back to the order page.
- **The handler is idempotent now**, keyed by the provider's reference, so a
  repeated call changes nothing. M7 inherits that, as `CLAUDE.md` requires for
  webhooks. It also refuses an order that is not *awaiting payment*.
- **The handler runs with the service-role client.** No user may move an order
  to `paid`, and M7's webhook has no user session anyway. That makes it **a new
  entry in `admin-import-guard.test.ts`'s allowlist**, which `CLAUDE.md` calls a
  security decision. It goes to Geri explicitly in the plan. The test page's
  "Pay" action verifies that the signed-in user owns the order before calling
  the handler.
- **Switched on only by a runtime server setting,** `PAYMENT_PROVIDER=fake`.
  It's not a `NEXT_PUBLIC_*` value, so it isn't baked into the image. With the
  setting unset, the test page and its actions do not exist (404) and no order
  can reach `paid`. Turning it off for production is a **launch-checklist
  item**, recorded in `docs/deployment/`.

### Shipping

- **Fees** come from the price table's zones. That isn't fake data, just the
  current pricing, and the summary labels the fees "estimated". M6 decides how
  live rates enter the server-side pricing.
- **No carrier label, real or fake** (revised 2026-10-28). The earlier fake
  FedEx label and its `SHIPPING_PROVIDER` switch are dropped. The customer
  ships the parcel themselves, carrying ART's QR parcel label (next section).
  M6 adds the carrier label as a further printable on the same page.

### Where a test order stops

Cards → shipping → summary → test payment → `paid` → parcel label and
submission form printed. Receiving, grading and shipping back are staff work
(M5/M6), so the remaining timeline steps stay greyed out.

## Printables — parcel label and submission form

From the 2026-10-28 call: ART wants to identify an arriving parcel **without
opening it**, and to find the order's paperwork inside. Once an order is
**paid**, its page offers packing instructions and two printable pages. The
customer fills in nothing by hand; everything is generated from the order.

- **Parcel label:** the order reference in large type and a **QR code**, sized
  to cut out and stick on the outside of the box. It is printed for both
  methods, because an in-person parcel still needs identifying at the desk.
  It also carries ART's receiving address, which is client copy.
- **Submission form:** goes in the box with the cards. It has the same QR code
  and reference, then:
  - the customer's contact details and the shipping method;
  - one numbered line per card, matching the order of the order page: every
    identification field (or "ART identifies it"), signed, numbered, service,
    tier, add-ons and declared value;
  - the card count, the total declared value, the price lines and the total
    paid.
- **The QR code encodes a URL, not just the reference**, so a phone camera
  opens it directly (as Geri put it to the client: scan it with a phone and
  you're done). The URL is the short, stable path `/o/<reference>`, because
  printed paper outlives route changes. In M3, `/o/<reference>` redirects to
  the order page, which RLS shows only to its owner. M5 makes it open the
  intake view for staff. The host comes from a runtime `SITE_URL` setting,
  not a build arg *(my call)*.
- **Printing is the browser's print dialog** over a print stylesheet, with no
  PDF dependency *(my call)*. The QR code is rendered on the server as inline
  SVG.
- **Per-card QR codes** for ART's internal work are M5, printed at intake.
- The packing instructions are client copy.

## Status tracking in the account

`/account` becomes the orders overview (anticipated by the settings spec).

- **Orders list:** reference, date, card count, total, status. The open draft
  is first, with "Continue".
- **Order page** (`/account/orders/[reference]`): the cards with their
  services, the shipping details, the price lines, and **Cancel** while the
  order is unpaid. Plus:
  - **The full timeline**, every status from submitted to completed. Reached
    steps carry their time from the status log; steps not reached yet are
    greyed out, so the customer sees the whole journey from day one (decided).
  - **The next action**, depending on status: *Pay* while awaiting payment;
    once paid, **"Ship your cards"** for postal orders or **"Bring your
    cards"** for in-person ones. Both come with the packing instructions and
    links to the parcel label and the submission form.
- Status labels are message keys.

## Account deletion against real orders

The M2 settings spec fixed the contract; M3 implements it in `deleteAccount`:

- **Refused** while the customer has an order in `paid`, `received`,
  `grading`, `graded` or `shipped_back` — their cards may physically be with
  ART or in transit. The refusal tells them why.
- **Drafts and unpaid orders are deleted**, with their photos, before the user
  is deleted. They carry no obligation.
- **Remaining orders** (completed or cancelled after payment, once M7 exists)
  keep their amounts and lose their personal fields — name, address, phone —
  and their `user_id` becomes null. Which fields must be kept and for how long
  is still the open legal question in `docs/content-requests.md`; scrubbing all
  personal fields is the conservative default *(my call)*.

## Draft expiry and photo cleanup

Expiring drafts and deleting orphaned photos both need a job that runs without
a user. **The builder proposes the mechanism.** If it needs the service-role
client, that is a new entry in `admin-import-guard.test.ts`'s allowlist —
**a security decision Geri approves explicitly**, not one the plan makes
quietly. A scheduled Postgres function for the rows plus an object-key queue
the app drains is one route; a Coolify-scheduled call to a secret-guarded
route handler is another.

## Observability

Per `CLAUDE.md`: a Server Action that catches an error and returns `{error}`
must call `Sentry.captureException`. Submission is the flow this rule was
written for. Never attach the order's address, phone or names to a Sentry
event.

## Testing

- **pgTAP:** RLS on every new table; the transition functions (allowed and
  refused transitions, ownership, the log row); submit refusing an incomplete
  draft; the one-draft index.
- **Vitest:** price computation (the identification fee included), the
  card-field rules in both identification modes, service availability for
  signed cards, add-on applicability, the reference format, the photo limits,
  the wizard's step validation, the deletion rules, the printables (the QR
  code carries `/o/<reference>`, and they are only for paid orders), and the
  payment-success handler: idempotency, refusing an order not awaiting payment,
  and the stand-in being unreachable when its setting is unset.
- **pgTAP** also covers `authenticated` being unable to reach `paid`.
- Multi-step flow coverage end to end is M8's E2E (`CLAUDE.md`).

## Design system work this needs

The form leans on `Field` and needs a **Select** (language, tier, country) and
a **file input with preview**. `CLAUDE.md` asks to re-evaluate Base UI at M3;
that happens here. New primitives go in the `/design` gallery.

## Questions for the client

Added to `docs/content-requests.md` as part of the work:

1. **The price list:** tiers per service (autograph and dual included),
   prices, value caps, turnaround times, the Digital Grade price, the
   identification fee (€2 was named on the call), accepted countries and
   shipping fees. *Blocks a realistic demo of M3, not its build.*
2. **VAT:** rate and treatment; whether placeholder gross pricing is right.
3. **Digital Grade default:** no add-on can be pre-ticked under EU law;
   confirm unticked, and the add-on's description.
4. **Terms of service:** the checkbox links to `/terms`, which needs the
   lawyer's text. **Blocks launch.**
5. **In-person drop-off:** the address, hours and any appointment rule.
6. **Inbound-insurance acknowledgement wording.**
7. **Rarity:** the slab label shows rarity but nothing collects it
   (`2026-09-08-brand-identity-adoption-design.md`). Add a field or drop the
   label line.
8. **Photos:** one per card, or front and back.
9. **Retention** after account deletion (already open) now decides how
   completed orders are scrubbed.

From the 2026-10-28 call:

10. **The terms clause for ART-identified cards:** the customer's declared
    value stands for insurance and the return even when ART identified the
    card. This is for the lawyer drafting the ToS. **Blocks launch** with item 4.
11. **Services:** confirm card grading, autograph, dual and authentication.
    Does card grading include an authenticity check, as at PSA, or is a
    grading-plus-authentication bundle needed as its own service?
12. **Item types:** PSA's flow offers Oversized Card, Pack and Ticket
    alongside Trading Card. Trading cards only at launch?
13. **Languages and surfaces:** the language list offered, and whether
    surface should be a fixed list of finishes rather than free text.
14. **Numbered:** keep the serial-numbered flag from the process document?
15. **Packing instructions** and ART's **receiving address** for the parcel
    label.
16. **Card search:** a change request. Which games come first, and is a
    paid catalogue source acceptable for sports cards?

## Docs that change

- `CLAUDE.md`: `/submit` leaves the deliberate-404 table and `/terms` joins it;
  "Not yet built" moves on; the order state machine, R2 and the printables'
  `/o/<reference>` URL get their rules.
- `docs/content-requests.md`: the questions above.
- `docs/deployment/R2_SETUP.md`: new runbook.
- `docs/deployment/`: the launch-checklist item that `PAYMENT_PROVIDER` must
  not be `fake` in production, and `SITE_URL` set to the public origin.
- `2026-09-28-profile-settings-design.md`: note that order mail moved to M7.
