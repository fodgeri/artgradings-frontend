# Grading Submission Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revised 2026-10-28** after the client call. It brings in unknown cards identified by ART for a fee, the client's card fields, autograph and dual services for signed cards, and the QR parcel label and submission form. The fake carrier label is dropped. Card search is deferred to a change request.

**Goal:** A signed-in customer builds a multi-card order at `/submit` (cards & services → shipping → summary) and submits it. They pay on a test payment page, then print ART's QR parcel label and submission form, and track the order under `/account`. Stripe can be swapped in later behind a provider boundary.

**Architecture:**
- **Postgres owns the rules.** Orders and their cards live in Postgres. Drafts are orders in status `draft`, saved by Server Actions through the session client under RLS.
- **Pricing and status changes happen in `SECURITY DEFINER` SQL functions.** The functions that price an order, submit it and change its status are the only writers of prices and statuses. The browser mirrors the pricing only to show a running total.
- **Services, tiers, add-ons, card fees and shipping zones are data.** Each is a table row plus a message key.
- **Two modules use the service-role client:**
  - **The payment-success handler**, which the test payment page calls now and the M7 webhook will call later.
  - **The maintenance job**, which expires drafts and deletes photos.
  Each one is a new entry in the admin-import allowlist.
- **Photos** go through our server into R2. Locally that's Supabase Storage's S3 endpoint, standing in for R2. Photos are served back through an RLS-checked route handler.
- **Printables** are server-rendered pages with a print stylesheet. Their QR code (inline SVG) encodes the stable URL `${SITE_URL}/o/<reference>`.

**Tech Stack:**
- Next.js 16 App Router (Server Actions, Route Handlers), React 19, next-intl
- `@supabase/ssr` + `@supabase/supabase-js`
- Postgres + pgTAP via the Supabase CLI
- `@aws-sdk/client-s3` and `qrcode` + `@types/qrcode` (new dependencies)
- Base UI, Vitest 4 + React Testing Library

**Spec:** `docs/superpowers/specs/2026-10-22-submission-flow-design.md`, revised 2026-10-28. Read it before Task 1, especially *The 2026-10-28 client call*. Where this plan departs from it, *Deviations from the spec* says so and why.

## Global Constraints

