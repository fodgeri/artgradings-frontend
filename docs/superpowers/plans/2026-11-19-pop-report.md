# Pop Report (M4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, searchable database of every copy ART has graded or
authenticated: card catalogue, populations, search, browse, set/card pages and
`/cert/<number>`, with Meilisearch kept in step by Supabase Cron jobs.

**Architecture:** Postgres is the truth. New tables (catalogue, grades, graded
copies, job runs) carry **no** `anon`/`authenticated` table access; every
public read goes through `security definer` RPCs that apply the public-copy
rule once. Meilisearch holds one document per public catalogue card and is
reached only from our server. Supabase Cron calls pure-SQL work directly and
calls app jobs over HTTPS with an HMAC-signed request; the app answers `202`
and runs the job in `after()` under a lease.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript strict,
Supabase (Postgres, `pg_cron`, `pg_net`, Vault, `pgcrypto`), Meilisearch
v1.35.1 + `meilisearch` JS client 0.62.0, next-intl, Vitest 4, pgTAP.

**Spec:** `docs/superpowers/specs/2026-11-17-pop-report-design.md` (approved
2026-11-19). Read it before any task; this plan argues from it.

## Global Constraints

- All user-facing copy in `messages/en.json`; components never hardcode copy. Tests import `messages/en.json` and never assert copy literals.
- `Link`, `redirect`, `useRouter`, `usePathname` from `@/i18n/navigation`, never `next/link` / `next/navigation` (except `notFound`, which stays from `next/navigation` as existing pages do).
- Numbers and dates via `useFormatter()` / `getFormatter()`.
- Migrations hand-written, created with `npm run db:new <name>`, replayable from empty; `npm run db:types` after each migration task; `database.types.ts` never hand-edited.
- Every function `set search_path = ''` with fully qualified names; every call inside a policy wrapped `(select …)`.
- RLS `enable`d (never `force`d) on every new table. No new table gets a policy or grant for `anon`/`authenticated` in M4 — public reads are RPCs only (spec: "column grants vs views vs RPCs … builder's call").
- Every foreign key column leads a btree index.
- Runtime env only, never build args: `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MEILISEARCH_MASTER_KEY` (container only), `JOBS_SECRET`.
- Meilisearch is never reachable from the browser; no search key in any `NEXT_PUBLIC_*`.
- Public output never contains `order_card_id`, an order, a user, a price or a declared value.
- `/cert/<number>` is printed on slabs and never changes.
- Errors caught and not re-thrown are reported to Sentry by flow + code, never with data.
- New `lib/supabase/admin.ts` importers: `lib/jobs/run-job.ts`, `lib/search/sync.ts` only (approved by Geri 2026-11-19).
- `meilisearch` npm dependency pinned exactly: `"meilisearch": "0.62.0"`.

## Review Focus

1. **Hostile search parameters** (`?category=pokemon" OR kind = "x`, `?grade=';drop`, a 5 000-char `q`, repeated params) — invalid values are dropped, never interpolated into a Meilisearch filter; the page renders. Pinned in Task 9.
2. **Cert numbers as people type them** (`art-0883 1204`, ` #ART-08831204 `, `../etc`, 500 chars) — normalised or rejected to the not-found page, never a 500. Pinned in Task 13.
3. **Meilisearch down or unset** — search shows an "unavailable" state, every other public page still works, the delta does not advance its watermark. Pinned in Tasks 7, 8, 9.
4. **A card with no card-graded copies** (only authentic-only or autograph-only copies) — population table renders an Authentic and/or autograph line without empty grade columns or a zero-width table. Pinned in Task 10.
5. **Mixed card numbers on a set page** (`2`, `10`, `004/102`, `TG01`, `SV-P 001`, variants of one number) — numeric numbers sort numerically, others after them, variants together. Pinned in Task 3.

---

## File Structure

```
supabase/migrations/<ts>_catalog.sql            categories, sets, refs, catalogue cards, grades, number key, touch trigger
supabase/migrations/<ts>_graded_copies.sql      graded_copies + public-copy index
supabase/migrations/<ts>_pop_functions.sql      public RPCs (pop_*)
supabase/migrations/<ts>_search_sync.sql        job_runs, sync RPCs, overdue_jobs
supabase/migrations/<ts>_job_scheduling.sql     pg_cron/pg_net, signing, call_job, schedules
supabase/tests/120-catalog.sql … 160-job-scheduling.sql
supabase/seed.sql                                 + catalogue, copies, local Vault secrets

lib/supabase/public.ts         cookie-less publishable-key client for public RPCs
lib/pop/keys.ts                CATEGORY_KEYS, GRADE_KEYS (mirror of migration rows)
lib/pop/types.ts               Population, PopCard, PopSet, PopCertificate…
lib/pop/load.ts                RPC wrappers for pages
lib/pop/search-params.ts       URL ⇄ PopSearch ⇄ Meilisearch filter
lib/pop/cert-number.ts         normaliseCertNumber
lib/search/env.ts, client.ts, settings.ts, documents.ts, query.ts, sync.ts, errors.ts
lib/jobs/signature.ts          HMAC sign/verify
lib/jobs/registry.ts           job name → function
lib/jobs/run-job.ts            lease + run + finish
lib/jobs/overdue.ts            health's overdue check
app/api/jobs/[job]/route.ts    replaces app/api/jobs/maintenance/route.ts
scripts/run-job.mjs            signed POST from a shell (search:reindex)
docker-compose.meilisearch.yml
components/pop/*               population table, search form, results, tiles, set table, certificate
app/[locale]/pop-report/…, app/[locale]/cert/…
docs/deployment/SEARCH_SETUP.md
```

---

### Task 1: Catalogue schema

**Files:**
- Create: `supabase/migrations/<ts>_catalog.sql` (`npm run db:new catalog`)
- Create: `supabase/tests/120-catalog.sql`
- Create: `lib/pop/keys.ts`, `lib/pop/keys.test.ts`
- Modify: `messages/en.json` (`catalog.kinds`, `catalog.categories`, `catalog.grades`), `lib/supabase/database.types.ts` (generated)

