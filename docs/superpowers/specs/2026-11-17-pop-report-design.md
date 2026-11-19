# Pop Report — card catalogue, populations, search, certificates

**Date:** 2026-11-17
**Status:** Draft — awaiting Geri's approval (all design questions answered 2026-11-19)
**Module:** M4 — Pop Report (plus the Meilisearch line of M0)

## Goal

A public database of everything ART has graded or authenticated, the way PSA
and CGC publish theirs. A collector can:

- **search and filter** graded cards by name, set, year, category and grade;
- **browse** by category and set, and open a **set page** listing every graded
  card in that set with its counts;
- open a **card page**: one catalogue card, its details and how many copies
  received each grade;
- open a **certificate page** for one physical slab — by scanning the slab's
  QR code or typing the cert number — and confirm that the slab is genuine and
  its grade is what the label says.

Why it matters: the population ("only 2 copies at 10") is what collectors price
by, and the certificate page is what makes an ART slab — and above all an
ART *authentication* — worth anything to a stranger buying it second-hand.

## Where the scope comes from

`docs/01-project-estimation.md`, M4, 80 h: public database of graded cards;
Meilisearch search and filtering by card name, set, year and grade; the Pop
Report view (per card, how many of each grade); a card detail page (image,
metadata, grade distribution). M0's "install and configure Meilisearch" was
deferred to here.

Decided with Geri, and argued as inside that scope:

- **The certificate page** (`/cert/<number>`) is in M4. The brand manual's slab
  label carries a QR code and the cert serial (brand spec, *The slab label*),
  and the footer already links "Certificate lookup" to `/cert`. The estimate's
  "card detail page (image, metadata)" fits one physical copy better than a
  card in general.
- **The set page** is in M4 — PSA's "View Set", read as part of "the Pop
  Report view".

## How competitors do it (researched 2026-11-17)

| | Top level | Then | Card row |
|---|---|---|---|
| PSA | category tiles (each sport, TCG, non-sport) | year → set → card | card #, name, **Variety**, every grade incl. halves, **Authentic**, total; autograph (PSA/DNA) populations counted separately |
| CGC | **TCG & non-sports** / **Sports** | TCG: game → era → set; Sports: sport → date range → set | card #, name, variant, grades, total; language folded into the set ("XY – English") |
| Beckett | sport | set → player | exact-match search only; widely called the weakest — the one not to copy |
| TAG | — | — | the cert page shows the card's population |

PSA moved to search-first in 2018 and kept the browse tiles after collectors
complained. Every design choice below follows from this table.

## Decisions

### 1. Staff link each graded copy to a card in our catalogue

Customers type card details as free text (M3), so "Charizard / Base" and
"charizard holo / Base Set" would split one population if we grouped by text.
**Decided (option A):** a catalogue of canonical cards; at grading (M5) staff
pick the catalogue card a copy belongs to, or create one. Rejected: grouping by
normalised text (one typo splits a public count), and depending on an external
card database now (a separate change request).

### 2. The catalogue is shaped for an automatic set loader, built later

**Decided:** the schema must accept a future importer that loads whole TCG sets
and checklists from external sources (TCGdex, Scryfall, YGOPRODeck, … as
Cardstrade does in `cardstrade-frontend/src/lib/catalog-import/`). The loader
is the **last** thing built and is **not** in M4. M4 needs only a few seed rows.

What M4 takes from Cardstrade's importer, because getting it wrong later means
re-keying rows that graded copies and printed QR codes depend on:

- **A set's identity at each source lives in its own table**
  (`card_set_external_refs`: set, source, external id, language; unique on
  source + external id). The importer recognises a set by it and never guesses.
- **A catalogue card carries an optional external source and id**, unique per
  source, null for cards staff created by hand.
- **One card-number rule:** "012/180", "12/180" and "12" are one card. A
  derived number key is what uniqueness and matching use; the number as
  printed is what is displayed. Keyless numbers ("#", "/180") key as
  themselves so they never merge. (Cardstrade: `ct_catalog_number_key`.)