- **The branch is `feature/submission-flow`,** created off `origin/main` in Task 1. Commit after every task, in conventional-commit style, and end every message with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FbCQKSRTuHvdfmj2XToEGF
  ```
- **All user-facing copy lives in `messages/en.json`:**
  - `submit.*` for the wizard
  - `orders.*` for the account, order and printable pages
  - `catalog.services.<key>.{label,description}`, `catalog.tiers.<key>.{label,description}`, `catalog.addOns.<key>.{label,description}` and `catalog.zones.<key>` for the catalog
  - `orders.status.<status>` for status labels
  - `auth.errors.ordersInProgress` for the deletion refusal

  Catalog keys are dynamic, so render them through `t.has(key) ? t(key) : key`. Never put copy in the database. *(Decided: revisit at M5.)*
- **Never assert user-facing copy as a literal.** Import `messages/en.json`.
- **Import `Link`, `redirect`, `useRouter` from `@/i18n/navigation`**, never from `next/*`. In a Server Action, always `return redirect({ href, locale })` outside any `try`.
- **Every Server Action:**
  1. resolves its locale with `resolveLocale()`;
  2. reads the user with `requireUser()`;
  3. never reads a user id, order id, price or status from its input.

  The draft is found with `user_id = auth.uid()` through RLS. Cards and photos are addressed by their ids, and RLS proves the caller owns them.
- **Money** is an integer number of minor units (cents) plus an ISO 4217 `currency`, everywhere. It is **EUR only** today, via `DEFAULT_CURRENCY = "EUR"`. Format it with `useFormatter().number(cents / 100, { style: "currency", currency })` or `getFormatter()`. Never format by hand.
- **Order statuses** are exactly `draft`, `awaiting_payment`, `paid`, `received`, `grading`, `graded`, `shipped_back`, `completed` and `cancelled`.
  - The transitions in M3 are draft from nothing, `draft→awaiting_payment`, `draft→cancelled`, `awaiting_payment→cancelled` and `awaiting_payment→paid`, the last one by the system only.
  - **No application code writes `orders.status`.**
  - **`authenticated` can never reach `paid`.**
- **Services** are rows of `public.services`. The seeded keys are `grading`, `autograph`, `dual` and `authentication`. `autograph` and `dual` have `requires_signed = true`, so they are offered, priced and accepted only on a card with `signed = true`.
- **Identification:** `order_cards.identified_by` is `'customer'` (the default) or `'art'`.
  - For `'customer'`, the **identification fields** are required: `release_year`, `brand`, `language`, `name`, `set_name` and `card_number`.
  - For `'art'`, those fields are optional hints, and the card carries the `identification` card fee.
  - `declared_value_cents`, `service` and `tier_key` are required in both modes. `surface` is always optional.
- **Shipping methods** are `postal` and `in_person`.
- **Card limits** (exported from `lib/orders/card-rules.ts` and mirrored by DB checks):

  | Constant | Value |
  |---|---|
  | `MAX_CARDS_PER_ORDER` | `50` |
  | `CARD_TEXT_MAX` (name, set name) | `200` |
  | `BRAND_MAX`, `SURFACE_MAX` | `100` |
  | `CARD_NUMBER_MAX` | `50` |
  | `RELEASE_YEAR_MIN` | `1880` |
  | release year maximum | next calendar year, checked at submit |
  | `DECLARED_VALUE_MAX_CENTS` | `1_000_000_000` (€10M) |
  | `CARD_LANGUAGES` | `["en", "ja", "ko", "zh", "de", "fr", "it", "es", "pt", "nl", "pl", "ru"]` *(my call, a client question)* |

  A declared value must be greater than 0. Languages are ISO 639-1 codes, named with `new Intl.DisplayNames([locale], { type: "language" })`.
- **Contact limits** (exported from `lib/orders/shipping-rules.ts`):
  - names use `NAME_MAX_LENGTH` (100) from `lib/auth/profile-name.ts`;
  - `PHONE_PATTERN = /^\+?[0-9 ()-]{6,30}$/`;
  - `POSTCODE_MAX = 20`, `CITY_MAX = 100`, `ADDRESS_LINE_MAX = 200`;
  - the country is ISO 3166-1 alpha-2 and must be in a shipping zone.
- **Photos:**
  - one per card (`MAX_PHOTOS_PER_CARD = 1`);
  - in the browser, input over `PHOTO_INPUT_MAX_BYTES = 20 * 1024 * 1024` is refused, and the longest edge is cut to `PHOTO_MAX_EDGE = 2000`, re-encoded as WebP at quality 0.85, with JPEG as the fallback;
  - the server accepts `image/jpeg`, `image/png` and `image/webp`, recognised by **magic bytes**, up to `PHOTO_MAX_BYTES = 2 * 1024 * 1024`;
  - `serverActions.bodySizeLimit` is `"3mb"`.
- **Drafts:** at most one per customer, deleted after **30 days** without a change. **Add-ons are never pre-ticked.** Identification defaults to `'customer'`, which costs nothing, so no paid option is ever a default.
- **Runtime server settings**, never `NEXT_PUBLIC_*` and never build args:
  - `PAYMENT_PROVIDER=fake` enables the test payment page. When it is unset, that page and its actions return 404.
  - `JOBS_SECRET` enables the maintenance route. When it is unset, the route returns 404.
  - `SITE_URL` is the public origin that the printables' QR code points at.
- **Order references** match `ORDER_REFERENCE_PATTERN = /^AG-[0-9A-HJKMNP-TV-Z]{8}$/` (Crockford base32), are random and never sequential. **The printed URL is `/o/<reference>`**, and it never changes once a label is printed.
- **`lib/supabase/admin.ts` may be imported only by** `lib/auth/delete-current-user.ts`, `lib/payments/record-payment.ts` and `lib/jobs/run-maintenance.ts`. Adding the last two is a security decision Geri approved with this plan.
- **Sentry:** a caught-and-returned error calls `reportOrderError(flow, code)` (Task 5). It never attaches names, an address, a phone number or form data.

## Review Focus

1. **The same draft open in two tabs or on two devices.** Saving a card that the other tab removed must not resurrect it, and must not loop on errors. `saveCard` returns `{ ok: false, errorKey: "cardGone" }` and the editor drops the card. → Task 8 test.
2. **A customer changes their mind halfway through a card.**
   - Unticking *signed* on a card set to `dual` clears the service and tier, and drops add-ons that no longer apply, both in the editor and in `saveCard`.
   - Switching to "ART identifies it" keeps whatever was typed and adds the fee to the running total.
   - Switching back makes the fields required again, without losing them.
   → Task 8 and Task 10 tests.
3. **The catalog changing between the running total and submit:** a tier or service deactivated, a cap lowered, a price changed. Submit refuses with the specific code, the summary names the card, and the stored price is the server's. → Task 3 pgTAP and Task 12 test.
4. **Double-clicking Submit or Pay.**
   - A second submit hits `not_draft`, which the action treats as "already submitted" and redirects to the order page.
   - A second Pay is a `duplicate`, or `not_awaiting_payment`, and also lands on the order page.
   - Neither creates a second log row or a second payment attempt.
   → Task 3, Task 12 and Task 13 tests.
5. **Declared values typed the way people type them:** `400`, `400.5`, `1.234,56`, `1,234.56`, `€ 400`, `-5`, `0`, `1e9`, `abc`, and values over €10M. `parseMoney` accepts the first five and rejects the rest. → Task 5 test.

## Deviations from the spec

| Spec says | Plan does | Why |
|---|---|---|
| The owner sees photos through short-lived signed URLs | Photos are served through `GET /api/photos/[id]`, which reads the row with the session client (so RLS proves ownership) and streams the object from R2 | Ownership is re-checked on every request, the presigner dependency isn't needed, and it works the same against the local Supabase S3 stand-in |
| Acknowledgements are recorded "with a timestamp" | Drafts hold booleans; `submit_order` stamps `terms_accepted_at` and `inbound_insurance_confirmed_at` with `now()` | A timestamp the customer writes through the Data API is forgeable. Submitting is the moment the order is placed |
| Runbook `docs/deployment/R2_SETUP.md` | `docs/deployment/SUBMISSION_SETUP.md` covers R2, `SITE_URL`, `JOBS_SECRET`, the Coolify schedule, and the launch checklist for `PAYMENT_PROVIDER` | One runbook for everything this module adds to a host |
| The cleanup mechanism is left to the builder | A `POST /api/jobs/maintenance` route guarded by `JOBS_SECRET` and called hourly by a Coolify scheduled task. It runs `lib/jobs/run-maintenance.ts` on the service-role client | A single scheduled entry point, with no `pg_cron` dependency on the hosted project. It needs the allowlist entry Geri approves with this plan |
| "Prefilled from the customer's most recent submitted order" | Same, and names written back to the profile happen inside `submit_order` | That makes the write-back atomic with the submit |
| `catalog_ref` for the future card search | The column exists but is in **no** grant | Nothing writes it until the search change request, which grants it together with the validation the catalogue makes possible |

## File Structure

**Database (`supabase/`)**
- `migrations/<ts>_order_catalog.sql`: statuses, transitions, services, tiers, add-ons, card fees and zones, with their prices and placeholder rows
- `migrations/<ts>_orders.sql`: orders, cards, add-on links, photos, the status log, payment attempts, the photo-deletion queue, and RLS
- `migrations/<ts>_order_functions.sql`: reference generator, transition, pricing, `quote_order`, `submit_order`, `cancel_order`
- `migrations/<ts>_order_system_functions.sql`: payment, expiry, photo queue and account-deletion functions
- `config.toml`: the `card-photos` bucket
- `tests/070-order-catalog.sql`, `tests/080-orders-rls.sql`, `tests/090-order-functions.sql`, `tests/100-order-system-functions.sql`
- `seed.sql`: one synthetic draft for `user@example.test`

**Domain library (`lib/`)**
- `money.ts`: `parseMoney`, `DEFAULT_CURRENCY`
- `site-url.ts`: `siteUrl()`
- `orders/status.ts`, `orders/types.ts`, `orders/reference.ts`, `orders/card-rules.ts`, `orders/shipping-rules.ts`, `orders/pricing.ts`, `orders/catalog.ts`, `orders/load-draft.ts`, `orders/load-orders.ts`, `orders/next-action.ts`, `orders/qr.ts`, `orders/errors.ts`, `orders/terms.ts`, `orders/fixtures.ts`
- `storage/env.ts`, `storage/r2.ts`
- `photos/limits.ts`, `photos/sniff.ts`, `photos/compress.ts`
- `payments/provider.ts`, `payments/record-payment.ts`
- `jobs/run-maintenance.ts`

**Components**
- `components/ui/checkbox.tsx`, `components/ui/photo-input.tsx`
- `components/submit/*`: step indicator, running total, card editor, card list, shipping form, summary, `use-autosave.ts`
- `components/orders/*`: orders list, status timeline, next action, order QR, parcel label, submission form, print button
- `components/layout/site-header.tsx`, `site-footer.tsx`: `print:hidden`

**Routes (`app/`)**
- `[locale]/submit/{page.tsx,shipping/page.tsx,summary/page.tsx,actions.ts}`
- `[locale]/account/page.tsx`: becomes the orders overview
- `[locale]/account/orders/[reference]/{page.tsx,actions.ts}`, `…/pay/{page.tsx,actions.ts}`, `…/label/page.tsx`, `…/form/page.tsx`
- `[locale]/o/[reference]/page.tsx`: the printed URL
- `[locale]/account/settings/actions.ts`: `deleteAccount` uses `prepare_account_deletion`
- `api/photos/[id]/route.ts`, `api/jobs/maintenance/route.ts`

**Other files**
- `next.config.ts`, `.env.example`, `messages/en.json`, `package.json`, `.gitignore`
- `lib/supabase/admin.ts` (comment), `lib/supabase/admin-import-guard.test.ts` (allowlist), `lib/supabase/database.types.ts`
- `app/[locale]/design/_sections/*` (new primitives)
- `CLAUDE.md`, `docs/content-requests.md`, `docs/deployment/SUBMISSION_SETUP.md`, the M2 settings spec, and the spec's status line

---

### Task 1: The catalog — statuses, transitions and prices as data

**Files:**
- Create: `supabase/migrations/<ts>_order_catalog.sql` (`npm run db:new order_catalog`)
- Create: `supabase/tests/070-order-catalog.sql`
- Modify: `.gitignore` (add `.superpowers/`)
- Regenerate: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces these tables, all in `public`, readable by `authenticated`, with no write grants:

  | Table | Columns |
  |---|---|
  | `order_statuses` | `key text pk`, `position int` |
  | `order_transitions` | `from_status text null → order_statuses`, `to_status text → order_statuses`, `actor text check (actor in ('customer','system','staff'))`, unique `(from_status, to_status)` |
  | `services` | `key text pk`, `position int`, `requires_signed bool not null default false`, `active bool not null default true` |
  | `tiers` | `key text pk`, `service text → services`, `position int`, `turnaround_days int check > 0`, `active bool default true` |
  | `tier_prices` | `tier_key → tiers`, `currency char(3)`, `amount_cents bigint check >= 0`, `max_declared_value_cents bigint null check > 0`, pk `(tier_key, currency)` |
  | `add_ons` | `key text pk`, `position int`, `active bool default true` |
  | `add_on_services` | `add_on_key → add_ons`, `service → services`, pk `(add_on_key, service)` |
  | `add_on_prices` | `add_on_key`, `currency`, `amount_cents`, pk `(add_on_key, currency)` |
  | `card_fees` | `key text pk` |
  | `card_fee_prices` | `fee_key → card_fees`, `currency`, `amount_cents bigint check >= 0`, pk `(fee_key, currency)` |
  | `shipping_zones` | `key text pk`, `position int` |
  | `shipping_zone_countries` | `country_code char(2) pk check (country_code ~ '^[A-Z]{2}$')`, `zone_key → shipping_zones` |
  | `shipping_zone_prices` | `zone_key`, `currency`, `inbound_cents`, `return_cents`, pk `(zone_key, currency)` |

- Placeholder rows, all EUR:
  - services `grading` (position 0), `autograph` (1, requires signed), `dual` (2, requires signed) and `authentication` (3);
  - tiers `grading_standard` (€1.00, 30 days), `grading_express` (€2.00, 10 days, cap €1,000), `autograph_standard` (€1.00, 30 days), `dual_standard` (€1.50, 30 days) and `authentication_standard` (€1.00, 15 days);
  - add-on `digital_grade` (€0.50), applying to `grading` and `dual`;
  - card fee `identification` (€2.00, the figure the client named on 2026-10-28);
  - zone `placeholder_eu` covering `HU`, `AT`, `DE` and `SK`, with inbound €0.10 and return €0.20.

  The comment above the inserts says these are placeholders until the client's price list arrives, per `docs/content-requests.md`.

- [ ] **Step 1: Create the branch**

```bash
git fetch origin && git switch -c feature/submission-flow origin/main
```

- [ ] **Step 2: Write the failing pgTAP test** `supabase/tests/070-order-catalog.sql` with `plan(9)`. It asserts:

```sql
select results_eq(
  'select key from public.order_statuses order by position',
  $$values ('draft'),('awaiting_payment'),('paid'),('received'),('grading'),
           ('graded'),('shipped_back'),('completed'),('cancelled')$$,
  'the nine statuses, in journey order');
select results_eq(
  $$select coalesce(from_status,'∅'), to_status, actor from public.order_transitions order by 1,2$$,
  $$values ('awaiting_payment','cancelled','customer'),('awaiting_payment','paid','system'),
           ('draft','awaiting_payment','customer'),('draft','cancelled','customer'),
           ('∅','draft','customer')$$,
  'exactly the M3 transitions');
-- as an authenticated user:
select isnt_empty('select 1 from public.tiers', 'signed-in users read tiers');
select results_eq('select key from public.services where requires_signed order by position',
  $$values ('autograph'),('dual')$$, 'autograph services need a signed card');
select throws_ok($$insert into public.tiers (key, service, position, turnaround_days) values ('x','grading',9,1)$$,
  '42501', null, 'nobody writes the catalog through the Data API');
select throws_ok($$update public.card_fee_prices set amount_cents = 0$$, '42501', null, 'nor its prices');
select results_eq($$select service from public.add_on_services where add_on_key = 'digital_grade' order by 1$$,
  $$values ('dual'),('grading')$$, 'digital grade applies to graded services only');
select is((select amount_cents from public.card_fee_prices where fee_key = 'identification' and currency = 'EUR'),
  200::bigint, 'the identification fee is seeded');
-- as anon:
select throws_ok('select 1 from public.tiers', '42501', null, 'anon reads nothing');
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run db:test`
Expected: FAIL in `070-order-catalog.sql`, because `relation "public.order_statuses" does not exist`.

- [ ] **Step 4: Write the migration.** Follow the house style of `20260901073552_auth_foundation.sql`: section rulers and a comment explaining why each non-obvious choice was made.
  - Statuses and services are tables, not enums, for the same reason `permissions` is.
  - Revoke everything from `anon`. Grant `select` to `authenticated`, with one `select … using (true)` policy per table.
  - Index the foreign keys that don't lead an index: `order_transitions.to_status`, `tiers.service`, `add_on_services.service` and `shipping_zone_countries.zone_key`.

- [ ] **Step 5: Reset, test and regenerate**

Run: `npm run db:reset && npm run db:test && npm run db:types`
Expected: every pgTAP file passes, and `database.types.ts` gains the new tables.

- [ ] **Step 6: Commit:** `feat: add the order catalog — statuses, services, tiers, add-ons, fees, zones`

---

### Task 2: Orders schema and RLS

**Files:**
- Create: `supabase/migrations/<ts>_orders.sql`
- Create: `supabase/tests/080-orders-rls.sql`
- Modify: `supabase/tests/030-rls-profiles.sql` only if its "every table has RLS" count needs nothing new. It shouldn't, because every new table enables RLS.
- Regenerate: `lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: the Task 1 tables.
- Produces these tables, all in `public`. Every column is nullable in the draft unless stated otherwise.

  **`orders`**
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid null references auth.users on delete set null`
  - `reference text unique not null` (default set in Task 3)
  - `status text not null default 'draft' references order_statuses`
  - `currency char(3) not null default 'EUR'`
  - `shipping_method text check in ('postal','in_person')`
  - `contact_first_name`, `contact_last_name`, `contact_phone`
  - `address_country char(2)`, `address_postcode`, `address_city`, `address_line`
  - `inbound_insurance_confirmed bool not null default false`, `inbound_insurance_confirmed_at timestamptz`
  - `terms_accepted_at timestamptz`, `terms_version text`
  - `subtotal_cents`, `inbound_cents`, `return_cents`, `total_cents`, `declared_value_total_cents` (all `bigint`)
  - `turnaround_days int`, `submitted_at timestamptz`, `created_at`, `updated_at`

  **`order_cards`**
  - `id uuid pk`, which the **client supplies** and Postgres defaults
  - `order_id uuid not null references orders on delete cascade`
  - `position int not null`
  - `identified_by text not null default 'customer' check in ('customer','art')`
  - `release_year int check between 1880 and 2100`
  - `brand`, `language` (`check (language ~ '^[a-z]{2}$')`), `name`, `set_name`, `card_number`, `surface`
  - `signed bool not null default false`, `numbered bool not null default false`
  - `declared_value_cents bigint check between 1 and 1000000000`
  - `catalog_ref text null`, with a comment saying it is reserved for the card-search change request and is in no grant
  - `service text references services`, `tier_key text references tiers`
  - `price_cents bigint`, `identification_cents bigint`, `created_at`, `updated_at`

  **The other tables**
  - **`order_card_add_ons`:** `card_id uuid references order_cards on delete cascade`, `add_on_key text references add_ons`, `price_cents bigint null`, pk `(card_id, add_on_key)`.
  - **`card_photos`:** `id uuid pk`, `card_id uuid not null references order_cards on delete cascade`, `content_type text not null check in (the three types)`, `byte_size int not null check between 1 and 2097152`, `object_key text generated always as ('card-photos/' || card_id::text || '/' || id::text) stored`, `created_at`.
  - **`order_status_log`:** `id bigint identity pk`, `order_id → orders on delete cascade`, `from_status text null`, `to_status text not null`, `actor text not null`, `actor_user_id uuid null references auth.users on delete set null`, `created_at timestamptz not null default now()`.
  - **`payment_attempts`:** `id uuid pk`, `order_id → orders on delete cascade`, `provider text not null`, `provider_reference text not null`, `outcome text check in ('succeeded','failed')`, `amount_cents bigint not null`, `currency char(3) not null`, `created_at`, unique `(provider, provider_reference)`.
  - **`private.photo_deletions`:** `object_key text pk`, `queued_at timestamptz default now()`.

  **Constraints, triggers and indexes**
  - Length checks match the Global Constraints. `contact_phone` checks `~ '^\+?[0-9 ()-]{6,30}$'`.
  - A partial unique index `orders_one_draft_per_user on orders (user_id) where status = 'draft'`.
  - Triggers:
    - `private.set_updated_at` on `orders` and `order_cards`;
    - `private.touch_order()` after insert, update or delete on `order_cards`, `order_card_add_ons` and `card_photos`, bumping the parent order's `updated_at`;
    - `private.enforce_card_limit()` before insert on `order_cards`, which raises `too_many_cards` once the order already has 50;
    - `private.queue_photo_deletion()` after delete on `card_photos`, which inserts `old.object_key` into `private.photo_deletions` with `on conflict do nothing`.
  - Indexes on `orders.user_id`, `order_cards.order_id`, `order_cards.service`, `order_cards.tier_key`, `order_card_add_ons.add_on_key`, `card_photos.card_id`, `order_status_log.order_id` and `payment_attempts.order_id`.

- **Grants and policies:**
  - Grant `authenticated` `select` on every new public table.
  - On `orders`, grant `insert (shipping_method, contact_first_name, contact_last_name, contact_phone, address_country, address_postcode, address_city, address_line, inbound_insurance_confirmed)` and `update` on the same columns.
  - On `order_cards`, grant `insert (id, order_id, position, identified_by, release_year, brand, language, name, set_name, card_number, surface, signed, numbered, declared_value_cents, service, tier_key)`, `update` on the same columns except `id` and `order_id`, and `delete`. `catalog_ref`, `price_cents` and `identification_cents` stay out.
  - On `order_card_add_ons`, grant `insert (card_id, add_on_key)` and `delete`. On `card_photos`, grant `insert (id, card_id, content_type, byte_size)` and `delete`. Grant no writes on the log or payments.
  - The **`orders` insert policy** checks `user_id = (select auth.uid()) and status = 'draft'`. `user_id` defaults to `auth.uid()`: add `default auth.uid()` and leave it out of the insert grant, so the customer can't choose it.
  - **`orders` update policy:** `using` and `with check` are both `user_id = (select auth.uid()) and status = 'draft'`.
  - **Child tables** use `exists (select 1 from public.orders o where o.id = … and o.user_id = (select auth.uid()))` for `select`, and the same plus `o.status = 'draft'` for `insert`, `update` and `delete`.
  - `order_status_log` and `payment_attempts` get `select` on the customer's own orders only.

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/080-orders-rls.sql`. Use two users, alice and bob, set up as the existing files do, and `plan(14)`. It asserts:

```sql
-- alice inserts a draft; user_id comes from auth.uid(), not from her
select lives_ok($$insert into public.orders default values$$, 'a customer opens a draft');
select is((select user_id from public.orders), :'alice_id'::uuid, 'owned by the caller');
select throws_ok($$insert into public.orders default values$$, '23505', null, 'one draft per customer');
select throws_ok($$update public.orders set status = 'paid'$$, '42501', null, 'status is not writable');
select throws_ok($$update public.orders set total_cents = 1$$, '42501', null, 'prices are not writable');
select lives_ok($$insert into public.order_cards (order_id, position, name) select id, 0, 'Test card' from public.orders$$,
  'cards go into her own draft');
select is((select identified_by from public.order_cards), 'customer', 'a card defaults to customer-identified');
select throws_ok($$update public.order_cards set identification_cents = 0$$, '42501', null, 'the identification fee is not writable');
select throws_ok($$update public.order_cards set catalog_ref = 'x'$$, '42501', null, 'nor the reserved catalogue reference');
-- bob
select is_empty('select 1 from public.orders', 'another customer sees no orders');
select is_empty('select 1 from public.order_cards', 'nor their cards');
select throws_ok(format($$insert into public.order_cards (order_id, position) values (%L, 1)$$, :'alice_order'),
  '42501', null, 'nor writes into them');
-- as postgres, flip alice's order to awaiting_payment, then as alice:
select is((with u as (update public.order_cards set name = 'x' returning 1) select count(*)::int from u), 0,
  'a submitted order is immutable to its owner');
select is((select object_key from public.card_photos limit 1) ~ '^card-photos/[0-9a-f-]{36}/[0-9a-f-]{36}$', true,
  'a photo key is derived from its own ids');
```

The last assertion needs a photo row inserted while the order was still a draft. Do that before the flip.

- [ ] **Step 2:** Run `npm run db:test`. Expected: it fails because the tables are missing.
- [ ] **Step 3:** Write the migration as specified in *Interfaces*.
- [ ] **Step 4:** Run `npm run db:reset && npm run db:test && npm run db:types`. Expected: all tests pass.
- [ ] **Step 5: Commit:** `feat: add orders, cards, photos and their RLS`

---

### Task 3: Transitions, pricing, submit and cancel in SQL

**Files:**
- Create: `supabase/migrations/<ts>_order_functions.sql`
- Create: `supabase/tests/090-order-functions.sql`
- Regenerate: `lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - **`private.new_order_reference() returns text`**: `'AG-'` plus 8 Crockford base32 characters from `extensions.gen_random_bytes(5)`, looping until the value is unused. Set as the default on `orders.reference`.
  - **`private.transition_order(p_order_id uuid, p_to text, p_actor text, p_actor_user_id uuid) returns void`**: `security definer`, `set search_path = ''`. It locks the order row `for update`, raises `transition_not_allowed` unless `order_transitions` has `(current status, p_to, p_actor)`, updates the status, and appends to `order_status_log`. **This is the only statement in the codebase that writes `orders.status`.**
  - An insert trigger on `orders` writes the `(null → draft, customer)` log row.
  - **`private.price_order(p_order_id uuid) returns jsonb`**: `security definer`. It applies the spec's pricing rules and returns:

    ```
    {currency, cards:[{card_id, price_cents, identification_cents, add_ons:[{key, price_cents}]}],
     subtotal_cents, inbound_cents, return_cents, total_cents,
     declared_value_total_cents, turnaround_days}
    ```

    Rules:
    - A card's price is the sum of three things:
      - the active tier's price for the order's currency;
      - each attached add-on that is active, applies to the card's service, and is priced in that currency;
      - when `identified_by = 'art'`, the `identification` card fee, which is also returned separately as `identification_cents` (otherwise that is 0).
    - It raises:
      - `service_unavailable` when the service is missing or inactive, or requires signed on an unsigned card;
      - `tier_unavailable` when the tier is missing or inactive, belongs to another service, or has no price in this currency;
      - `add_on_unavailable`, `declared_value_over_cap` and `country_unsupported`.
    - In-person orders have both fees at 0.
    - `turnaround_days` is the maximum across the tiers.
  - **`public.quote_order() returns jsonb`**: `security definer`. It finds the caller's draft (`user_id = auth.uid() and status = 'draft'`), raises `not_found` if there is none, and returns `private.price_order`.
  - **`public.submit_order(p_terms_version text) returns text`**, returning the reference. `security definer`. It finds the caller's draft by `user_id = auth.uid()`, and if there is none, raises `not_draft` when the caller has an order already awaiting payment and `not_found` otherwise. It then:
    1. validates completeness, raising `incomplete` when:
       - there are no cards;
       - a card lacks `declared_value_cents`, `service` or `tier_key`;
       - a card with `identified_by = 'customer'` lacks any identification field;
       - `release_year > extract(year from now()) + 1`, where set;
       - there is no shipping method, contact details are missing, or a postal address is missing;
       - a postal order lacks `inbound_insurance_confirmed`;
    2. calls `price_order` and stores its prices on the order, cards (`price_cents`, `identification_cents`) and add-on links;
    3. stamps `submitted_at`, `terms_accepted_at`, `terms_version` and `inbound_insurance_confirmed_at` (postal only);
    4. writes `contact_first_name` / `contact_last_name` into `profiles` where those are null;
    5. calls `transition_order(…, 'awaiting_payment', 'customer', auth.uid())`.
  - **`public.cancel_order(p_reference text) returns void`**: `security definer`, owner only. It raises `not_found` if the order isn't the caller's, then calls `transition_order(…, 'cancelled', 'customer', auth.uid())`.
  - Every error is `raise exception '<code>' using errcode = 'P0001'`, where `<code>` is one of `not_found`, `not_draft`, `incomplete`, `service_unavailable`, `tier_unavailable`, `add_on_unavailable`, `declared_value_over_cap`, `country_unsupported`, `too_many_cards` or `transition_not_allowed`.
  - Revoke `execute` on the `private.*` functions from `public`. Grant `quote_order`, `submit_order` and `cancel_order` to `authenticated` only, and revoke them from `anon`.

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/090-order-functions.sql`. Build alice's complete postal draft in `HU` with two cards:
  - **A** is customer-identified with every identification field, on `grading_standard` with `digital_grade`, declared at €400;
  - **B** has `identified_by = 'art'` and no identification fields, on `authentication_standard`, declared at €900.

  Then assert the following. Each temporary third card is complete, so that pricing rather than the completeness check is what refuses it:

```sql
select matches((select reference from public.orders limit 1), '^AG-[0-9A-HJKMNP-TV-Z]{8}$', 'readable reference');
select is((public.quote_order())->>'total_cents', '480', '100+50 + 100+200 identification + 10 inbound + 20 return');
select is((public.quote_order())->>'turnaround_days', '30', 'the longest tier wins');
-- as postgres: deactivate grading_standard; as alice:
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'tier_unavailable', 'a deactivated tier refuses submit');
-- reactivate; add a third card on grading_express declared at €1,500:
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'declared_value_over_cap', 'the tier cap holds');
-- remove it; add a third, unsigned card on dual_standard:
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'service_unavailable', 'dual needs a signed card');
-- remove it; attach digital_grade to card B:
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'add_on_unavailable', 'add-ons follow the service');
-- remove it; set card A's brand to null:
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'incomplete', 'a customer-identified card needs every field');
-- restore it; set address_country = 'US':
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'country_unsupported', 'only zoned countries');
-- restore HU; set inbound_insurance_confirmed = false:
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'incomplete', 'postal needs the acknowledgement');
-- restore it:
select matches(public.submit_order('v1'), '^AG-', 'submit returns the reference');
select is((select status from public.orders), 'awaiting_payment', 'submitted');
select results_eq('select price_cents, identification_cents from public.order_cards order by position',
  $$values (150::bigint, 0::bigint), (300::bigint, 200::bigint)$$, 'card prices and the fee stored');
select is((select price_cents from public.order_card_add_ons), 50::bigint, 'add-on price stored');
select isnt((select terms_accepted_at from public.orders), null, 'terms stamped by the server');
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'not_draft', 'a second submit is refused, not duplicated');
select is((select count(*)::int from public.order_status_log), 2, 'one log row per transition');
select throws_ok(format('select public.cancel_order(%L)', :'alice_ref'), 'P0001', null,
  'bob cannot cancel alice''s order');  -- run as bob; expects not_found
```

Also cover, in the same file: after submit, the profile names are filled when null and kept when set. Bump `plan()` to match the final count.

- [ ] **Step 2:** Run `npm run db:test`. Expected: it fails because the functions are missing.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run `npm run db:reset && npm run db:test && npm run db:types`. Expected: all tests pass.
- [ ] **Step 5: Commit:** `feat: price, submit and cancel orders through one transition function`

---

### Task 4: System functions — payment, expiry, photo queue, deletion

**Files:**
- Create: `supabase/migrations/<ts>_order_system_functions.sql`
- Create: `supabase/tests/100-order-system-functions.sql`
- Regenerate: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces these functions. All are `security definer`, with `execute` **granted to `service_role` only** and revoked from `public`, `anon` and `authenticated`, except `prepare_account_deletion`.

  | Function | Returns | Behaviour |
  |---|---|---|
  | `public.record_payment_success(p_order_id uuid, p_provider text, p_provider_reference text, p_amount_cents bigint, p_currency text)` | `'recorded' \| 'duplicate' \| 'rejected'` | `duplicate` if `(provider, reference)` exists. `rejected` (and no row) if the order isn't `awaiting_payment`, or the amount or currency differs from the order's totals. Otherwise it inserts a succeeded attempt and calls `transition_order(…, 'paid', 'system', null)`. |
  | `public.record_payment_failure(same arguments)` | `void` | Inserts a failed attempt, `on conflict do nothing`. |
  | `public.expire_stale_drafts()` | `int` | Deletes drafts whose `updated_at < now() - interval '30 days'` and returns the count. |
  | `public.list_photo_deletions(p_limit int)` | `setof text` | |
  | `public.complete_photo_deletions(p_keys text[])` | `void` | |
  | `public.prepare_account_deletion()` | `'ok' \| 'orders_in_progress'` | Granted to `authenticated`. Runs as the caller (`auth.uid()`). Returns `'orders_in_progress'` if an own order is in `paid`, `received`, `grading`, `graded` or `shipped_back`. Otherwise it deletes own orders that are `draft`, `awaiting_payment`, or `cancelled` without a succeeded payment attempt; nulls the contact and address columns on the rest; and returns `'ok'`. |

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/100-order-system-functions.sql` with `plan(11)`. Set up a submitted order built like Task 3's (total 480), since each pgTAP file runs on its own. It asserts:

```sql
-- as alice:
select throws_ok($$select public.record_payment_success(:'order', 'fake', 'fake_x', 480, 'EUR')$$, '42501', null,
  'a customer cannot mark an order paid');
select throws_ok('select public.expire_stale_drafts()', '42501', null, 'nor run the expiry');
-- as service_role (set role service_role):
select is(public.record_payment_success(:'order','fake','fake_1',999,'EUR'), 'rejected', 'wrong amount is rejected');
select is(public.record_payment_success(:'order','fake','fake_1',480,'EUR'), 'recorded', 'paid');
select is(public.record_payment_success(:'order','fake','fake_1',480,'EUR'), 'duplicate', 'idempotent by reference');
select is(public.record_payment_success(:'order','fake','fake_2',480,'EUR'), 'rejected', 'a paid order takes no second payment');
select is((select count(*)::int from public.order_status_log where to_status = 'paid'), 1, 'one paid transition');
-- a draft with updated_at backdated 31 days and one photo:
select is(public.expire_stale_drafts(), 1, 'the stale draft expires');
select is((select count(*)::int from public.list_photo_deletions(10)), 1, 'its photo is queued for R2');
-- as alice, who now has a paid order:
select is(public.prepare_account_deletion(), 'orders_in_progress', 'deletion waits for paid orders');
-- as bob with one draft:
select is(public.prepare_account_deletion(), 'ok', 'drafts are no obstacle and are removed');
```

- [ ] **Step 2:** Run `npm run db:test`. Expected: it fails.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run `npm run db:reset && npm run db:test && npm run db:types`. Expected: all tests pass.
- [ ] **Step 5: Commit:** `feat: add payment, expiry and deletion functions for system callers`

---

### Task 5: Domain library — money, statuses, rules and the pricing mirror

**Files:**
- Create: `lib/money.ts` + `lib/money.test.ts`
- Create: `lib/orders/status.ts`, `lib/orders/types.ts`, `lib/orders/reference.ts`, `lib/orders/card-rules.ts`, `lib/orders/shipping-rules.ts`, `lib/orders/pricing.ts`, `lib/orders/catalog.ts`, `lib/orders/errors.ts`, `lib/orders/terms.ts`, `lib/orders/fixtures.ts`, each with a colocated test where there is logic

**Interfaces:**
- **`lib/money.ts`:**
  - `DEFAULT_CURRENCY = "EUR"`
  - `parseMoney(input: string): number | null`, which returns cents or null. It strips whitespace and currency symbols. When both `.` and `,` appear, the last one is the decimal separator. A lone separator followed by exactly 3 digits is a thousands separator unless it's `.` with 1–2 digits. It rejects ≤ 0, non-numeric input, exponent notation, and anything over `DECLARED_VALUE_MAX_CENTS`.
- **`lib/orders/status.ts`:**
  - `ORDER_STATUSES` (the nine, as `const`) and `type OrderStatus`
  - `JOURNEY: OrderStatus[]`, which is the nine minus `draft` and `cancelled`, in order
  - `DELETION_BLOCKING: OrderStatus[]`, which is `paid`, `received`, `grading`, `graded` and `shipped_back`
- **`lib/orders/reference.ts`:** `ORDER_REFERENCE_PATTERN` and `orderPath(reference: string): string`, which returns `/o/${reference}`.
- **`lib/orders/types.ts`:**
  - `IdentifiedBy = "customer" | "art"`, `ShippingMethod = "postal" | "in_person"`. Service keys are plain `string`s, because services are data.
  - `DraftCard = { id; position; identifiedBy: IdentifiedBy; releaseYear; brand; language; name; setName; cardNumber; surface; signed; numbered; declaredValueCents; service; tierKey; addOnKeys: string[]; photo: { id: string } | null }`, where the nullable fields are `| null`
  - `DraftShipping = { method; firstName; lastName; phone; country; postcode; city; addressLine; inboundInsuranceConfirmed: boolean }`
  - `Draft = { reference: string; currency: string; cards: DraftCard[]; shipping: DraftShipping }`
  - `Catalog = { currency; services: { key; position; requiresSigned: boolean }[]; tiers: { key; service; position; turnaroundDays; amountCents; maxDeclaredValueCents: number | null }[]; addOns: { key; position; services: string[]; amountCents }[]; identificationCents: number; zones: { key; countries: string[]; inboundCents; returnCents }[] }`
  - `Quote = { currency; cards: { cardId; priceCents: number | null; identificationCents: number }[]; subtotalCents; inboundCents; returnCents; totalCents; declaredValueTotalCents; turnaroundDays: number | null }`
- **`lib/orders/card-rules.ts`:**
  - the constants from Global Constraints, including `CARD_LANGUAGES`
  - `IDENTIFICATION_FIELDS = ["releaseYear", "brand", "language", "name", "setName", "cardNumber"] as const`
  - `type CardProblem = "yearMissing" | "yearOutOfRange" | "brandMissing" | "languageMissing" | "nameMissing" | "setMissing" | "cardNumberMissing" | "valueMissing" | "serviceMissing" | "serviceNeedsSigned" | "tierMissing" | "overCap"`
  - `cardProblems(card: DraftCard, catalog: Catalog, now?: Date): CardProblem[]`. The `…Missing` problems for identification fields apply only when `identifiedBy === "customer"`. `yearOutOfRange` applies whenever a year is set.
  - `availableServices(signed: boolean, catalog: Catalog): Catalog["services"]`
  - `applicableAddOns(service: string | null, catalog: Catalog): Catalog["addOns"]`
  - `availableTiers(service: string | null, declaredValueCents: number | null, catalog: Catalog): Catalog["tiers"]`
  - `normalizeCard(card: DraftCard, catalog: Catalog): DraftCard`: clears `service` and `tierKey` when the service isn't in `availableServices(card.signed)`, clears `tierKey` when it isn't offered for the service, and filters `addOnKeys` to `applicableAddOns`. The editor and `saveCard` both apply it.
- **`lib/orders/shipping-rules.ts`:**
  - the constants from Global Constraints
  - `type ShippingProblem = "methodMissing" | "firstNameMissing" | "lastNameMissing" | "phoneInvalid" | "countryUnsupported" | "postcodeMissing" | "cityMissing" | "addressMissing" | "insuranceUnconfirmed"`
  - `shippingProblems(shipping: DraftShipping, catalog: Catalog): ShippingProblem[]`. For `in_person` it checks only the method, names and phone.
- **`lib/orders/pricing.ts`:** `quoteDraft(draft: Draft, catalog: Catalog): Quote`. It mirrors `private.price_order`, but is tolerant:
  - An incomplete card gets `priceCents: null` and contributes 0, except for its identification fee. The fee shows as soon as the customer chooses "ART identifies it".
  - In-person fees are 0, and so are fees while no country is set.
- **`lib/orders/catalog.ts`:** `loadCatalog(supabase: SupabaseClient<Database>, currency = DEFAULT_CURRENCY): Promise<Catalog>`. It selects the active rows priced in `currency`, ordered by `position`.
- **`lib/orders/errors.ts`:**
  - `type OrderErrorKey = "notFound" | "notDraft" | "incomplete" | "serviceUnavailable" | "tierUnavailable" | "addOnUnavailable" | "overCap" | "countryUnsupported" | "tooManyCards" | "cardGone" | "photoTooLarge" | "photoType" | "photoLimit" | "termsRequired" | "generic"`
  - `orderErrorKey(error: { code?: string; message?: string } | null): OrderErrorKey`, which maps a `P0001` message by exact match onto the camelCase key, and anything else to `generic`
  - `type OrderFlow = "saveCard" | "removeCard" | "saveShipping" | "uploadPhoto" | "removePhoto" | "submitOrder" | "cancelOrder" | "payTest" | "recordPayment" | "maintenance"`
  - `reportOrderError(flow: OrderFlow, code: string): void`, which calls `Sentry.captureException(new Error(\`Order error in ${flow}\`), { tags: { "order.flow": flow, "order.code": code } })`
  - `type SaveResult<T> = { ok: true; data: T } | { ok: false; errorKey: OrderErrorKey }`
  - Copy for every `OrderErrorKey` lives under `submit.errors.*`.
- **`lib/orders/terms.ts`:** `TERMS_VERSION = "placeholder-2026-10"`, with a comment saying it changes when the lawyer's ToS lands.
- **`lib/orders/fixtures.ts`:** `CATALOG` mirrors Task 1's placeholder rows, and `REFERENCE_DRAFT` mirrors Task 3's draft (cards A and B). Both TypeScript and SQL pricing are checked against the same numbers.

- [ ] **Step 1: Write the failing tests.** These are the key assertions; add the obvious per-rule cases beside them.

```ts
// lib/money.test.ts
test.each([["400", 40000], ["400.5", 40050], ["1.234,56", 123456], ["1,234.56", 123456], ["€ 400", 40000]])(
  "parses %j", (input, cents) => expect(parseMoney(input)).toBe(cents));
test.each(["-5", "0", "1e9", "abc", "", "10000000.01"])("rejects %j", (input) => expect(parseMoney(input)).toBeNull());

// lib/orders/pricing.test.ts
test("matches the SQL pricing for the reference order", () => {
  expect(quoteDraft(REFERENCE_DRAFT, CATALOG)).toMatchObject({ subtotalCents: 450, inboundCents: 10, returnCents: 20, totalCents: 480, turnaroundDays: 30 });
});
test("an ART-identified card carries the identification fee", () => { /* card B → identificationCents 200, priceCents 300 */ });
test("the fee shows before the card is complete", () => { /* identifiedBy art, tierKey null → priceCents null, identificationCents 200, subtotal 200 */ });
test("ignores an add-on that does not apply to the card's service", () => { /* digital_grade on authentication → 100 */ });
test("in-person orders carry no fees", () => { /* method in_person → 0/0 */ });