**Interfaces:**
- Produces (SQL):
  - `private.touch_updated_at()` trigger function: sets `new.updated_at = now()`.
  - `public.card_number_key(p text) returns text`, `immutable`, `parallel safe` — Cardstrade's rule:
    `coalesce(nullif(regexp_replace(split_part(lower(btrim(regexp_replace(btrim(p), '^#+', ''))), '/', 1), '^0+([0-9])', '\1'), ''), lower(btrim(p)))`. Executable by everyone (pure function).
  - `public.catalog_categories(key text pk, kind text, position int unique, active bool default true)`; key check `^[a-z][a-z0-9_]{1,30}$` and `not in ('sets','cards')` (route segments); kind check `in ('tcg','sports')`.
  - `public.card_sets(id uuid pk default gen_random_uuid(), category text not null fk, name text not null ≤200, code text ≤30, language text not null default 'en' check '^[a-z]{2}$', release_year int check 1880–2100, series text ≤100, total_cards int check > 0, created_at, updated_at)`.
  - `public.card_set_external_refs(set_id uuid not null fk on delete cascade, source text not null check '^[a-z0-9_]{2,30}$', external_id text not null ≤100, language text check '^[a-z]{2}$', created_at, primary key (source, external_id))`.
  - `public.catalog_cards(id uuid pk, set_id uuid not null fk, card_number text not null ≤50, number_key text generated always as (public.card_number_key(card_number)) stored, name text not null ≤200, variant text ≤100, rarity text ≤100, external_source text, external_id text, merged_into uuid fk catalog_cards, created_at, updated_at)`; checks `merged_into <> id`, `(external_source is null) = (external_id is null)`; unique index `(set_id, number_key, coalesce(variant, ''))` **where merged_into is null**; unique index `(external_source, external_id) where external_id is not null`.
  - `public.grades(key text pk check '^g[0-9]+(_5)?$', value numeric(3,1) not null unique, position int not null unique)`.
  - `touch_updated_at` triggers on `card_sets` and `catalog_cards` (before update).
  - Seed rows (placeholders, spec decision 6): grades `g1`=1.0 … `g10`=10.0 in 0.5 steps (19 rows, `g1_5`=1.5 etc.), position ascending by value. Categories: tcg `pokemon`, `mtg`, `yugioh`, `one_piece`; sports `basketball`, `soccer`, `baseball`, `american_football`, `hockey`.
  - RLS enabled on all five tables, **no policies**; `revoke all … from anon, authenticated` on each.
- Produces (TS) in `lib/pop/keys.ts`: `export const CATEGORY_KEYS = [...] as const; export const GRADE_KEYS = [...] as const; export type CategoryKey; export type GradeKey; export type CategoryKind = "tcg" | "sports";`

- [ ] **Step 1: Write the failing pgTAP test `supabase/tests/120-catalog.sql`.** Assertions:
  - `card_number_key`: `'012/180'`→`'12'`, `'12/180'`→`'12'`, `'12'`→`'12'`, `'#4'`→`'4'`, `'000'`→`'0'`, `'#'`→`'#'`, `'/180'`→`'/180'`, `'LOB-EN001'`→`'lob-en001'`, `'TG01/TG30'`→`'tg01'`.
  - inserting `012/180` then `12/180` (same set, no variant) fails `23505`; with variant `'1st Edition'` succeeds.
  - a merged row (`merged_into` set) may share keys with its survivor.
  - `external_source` without `external_id` fails `23514`; duplicate `(external_source, external_id)` fails `23505`.
  - category key `'sets'` fails `23514`.
  - `select array_agg(key order by position) from public.grades` equals the 19 keys; same for categories against the list above.
  - updating a `catalog_cards` row moves `updated_at`.
  - as `anon` and as an authenticated user: `select` on each new table throws `42501`.
- [ ] **Step 2:** `npm run db:reset && npm run db:test` → 120 fails (relations missing).
- [ ] **Step 3:** Write the migration per Interfaces.
- [ ] **Step 4:** `npm run db:reset && npm run db:test` → all pass. `npm run db:types`.
- [ ] **Step 5: Failing Vitest `lib/pop/keys.test.ts`:** every `CATEGORY_KEYS` entry has `messages.catalog.categories[key].label`; every `GRADE_KEYS` entry has `messages.catalog.grades[key].label`; `messages.catalog.kinds.tcg/.sports` exist; `GRADE_KEYS.length === 19`.
- [ ] **Step 6:** Add `lib/pop/keys.ts` and the messages (labels are placeholders — e.g. `g10` "Gem Mint", `g9_5` "Mint+", `g9` "Mint"; the rest plain "Grade N"). Run `npm test -- lib/pop` → PASS.
- [ ] **Step 7: Commit** `feat(db): add the card catalogue, grades and the card-number key`.

---

### Task 2: Graded copies

**Files:**
- Create: `supabase/migrations/<ts>_graded_copies.sql`, `supabase/tests/130-graded-copies.sql`
- Modify: `lib/supabase/database.types.ts` (generated)

**Interfaces:**
- Produces `public.graded_copies`:
  `id uuid pk, cert_number text not null unique check '^[A-Z0-9-]{4,32}$', catalog_card_id uuid not null fk, order_card_id uuid fk order_cards on delete restrict, service text not null fk services, card_grade text fk grades, autograph_grade text fk grades, card_authentication text check in ('genuine','not_genuine'), autograph_authentication text check in ('genuine','not_genuine'), finalized_at timestamptz, published_at timestamptz, withdrawn_at timestamptz, created_at, updated_at`.
  Checks: `published_at is null or finalized_at is not null`; `withdrawn_at is null or published_at is not null`; `card_grade is not null or card_authentication is not null or autograph_grade is not null` (a copy is a result of something).
  Indexes: each FK column; `updated_at`; partial `graded_copies_public_idx on (catalog_card_id) where published_at is not null and withdrawn_at is null and card_authentication is distinct from 'not_genuine'`.
  `touch_updated_at` trigger. RLS on, no policies, revoked from `anon`, `authenticated`.
- **The public-copy rule** (used verbatim by every later RPC): `published_at is not null and withdrawn_at is null and card_authentication is distinct from 'not_genuine'`.

- [ ] **Step 1: Failing `130-graded-copies.sql`:** each check constraint rejects its case (`23514`); a lower-case or `/`-containing cert fails; duplicate cert fails `23505`; deleting an `order_cards` row a copy references fails `23503`; `updated_at` moves on update; `anon`/`authenticated` `select` throws `42501`; `pg_indexes` contains `graded_copies_public_idx`.
- [ ] **Step 2:** `npm run db:reset && npm run db:test` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `npm run db:reset && npm run db:test` → PASS; `npm run db:types`.
- [ ] **Step 5: Commit** `feat(db): add graded copies and the public-copy rule`.

---

### Task 3: Public Pop Report RPCs

**Files:**
- Create: `supabase/migrations/<ts>_pop_functions.sql`, `supabase/tests/140-pop-functions.sql`
- Modify: `lib/supabase/database.types.ts` (generated)