- **Non-English sets are their own sets.** Language is a column on the set,
  never a facet of a card, so a Japanese Charizard never shares an English
  population.
- **Imports never delete or re-key a row.** A hand-made card that an import
  later duplicates is **merged**: it gets `merged_into`, its copies move to the
  survivor, and its old card page redirects.

What waits for the importer: the work queue, per-source pause state, the
review/conflict workflow, and any image hotlinking or licensing question.

### 3. Categories have two levels

**Kind** (`tcg` | `sports`), then **category** — the game or the sport
(Pokémon, Magic: The Gathering / Basketball, Soccer). TCG sets carry an
**era** (`series`: "Sun & Moon"); sports sets are browsed by year. This is
CGC's structure. Category and kind names are copy — message keys, like
services (`catalog.*`), never database text. Set and card names are data.

M3's submission form has no category field; a copy's category comes from the
catalogue card staff link it to.

### 4. Variants are separate catalogue cards

1st Edition, Shadowless, Holo / Reverse Holo, a sports parallel or refractor:
each is its own catalogue card with its own population, as PSA's Variety
column does. (Cardstrade made variants facets of one card because it tracks
prices, not populations; that does not apply here.) Uniqueness is set +
number key + variant.

### 5. What is public

- **Only published copies.** A copy is public once it is **published** — a
  `published_at` the system *writes*, distinct from the moment grading is
  finalized. Before that it appears in no count, page, search document or cert
  lookup. *(my call)* Today M5 publishes at finalization. If the client wants a
  window between the two (an owner-only "early access" period — an open
  question below), it becomes a job that writes `published_at` when the window
  ends. Visibility is never computed against `now()`, because no trigger fires
  when time passes, and the search delta, the counts and RLS all rely on row
  changes.
- **A copy found not genuine is never public.** See *Authentication results*
  in decision 6.
- **A published copy can be withdrawn** (a counterfeit found later, a voided
  cert). It leaves every count, document and search result. Its cert page
  says **"this certificate has been withdrawn"**, never "not found", so a
  second-hand buyer holding that slab is told plainly. *(my call)* Withdrawing
  is M5 staff work; M4 handles the state. A **grade correction** is an ordinary
  update: its `updated_at` moves, the next delta re-indexes the card, and the
  counts follow.
- **Only catalogue cards with at least one public copy** appear anywhere
  public — search, set pages, card pages. The catalogue may hold thousands of
  imported cards with nobody's copy linked; those are staff material.
  *(my call — PSA lists graded specs only.)*
- **Never** the owner, the order, the price, the declared value, or a link a
  public reader could follow from a copy to an order.
- **Photos: only staff-taken ones (M5).** Photos customers uploaded in M3 are
  never made public — they were not given for that. Until M5 adds staff
  photos, card and certificate pages render our `Slab` component with the real
  data, which already falls back to the hatch when there is no image.

### 6. Grades are data, and the scale is still the client's

The grading scale (range, half grades, labels, subgrade names) is
client-supplied and unknown (`content-requests.md`). So:

- A `grades` table holds the scale as rows: a key, a numeric value for
  ordering and "graded higher", and a position. The label ("GEM MINT") is copy:
  a message key per grade. The real scale is a migration plus message keys,
  never a code change.
- A copy has a **card grade** (null for an autograph-only service), an
  **autograph grade** (null unless the service graded the signature), and
  **two authentication results**, one for the card and one for the signature.
  Each is `genuine`, `not_genuine` or null (not examined). *(my call: two
  results, because a dual copy can have a genuine card and a forged
  signature.)*
- **Authentication results** decide what is public:
  - card `not_genuine` → the copy is never public;
  - signature `not_genuine` → the copy is public **without** an autograph line;
  - a grading-only copy has a null card result and counts in the grade columns.
    Whether grading implies an authenticity check, as at PSA, is still client
    question 11, and the answer changes only which value M5 writes.