// lib/orders/card-rules.test.ts
test("a customer-identified card needs every identification field", () => { /* brand null → brandMissing */ });
test("an ART-identified card needs only value, service and tier", () => { /* all identification fields null → [] */ });
test("autograph and dual are offered only on signed cards", () => {
  expect(availableServices(false, CATALOG).map((s) => s.key)).toEqual(["grading", "authentication"]);
  expect(availableServices(true, CATALOG).map((s) => s.key)).toEqual(["grading", "autograph", "dual", "authentication"]);
});
test("normalizeCard clears dual and its add-ons when signed is unticked", () => {}); // Review Focus 2
test("a card above every tier cap reports overCap", () => {});
test("release year next year is allowed, the year after is not", () => { /* now = 2026-10-28 → 2027 ok, 2028 yearOutOfRange */ });

// lib/orders/shipping-rules.test.ts
test("in-person needs only names and phone", () => {});
test("postal needs the insurance acknowledgement", () => {});
test("a country outside every zone is countryUnsupported", () => {});

// lib/orders/errors.test.ts
test.each([["service_unavailable", "serviceUnavailable"], ["declared_value_over_cap", "overCap"], ["something else", "generic"]])(
  "maps %s", (message, key) => expect(orderErrorKey({ code: "P0001", message })).toBe(key));