**Interfaces:** all `language sql stable security definer set search_path = ''`, `revoke … from public`, `grant execute … to anon, authenticated, service_role`.

**Population definition** (shared by every function; implement once as `private.card_population(p_card uuid) returns table(grade_counts jsonb, authentic_count int, total int, autograph_counts jsonb, autograph_total int)`, not granted to anyone):
- `grade_counts`: `{grade_key: n}` over public copies with `card_grade is not null`.
- `authentic_count`: public copies with `card_grade is null and card_authentication = 'genuine'`.
- `total` = sum(grade_counts) + authentic_count.
- `autograph_counts` / `autograph_total`: public copies with `autograph_grade is not null and autograph_authentication is distinct from 'not_genuine'`, by `autograph_grade`.
- A catalogue card is **public** when `merged_into is null` and `total + autograph_total > 0`.

**Set-page ordering** (Review Focus 5): `order by (number_key ~ '^[0-9]+$') desc, case when number_key ~ '^[0-9]+$' then lpad(number_key, 12, '0') else number_key end, variant nulls first, name`.

Functions:
- `pop_grades() returns table(key text, value numeric)` ordered by position.
- `pop_categories() returns table(key text, kind text, set_count int, total int)` — active categories with ≥1 public card, by position.
- `pop_category_sets(p_category text) returns table(id uuid, name text, code text, language text, release_year int, series text, card_count int, total int)` — sets with ≥1 public card; `order by series nulls last, release_year desc nulls last, name`.
- `pop_set(p_set uuid) returns table(id uuid, category text, kind text, name text, code text, language text, release_year int, series text, total_cards int)` — no row unless the set has a public card.
- `pop_set_cards(p_set uuid) returns table(id uuid, card_number text, name text, variant text, grade_counts jsonb, authentic_count int, total int, autograph_counts jsonb, autograph_total int)` — public cards only, ordering above.
- `pop_card(p_card uuid) returns table(id, set_id, set_name, set_code, category, kind, card_number, name, variant, rarity, language, release_year, series, grade_counts, authentic_count, total, autograph_counts, autograph_total)` — no row unless public.
- `pop_resolve_card(p_card uuid) returns uuid` — follows `merged_into` (at most 10 hops) to the final row; `null` when unknown.
- `pop_certificate(p_cert text) returns table(status text, cert_number text, card_id uuid, card_name text, card_number text, variant text, set_id uuid, set_name text, category text, release_year int, language text, service text, card_grade text, autograph_grade text, card_authentication text, autograph_authentication text, published_at timestamptz, card_total int, graded_higher int)`:
  - published **and** withdrawn → one row, `status = 'withdrawn'`, only `cert_number` set;
  - public → `status = 'public'`, all fields; `card_total` = the card's `total`; `graded_higher` = public copies of the same card whose card grade's `value` > this copy's (null when this copy has no card grade);
  - anything else → no row. Looks up `p_cert` exactly (normalisation is the app's job).
- `pop_recent_copies(p_limit int) returns table(cert_number, card_id, card_name, card_number, variant, rarity, set_name, category, release_year, card_grade, published_at)` — public copies with a card grade, newest `published_at` first, `limit least(p_limit, 24)`.

- [ ] **Step 1: Failing `140-pop-functions.sql`.** Fixture (inside the test): one set, cards A (`2`), B (`10`), C (`004/102`), D (`TG01`), E (`2`, variant `Holo`), F merged into A; copies of A: two `g10`, one `g9`, one authentic-only (service `authentication`, `card_authentication='genuine'`, no grades), one autograph-only (service `autograph`, `card_grade` and `card_authentication` null, `autograph_grade='g8'`, `autograph_authentication='genuine'`), one unpublished `g10`, one withdrawn `g10`, one `not_genuine`; one dual copy on B with `autograph_authentication='not_genuine'` and card `g7`. Assert, as `anon`:
  - `pop_card(A)` → `grade_counts = {"g10":2,"g9":1}`, `authentic_count = 1`, `total = 4`, `autograph_counts = {"g8":1}`, `autograph_total = 1`.
  - `pop_card(B)` → `total = 1`, `autograph_total = 0`.
  - `pop_card(F)` → no row; `pop_resolve_card(F) = A`; `pop_resolve_card(gen_random_uuid())` is null.
  - `pop_set_cards(set)` ids in order **A, E, C, B, D** (`2`, `2 Holo`, `004/102` keyed `4`, `10`, `TG01`) — Review Focus 5.
  - `pop_certificate(<g9 copy>)` → `status='public'`, `graded_higher = 2`, `card_total = 4`; `pop_certificate(<withdrawn>)` → `status='withdrawn'` and `card_id is null`; unpublished, `not_genuine`, unknown → zero rows.
  - `pop_recent_copies(100)` returns ≤ 24 rows and no authentic-only copy.
  - `pop_categories()` lists only the fixture's category; `select * from public.graded_copies` as anon still throws `42501`.
  - No function's result type has a column named `order_card_id` (query `information_schema.routines`/`parameters` for the `pop_` functions' OUT parameters).
- [ ] **Step 2:** `npm run db:reset && npm run db:test` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `npm run db:reset && npm run db:test` → PASS; `npm run db:types`.
- [ ] **Step 5: Commit** `feat(db): add the public Pop Report functions`.

---

### Task 4: Search-sync and job-run functions

**Files:**
- Create: `supabase/migrations/<ts>_search_sync.sql`, `supabase/tests/150-search-sync.sql`
- Modify: `lib/supabase/database.types.ts` (generated)

**Interfaces** (all `security definer`, `search_path = ''`; service_role only unless stated):
- `private.job_runs(job text pk, last_success_started_at timestamptz, lease_until timestamptz, last_finished_at timestamptz)`.
- `public.begin_job_run(p_job text, p_lease_seconds int) returns table(acquired boolean, started_at timestamptz, previous_success_started_at timestamptz)` — upserts the row; takes the lease only when `lease_until is null or lease_until < now()`; `started_at = now()`.
- `public.finish_job_run(p_job text, p_started_at timestamptz, p_success boolean) returns void` — clears the lease, sets `last_finished_at`, and on success `last_success_started_at = p_started_at`.
- `public.overdue_jobs() returns text[]` — **granted to `anon, authenticated, service_role`** (job names only, for `/api/health`). Thresholds: `maintenance` 3 h, `search-delta` 45 min, `search-rebuild` 8 days; a job with no successful run is overdue.
- `public.search_changed_card_ids(p_since timestamptz) returns setof uuid` — distinct ids: `catalog_cards.updated_at >= p_since`, cards of `card_sets.updated_at >= p_since`, `catalog_card_id` of `graded_copies.updated_at >= p_since`.
- `public.search_public_card_ids(p_after uuid, p_limit int) returns setof uuid` — public cards (Task 3 definition) with `id > coalesce(p_after, '00000000-…')`, ordered by id, `limit least(p_limit, 1000)`.
- `public.search_card_documents(p_card_ids uuid[]) returns table(id uuid, name text, card_number text, number_key text, variant text, rarity text, set_id uuid, set_name text, set_code text, series text, language text, release_year int, category text, kind text, grade_counts jsonb, authentic_count int, total int, autograph_total int, grades_present text[], latest_published_at timestamptz)` — rows only for ids that are public; `grades_present` = keys of `grade_counts` plus `'authentic'` when `authentic_count > 0`.