- The population shows: one column per card grade, an **Authentic** column for
  copies authenticated without a card grade, and a total. **Autograph grades
  are a separate line** (PSA/DNA style).
- **Subgrades:** M4 leaves room (M5 stores them per copy) but the public
  report shows the overall grade only until the client defines them.

Seeded with a placeholder scale, listed in `content-requests.md` like the
placeholder prices.

### 7. Search runs in Meilisearch; everything else reads Postgres

Postgres is the source of truth; the Meilisearch index is derived and
rebuildable at any time.

- **One search document per public catalogue card**, carrying what search,
  filters and the results list need: name, set, era, category, kind, year,
  number, variant, language, the total and the per-grade counts, and the grades
  present (so "filter by grade 10" means "cards with at least one 10").
- **Card, set and certificate pages read Postgres**, so they are never stale.
  Cert lookup is an exact read by number, not a search.
- **Meilisearch stays private.** Every search goes through our server (Server
  Component or Route Handler); the browser never talks to Meilisearch and no
  search key is shipped to it. *(my call — it lets Meilisearch sit on the
  netcup box's private network.)*

### 8. Sync: on publish, a 15-minute delta, a weekly full rebuild

**Decided with Geri**, after weighing a change-queue design (transactional
outbox) and rejecting it as more machinery than ART's write volume needs —
a few hundred publishes a day at most, a few thousand public cards. This is
the common three-layer pattern for keeping a search index in step with a
database (write-through, delta by `updated_at`, periodic full rebuild).

1. **Write-through.** M5's publish (and withdraw) action re-indexes the
   affected catalogue card right after its write commits. A Meilisearch
   failure never fails the publish: it is reported to Sentry and layer 2
   catches it. M4 provides the "re-index these cards" function M5 calls.
2. **Delta every 15 minutes.** Re-index every catalogue card whose own row,
   whose set's row, or any of whose copies' rows changed since the job's last
   successful run. A card with no public copies left has its document
   deleted. Rules that make it correct:
   - **`updated_at` is maintained by a database trigger** on `card_sets`,
     `catalog_cards` and `graded_copies`, never by application code, so SQL
     fixes, merges and a future importer are caught too.
   - **The window overlaps:** from the last successful run's start *minus a
     margin* (a few minutes), because a transaction that began before that run
     and committed after it carries an older `updated_at`. Re-indexing a card
     twice is harmless.
   - **The last successful run is stored** (a one-row-per-job table), so a job
     that failed for an hour catches up instead of skipping a window.
   - **Nothing is ever deleted** from these tables (copies are withdrawn,
     imports never delete), which is what lets an `updated_at` query see every
     change. A future hard delete would need a tombstone first.
3. **Weekly full rebuild** into a fresh index, then Meilisearch's index swap,
   so search never serves a half-built index. It also applies the index
   settings (searchable, filterable and sortable attributes, typo tolerance off
   for numbers). **`npm run search:reindex`** runs the same rebuild by hand —
   how a new environment is populated and how drift is repaired at once.

Rejected along the way: triggers calling Meilisearch directly (Cardstrade's
`pg_net` → edge function — loses updates while Meilisearch is down and would
expose Meilisearch to the internet), and write-through alone (any write it
does not make leaves the index stale).

### 9. Scheduling: Supabase Cron, hardened

**Decided with Geri: Supabase Cron schedules every job, including M3's
maintenance job**, which moves off its Coolify scheduled task — one scheduler,
and every schedule lives in a migration. This follows Supabase's documented
pattern (`pg_cron` + `pg_net`, URL and secret in Vault — *Scheduling Edge
Functions*), pointed at our own route instead of an Edge Function so the code
that talks to Meilisearch stays on netcup, with the hardening below.

1. **Pure-SQL work never leaves Postgres.** `pg_cron` calls
   `expire_stale_drafts()` directly — no HTTP, no secret. Only work that needs
   the app (R2 photo deletion, the search delta, the weekly rebuild) goes over
   HTTP.
2. **App jobs are called over HTTPS with an HMAC signature, not a static
   key.** `pg_cron` → `pg_net` → `https://<site>/api/jobs/<job>`. Postgres
   (`pgcrypto`) signs the job name and a timestamp; the route recomputes it,
   compares in constant time, and rejects anything older than ~5 minutes. The
   reason is in Supabase's own docs: `pg_net` holds each request, headers
   included, in `net.http_request_queue` until it is sent, readable by any
   role that can log in. A static key would sit there; a signature valid for
   five minutes is all that does. This is the webhook-signing standard
   (Stripe, GitHub, *Standard Webhooks*). It replaces `JOBS_SECRET`'s bearer
   check on `/api/jobs/maintenance` too.
3. **The secret lives in Supabase Vault**, one per environment, read at run
   time — never in a migration, never in `cron.job`'s command text, never in
   git. The app reads the same value from runtime env. Absent from Vault, the
   cron job does nothing; absent from the app's env, the routes 404 (as
   `JOBS_SECRET` does today).