test("never maps a non-P0001 error by message", () => expect(orderErrorKey({ code: "42501", message: "incomplete" })).toBe("generic"));

// lib/orders/reference.test.ts
test("orderPath is the short printed path", () => expect(orderPath("AG-0123ABCD")).toBe("/o/AG-0123ABCD"));
```

- [ ] **Step 2:** Run `npm test -- lib/money lib/orders`. Expected: FAIL, because the modules don't exist yet.
- [ ] **Step 3:** Implement the modules to the interfaces above, and add `submit.errors.*` to `messages/en.json`.
- [ ] **Step 4:** Run `npm test -- lib/money lib/orders`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: add the order domain library — money, rules, pricing mirror, errors`

---

### Task 6: R2 storage and the photo route

**Files:**
- Modify: `package.json` (`npm install @aws-sdk/client-s3`)
- Create: `lib/storage/env.ts`, `lib/storage/r2.ts` + `lib/storage/r2.test.ts`
- Create: `lib/photos/limits.ts`, `lib/photos/sniff.ts` + `lib/photos/sniff.test.ts`
- Create: `app/api/photos/[id]/route.ts` + `route.test.ts`
- Modify: `supabase/config.toml` (bucket), `next.config.ts` (`experimental.serverActions.bodySizeLimit: "3mb"`, read the docs at `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`), `.env.example`

