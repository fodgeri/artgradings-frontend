# Content requests

Every string on the public site that is **placeholder copy**, what it claims,
and what is needed from the client to replace it.

This file exists because the landing page ships with marketing copy taken from
the approved design, some of which makes quantified and contractual claims we
have not verified. That was a deliberate call — the pages render exactly as the
customer approved them — made with the risk stated. **Nothing about launch may
depend on remembering that conversation, which is what this file is for.**

Content, the grading scale, pricing rules and turnaround times are
client-supplied per `CLAUDE.md`. We do not invent business rules; where the
design asserted one, it is listed here.

---

## Blocking — must be resolved before launch

These carry contractual or advertising weight. Shipping them unverified is a
legal and regulatory exposure, not a copy problem.

| Key | Current placeholder | What is needed |
|---|---|---|
| `faq.items[4].answer` (`damage`) | "If we damage a card while it is in our care, we refund the grading fee and the card's declared value." | **A promise of financial liability.** Must be confirmed against the actual terms of service and insurance cover, and almost certainly reviewed by the lawyer drafting the ToS. Legal content is out of scope for us. |
| `home.stats[0]` | `1.2M+` — "Cards certified" | **A factual volume claim on a service that has certified nothing yet.** In the EU this is an advertising claim. Either a real number, or replace the stat. |
| `home.stats[2]` | `100%` — "Authentication guarantee" | A guarantee whose terms are undefined. Needs the actual guarantee, or removal. |
| `home.gasFill` | "Every slab is sealed under inert gas." | **The gas-fill claim in the client's words.** The brand manual establishes the feature exists; it does not say which gas, what it protects against, or for how long. We must not invent a preservation claim. |

## Needed — copy the design never wrote

| Key | Current placeholder | What is needed |
|---|---|---|
| `howItWorks.steps[*].body` | Four short paragraphs written from the estimate's process description | Real per-step detail. The design supplied step titles only, so `/how-it-works` is currently as thin as the landing summary. |
| `faq.items` | 6 entries | Further FAQ entries. With only six, `/faq` duplicates the landing's list plus two. |
| `faq.items[0].answer` (`turnaround`) | Deliberately vague — "depends on the service level you choose" | Real turnaround times per service level. Client-supplied per `CLAUDE.md`; the vagueness is intentional so no number is invented. |
| `faq.items[1].answer` (`scale`) | Describes a 4-sub-grade scale | The real grading scale — its range, its increments, and the sub-grade names. |
| `home.stats[1]` | `48hr` — "Vault express" | A turnaround claim tied to a service tier that does not exist yet. |
| `home.stats[3]` | `4-point` — "Sub-grade report" | Depends on the grading scale above. |

## Auth email and bot protection

Blocks hosted email, not development.

| Item | Current placeholder | What is needed |
|---|---|---|
| Sending domain | none | The client's domain on Cloudflare DNS, so Cloudflare Email Sending can onboard it (SPF, DKIM, DMARC). Until then only verified test inboxes receive auth email. |
| Sender address and name | `no-reply@<domain>`, `ART Gradings` | Confirmation of both. |
| Turnstile | built | **Outside the estimate (≈ 3–4 h), added deliberately.** Needs the client's agreement as a scope addition. |
| Auth email copy | English, in `supabase/templates/*.html` | Functional copy we wrote. Supabase renders it, so it is **not** in `messages/*.json`: when a second locale is scoped, all five templates (confirmation, recovery, email change, and the password-changed and email-changed notices) need translating and auth email moves to Supabase's Send Email hook (see the spec). |

## Accounts and personal data

| Item | Current state | What is needed |
|---|---|---|
| Retention after account deletion | Deletion is a hard delete. Since M3, drafts and unpaid orders are deleted with the account; orders that were paid keep their amounts and lose every personal field (name, phone, address), the conservative default. Deletion is refused while an order is in progress. | **How long order and payment records must be kept, and which fields.** A legal question for the client and their lawyer; it decides whether the M3 scrub keeps too little. |
| Data export | Not built | Whether the client wants a self-service GDPR access request, or handles such requests by email. |
| Deletion wording | Functional copy we wrote (`auth.settings.delete`) | The client may want their lawyer to see it alongside the privacy policy. |
| Support contact | The "email changed" notice says "contact ART Gradings support" with no address | A support address for account-security notices. |
| Turnstile | Now also on the password-change and delete forms | Part of the existing Turnstile scope addition; no further cost. |