4. **A forged call gains nothing.** Job routes take no parameters, return
   counts only (`pg_net` stores responses), are idempotent, and hold a lease
   (a lease row or an advisory lock) so two runs never overlap.
5. **Failures are visible.** `pg_net` is fire-and-forget, so each job records
   its last successful run and `/api/health` lists a job overdue past its
   threshold in its body. Health stays 200 (Coolify restarts unhealthy
   containers, which cannot fix a missed job); the overdue check instead
   raises a `jobs/overdue` Sentry warning, on which an alert rule is set
   (`SEARCH_SETUP.md`). Errors inside a job go to Sentry, as today.
6. **Long jobs outlive `pg_net`'s timeout.** The route verifies the signature,
   answers `202` at once and does the work in Next's `after()`. The lease
   covers the run, not the request.

Supabase Cron's own limits are respected: no more than 8 concurrent jobs, each
under 10 minutes. Locally, the Supabase stack calls
`host.docker.internal:3000`, so app jobs run only while `next dev` is up; the
pure-SQL job always runs. Setting the Vault secret per hosted project goes in
the runbook.

### 10. The jobs use the admin client — approved

The jobs run with no user, so they use the service-role client: **a new entry
in `admin-import-guard.test.ts`'s allowlist, approved by Geri on 2026-11-19.**
As with the maintenance job, they reach data only through service-role-only
RPCs (cards changed since a time, a card's document fields, record a run), so
the client's reach is those RPCs'. A dedicated least-privilege Postgres role
was considered and declined: the service-role key is already in the same
container for three other callers, so a second credential there would move the
risk, not remove it. Revisit if a job ever runs outside the app container.

## Pages

All under the existing locale routing; all copy in `messages/en.json`.

```
/pop-report                        search box, filters, category tiles
/pop-report?q=…&category=…&grade=… results (cards, with total and top counts)
/pop-report/<category>             the category's sets (TCG by era, sports by year)
/pop-report/sets/<set>             every public card in the set with its counts
/pop-report/cards/<card>           one card: details, population, its sets' link
/cert                              lookup box
/cert/<number>                     one copy
```

- **Card page:** the card's details, the population table (grade columns,
  Authentic, total), the autograph line when any exist, and links to the set
  and category. A merged card's URL redirects to the survivor.
- **Set page:** set name, era or year, language, then a table of every public
  card in the set — number, name, variant, per-grade counts, total — ordered
  by number key. This is PSA's most-used view.
- **Certificate page:** the copy's card (linking to the card page), card grade
  with its label, autograph grade, authentication result, the date graded, the
  photo or the rendered slab, and the card's population with **"graded
  higher: N"** beside it. Unknown or unpublished numbers get one "no
  certificate with this number" page — the same for "never existed" and "not
  published yet", so the page reveals nothing about work in progress. A
  withdrawn certificate gets its own "withdrawn" page (decision 5).