- [ ] **Step 1: Failing `150-search-sync.sql`:** with a small fixture: `begin_job_run('search-delta', 600)` acquires; a second call does not (`acquired = false`); after `finish_job_run(…, true)` `previous_success_started_at` on the next begin equals the first `started_at`; a failed finish leaves it unchanged; updating a set surfaces all its cards from `search_changed_card_ids(now() - interval '1 minute')`, updating a copy surfaces its card; `search_card_documents` omits a card whose only copy was withdrawn and a merged card; `grades_present` contains `'authentic'` when expected; `overdue_jobs()` as anon returns all three names on a fresh DB; anon calling `search_card_documents` / `begin_job_run` throws `42501`.
- [ ] **Step 2:** `npm run db:reset && npm run db:test` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** PASS; `npm run db:types`.
- [ ] **Step 5: Commit** `feat(db): add search-sync and job-run functions`.

---

### Task 5: Supabase Cron, signing and schedules

**Files:**
- Create: `supabase/migrations/<ts>_job_scheduling.sql`, `supabase/tests/160-job-scheduling.sql`
- Modify: `supabase/seed.sql` (local Vault secrets), `.env.example`

**Interfaces:**
- `create extension if not exists pg_cron with schema pg_catalog; create extension if not exists pg_net with schema extensions;` (pgcrypto already in `extensions`).
- `private.job_signature(p_job text, p_timestamp bigint, p_secret text) returns text` immutable: `'v1=' || encode(extensions.hmac(p_job || '.' || p_timestamp::text, p_secret, 'sha256'), 'hex')`. **Test vector** (shared with Task 6): `job_signature('search-delta', 1700000000, 'test-secret') = 'v1=ddd04777c2cff12e41d54cc8289adcc03281c52774b146301d41bd949816acfb'`.
- `private.call_job(p_job text) returns bigint` — reads `jobs_base_url` and `jobs_secret` from `vault.decrypted_secrets`; returns `null` without calling anything if either is missing; otherwise `net.http_post(url := base || '/api/jobs/' || p_job, headers := {'content-type': 'application/json', 'x-job-timestamp': ts, 'x-job-signature': private.job_signature(p_job, ts, secret)}, body := '{}'::jsonb, timeout_milliseconds := 5000)` with `ts = extract(epoch from now())::bigint`, and returns the request id.
- Schedules (`cron.schedule(name, cron, command)`, upserting by name):
  - `expire-stale-drafts` `7 * * * *` → `select public.expire_stale_drafts()` (pure SQL, no HTTP).
  - `maintenance` `0 * * * *` → `select private.call_job('maintenance')`.
  - `search-delta` `*/15 * * * *` → `select private.call_job('search-delta')`.
  - `search-rebuild` `30 3 * * 0` → `select private.call_job('search-rebuild')`.
- `seed.sql` (local only): `select vault.create_secret('http://host.docker.internal:3000', 'jobs_base_url'); select vault.create_secret('local-jobs-secret', 'jobs_secret');` guarded so a re-seed does not duplicate.
- `.env.example`: `JOBS_SECRET=local-jobs-secret` comment "must equal the Vault secret `jobs_secret`"; `MEILISEARCH_HOST=http://localhost:7700`, `MEILISEARCH_API_KEY=local-meili-master-key`, `MEILISEARCH_MASTER_KEY=local-meili-master-key` (container).

- [ ] **Step 1: Failing `160-job-scheduling.sql`:** the test vector; `select jobname, schedule from cron.job order by jobname` equals the four rows above; with the Vault secrets temporarily deleted inside the test transaction `private.call_job('search-delta')` returns null and `net.http_request_queue` gains no row; with them present it returns a non-null id and the queued request's headers contain `x-job-signature` starting `v1=` and **do not contain the secret value**.
- [ ] **Step 2:** `npm run db:reset && npm run db:test` → FAIL.
- [ ] **Step 3:** Write the migration and seed lines.
- [ ] **Step 4:** PASS. Also run `npx supabase db reset` twice in a row → no error (schedules upsert).
- [ ] **Step 5: Commit** `feat(db): schedule jobs with Supabase Cron and sign app job calls`.

---

### Task 6: Signed job route, lease runner and the maintenance move

**Files:**
- Create: `lib/jobs/signature.ts` (+ `.test.ts`), `lib/jobs/registry.ts`, `lib/jobs/run-job.ts` (+ `.test.ts`), `lib/jobs/errors.ts`, `app/api/jobs/[job]/route.ts` (+ `route.test.ts`), `scripts/run-job.mjs` (+ `scripts/run-job.test.ts`)
- Delete: `app/api/jobs/maintenance/route.ts`, `app/api/jobs/maintenance/route.test.ts`
- Modify: `lib/jobs/run-maintenance.ts` (+ test) — drop the `expire_stale_drafts` call (now pure cron), keep the R2 drain; `lib/supabase/admin-import-guard.test.ts` (add `lib/jobs/run-job.ts`); `package.json` scripts `"job": "node scripts/run-job.mjs"`