## Deferred by decision, not missing

| Item | Status |
|---|---|
| Pricing page and pricing band | Not scoped in `docs/01-project-estimation.md`. The design's `$19 / $39 / $99 / $299` tiers, `45 / 20 / 5 business day` turnarounds and `$499 / $2,500 / $10,000` value caps are invented and are **not** built. `/pricing` stays a 404 until the client supplies real numbers. |
| Hero secondary CTA | Points at `/how-it-works`. The design pointed it at `#pricing`; revisit when pricing lands. |
| Showcase cards | `SAMPLE_SLABS` fixtures, replaced by real Pop Report data at M4. Card names, certificate numbers and grades are invented. |

## Submission flow (M3)

The submission flow (`/submit`, the order pages and the printables) runs on a
**placeholder price list** and ships **placeholder copy** wherever the copy is
the client's to write. The questions below come from
`docs/superpowers/specs/2026-10-22-submission-flow-design.md`, numbered as
there.

### Blocking — must be resolved before launch

| Item | Current state | What is needed |
|---|---|---|
| `/terms` (question 4) | **A deliberate 404.** The summary's required terms checkbox links to it, and every order records `terms_version = "placeholder-2026-10"` (`lib/orders/terms.ts`). | The terms of service, from the lawyer. Legal content is out of our scope. When they land, `TERMS_VERSION` changes with them. |
| Terms clause on ART-identified cards (question 10) | Built as the client described: the declared value is required on every card, including one ART identifies, and stands for insurance and the return. | **The clause in the terms** saying so, from the lawyer drafting the ToS. Blocks launch together with `/terms`. |
| The price list (question 1) | Every row in the catalog migration `20261029084405_order_catalog.sql` is a placeholder — see the table below. | The client's real price list. Blocks a realistic demo of M3, not its build; **blocks launch**, since a submitted order stores the price it was charged. |

### The placeholder price list

Pricing is data (`public.services`, `tiers`, `tier_prices`, `add_ons`,
`add_on_prices`, `card_fee_prices`, `shipping_zones`,
`shipping_zone_countries`, `shipping_zone_prices`), changed by migration until
M5's admin area. All amounts EUR, stored VAT-inclusive.

| Row | Placeholder | What is needed |
|---|---|---|
| Services | `grading`, `autograph` (signed cards only), `dual` (signed cards only), `authentication` | Confirmation of the set — question 11. |
| Tiers and turnarounds | grading *Standard* 30 business days, grading *Express* 10; autograph, dual *Standard* 30; authentication *Standard* 15 | The tiers each service offers and their turnaround times. |
| Tier prices | grading Standard €1.00, Express €2.00; autograph €1.00; dual €1.50; authentication €1.00 | Real prices, deliberately absurd until then. |
| Value caps | grading Express capped at €1,000 declared value; every other tier uncapped | The cap per tier, if any. |
| Digital Grade add-on | €0.50, on grading and dual | Its price, which services it applies to, and its description (question 3). |
| Identification fee | €2.00 per card ART identifies | **The one figure the client named** (2026-10-28 call). Confirm it with the price list. |
| Shipping zones | one zone, `placeholder_eu` ("European Union (placeholder)"), covering HU, AT, DE and SK; inbound €0.10, return €0.20 | The accepted countries, their zones and the fixed inbound and return fees until M6's live rates. |
| VAT | Prices are stored and shown as gross, labelled "VAT included" | The rate and treatment (question 2). |

### Placeholder copy