- **Landing:** the hero and showcase switch from `SAMPLE_SLABS` to the most
  recently published copies, falling back to the fixtures while fewer than
  eight exist *(my call)*. Fixture slabs never link to a cert page, because
  their cert numbers are invented.

`/pop-report` and `/cert` leave the deliberate-404 list in `CLAUDE.md`.

### URLs that must never change

`/cert/<number>` is printed on every slab, like `/o/<reference>` on every
parcel. Card and set URLs are shared and bookmarked; they use a stable
identifier that survives renames and merges (a merged card redirects). The
choice of identifier (UUID, short id, slug) is the builder's, under that rule.

## Certificate numbers

Assigned once, never reused, never changed. **Format and assignment point are
M5's**, and the format is ultimately the client's (`content-requests.md`); M4
needs only a unique, stable, URL-safe column and its lookup. The fixtures use
`ART-0883…`; the seed must use a range that can never collide with real
numbers.

## Data model (outline)

Names are indicative; the builder writes the migrations.

```
catalog_categories   key, kind ('tcg'|'sports'), position, active
card_sets            id, category, name, code, language, release_year,
                     series (era), total_cards, created_at
card_set_external_refs  set_id, source, external_id, language
                     unique (source, external_id)
catalog_cards        id, set_id, card_number (as printed), number_key,
                     name, variant, rarity, external_source, external_id,
                     merged_into, created_at
                     unique (set_id, number_key, coalesce(variant,''))
                     unique (external_source, external_id) where not null
grades               key, value numeric, position
graded_copies        id, cert_number unique, catalog_card_id, order_card_id,
                     service, card_grade, autograph_grade,
                     card_authentication, autograph_authentication
                       ('genuine'|'not_genuine'|null),
                     finalized_at, published_at, withdrawn_at,
                     created_at, updated_at
(card_sets and catalog_cards also carry updated_at, trigger-maintained)
private.job_runs     job, last_success_started_at, lease_until
```

Population counts — a view, a materialized table kept by triggers, or a
function — are the builder's call, under these rules: counts always equal the
public copies (published, not withdrawn, card genuine), a copy published
concurrently with another is counted
exactly once, and a set page with a few hundred cards renders without a query
per card.

## Security

- **RLS on every new table.** Catalogue tables and public copies are
  readable by anyone, **including `anon`** — a deliberate exception to the
  "always `to authenticated`" rule, which exists because until now nothing was
  public. Each such policy says why in a comment.
- **Public readers never reach `order_card_id`** or any column that links a copy
  to an order. Whether by column grants, a public view, or RPCs is the
  builder's call; a pgTAP test proves `anon` cannot read it.
- **Unpublished copies are invisible** to `anon` and to customers — including
  the owner, until M5 decides what an owner sees of their in-progress grades.
  For a withdrawn copy, only the cert number and the fact that it is withdrawn
  are public.
- **Writes:** in M4, only migrations, the seed and service-role code. Staff
  writes (create catalogue cards, grade copies) arrive with M5 and bring their
  own permissions (`catalog.manage`, `grading.write`, …), named per the
  permission rule.
- `graded_copies.order_card_id` must not cascade a copy away: a published
  copy stays in the Pop Report even if its order's personal data is scrubbed
  on account deletion (`CLAUDE.md`: "graded cards stay in the Pop Report").
  Order cards are not deleted by account deletion today; the builder confirms
  the foreign key's `on delete` keeps it that way.

## Meilisearch hosting

- **Local:** a compose file, as Cardstrade's `docker-compose.meilisearch.yml`
  (pin a current 1.x; the index settings need ≥ 1.15 for
  `typoTolerance.disableOnNumbers`). `npm run search:start`, or folded into
  `db:start` — builder's call.
- **Hosted:** a Coolify service on the netcup box, on the private network with
  the app, with a persistent volume. Not exposed publicly.
