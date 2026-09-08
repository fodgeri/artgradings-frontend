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

## Deferred by decision, not missing

| Item | Status |
|---|---|
| Pricing page and pricing band | Not scoped in `docs/01-project-estimation.md`. The design's `$19 / $39 / $99 / $299` tiers, `45 / 20 / 5 business day` turnarounds and `$499 / $2,500 / $10,000` value caps are invented and are **not** built. `/pricing` stays a 404 until the client supplies real numbers. |
| Hero secondary CTA | Points at `/how-it-works`. The design pointed it at `#pricing`; revisit when pricing lands. |
| Showcase cards | `SAMPLE_SLABS` fixtures, replaced by real Pop Report data at M4. Card names, certificate numbers and grades are invented. |

## Known dead links

`/pricing`, `/pop-report` and `/submit` are linked from the header or a CTA and
all 404 today. `/submit` lands with M3. This is deliberate and is stated at
handover rather than papered over with stub pages nobody scoped.