**Interfaces:**
- `signature.ts`: `export const SIGNATURE_MAX_AGE_SECONDS = 300;` `export function jobSignature(job: string, timestamp: number, secret: string): string` (node `crypto` HMAC-SHA256 over `` `${job}.${timestamp}` ``, `"v1=" + hex`); `export function verifyJobRequest(headers: Headers, job: string, secret: string, nowSeconds: number): boolean` — reads `x-job-timestamp` (integer) and `x-job-signature`; false when missing, non-integer, `|now − ts| > 300`, or not equal under `timingSafeEqual` (length mismatch → false).
- `registry.ts`: `export type JobContext = { startedAt: Date; previousSuccessStartedAt: Date | null };` `export type JobFn = (ctx: JobContext) => Promise<Record<string, number>>;` `export const JOBS: Record<"maintenance" | "search-delta" | "search-rebuild", JobFn>;` `export type JobName = keyof typeof JOBS;` `export function isJobName(v: string): v is JobName`. Search entries come from Task 8 (`runSearchDelta`, `rebuildSearchIndex`); until then register stubs that throw `"not implemented"` — Task 8 replaces them.
- `run-job.ts`: `export const JOB_LEASE_SECONDS = 600;` `export async function runJob(job: JobName): Promise<"ran" | "busy" | "failed">` — `begin_job_run`; not acquired → `"busy"`; runs `JOBS[job]`; `finish_job_run(job, startedAt, success)` always; failures → `reportJobError(job, code)` and `"failed"`.
- `errors.ts`: `export function reportJobError(job: string, code: string): void` — same shape as `reportOrderError` (tags `job.name`, `job.code`).
- Route: `export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[job]">)`; `JOBS_SECRET` unset → 404; unknown job → 404; `verifyJobRequest` false → 401; else `after(() => runJob(job))` and `Response.json({ accepted: job }, { status: 202 })`. `export const dynamic = "force-dynamic"`. No `GET`.
- `scripts/run-job.mjs <job>`: reads `JOBS_SECRET` (required) and `JOBS_BASE_URL` (default `http://localhost:3000`), signs with the same scheme using `node:crypto`, POSTs, prints status, exits non-zero unless 202. Exports nothing; its signing function is a named export `sign(job, ts, secret)` so the test can import it.