**Interfaces:**
- **`lib/storage/env.ts`:** `r2Env(): { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; bucket: string; forcePathStyle: boolean }`.
  - It reads `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and the new optional `R2_ENDPOINT` and `R2_REGION`.
  - `endpoint` defaults to `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, and `region` to `"auto"`.
  - `forcePathStyle` is true when `R2_ENDPOINT` is set.
  - It throws naming the missing variable. It's runtime only: no `NEXT_PUBLIC_`, and it isn't added to the Dockerfile.
- **`lib/storage/r2.ts`** (`import "server-only"`):
  - `putObject(key: string, body: Uint8Array, contentType: string): Promise<void>`
  - `getObject(key: string): Promise<{ body: ReadableStream; contentType: string } | null>`, returning null on `NoSuchKey`
  - `deleteObjects(keys: string[]): Promise<void>`, batching up to 1000 keys per `DeleteObjectsCommand`
  - One `S3Client`, created lazily per process.
- **`lib/photos/limits.ts`:** `MAX_PHOTOS_PER_CARD`, `PHOTO_INPUT_MAX_BYTES`, `PHOTO_MAX_BYTES`, `PHOTO_MAX_EDGE`, and `PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const`.
- **`lib/photos/sniff.ts`:** `sniffImageType(bytes: Uint8Array): (typeof PHOTO_TYPES)[number] | null`. JPEG is `FF D8 FF`, PNG is `89 50 4E 47 0D 0A 1A 0A`, and WebP is `RIFF` at offset 0 plus `WEBP` at offset 8.
- **`GET /api/photos/[id]`:**
  1. Reads `card_photos` with the session client: `select object_key, content_type where id = params.id`. With no row, RLS has hidden it, so return `404`.
  2. Calls `getObject`. If it returns null, return 404.
  3. Streams the body with `Content-Type`, `Cache-Control: private, max-age=300` and `X-Content-Type-Options: nosniff`.
- **Locally**, the stand-in is Supabase Storage's S3 endpoint. In `config.toml`, add `[storage.buckets.card-photos]` with `public = false`, `file_size_limit = "2MiB"` and `allowed_mime_types` set to the three types. `.env.example` documents the local values from `supabase status -o env`:
  - `R2_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3`
  - `R2_REGION=local`
  - `R2_BUCKET_NAME=card-photos`
  - `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` set from `S3_PROTOCOL_ACCESS_KEY_ID` / `S3_PROTOCOL_ACCESS_KEY_SECRET`

- [ ] **Step 1: Write the failing tests:**

```ts
// lib/photos/sniff.test.ts
test("recognises jpeg, png and webp by their magic bytes", () => { /* three fixtures */ });
test("a png renamed .jpg is still png; a text file is null", () => {});

// lib/storage/r2.test.ts — mock @aws-sdk/client-s3's S3Client.send
test("deleteObjects batches 2500 keys into three requests", () => {});
test("getObject returns null for NoSuchKey", () => {});
test("r2Env names the missing variable", () => {});

// app/api/photos/[id]/route.test.ts — mock the session client and r2
test("a photo the caller cannot see is 404, and R2 is never asked", () => {});
test("serves the object privately with nosniff", () => { /* headers asserted */ });
```

- [ ] **Step 2:** Run `npm test -- lib/photos lib/storage app/api/photos`. Expected: FAIL.
- [ ] **Step 3:** Install `@aws-sdk/client-s3`, implement, and edit the config files.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `npm run db:stop && npm run db:start`, open Studio's Storage page, and confirm the `card-photos` bucket exists and is private.
- [ ] **Step 5: Commit:** `feat: wire R2 photo storage with a local Supabase S3 stand-in`

---

### Task 7: Form primitives — Checkbox and PhotoInput

**Files:**
- Create: `components/ui/checkbox.tsx` + test, `components/ui/photo-input.tsx` + test
- Create: `lib/photos/compress.ts` + test
- Modify: the `/design` gallery (`app/[locale]/design/_sections/`), adding both primitives

**Interfaces:**
- **`Checkbox({ checked, onCheckedChange, label, description?, disabled? })`**: Base UI `Checkbox` with a visible label, controlled, and **no default-checked prop**. The component has no `defaultChecked`, so a pre-ticked add-on can't be written by accident.
- **`fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number }`**: the arithmetic only, which is what gets unit-tested.
- **`compressPhoto(file: File): Promise<Blob>`**: `createImageBitmap`, then a canvas at `fitWithin(…, PHOTO_MAX_EDGE)`, then `toBlob("image/webp", 0.85)`, falling back to `"image/jpeg"` when the WebP blob comes back null or isn't `image/webp`. It throws `"photoTooLarge"` before any work when `file.size > PHOTO_INPUT_MAX_BYTES`.
- **`PhotoInput({ previewUrl, disabled, busy, onSelect: (file: File) => void, onRemove: () => void, label })`**: a styled file input (`accept="image/jpeg,image/png,image/webp"`) with a preview image and a remove button. It does no uploading itself.

- [ ] **Step 1: Write the failing tests:**

```ts
test("fitWithin keeps aspect and caps the longest edge", () => {
  expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
});
test("compressPhoto refuses input over 20 MB before decoding", async () => { /* createImageBitmap spy not called */ });
test("Checkbox starts unchecked when checked is false and reports toggles", async () => {});
test("PhotoInput is disabled while disabled is true", () => {});
test("PhotoInput shows the preview and a remove control when previewUrl is set", () => {});
```