| Key | Current placeholder | What is needed |
|---|---|---|
| `submit.shipping.inPerson.body` | "Placeholder: the drop-off address, opening hours and handover process will be supplied by the client." | The drop-off address, opening hours and any appointment rule (question 5). |
| `submit.shipping.insurance.label`, `.description` | "I understand how my cards are insured in transit to ART Gradings." / "Placeholder: the insurance wording will be supplied by the client." | **The inbound-insurance acknowledgement in the client's words** (question 6). It is a required checkbox on postal orders, recorded with a timestamp — it carries contractual weight. |
| `orders.next.ship.instructions`, `orders.next.bringIn.instructions`, `orders.printables.packing` | Bracketed placeholders | The packing instructions, and what to bring when handing cards in (question 15). |
| `orders.printables.artAddress` | "[PLACEHOLDER: ART Gradings receiving address, supplied by the client]" | **ART's receiving address**, printed on every parcel label (question 15). |
| `auth.errors.ordersInProgress` | "You can't delete your account while an order is in progress. Once your orders are complete or cancelled, you can delete it." | Our wording for the account-deletion refusal. Needs the client's sign-off, ideally with the lawyer's, alongside the rest of the deletion copy. |
| `catalog.services.*`, `catalog.tiers.*`, `catalog.addOns.*` | Labels and one-line descriptions we wrote | The client's names and descriptions for each service, tier and add-on. |

### Questions for the client

From the spec. Items 4 and 10 are the blocking ones above; item 1 is the price
list above.

| # | Question | Current state |
|---|---|---|
| 1 | **The price list:** tiers per service (autograph and dual included), prices, value caps, turnaround times, the Digital Grade price, the identification fee (€2 was named on the call), accepted countries and shipping fees. | Placeholders, above. |
| 2 | **VAT:** rate and treatment; whether placeholder gross pricing is right. | Gross, labelled "VAT included". |
| 3 | **Digital Grade default:** no add-on can be pre-ticked under EU law; confirm unticked, and the add-on's description. | Unticked; no add-on can be a default. |
| 4 | **Terms of service:** the checkbox links to `/terms`, which needs the lawyer's text. **Blocks launch.** | `/terms` is a 404. |
| 5 | **In-person drop-off:** the address, hours and any appointment rule. | Placeholder copy. |
| 6 | **Inbound-insurance acknowledgement wording.** | Placeholder copy. |
| 7 | **Rarity:** the slab label shows rarity but nothing collects it (`2026-09-08-brand-identity-adoption-design.md`). Add a field or drop the label line. | Not collected. |
| 8 | **Photos:** one per card, or front and back. | One per card; photos are their own table, so two is a limit change. |
| 9 | **Retention** after account deletion (already open) now decides how completed orders are scrubbed. | See *Accounts and personal data*. |
| 10 | **The terms clause for ART-identified cards:** the customer's declared value stands for insurance and the return even when ART identified the card. This is for the lawyer drafting the ToS. **Blocks launch** with item 4. | Declared value required on every card. |
| 11 | **Services:** confirm card grading, autograph, dual and authentication. Does card grading include an authenticity check, as at PSA, or is a grading-plus-authentication bundle needed as its own service? | The four services, as rows. A bundle would be a row, a message key and a deploy. |
| 12 | **Item types:** PSA's flow offers Oversized Card, Pack and Ticket alongside Trading Card. Trading cards only at launch? | Trading cards only. |
| 13 | **Languages and surfaces:** the language list offered, and whether surface should be a fixed list of finishes rather than free text. | Twelve languages (`CARD_LANGUAGES` in `lib/orders/card-rules.ts`); surface is free text. |
| 14 | **Numbered:** keep the serial-numbered flag from the process document? | Kept. |
| 15 | **Packing instructions** and ART's **receiving address** for the parcel label. | Placeholder copy. |
| 16 | **Card search:** a change request. Which games come first, and is a paid catalogue source acceptable for sports cards? | Not built; `order_cards.catalog_ref` is reserved for it. |

## Known dead links

`/pricing`, `/pop-report` and `/terms` are linked from the header, a CTA or the
submit summary and all 404 today. `/pop-report` lands with M4; `/terms` is
legal content, drafted by the lawyer. This is deliberate and is stated at
handover rather than papered over with stub pages nobody scoped.