- [ ] **Step 1: Failing tests.**
  - `signature.test.ts`: the Task 5 test vector; verify true at `ts`, true at `ts+300`, false at `ts+301` and `ts-301`; false for another job name, a tampered last hex digit, a missing header, `x-job-timestamp: "1e9"`, a signature of another length.
  - `route.test.ts` (node env; mock `next/server`'s `after` to collect callbacks, mock `@/lib/jobs/run-job`): 404 without secret; 404 for `/api/jobs/unknown` even when signed; 401 for a stale signature; 202 + `{accepted:"search-delta"}` when valid and `runJob` called once with `"search-delta"` only after the collected `after` callback runs; `GET` not exported.
  - `run-job.test.ts` (mock admin client RPCs): busy lease → `"busy"`, job not called; job throws → `finish_job_run` called with `false`, `reportJobError` called, `"failed"`; success → finish with `true` and the same `startedAt`.
  - `scripts/run-job.test.ts`: `sign("search-delta", 1700000000, "test-secret")` equals the vector.
  - `run-maintenance.test.ts`: no longer calls `expire_stale_drafts`.
- [ ] **Step 2:** `npm test -- lib/jobs app/api/jobs scripts` → FAIL.
- [ ] **Step 3:** Implement per Interfaces; delete the old maintenance route; add the allowlist entry.
- [ ] **Step 4:** `npm test` → PASS (whole suite, including the admin guard).
- [ ] **Step 5: Manual check:** `npm run db:start`, `npm run dev`, `JOBS_SECRET=local-jobs-secret npm run job maintenance` → `202`; `select * from private.job_runs` shows a success row.
- [ ] **Step 6: Commit** `feat: sign job calls and run jobs under a lease`.

---

### Task 7: Meilisearch locally, its client, settings and documents

**Files:**
- Create: `docker-compose.meilisearch.yml`, `lib/search/env.ts`, `lib/search/client.ts`, `lib/search/settings.ts`, `lib/search/documents.ts` (+ `.test.ts`), `lib/search/errors.ts`, `lib/search/env.test.ts`
- Modify: `package.json` (`meilisearch` 0.62.0 exact; scripts `search:start` = `docker compose -f docker-compose.meilisearch.yml up -d`, `search:stop` = `… down`)

**Interfaces:**
- Compose: image `getmeili/meilisearch:v1.35.1`, `127.0.0.1:7700:7700` (loopback only), `MEILI_ENV=development`, `MEILI_NO_ANALYTICS=true`, `MEILI_MASTER_KEY=${MEILISEARCH_MASTER_KEY:-local-meili-master-key}`, named volume, healthcheck on `/health`.
- `env.ts`: `export function searchEnv(): { host: string; apiKey: string } | null` — `null` when either `MEILISEARCH_HOST` or `MEILISEARCH_API_KEY` is unset (search unavailable, not an error).
- `client.ts` (`server-only`): `export function searchClient(): Meilisearch | null`.
- `settings.ts`: `export const POP_INDEX = "pop_cards";` `export const POP_INDEX_SETTINGS` = searchable `["name","set_name","card_number","variant","series","set_code"]`, filterable `["category","kind","set_id","release_year","language","grades_present"]`, sortable `["total","latest_published_at","release_year"]`, `typoTolerance: { disableOnNumbers: true }`.
- `documents.ts`: `export type PopCardDocument` = the Task 4 `search_card_documents` row with `latest_published_at` as unix seconds (`number`) and `grade_counts` typed `Partial<Record<GradeKey, number>>`; `export function toDocument(row): PopCardDocument`.
- `errors.ts`: `export function reportSearchError(flow: "query" | "index" | "delta" | "rebuild", code: string): void`.

- [ ] **Step 1: Failing tests:** `env.test.ts` — null when either var empty, values when both set; `documents.test.ts` — a fixture row maps to the expected document, `latest_published_at` `"2026-11-19T10:00:00Z"` → `1763546400`.
- [ ] **Step 2:** `npm test -- lib/search` → FAIL.
- [ ] **Step 3:** Implement; `npm install meilisearch@0.62.0 --save-exact`.
- [ ] **Step 4:** PASS. `npm run search:start` → `curl -s localhost:7700/health` returns `{"status":"available"}`.
- [ ] **Step 5: Commit** `feat(search): add Meilisearch locally with its client and index settings`.

---

### Task 8: Index sync — write-through, delta, weekly rebuild

**Files:**
- Create: `lib/search/sync.ts` (+ `sync.test.ts`)
- Modify: `lib/jobs/registry.ts` (real search jobs), `lib/supabase/admin-import-guard.test.ts` (add `lib/search/sync.ts`), `package.json` (`"search:reindex": "node scripts/run-job.mjs search-rebuild"`)

**Interfaces:**
- `export const DELTA_OVERLAP_MINUTES = 10; export const SYNC_BATCH = 500;`
- `export async function indexCards(cardIds: string[]): Promise<{ upserted: number; deleted: number }>` — for M5's write-through. Chunks of 500; `search_card_documents` → `addDocuments` (primary key `id`); ids not returned → `deleteDocuments`; waits for each task; throws on a failed task. No client (unset env) → throws `SearchUnavailableError` (exported).
- `export const runSearchDelta: JobFn` — `previousSuccessStartedAt` null → delegates to `rebuildSearchIndex`; else `since = previous − 10 min`, `search_changed_card_ids(since)`, `indexCards`. Returns `{ upserted, deleted }`.
- `export const rebuildSearchIndex: JobFn` — ensure `pop_cards` exists; create `pop_cards_rebuild` (delete a leftover first), apply `POP_INDEX_SETTINGS`, page `search_public_card_ids` (500) → documents → add; `swapIndexes([{ indexes: ["pop_cards", "pop_cards_rebuild"] }])` (settings travel with the swapped index); delete `pop_cards_rebuild`. Returns `{ documents }`.

- [ ] **Step 1: Failing `sync.test.ts`** (fake Meilisearch client and admin RPCs via `vi.mock`):
  - `indexCards(["a","b"])` with docs returned only for `a` → `addDocuments` with `[docA]`, `deleteDocuments(["b"])`, result `{upserted:1, deleted:1}`.
  - 1 200 ids → three `search_card_documents` calls (500/500/200).
  - a failed Meilisearch task → rejects (so `runJob` records failure and the watermark does not move — Review Focus 3).
  - unset env → `SearchUnavailableError`.
  - `runSearchDelta` with previous `12:00` → `search_changed_card_ids` called with `11:50`; with previous `null` → rebuild path taken.
  - `rebuildSearchIndex` → settings applied to `pop_cards_rebuild` **before** documents are added, then `swapIndexes`, then the rebuild index deleted.
- [ ] **Step 2:** `npm test -- lib/search` → FAIL.
- [ ] **Step 3:** Implement; replace the registry stubs; add the allowlist entry.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Manual check** (after Task 15's seed exists, or with the 140 fixture inserted by hand): `npm run search:reindex` → 202; `curl -s -H "Authorization: Bearer local-meili-master-key" localhost:7700/indexes/pop_cards/stats` shows the public card count.
- [ ] **Step 6: Commit** `feat(search): sync the index on demand, every 15 minutes and weekly`.

---

### Task 9: Search parameters and querying

**Files:**
- Create: `lib/pop/search-params.ts` (+ `.test.ts`), `lib/search/query.ts` (+ `.test.ts`)

**Interfaces:**
- `export type PopSearch = { q: string; kind?: CategoryKind; category?: CategoryKey; year?: number; grade?: GradeKey | "authentic"; page: number };`
- `export const POP_PAGE_SIZE = 24; export const POP_MAX_PAGE = 100; export const POP_MAX_QUERY = 100;`
- `export function parsePopSearch(params: Record<string, string | string[] | undefined>): PopSearch` — first value of repeated params; `q` trimmed and cut to 100; `kind`/`category`/`grade` kept only if in `CATEGORY_KEYS`/`GRADE_KEYS`/`"authentic"`/kinds; `year` only an integer 1880–2100; `page` integer 1–100, else 1.
- `export function isEmptySearch(s: PopSearch): boolean` — no `q` and no filter.
- `export function toSearchParams(s: PopSearch): URLSearchParams` (omits defaults).
- `export function toMeiliFilter(s: PopSearch): string[]` — e.g. `category = "pokemon"`, `release_year = 1999`, `grades_present = "g10"`. Values are already allow-listed; still quoted.
- `export async function searchPopCards(s: PopSearch): Promise<{ status: "ok"; hits: PopCardDocument[]; total: number; page: number; pages: number } | { status: "unavailable" }>` — sort `total:desc` when `q` is empty, relevance otherwise; `hitsPerPage` 24; any thrown error → `reportSearchError("query", …)` and `unavailable`; no client → `unavailable` without reporting.

- [ ] **Step 1: Failing tests** — Review Focus 1: `parsePopSearch({ category: 'pokemon" OR kind = "x' })` has no `category`; `{ grade: "';drop" }` no grade; `q` of 5 000 chars → length 100; `{ category: ["mtg","pokemon"] }` → `mtg`; `{ year: "1999.5" }`, `"0"`, `"abc"` → no year; `page: "-3"` → 1; `toMeiliFilter` output for a full search equals the exact array; round-trip `parsePopSearch(Object.fromEntries(toSearchParams(s)))` equals `s`. `query.test.ts`: unset env → `unavailable`, no Sentry; client throws → `unavailable` and `reportSearchError` called; filters and sort passed as specified.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm test -- lib/pop lib/search` PASS.
- [ ] **Step 5: Commit** `feat(search): parse Pop Report searches and query Meilisearch`.

---

### Task 10: Public data loaders and the population table

**Files:**
- Create: `lib/supabase/public.ts`, `lib/pop/types.ts`, `lib/pop/load.ts` (+ `.test.ts`), `components/pop/population-table.tsx` (+ `.test.tsx`), `components/pop/grade-label.tsx`
- Modify: `messages/en.json` (`pop.*` namespace: table headings, Authentic, Total, autograph line, empty states)

**Interfaces:**
- `public.ts` (`server-only`): `export function createPublicClient(): SupabaseClient<Database>` — `@supabase/supabase-js` `createClient` with the publishable key, `auth: { persistSession: false, autoRefreshToken: false }`; reads no cookies, so pages using it do not depend on the session.
- `types.ts`: `export type Population = { gradeCounts: Partial<Record<GradeKey, number>>; authenticCount: number; total: number; autographCounts: Partial<Record<GradeKey, number>>; autographTotal: number };` plus `PopCategory`, `PopSetSummary`, `PopSet`, `PopSetCard` (`Population` + `id, cardNumber, name, variant`), `PopCard`, `PopCertificate` (`{ status: "withdrawn"; certNumber } | { status: "public"; … }`), `PopRecentCopy`, `Grade = { key: GradeKey; value: number }` — camelCase mirrors of the Task 3 rows.
- `load.ts`: `loadGrades()`, `loadCategories()`, `loadCategorySets(category)`, `loadSet(id)`, `loadSetCards(id)`, `loadCard(id)`, `resolveCard(id)`, `loadCertificate(certNumber)`, `loadRecentCopies(limit)` — each returns the mapped type or `null`/`[]`; an RPC error throws (pages let `error.tsx` handle it) **except** `loadRecentCopies`, which returns `[]` and reports (landing must never break).
- `PopulationTable({ grades, rows, caption })` where `rows: Array<{ id: string; href?: string; label: ReactNode } & Population>`: columns = grades with a non-zero count in **any** row, ordered by value **descending**, then Authentic (only if any row has one), then Total. An autograph sub-row under a row with `autographTotal > 0`, using the same columns. The table sits in an `overflow-x-auto` wrapper (no page-level horizontal scroll). Numbers via `useFormatter`.
- `GradeLabel({ grade })`: numeral via `useFormatter().number(value)` + `catalog.grades[key].label`.

- [ ] **Step 1: Failing tests.** `load.test.ts` (mock client): `loadCard` maps snake_case + jsonb to `Population`; `loadCertificate` maps both statuses; `loadRecentCopies` returns `[]` and reports when the RPC errors. `population-table.test.tsx` via `renderWithIntl`: a row with only an authentic copy renders the Authentic and Total headers and **no** grade column (Review Focus 4); a row with only autograph copies renders the autograph line and a Total of 0 on the card line; grade headers appear in descending value order; header text comes from `messages.pop` / `messages.catalog.grades`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(pop): add public loaders and the population table`.

---

### Task 11: `/pop-report` — search, results and category tiles; category page

**Files:**
- Create: `app/[locale]/pop-report/page.tsx`, `app/[locale]/pop-report/[category]/page.tsx`, `components/pop/search-form.tsx` (+ test), `components/pop/search-results.tsx` (+ test), `components/pop/category-tiles.tsx` (+ test), `components/pop/category-sets.tsx` (+ test)
- Modify: `messages/en.json` (`pop.search.*`, `pop.category.*`, metadata)

**Interfaces:**
- `/pop-report`: `searchParams` → `parsePopSearch`. Empty search → `SearchForm` + `CategoryTiles` (`loadCategories`). Otherwise → `SearchForm` (prefilled) + `SearchResults` from `searchPopCards`; `unavailable` → the unavailable message; zero hits → empty state; pagination links built with `toSearchParams`, previous/next only.
- `SearchForm`: plain `<form method="get">` (works without JS): `q`, kind, category (options from `CATEGORY_KEYS` labels), year, grade (from `GRADE_KEYS` + authentic). Uses existing `Field*` primitives.
- `SearchResults`: each hit → card name, set name, number, variant, year, total and its highest grade with count; links to `/pop-report/cards/<id>`.
- `CategoryTiles`: grouped by kind; each tile → `/pop-report/<key>` with set count and total.
- `/pop-report/[category]`: unknown or non-public category → `notFound()`. `CategorySets`: TCG grouped by `series` (era), sports grouped by `release_year`; each set links to `/pop-report/sets/<id>` with language shown when not `en`.
- Pages export `generateMetadata` with titles from `pop.*`. No `revalidate`, no caching: always fresh.

**Cut 3 (if over budget):** drop `CategoryTiles` and `/pop-report/[category]`; the empty search shows only the form.

- [ ] **Step 1: Failing component tests** (`renderWithIntl`): `SearchForm` prefilled from a `PopSearch`; `SearchResults` renders hits, the unavailable state and the empty state from `messages.pop.search`; `CategoryTiles` groups by kind; `CategorySets` groups TCG by era and sports by year.
- [ ] **Step 2:** FAIL → **Step 3:** implement components and pages → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(pop): add Pop Report search and category browsing`.

---

### Task 12: Set page and card page

**Files:**
- Create: `app/[locale]/pop-report/sets/[set]/page.tsx`, `app/[locale]/pop-report/cards/[card]/page.tsx`, `components/pop/card-details.tsx` (+ test)
- Modify: `messages/en.json` (`pop.set.*`, `pop.card.*`), `lib/uuid.ts`, `lib/uuid.test.ts`

**Interfaces:**
- Both validate the param with a new `export function isUuid(value: string): boolean` in `lib/uuid.ts` (tested in `lib/uuid.test.ts`: a v4 UUID true; `"abc"`, `"../x"`, an uppercase-hex UUID true, a 37-char string false) before any query; invalid → `notFound()`.
- Set page: `loadSet` null → `notFound()`; header (name, era or year, language, code, link back to the category); `PopulationTable` with one row per `loadSetCards` card (label = number, name, variant; href = card page). Order is the RPC's.
- Card page: `loadCard` null → `resolveCard(id)`; a different id → `redirect` (locale-aware) to `/pop-report/cards/<resolved>`; otherwise `notFound()`. Renders `CardDetails` (name, number, variant, rarity, set link, category, year, language) beside a `Slab` built from the card's data with `grade` = the highest grade numeral present and its label, or the category when none; and the `PopulationTable` with the single row.

**Cut 2 (if over budget):** drop the `resolveCard` redirect (merged cards simply 404).

- [ ] **Step 1: Failing tests** — the `isUuid` cases above, and `card-details.test.tsx`: renders every present field, omits absent `variant`/`rarity` lines, links to `/pop-report/sets/<id>`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(pop): add the set and card pages`.

---

### Task 13: Certificate lookup and certificate page

**Files:**
- Create: `lib/pop/cert-number.ts` (+ test), `app/[locale]/cert/page.tsx`, `app/[locale]/cert/[number]/page.tsx`, `components/pop/certificate.tsx` (+ test), `components/pop/cert-lookup-form.tsx`
- Modify: `messages/en.json` (`cert.*`)

**Interfaces:**
- `export function normaliseCertNumber(input: string): string | null` — uppercase, strip whitespace and leading `#`; return it if it matches `^[A-Z0-9-]{4,32}$`, else `null`.
- `/cert`: `CertLookupForm` (`<form method="get">`, field `number`). With `?number=`: normalise; valid → `redirect` to `/cert/<normalised>`; invalid → render the form with the not-found message.
- `/cert/[number]`: normalise the param; it differs from the param → `redirect` to the normalised URL; `null` → the not-found view (HTTP 404 via `notFound()`); `loadCertificate` null → `notFound()` with the "no certificate with this number" copy (one message for "never existed" and "not published yet"); `withdrawn` → the withdrawn view (HTTP 200, `robots: noindex`); `public` → `Certificate`.
- `Certificate`: cert number, `Slab` from the copy (grade numeral + label, or the authentic wording), card grade, autograph grade (only when present), authentication results (card shown when not null; signature shown when not null), date graded (`published_at`, formatted), link to the card page, "{total} graded" and "graded higher: {n}" (ICU plurals in messages; "graded higher" hidden when null).
- Add a `not-found.tsx` under `app/[locale]/cert/[number]/` rendering the lookup form and the not-found copy.

- [ ] **Step 1: Failing tests** — Review Focus 2: `normaliseCertNumber(" #art-0883 1204 ")` → `"ART-08831204"`; `"../etc"`, `""`, `"x".repeat(500)`, `"AB"` → `null`. `certificate.test.tsx`: public copy shows grade label, "graded higher" with the count; withdrawn renders `messages.cert.withdrawn.*` and no card data; autograph line absent when `autographGrade` null.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(pop): add certificate lookup and certificate pages`.

---

### Task 14: Landing switch, health check

**Files:**
- Modify: `app/[locale]/page.tsx`, `components/slab/slab.tsx` (optional `href` on `SlabData`; when set the slab is a `Link` to it), `components/sections/showcase.tsx` / `hero` only if they must pass `href` through
- Create: `lib/pop/showcase.ts` (+ test), `lib/jobs/overdue.ts` (+ test)
- Modify: `app/api/health/route.ts` (+ create `route.test.ts`)

**Interfaces:**
- `export const SHOWCASE_MIN = 8;` `export function toShowcaseSlabs(copies: PopRecentCopy[], grades: Grade[], label: (key: GradeKey) => string, category: (key: string) => string): SlabData[] | null` — `null` when fewer than 8 (caller falls back to `SAMPLE_SLABS`); each slab has `href: "/cert/<cert>"`. Fixture slabs never get an `href`.
- Landing: `export const revalidate = 300`; loads `loadRecentCopies(8)` + `loadGrades()` inside a `try` — any failure (including missing env at build) → fixtures. The page stays statically prerendered with ISR.
- `overdue.ts`: `export const OVERDUE_CHECK_INTERVAL_MS = 600_000;` `export async function checkOverdueJobs(now: number): Promise<string[]>` — calls `overdue_jobs` with `createPublicClient()` at most once per interval (module-level memo of the last result and time); a non-empty result → `Sentry.captureMessage("jobs/overdue", { level: "warning", tags: { "jobs.overdue": names.join(",") } })` once per check; an RPC error → returns the previous result and reports nothing.
- Health: **always 200** (Coolify restarts unhealthy containers; a stale search job must not take the site down — the spec's "health reports overdue jobs" is met by the field plus the Sentry warning). Adds `jobs: { overdue: string[] }`.

**Cut 1 (if over budget):** skip the landing part of this task; fixtures stay until M5.

- [ ] **Step 1: Failing tests:** `showcase.test.ts` — 7 copies → `null`; 8 → 8 slabs with `href` `/cert/…` and labels from the callbacks. `overdue.test.ts` — second call within 10 min does not hit the RPC; overdue names → one `captureMessage`; RPC error → previous result. `health route.test.ts` — status 200 with `jobs.overdue` from the mocked checker.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm test` PASS.
- [ ] **Step 5: Commit** `feat: show real graded copies on the landing page and report overdue jobs`.

---

### Task 15: Seed data, docs and end-to-end verification

**Files:**
- Modify: `supabase/seed.sql`, `docs/content-requests.md`, `docs/deployment/SUBMISSION_SETUP.md`, `CLAUDE.md`, `components/slab/fixtures.ts` (comment only: "replaced on the landing page once 8 real copies exist")
- Create: `docs/deployment/SEARCH_SETUP.md`

**Seed** (local only, obviously synthetic; cert numbers `TEST-0001`…, a range real numbers can never use): categories already exist; sets: one Pokémon English set, one Pokémon Japanese set (`language = 'ja'`), one basketball set with `release_year`; ~12 catalogue cards incl. two variants of one number and one merged card; copies — on the seeded order cards where they exist, else `order_card_id` null — covering: several grades incl. halves, authentic-only, dual with autograph grade, dual with forged signature, unpublished, withdrawn, not genuine. At least 8 published card-graded copies so the landing switch shows real data locally.

**Docs:**
- `SEARCH_SETUP.md`: Coolify Meilisearch service (image `getmeili/meilisearch:v1.35.1`, persistent volume, no public port, same network as the app, `MEILI_ENV=production`, `MEILISEARCH_MASTER_KEY`); minting an admin-scoped key with the master key and setting `MEILISEARCH_HOST` / `MEILISEARCH_API_KEY` on the app; Vault secrets per Supabase project (`select vault.create_secret('<https://site>', 'jobs_base_url'); select vault.create_secret('<same as JOBS_SECRET>', 'jobs_secret');`); first `npm run search:reindex` from the app container; checks: `select * from cron.job_run_details order by start_time desc limit 10`, `select * from private.job_runs`, `/api/health` `jobs.overdue` empty, index stats count equals `select count(*) from search_public_card_ids(null, 1000)` (paged).
- `SUBMISSION_SETUP.md`: remove the Coolify scheduled-task step; replace with "the schedule lives in the `job_scheduling` migration; set the Vault secrets (see `SEARCH_SETUP.md`); then delete the old Coolify task".
- `content-requests.md`: grading scale (19 placeholder grades and labels), certificate number format, launch categories (the 9 placeholders), early-access window question, and "showcase switches to real copies at 8".
- `CLAUDE.md`: repo-state paragraph (M4 built); remove `/pop-report` from the deliberate-404 table; new **Pop Report** section with the rules: public reads are RPCs only and the public-copy rule lives in them; Meilisearch is derived, private, rebuilt by `search:reindex`; the three sync layers and the overlap margin; `updated_at` triggers are what the delta relies on — nothing is hard-deleted from catalogue/copy tables; Supabase Cron + HMAC-signed job calls, secret in Vault and `JOBS_SECRET`; `/cert/<number>` never changes; health stays 200; the two new admin-client allowlist entries.

- [ ] **Step 1:** Write the seed; `npm run db:reset` → no error; `npm run db:test` → PASS.
- [ ] **Step 2:** Write the docs.
- [ ] **Step 3: Full verification:** `npm run lint && npm test && npm run build && npx tsc --noEmit` → all pass.
- [ ] **Step 4: Run it** (use the `next-dev-loop` skill): `npm run db:reset`, `npm run search:start`, `npm run dev`, `JOBS_SECRET=local-jobs-secret npm run search:reindex`. Check in the browser: `/pop-report` tiles; a search for a seeded name; filter by a grade; a category page; the set page order; a card page incl. the merged card's redirect; `/cert/TEST-0001` (public), the withdrawn and unpublished certs, `/cert?number=test-0001`; landing shows real slabs linking to `/cert/…`; stop Meilisearch (`npm run search:stop`) → search shows unavailable, card/set/cert pages still work; `/api/health` shows `jobs`; wait for or trigger `select private.call_job('search-delta')` → `private.job_runs` advances.
- [ ] **Step 5: Commit** `docs: Pop Report setup, rules and client questions`.