- [ ] **Step 2:** Run `npm test -- components/ui lib/photos`. Expected: FAIL.
- [ ] **Step 3:** Implement the primitives and add them to the gallery. Record in the commit body that Base UI was re-evaluated per `CLAUDE.md`: the native `<select>` from `FieldSelect` stays, for mobile pickers and simplicity, and Base UI supplies `Checkbox`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: add Checkbox and PhotoInput primitives`

---

### Task 8: Draft actions — cards, shipping, photos

**Files:**
- Create: `lib/orders/load-draft.ts` + test
- Create: `app/[locale]/submit/actions.ts` + `actions.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 5 and 6.
- **`loadDraft(supabase): Promise<Draft | null>`**: one select of `orders` (status `draft`) with nested `order_cards(…, order_card_add_ons(add_on_key), card_photos(id))`, mapped to `Draft` and ordered by `position`.
- **`loadPrefill(supabase, userId): Promise<Partial<DraftShipping>>`**: the contact and address from the most recent order with `submitted_at` not null, otherwise the names from `profiles`.
- **Actions.** All are `"use server"`, take `locale` first, and return `SaveResult`:
  - `saveCard(locale: string, card: DraftCardInput): Promise<SaveResult<{ reference: string }>>`, where `DraftCardInput` is `DraftCard` without `photo`, plus `persisted: boolean` (true once an earlier save of this card has landed).
    - It validates types and limits, not completeness: a `language` outside `CARD_LANGUAGES` is refused as `generic` without calling Supabase.
    - It applies `normalizeCard` with the loaded catalog before writing, so an unsigned card never stores an autograph service.
    - If there's no draft, it inserts one (on a `23505` race, it reselects).
    - When `persisted` is true, it **only updates**. An update that matches nothing means another tab removed the card or submitted the draft, so it returns `{ ok: false, errorKey: "cardGone" }` and never re-inserts, so a removed card is never resurrected.
    - When `persisted` is false, it inserts. A `23505` or `42501` on that insert also returns `cardGone`.
    - It then replaces the card's add-on links with the normalized `addOnKeys`.
  - `removeCard(locale, cardId: string): Promise<SaveResult<null>>`
  - `saveShipping(locale, shipping: DraftShipping): Promise<SaveResult<null>>`, which updates only the draft's shipping columns.
  - `uploadPhoto(locale, formData: FormData /* cardId, file */): Promise<SaveResult<{ photoId: string }>>`:
    1. reads the bytes;
    2. refuses with `photoTooLarge` over `PHOTO_MAX_BYTES`, `photoType` when `sniffImageType` is null, and `photoLimit` when the card already has a photo;
    3. inserts the `card_photos` row through the session client (RLS proves draft ownership; a failure returns `cardGone`);
    4. calls `putObject(row.object_key, bytes, sniffedType)`;
    5. **if the put throws**, deletes the row, reports `uploadPhoto`, and returns `generic`.
  - `removePhoto(locale, photoId: string): Promise<SaveResult<null>>`, which deletes the row. The trigger queues the R2 object.
  - Every non-`ok` result from an unexpected error calls `reportOrderError` with the Postgres code, never the payload.

- [ ] **Step 1: Write the failing tests** `app/[locale]/submit/actions.test.ts`. Mock `@/lib/supabase/server`, `@/lib/storage/r2` and `@sentry/nextjs` in the style of `app/[locale]/account/settings/actions.test.ts`.

```ts
test("saveCard opens a draft on first save and never sends a user id", () => {
  /* insert on orders called with {} ; no user_id key anywhere in the payload */
});
test("saveCard stores identified_by and never a price or catalog_ref", () => {});
test("saveCard clears dual and its add-ons on an unsigned card", () => {}); // Review Focus 2
test("saveCard drops add-ons that do not apply to the chosen service", () => {
  /* service authentication + addOnKeys ['digital_grade'] → no add-on insert */
});
test("saveCard on a card removed in another tab returns cardGone and inserts nothing", () => {}); // Review Focus 1
test("saveCard rejects a declared value over the limit without calling Supabase", () => {});
test("saveCard rejects a language outside the list without calling Supabase", () => {});
test("uploadPhoto refuses a renamed text file as photoType", () => {});
test("uploadPhoto deletes the row when R2 rejects the upload", () => {});
test("uploadPhoto refuses a second photo for the same card as photoLimit", () => {});
test("an unexpected Postgres error is reported with its code only", () => {
  /* captureException called; the tags hold no names/addresses */
});
test("signed-out callers are sent to sign-in", () => {});
```

- [ ] **Step 2:** Run `npm test -- app/\\[locale\\]/submit lib/orders/load-draft`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: save drafts, cards, shipping and photos through Server Actions`

---

### Task 9: Wizard shell — step indicator, running total, autosave

**Files:**
- Create: `components/submit/step-indicator.tsx`, `components/submit/running-total.tsx`, `components/submit/use-autosave.ts`, each with a test
- Modify: `messages/en.json` (`submit.steps.*`, `submit.total.*`, `submit.autosave.*`)

**Interfaces:**
- **`StepIndicator({ current: "cards" | "shipping" | "summary" })`**: three steps. Earlier steps are `Link`s to `/submit`, `/submit/shipping` and `/submit/summary`; the current and later steps are plain text. The current step has `aria-current="step"`.
- **`RunningTotal({ quote: Quote, cardCount: number, action?: ReactNode })`**: a side panel from `lg:` up, and a fixed bottom bar below that. It shows the card count, the estimated total (formatted) and the estimated turnaround in business days, or "—" while it's null. `action` is the Next button.
- **`useAutosave<T>(value: T, save: (value: T) => Promise<SaveResult<unknown>>, { delayMs = 800, enabled = true }): { status: "idle" | "saving" | "saved" | "error"; errorKey: OrderErrorKey | null; flush: () => Promise<void> }`**:
  - It debounces and saves the latest value only, and never runs two saves at once: a change during a save queues one more save.
  - `flush()` saves immediately; the Next buttons await it.

- [ ] **Step 1: Write the failing tests:**

```ts
test("useAutosave saves once after the debounce, with the latest value", async () => { /* fake timers, three changes → one call with the third */ });
test("a change during a save queues exactly one more save", async () => {});
test("flush saves immediately and resolves after the save", async () => {});
test("RunningTotal formats the total as currency and shows the turnaround", () => {});
test("StepIndicator links back, not forward", () => {});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement them and add the messages.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: add the wizard's step indicator, running total and autosave`

---

### Task 10: Step 1 — cards & services

**Files:**
- Create: `app/[locale]/submit/page.tsx`
- Create: `components/submit/cards-step.tsx` + test, `components/submit/card-editor.tsx` + test
- Modify: `messages/en.json` (`submit.cards.*`, `catalog.*` for the placeholder rows)

**Interfaces:**
- **`page.tsx`** (async): runs `requireUser({ locale, next: "/submit" })`, `loadCatalog`, then `loadDraft`, and renders `<CardsStep initialDraft catalog />` with `StepIndicator current="cards"`. `generateMetadata` reads its title from `submit.cards.title`.
- **`CardsStep({ initialDraft: Draft | null, catalog: Catalog })`** (client):
  - It holds the card list.
  - **"+ Add card"** appends a card with `id: crypto.randomUUID()`, `identifiedBy: "customer"`, every field null, `signed`/`numbered` false and `addOnKeys` empty. It's disabled at `MAX_CARDS_PER_ORDER`.
  - One card is expanded at a time. The others show a one-line summary: name, set, service label and price, or `submit.cards.unknownSummary` for an ART-identified card with no name.
  - It renders `RunningTotal` with `quoteDraft`.
  - **Next** is enabled when there's at least one card and `cardProblems` is empty for every card. It runs `flush()` and then `router.push("/submit/shipping")`.