- **Configuration is runtime env**, never build args: `MEILISEARCH_URL`, and a
  key — the master key only to mint a scoped admin key, if the builder prefers
  that. Unset, search pages show a "search unavailable" state and the search
  jobs do nothing (and report it in `/api/health`).
- A runbook, `docs/deployment/SEARCH_SETUP.md`: the service, the env, the
  Vault secret, first `search:reindex`, and a check that the index matches
  Postgres. `SUBMISSION_SETUP.md` loses its Coolify scheduled-task step and
  gains the Vault one; the existing Coolify task is deleted once the cron jobs
  are live.

## Seed data

`supabase/seed.sql` (local only) gains a few categories (one TCG game, one
sport), a few sets (one non-English), a dozen catalogue cards including two
variants of one card, and enough published copies — plus an unpublished one,
a withdrawn one, a not-genuine one and a dual copy with a forged signature — to exercise every column, the "graded higher" count,
the fallback, and the visibility rules. Cert numbers in an impossible range
(per `CLAUDE.md`, nothing that could be mistaken for a real graded card).

## Testing

- **pgTAP:** RLS (anon reads public rows only; never `order_card_id`; never an
  unpublished, withdrawn-beyond-the-notice or not-genuine copy), the
  number-key rule, catalogue uniqueness, merge redirect data, the `updated_at`
  triggers, "cards changed since" (a copy, card or set change each surfaces
  the right card), the counts, the HMAC signing function, the cron schedules
  existing after a replay from empty.
- **Vitest:** the delta (upsert, delete when a card stops being public, a
  failed run does not advance the watermark, the overlap margin), the full
  rebuild's swap, document mapping, the signature check (valid, stale,
  tampered, wrong job, unset secret), the lease, the 202 + `after()` path,
  query-string ↔ filter mapping, page components through `renderWithIntl`.
- Meilisearch itself is not mocked in a way that hides its filter syntax: the
  builder decides whether CI runs a Meilisearch container or the client is
  faked at the HTTP boundary with recorded filter strings.

## Budget and cut order

Agreed with Geri: the estimate's **80 h**, plus **~6 h** for Meilisearch
hosting carried over from M0, plus **~4 h** for the Supabase Cron hardening
(which also moves M3's maintenance job). Rough split: schema, RLS and pgTAP
~16 h; Meilisearch hosting ~6 h; sync, rebuild and index settings ~12 h;
cron hardening ~4 h; search page ~16 h; category and set pages ~10 h; card
page ~8 h; certificate page ~6 h; landing switch, merge redirect, seed and
content requests ~6 h.

**If it runs over, cut in this order:** the landing switch (fixtures stay
until M5), then the merge redirect (keep `merged_into`, build the redirect
with the importer), then the category tiles (search and set pages still
work). Nothing else is cut without asking.

## Non-goals

- The set/checklist importer, its queue and review workflow (later).
- Staff screens to create catalogue cards, link copies, grade, finalize,
  photograph, print labels or merge duplicates (M5).
- Subgrade distributions, qualifiers (OC, ST…), population history and
  "pop changes this week" (not in the estimate).
- Prices, market values and sales data.
- SEO work (out of scope per `CLAUDE.md`), beyond sensible titles.
- Translating category or grade labels beyond English.

## Client questions to add to `content-requests.md`

- The grading scale: range, half grades, labels, subgrades, and what an
  authentication-only result is called ("Authentic").
- The certificate number format.
- Which categories ART accepts at launch (games and sports).
- Whether a copy's owner should be able to see it on the public pages before
  others do (e.g. an "early access" window — the Digital Grade add-on's
  promise may touch this).

## Left to the builder

The exact migrations and names; how counts are computed and kept; card and set
URL identifiers; column grants vs views vs RPCs for public reads; the
Meilisearch client library and index settings; CI's Meilisearch strategy; the
search UI's layout within the design system; pagination sizes.