- **`CardEditor({ card, catalog, onChange, onRemove, saved: boolean, onPhoto…})`:** `saved` is the card's `persisted` flag. `CardsStep` sets it once `saveCard` first returns `ok`, and `initialDraft` cards start with it set.
  - **First, the identification choice:** a `SegmentedControl` with "I'll enter the details" and "ART identifies it". The second option's label carries the fee, formatted from `catalog.identificationCents`. With "ART identifies it", the identification fields stay visible, marked optional, with a hint that a photo helps ART.
  - The fields follow in the spec's order: year, brand, language (a `FieldSelect` over `CARD_LANGUAGES`, named with `Intl.DisplayNames`), card name, set name, card number, surface, signed, numbered, then declared value.
  - Service is a `SegmentedControl` over `availableServices(card.signed)`, and tier is a `FieldSelect` over `availableTiers`.
  - Every change goes through `normalizeCard` before `onChange`, so unticking *signed* clears an autograph service, its tier and its add-ons.
  - Add-ons are `Checkbox`es over `applicableAddOns`, all unticked unless `card.addOnKeys` has them.
  - Declared value is a text input parsed with `parseMoney` on blur.
  - The photo uses `PhotoInput`, **disabled until `saved`** (the card's first autosave has landed); it calls `compressPhoto` and then `uploadPhoto`.
  - Problems are shown per field after blur or after a Next attempt.
  - `cardGone` from autosave removes the card from the list and shows `submit.errors.cardGone`.

- [ ] **Step 1: Write the failing tests:**

```ts
test("Add card appends an empty, customer-identified card and is disabled at 50", () => {});
test("no add-on is ticked on a new card", () => { /* every add-on checkbox unchecked */ });
test("autograph and dual appear only after Signed is ticked", () => {});
test("unticking Signed on a dual card clears the service and its add-ons", () => {}); // Review Focus 2
test("choosing ART identifies it keeps the typed fields, marks them optional and adds the fee", () => {}); // Review Focus 2
test("switching back to entering details makes the empty fields block Next", () => {}); // Review Focus 2
test("switching service to authentication hides Digital Grade and unticks it", () => {});
test("tiers whose cap the declared value exceeds are not offered", () => {});
test("the photo input is disabled until the card's first save lands", () => {});
test("a cardGone save result removes the card and says why", () => {}); // Review Focus 1
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. The landing CTAs and header already link to `/submit`; nothing changes there.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then `npm run dev`, sign in as `user@example.test`, add one detailed card and one card ART identifies, reload, and confirm both come back. Open the page in a second browser and confirm the same cards are there.
- [ ] **Step 5: Commit:** `feat: build the cards-and-services step of /submit`

---

### Task 11: Step 2 — shipping

**Files:**
- Create: `app/[locale]/submit/shipping/page.tsx`
- Create: `components/submit/shipping-step.tsx` + test
- Modify: `messages/en.json` (`submit.shipping.*`, including the client-copy placeholders for drop-off and insurance wording)

**Interfaces:**
- **`page.tsx`** loads the catalog and the draft. It redirects to `/submit` when there's no draft, or when any card has problems. When the draft's shipping is empty, it merges in `loadPrefill`, which isn't saved until the customer changes something. It then renders `<ShippingStep>` with `StepIndicator current="shipping"`.
- **`ShippingStep({ draft, catalog, prefill })`** (client):
  - The method is a `SegmentedControl` (`postal` / `in_person`).
  - The contact fields (first name, last name, phone) are always shown.
  - For postal, it also shows a country `FieldSelect` over the zone countries, labelled with `new Intl.DisplayNames([locale], { type: "region" })`; postcode, city and address line; and the insurance `Checkbox`.
  - For in person, it shows the drop-off copy instead.
  - It autosaves through `saveShipping`.
  - `RunningTotal` updates the fees as the country changes.
  - **Next** is enabled when `shippingProblems` is empty. It runs `flush()` and then goes to `/submit/summary`.

- [ ] **Step 1: Write the failing tests:**

```ts
test("in person hides the address and the insurance checkbox", () => {});
test("postal requires the insurance acknowledgement before Next", () => {});
test("only zoned countries are offered, named in the active locale", () => {});
test("changing the country updates the fees in the running total", () => {});
test("the prefill fills empty fields and is not saved until edited", () => {});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: build the shipping step of /submit`

---

### Task 12: Step 3 — summary and submit

**Files:**
- Create: `lib/payments/provider.ts` (stub, see Interfaces)
- Create: `app/[locale]/submit/summary/page.tsx`
- Create: `components/submit/summary-step.tsx` + test
- Modify: `app/[locale]/submit/actions.ts` + test (adding `submitOrder`)
- Modify: `messages/en.json` (`submit.summary.*`)

**Interfaces:**
- Produces a stub: `lib/payments/provider.ts`, exporting `type PaymentProvider` (as in Task 13) and `getPaymentProvider(): PaymentProvider | null` that always returns `null`. Task 13 replaces the body.
- **`page.tsx`** redirects to `/submit` or `/submit/shipping` when either step has problems. It calls `rpc("quote_order")`, and on a `P0001` error it redirects to `/submit?problem=<key>`. It renders `<SummaryStep draft quote />` with the server's quote.
- **`SummaryStep({ draft, quote, termsHref = "/terms" })`:**
  - One line per card (name or "Unknown card — ART identifies it", set, service, tier, add-ons, the identification fee where it applies, price), then the inbound fee, return fee, total, total declared value and estimated turnaround.
  - The total carries the label "VAT included" (`submit.summary.vatIncluded`).
  - Contact details and the shipping method.
  - The terms `Checkbox`, whose label contains a `Link` to `/terms`.
  - The **"Continue to payment"** button, disabled until the terms box is ticked and while submitting.
- **`submitOrder(locale: string, input: { termsAccepted: boolean }): Promise<SaveResult<null>>`:**
  - It returns `termsRequired` when `termsAccepted` isn't `true`.
  - It calls `rpc("submit_order", { p_terms_version: TERMS_VERSION })`.
  - **On `not_draft`**, it looks up the caller's newest `awaiting_payment` order and redirects to its order page. This is the double-click case.
  - On another `P0001` error, it returns the mapped key, which the summary shows beside the right card where it can.
  - On success: if `getPaymentProvider()` is non-null, it returns `redirect(await provider.startPayment({ reference }))`; otherwise it redirects to `/account/orders/${reference}`.

- [ ] **Step 1: Write the failing tests:**

```ts
test("submitOrder refuses without the terms box, without calling Supabase", () => {});
test("submitOrder sends the terms version and no prices", () => {});
test("a second submit lands on the existing order instead of failing", () => {}); // Review Focus 4
test("a catalog change since the running total surfaces its key", () => { /* service_unavailable → serviceUnavailable */ }); // Review Focus 3
test("with no payment provider, submit lands on the order page", () => {});
test("SummaryStep shows the server's total, labelled VAT included", () => {});
test("SummaryStep shows the identification fee on an ART-identified card", () => {});
test("Continue to payment is disabled until terms are accepted", () => {});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: build the summary step and submit orders`

---

### Task 13: Payment provider boundary, the payment-success handler and the test payment page

> **Security decision — approved with this plan:** `lib/payments/record-payment.ts` joins the admin-import allowlist.

**Files:**
- Modify: `lib/payments/provider.ts` (created as a `null` stub in Task 12) + test
- Create: `lib/payments/record-payment.ts` + test
- Create: `app/[locale]/account/orders/[reference]/pay/page.tsx`, `…/pay/actions.ts` + test
- Modify: `lib/supabase/admin-import-guard.test.ts` (allowlist and its equality assertion), `lib/supabase/admin.ts` (the comment naming its callers)
- Modify: `messages/en.json` (`orders.pay.*`)

**Interfaces:**
- **`type PaymentProviderId = "fake"`**; **`type PaymentProvider = { id: PaymentProviderId; startPayment(order: { reference: string }): Promise<string /* locale-less href */> }`**
- **`getPaymentProvider()`** returns the fake provider when `process.env.PAYMENT_PROVIDER === "fake"`, otherwise `null`. The fake `startPayment` returns `/account/orders/${reference}/pay`.
- **`recordPaymentSuccess(input: { orderId: string; provider: PaymentProviderId; providerReference: string; amountCents: number; currency: string }): Promise<"recorded" | "duplicate" | "rejected">`**: calls `rpc("record_payment_success")` on the admin client and returns its result. An RPC error is reported as `recordPayment` and rethrown. **This is the function M7's webhook will call.**
- **`recordPaymentFailure(input): Promise<void>`**
- **The pay page:**
  - It returns `notFound()` unless `getPaymentProvider()?.id === "fake"`.
  - It reads the order by reference through the session client, which proves ownership, and returns `notFound()` when that finds nothing.
  - If the order isn't `awaiting_payment`, it redirects to the order page.
  - It renders a "Test payment — no money is taken" panel with the total and **Pay**, **Fail** and **Cancel** buttons.
- **`payTestOrder(locale, reference)` and `failTestOrder(locale, reference)`:**
  1. Return `notFound()` unless the provider is fake.
  2. Run `requireUser`.
  3. Read `id, total_cents, currency` by reference through the session client; if there's no row, return `notFound`.
  4. Call `recordPaymentSuccess` or `recordPaymentFailure` with `providerReference: \`fake_${id}\``. The reference is deterministic so a double-click is a `duplicate`.
  5. Redirect to the order page, whatever the outcome.

- [ ] **Step 1: Write the failing tests:**

```ts
// lib/payments/record-payment.test.ts — mock @/lib/supabase/admin
test("passes the amount and reference through and returns the database's verdict", () => {});
test("an RPC error is reported without the payload and rethrown", () => {});
// pay/actions.test.ts
test("payTestOrder 404s when PAYMENT_PROVIDER is unset", () => {});
test("payTestOrder uses a deterministic provider reference per order", () => {}); // Review Focus 4
test("an order the caller does not own is notFound, and the admin client is never reached", () => {});
// admin-import-guard.test.ts
expect(ADMIN_ALLOWLIST).toEqual([
  join("lib", "auth", "delete-current-user.ts"),
  join("lib", "jobs", "run-maintenance.ts"),
  join("lib", "payments", "record-payment.ts"),
]);
```

Task 17 creates `run-maintenance.ts`. Until then, the guard's "allowlisted files still exist" test would fail. So in this task, add only the `record-payment.ts` entry, and Task 17 adds its own.

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the provider, the handler, the page and the actions, and update the allowlist and the `admin.ts` comment.
- [ ] **Step 4:** Run `npm test`. Expected: PASS, including the admin guard.
- [ ] **Step 5: Commit:** `feat: add the payment boundary, the success handler and a test payment page`

---

### Task 14: The account — orders list, order page, timeline, cancel, the printed URL

**Files:**
- Modify: `app/[locale]/account/page.tsx` (it becomes the orders overview, keeping the Settings and Sign out controls)
- Create: `lib/orders/load-orders.ts` + test, `lib/orders/next-action.ts` + test
- Create: `components/orders/orders-list.tsx`, `components/orders/status-timeline.tsx`, `components/orders/next-action.tsx`, each with a test
- Create: `app/[locale]/account/orders/[reference]/page.tsx`, `…/[reference]/actions.ts` + test
- Create: `app/[locale]/o/[reference]/page.tsx`
- Modify: `messages/en.json` (`orders.*`, `orders.status.*`, with client-copy placeholders for the packing instructions)

**Interfaces:**
- **`loadOrders(supabase): Promise<OrderSummary[]>`**, where `OrderSummary = { reference; status: OrderStatus; createdAt; submittedAt | null; cardCount; totalCents | null; currency }`. The draft comes first, then the rest by `created_at` descending.
- **`loadOrder(supabase, reference): Promise<OrderDetail | null>`**: the order with every column the printables need, its cards (every field) with add-ons, its status log, and its payment attempts. Task 15 consumes it.
- **`printablesAvailable(status: OrderStatus): boolean`**: true from `paid` through `completed`, false for `draft`, `awaiting_payment` and `cancelled`.
- **`nextAction(order: OrderDetail, providers: { payment: boolean }): { kind: "pay" } | { kind: "ship" } | { kind: "bringIn" } | { kind: "none" }`**:
  - `pay` when the order is `awaiting_payment` and a payment provider exists;
  - `ship` for a `paid` postal order;
  - `bringIn` for a `paid` in-person order;
  - `none` otherwise.
- **`NextAction`** renders `ship` and `bringIn` with the packing instructions and links to `/account/orders/<reference>/label` and `/account/orders/<reference>/form`.
- **`StatusTimeline({ log, status })`** renders `JOURNEY`. Reached steps show their time from the log, formatted with `useFormatter().dateTime`. Unreached steps are greyed out and carry `aria-disabled`. A cancelled order shows cancelled as the final step instead.
- **`cancelOrder(locale, reference)`** calls `rpc("cancel_order")` and redirects to the order page. A `P0001` error is mapped, and unexpected errors are reported.
- **The order page:**
  - It returns `notFound()` when `loadOrder` is null.
  - It shows the cards, shipping details and price lines, plus `StatusTimeline` and `NextAction`.
  - **Cancel** shows while the order is `draft` or `awaiting_payment`.
  - A draft's page links to "Continue" at `/submit` rather than showing a timeline.
- **`/o/[reference]`** returns `notFound()` unless the reference matches `ORDER_REFERENCE_PATTERN`. Otherwise it returns `redirect({ href: \`/account/orders/${reference}\`, locale })`. The order page then shows the order to its owner and 404s for anyone else. A comment says M5 routes staff to intake from here, and that the path never changes, because it is printed.

- [ ] **Step 1: Write the failing tests:**

```ts
test("the draft is listed first with Continue", () => {});
test("the timeline greys out steps not reached and times the reached ones", () => {});
test("a cancelled order ends its timeline at cancelled", () => {});
test("nextAction: awaiting payment without a provider offers nothing", () => {});
test("nextAction: paid postal is ship, paid in person is bringIn", () => {});
test("printablesAvailable is false until paid and after cancelling", () => {});
test("NextAction links to the parcel label and the submission form", () => {});
test("Cancel is offered only while unpaid", () => {});
test("cancelOrder on someone else's reference maps not_found and changes nothing", () => {});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: track orders under /account with a full status timeline`

---

### Task 15: Printables — QR parcel label and submission form

**Files:**
- Modify: `package.json` (`npm install qrcode` and `npm install -D @types/qrcode`)
- Create: `lib/site-url.ts` + test, `lib/orders/qr.ts` + test
- Create: `components/orders/order-qr.tsx`, `components/orders/parcel-label.tsx`, `components/orders/submission-form.tsx`, `components/orders/print-button.tsx`, with tests for the label and the form
- Create: `app/[locale]/account/orders/[reference]/label/page.tsx`, `…/[reference]/form/page.tsx`
- Modify: `components/layout/site-header.tsx`, `components/layout/site-footer.tsx` (add `print:hidden` to the root element)
- Modify: `.env.example` (`SITE_URL=http://localhost:3000`), `messages/en.json` (`orders.printables.*`, with ART's receiving address as a client-copy placeholder)

**Interfaces:**
- Consumes: `loadOrder`, `OrderDetail` and `printablesAvailable` from Task 14, and `orderPath` from Task 5.
- **`siteUrl(): string`** reads `SITE_URL` at runtime, throws naming it when unset, and strips a trailing slash.
- **`orderQrSvg(reference: string): Promise<string>`** (`import "server-only"`) returns `QRCode.toString(new URL(orderPath(reference), siteUrl()).href, { type: "svg", errorCorrectionLevel: "M", margin: 1 })`.
- **`OrderQr({ svg, reference, size })`** renders the SVG as an `<img>` with a `data:image/svg+xml` URI, which avoids `dangerouslySetInnerHTML`, and alt text naming the reference.
- **`ParcelLabel({ reference, qrSvg })`** is sized to cut out (roughly 10 × 15 cm in print). It shows `OrderQr`, the reference in large type, and ART's receiving address.
- **`SubmissionForm({ order: OrderDetail, qrSvg })`** shows:
  - `OrderQr` and the reference;
  - the contact details and the shipping method;
  - one numbered row per card in `position` order. Each row has every identification field, or `orders.printables.artIdentifies` plus whatever hints were typed, then signed, numbered, service, tier, add-ons and the declared value;
  - the card count, the total declared value, the price lines and the total paid.

  Amounts and dates go through `useFormatter`.
- **`PrintButton`** (client) calls `window.print()`, and is itself `print:hidden`.
- **Both pages** run `requireUser`, then `loadOrder` through the session client, which is RLS. They return `notFound()` when the order is missing or `!printablesAvailable(order.status)`, then render the component with `await orderQrSvg(order.reference)` and a `PrintButton`.

- [ ] **Step 1: Write the failing tests:**

```ts
// lib/site-url.test.ts
test("siteUrl names SITE_URL when it is unset", () => { /* vi.stubEnv */ });
test("siteUrl strips a trailing slash", () => {});
// lib/orders/qr.test.ts — mock qrcode
test("the QR code encodes the absolute /o/<reference> URL", () => {
  /* SITE_URL=https://example.test → toString called with "https://example.test/o/AG-0123ABCD" */
});
// components/orders/submission-form.test.tsx — renderWithIntl with REFERENCE_DRAFT-shaped OrderDetail
test("lists every card, numbered, in position order", () => {});
test("marks an ART-identified card instead of empty fields", () => {});
test("shows the total declared value and the total paid", () => {});
// components/orders/parcel-label.test.tsx
test("shows the reference and a QR image named after it", () => {});
```

- [ ] **Step 2:** Run `npm test -- lib/site-url lib/orders/qr components/orders`. Expected: FAIL.
- [ ] **Step 3:** Install the dependencies, then implement the modules, components and pages. Add `print:hidden` to the header and footer.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then open a paid order's `/label` and `/form` in `npm run dev`, open the browser's print preview, and confirm that the site chrome and the print button are hidden and that the QR code scans to `/o/<reference>` with a phone.
- [ ] **Step 5: Commit:** `feat: add the QR parcel label and the printable submission form`

---

### Task 16: Account deletion against real orders

**Files:**
- Modify: `app/[locale]/account/settings/actions.ts` (`deleteAccount`) + `actions.test.ts`
- Modify: `messages/en.json` (`auth.errors.ordersInProgress`)

**Interfaces:**
- **`deleteAccount`**, after the password is verified and **before** `deleteCurrentUser()`:
  1. Calls `rpc("prepare_account_deletion")`.
  2. On `"orders_in_progress"`, returns `{ status: "error", errorKey: "ordersInProgress" }` and touches nothing else.
  3. On an RPC error, reports it with `reportAuthError`-style tags (flow `deleteAccount`) and returns `generic`.
  4. Otherwise continues exactly as today.

  The trigger has already queued any photos of the deleted drafts.

- [ ] **Step 1: Write the failing tests:**

```ts
test("deletion is refused while an order is in progress, and the user is not deleted", () => {
  /* rpc → 'orders_in_progress'; deleteCurrentUser not called; errorKey ordersInProgress */
});
test("a wrong password still stops before prepare_account_deletion", () => {});
test("prepare runs before deleteCurrentUser", () => { /* call order */ });
```

- [ ] **Step 2:** Run `npm test -- app/\\[locale\\]/account/settings`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: refuse account deletion while an order is in progress`

---

### Task 17: The maintenance job — expire drafts, delete photos

> **Security decision — approved with this plan:** `lib/jobs/run-maintenance.ts` joins the admin-import allowlist.

**Files:**
- Create: `lib/jobs/run-maintenance.ts` + test
- Create: `app/api/jobs/maintenance/route.ts` + `route.test.ts`
- Modify: `lib/supabase/admin-import-guard.test.ts` (the third entry and the final equality assertion from Task 13), `lib/supabase/admin.ts` (comment), `.env.example` (`JOBS_SECRET`, plus `PAYMENT_PROVIDER` documented as a runtime-only switch)

**Interfaces:**
- **`runMaintenance(): Promise<{ expiredDrafts: number; deletedPhotos: number }>`**:
  1. Calls `rpc("expire_stale_drafts")`.
  2. Loops: `list_photo_deletions(100)`, then `deleteObjects(keys)`, then `complete_photo_deletions(keys)`, until a batch is empty, at most 50 batches per run.
  3. An R2 failure stops the loop **without** completing that batch, so the keys are retried next run, and is reported as `maintenance`.
- **`POST /api/jobs/maintenance`:**
  - It returns `404` when `JOBS_SECRET` is unset, and `401` unless `Authorization` equals `Bearer ${JOBS_SECRET}`, compared with `crypto.timingSafeEqual` over equal-length buffers.
  - Otherwise it returns `200` with the counts as JSON.
  - `GET` isn't exported, so it gets a 405.
  - The route is under `/api`, so `proxy.ts` already skips it.

- [ ] **Step 1: Write the failing tests:**

```ts
test("an R2 failure leaves the batch queued for the next run", () => { /* complete_photo_deletions not called */ });
test("drains until the queue is empty", () => {});
test("404 without JOBS_SECRET, 401 with a wrong token, 200 with the right one", () => {});
test("a token of a different length is 401, not a thrown error", () => {});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement, and finish the allowlist with all three entries.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: add the maintenance job that expires drafts and deletes photos`

---

### Task 18: Docs, seed, and the end-to-end check

**Files:**
- Modify: `supabase/seed.sql` (one synthetic draft for `user@example.test`, named "Example Card" in set "Example Set", obviously fake)
- Create: `docs/deployment/SUBMISSION_SETUP.md`
- Modify: `CLAUDE.md`, `docs/content-requests.md`, `docs/superpowers/specs/2026-09-28-profile-settings-design.md`, `docs/superpowers/specs/2026-10-22-submission-flow-design.md` (status line)

**Content:**
- **`SUBMISSION_SETUP.md`:**
  - creating the R2 bucket (private) and an API token scoped to it;
  - the `R2_*` runtime variables in Coolify;
  - `SITE_URL` set to the public origin, because printed QR codes point at it;
  - `JOBS_SECRET` and the hourly Coolify scheduled task (`curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" http://localhost:3000/api/jobs/maintenance`);
  - `npm run db:push` for the four migrations;
  - **the launch checklist**: `PAYMENT_PROVIDER` must be unset or real in production, never `fake`, and `SITE_URL` must be the production origin before the first real label is printed.
- **`CLAUDE.md`:**
  - "Not yet built" moves on to M4.
  - In the deliberate-404 table, `/submit` comes out and `/terms` goes in ("legal content, lawyer-drafted; the submit summary links to it").
  - A new **Orders** section covers:
    - the state machine lives in `private.transition_order`, and no app code writes `orders.status`;
    - prices are computed in `private.price_order`, and the TypeScript pricing is a display mirror kept in step by `lib/orders/fixtures.ts`;
    - services, tiers, add-ons and card fees are data;
    - `/o/<reference>` is printed on paper and must never change;
    - the payment switch and `SITE_URL`;
    - the three admin-client callers;
    - photos are served through `/api/photos/[id]`.
  - The design-system note records the Base UI re-evaluation.
- **`content-requests.md`:** the spec's sixteen client questions, the drop-off copy, the packing instructions and ART's receiving address. The terms clause on ART-identified cards is listed as blocking, beside `/terms`.
- **The settings spec:** a line noting that order mail moved to M7.

- [ ] **Step 1:** Write the docs and the seed. Run `npm run db:reset`; expected: the seed applies cleanly.
- [ ] **Step 2: The full gate**

Run: `npm run lint && npm run build && npx tsc --noEmit && npm test && npm run db:test`
Expected: every command exits 0.

- [ ] **Step 3: End to end in the browser.** Use the `next-dev-loop` skill with `PAYMENT_PROVIDER=fake SITE_URL=http://localhost:3000 npm run dev` and a configured local R2 stand-in. As `user@example.test`:
  1. Add three cards:
     - one fully entered, on card grading with Digital Grade and a photo;
     - one marked "ART identifies it", on authentication;
     - one signed card on dual.
  2. Confirm that unticking *signed* on the third card clears dual, then set it back.
  3. Reload, and confirm everything is still there.
  4. Choose postal to `HU` and tick the insurance box.
  5. On the summary, confirm the total matches the running total and the identification fee appears on the second card.
  6. Tick the terms box and choose Continue to payment.
  7. Choose **Pay**.
  8. Confirm the order page shows *paid*, with later timeline steps greyed out, and "Ship your cards" linking to both printables.
  9. Open the parcel label and the submission form, check them in print preview, and confirm `/o/<reference>` lands on the order page.
  10. Then confirm:
      - an in-person order shows "Bring your cards";
      - Cancel works on a second, unpaid order, and that order's `/label` is a 404;
      - with `PAYMENT_PROVIDER` unset, `/account/orders/<ref>/pay` is a 404.

  Report what was seen, including anything that failed.
- [ ] **Step 4: Commit:** `docs: record the submission flow, its runbook and the client requests`
