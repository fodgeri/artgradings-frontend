# Supabase foundation — clients, auth wiring, roles & RLS

**Date:** 2026-08-18
**Status:** Approved, not yet implemented
**Module:** M0 — Foundation & infrastructure

## Goal

Connect the application to the existing hosted Supabase project (EU) and
establish the three things every later module depends on: typed clients for
each Next.js runtime, cookie-based session handling that coexists with the
next-intl proxy, and a role/permission model whose Row Level Security policies
are written once and never rewritten as roles are added.

The deliverable is the foundation and its security boundary. No user-facing
screen ships in this work.

## Non-goals

- **Auth UI.** Signup, login, password reset, profile and settings screens are
  M2. This spec stops at the plumbing those screens will call. It adds no
  route, no form, and no page.
- **The domain schema.** Orders, order items, cards, grades, and the Pop Report
  aggregation are M3–M5. Writing an order state machine before M3 has pinned
  down services, pricing rules and the client-supplied grading scale is the
  scope creep `CLAUDE.md` names as the project's top risk. Only tables with a
  policy today are created.
- **Permissions for tables that do not exist.** The permission vocabulary is
  seeded with the three permissions that back a policy in this work.
  `orders.grade` and its siblings arrive in the migration that creates
  `orders`.
- **Storage buckets.** Card images go to Cloudflare R2, not Supabase Storage.
  Supabase Storage is not configured, and R2 is a separate M0 line item.
- **A local Supabase stack for development.** Day-to-day development runs
  against the hosted project. A local database container exists solely to run
  the pgTAP suite — see *Environment strategy*.
- **Automated migration deployment.** Applying DDL to production from CI, with
  no test project to rehearse against, is a worse risk than a manual step. See
  *Migrations*.
- **A `role_permissions` admin UI.** Roles are assignable via SQL and the
  `roles.assign` permission exists, but no screen consumes it until M5.

## Decisions and their rationale

### Environment strategy: hosted for development, local Postgres for tests

A hosted EU project already exists and remains the source of truth for
development and production. Migrations are authored against it and pushed to
it; there is no second Supabase project to keep in sync.

Tests are the exception. `supabase db start` brings up **only the database
container** — not the ten-container full stack — and `supabase test db` runs
pgTAP against it. Docker is therefore required to run the database test suite,
but not to develop the application.

An earlier draft of this spec rejected any local stack and accepted, as its
largest known weakness, that **RLS policy behaviour would have no automated
test**. That trade was wrong once it became clear how narrow the requirement
actually is: RLS is the security boundary of this platform — the single
mechanism standing between one customer and another customer's orders,
addresses and payment records — and "verified by reading it" is not an adequate
standard for that. A database-only container is a much smaller commitment than
the full local stack that was rejected, and it buys the one thing worth having.

Two consequences follow, both improvements:

- **Migrations must run cleanly from empty.** `supabase db reset` replays every
  migration into a fresh database on each test run, so a migration that only
  works against the current production state fails in CI rather than in six
  months.
- **Policy changes become reviewable by evidence.** A pull request touching a
  policy shows a passing or failing assertion, not a reviewer's reasoning about
  `SECURITY DEFINER` semantics — which, on the evidence of this spec's own
  first draft, is not reliable.

### Roles: table-resolved, not JWT-resolved

Two mechanisms were considered for getting a user's role into a policy:

1. **Custom Access Token Hook** — a Postgres function injects the role into the
   JWT at issue time; policies read `auth.jwt()`.
2. **Lookup in the database** — a `SECURITY DEFINER` helper reads the role
   tables; policies call the helper.

**Chosen: 2.** Three reasons, in order of weight:

- **It is entirely versioned SQL.** The auth hook is enabled through dashboard
  configuration, not a migration — so it is invisible to `supabase db reset`,
  meaning the local test database would not have it and the pgTAP suite could
  not exercise the role mechanism at all. Every piece of un-versioned
  configuration is also something that must be reproduced by hand when the
  phase-2 test project is created, with no diff to check it against.
- **Revocation is immediate.** A JWT-borne role persists until the token
  refreshes. The elevated roles here belong to staff who can finalize grades
  and issue refunds; a revocation that takes effect within the hour, silently,
  is the wrong default for that.
- **The performance argument for the hook does not survive scrutiny.** A helper
  invoked as `(select private.has_permission(…))` is evaluated once per
  statement as an InitPlan, not once per row. The cost is one indexed lookup
  per query against two small tables.

This decision is **reversible at low cost**, which is the point of the
indirection described next: policies name a permission, never a mechanism, so
switching to the JWT hook later means rewriting one function body while every
policy keeps working.

### Authorization: permissions, not roles, in policies

Policies do not test for a role. They test for a **permission**, and a table
maps roles to permissions:

```
user_roles        -- who holds which role
role_permissions  -- what each role may do
private.has_permission('profiles.read_all')  -- what a policy calls
```

With two roles this indirection looks like overhead. It is not, because more
roles are expected. Policies that name roles directly must each be found and
edited when a role is added, and a policy that is missed is a silent
authorization defect in the mechanism that *is* the security boundary. With the
mapping table, adding a role is an `INSERT` and **no policy changes at all**.

This is cheap to adopt now and expensive to retrofit later, since retrofitting
means rewriting every policy accumulated by then.

### Permissions are a table, not an enum

Supabase's own RBAC guide models permissions as a Postgres enum. That does not
work well here.

`alter type … add value` cannot have its new value used in the same transaction
that adds it, and Supabase runs each migration file in a transaction. The
natural migration — *add permission `orders.grade`, grant it to `admin`* —
would therefore fail as a single file, and every M3/M5 migration touching
permissions would have to be split in two, permanently.

A lookup table with a text primary key makes the same change one `INSERT`.

Roles are likewise a table rather than an enum: a role is a business concept
that may eventually be managed by an admin screen. Permissions remain
code-owned — they are only meaningful when a policy references them — so they
are added by migration alongside the policy that uses them, never at runtime.

### Session refresh belongs in the proxy; authorization does not

Next's own proxy documentation states that proxy "should not be used as a full
session management or authorization solution." The split this work adopts:

- **`proxy.ts`** rotates the auth token and nothing else. It may perform
  optimistic redirects later; it is never the thing that decides access.
- **RLS** is the authorization boundary. A user sees their own rows because the
  database refuses to return anyone else's, not because a route guard held.

## Architecture

Four seams, one file each, plus a generated types module, under `lib/supabase/`:

| File | Runs as | Used by |
|---|---|---|
| `client.ts` | `anon` + user JWT | Client Components |
| `server.ts` | `anon` + user JWT | Server Components, Server Actions, Route Handlers |
| `proxy.ts` | `anon` (edge) | Token rotation from the root `proxy.ts` |
| `admin.ts` | `service_role` | Server-only; **bypasses RLS entirely** |
| `database.types.ts` | — | Generated; typed into all of the above |

`admin.ts` carries `import "server-only"` as its first line, so importing it
from a Client Component is a build failure rather than a runtime credential
leak. It has no consumer in M0. It is created now, with its guardrail, so that
it is not created for the first time under deadline pressure during the M7
webhook work — which is precisely when a `service_role` client is reached for
and precisely when a mistake is most expensive.

Dependencies: `@supabase/supabase-js@^2.112.3`, `@supabase/ssr@^0.12.4`,
`supabase` (CLI) as a devDependency.

### Proxy composition

Next.js permits exactly one `proxy.ts`, and next-intl already owns it. Both
libraries want to own the response. Getting this wrong produces the worst class
of bug available here — users logged out at random, intermittently, in
production only.

```ts
export default async function proxy(request: NextRequest) {
  // 1. Refresh first. No code may run between createServerClient and getClaims().
  const supabaseResponse = await updateSession(request);

  // 2. next-intl negotiates locale against cookies Supabase may have rewritten.
  const intlResponse = handleI18nRouting(request);

  // 3. Carry refreshed auth cookies onto whichever response actually ships.
  supabaseResponse.cookies.getAll()
    .forEach(({ name, value, ...options }) => intlResponse.cookies.set(name, value, options));

  return intlResponse;
}
```

Order is load-bearing in both directions:

- **Supabase runs first** because it may rewrite the request's cookies, and
  next-intl reads `NEXT_LOCALE` from that same cookie jar.
- **next-intl produces the returned response** because it owns redirects
  (`/en/faq` → `/faq`, and every unprefixed-English canonicalization).
- **Step 3 is not optional.** A redirect response created by next-intl does not
  inherit the `Set-Cookie` headers Supabase produced. Without the copy, the
  rotated token is dropped on exactly those requests that redirect — which is
  why the resulting logouts are intermittent rather than total, and why this is
  the one piece of logic in this spec that gets a real unit test.

`@supabase/ssr@0.12` passes a **second `headers` argument** to the `setAll`
cookie callback which must be forwarded onto the response. Snippets predating
that release omit it.

`getClaims()` is used rather than `getUser()`. With asymmetric JWT signing keys
it verifies the token locally instead of making a network round trip to the
auth server on every proxied request.

The existing matcher is correct for this work and **does not change**:

```
/((?!api|monitoring|_next|_vercel|.*\..*).*)
```

`monitoring` must remain excluded for the reason already documented — it is the
Sentry tunnel route, and locale negotiation would redirect it to
`/en/monitoring` and silently drop every browser-side error report.

## Schema

Five tables in `public`, lowercase snake_case throughout.

```
profiles         (id uuid pk → auth.users(id) on delete cascade,
                  full_name text, created_at timestamptz, updated_at timestamptz)
roles            (key text pk, label text not null)
permissions      (key text pk, description text not null)
user_roles       (user_id uuid → auth.users(id) on delete cascade,
                  role_key text → roles(key),
                  pk (user_id, role_key))
role_permissions (role_key text → roles(key) on delete cascade,
                  permission_key text → permissions(key) on delete cascade,
                  pk (role_key, permission_key))
```

Conformance to the Postgres best-practice rules, and the one deliberate
departure:

- `timestamptz` never `timestamp`; `text` never `varchar(n)`.
- Every foreign key is indexed. The composite primary keys cover the leading
  column; `user_roles.role_key` and `role_permissions.permission_key` get
  explicit indexes for the trailing side.
- Constraints added in migrations use `DO` blocks guarded on `pg_constraint`,
  since Postgres has no `ADD CONSTRAINT IF NOT EXISTS`.
- **Departure:** the lookup tables use natural `text` primary keys rather than
  `bigint generated always as identity`. That rule targets high-volume tables
  where index locality matters. These hold single-digit row counts, and a
  readable key makes `role_permissions` rows self-describing while removing a
  join from every policy evaluation.

`profiles.id` is `uuid` because it is a foreign key to `auth.users.id`. That is
not a choice.

### Provisioning trigger

An `after insert` trigger on `auth.users` creates the `profiles` row and grants
the `user` role. It is `SECURITY DEFINER` with `set search_path = ''`, and every
insert carries `on conflict do nothing`.

The trigger must be incapable of raising. If it throws, signup fails with an
opaque 500 that gives no indication the cause was a trigger on a table the
application never writes to directly.

### Seed data

| Table | Rows |
|---|---|
| `roles` | `user`, `admin` |
| `permissions` | `profiles.read_all`, `roles.read_all`, `roles.assign` |
| `role_permissions` | `admin` → all three. `user` → none. |

Every seeded permission backs a policy created in this work. None are
speculative.

## Row Level Security

RLS is `enable`d on all five tables. It is **not** `force`d, and the
`service_role` client used by `admin.ts` bypasses policies through its
`BYPASSRLS` role attribute.

`force row level security` was in an earlier draft of this spec and was removed
after testing it against a real Postgres. It is actively harmful here, in two
ways:

- **It silently disables the admin path.** Inside a `SECURITY DEFINER`
  function, `current_user` is the function's owner, not the caller. `force`
  subjects that owner to the table's policies, and every policy here is
  declared `to authenticated` — so none of them match the owner, default-deny
  applies, and `private.has_permission` returns `false` for everyone forever.
  Measured: an admin who should see all rows saw only their own. No error, no
  log line, no recursion — just an administrator who quietly cannot administer.
- **It blocks the seed data.** The reference tables deliberately have no write
  policy, so the migration's own `INSERT`s fail with `new row violates
  row-level security policy for table "user_roles"`.

Supabase's documentation never mentions `force`. That is not an oversight.

### The permission helper

```sql
create schema if not exists private;

create or replace function private.has_permission(requested text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = (select auth.uid())
      and rp.permission_key = requested
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.has_permission(text) to authenticated;
```

Four properties, each required rather than stylistic:

- **`security definer` prevents infinite recursion.** The function reads
  `user_roles`, whose own policy calls the function. The bypass comes from the
  function running as the tables' owner, and owners are exempt from RLS *unless
  forced* — which is the second reason `force` is absent above. Without the
  bypass this recurses during login and surfaces as nothing resembling a
  permissions problem.
- **The identity check is inside the body.** `auth.uid()` is read within the
  function rather than accepted as an argument. This is the control that makes
  the function safe to expose: a caller can only ever ask it about themselves.
  Verified — `authenticated` invoking it directly for a permission they lack
  receives `false`, not another user's answer.
- **It lives in `private`, not `public`.** Protection from the Data API comes
  from `private` not being a PostgREST-exposed schema. A security-definer
  function in `public` is callable over the API.
- **`execute` is granted to `authenticated`, together with `usage` on the
  schema.** This reverses the more commonly published advice, which revokes
  `execute` from `anon`, `authenticated` and `service_role`. That advice is
  wrong for a function called from a policy: **policy expressions are evaluated
  with the privileges of the querying user**, so revoking the grant makes every
  query against the table fail with `ERROR: permission denied for function
  has_permission`. Tested directly; the revoke-based version does not work. The
  pattern appears to work for others only because they never revoke and inherit
  the default `PUBLIC` grant.

### Policies

Rules that hold for every policy in this work:

- **One policy per operation. Never `for all`.** Postgres does not accept
  multiple operations in a single `FOR` clause, and per-operation policies make
  the `using` / `with check` split explicit.
- **Always `to authenticated`**, so anonymous requests stop at the role check
  without evaluating the expression.
- **`using` for `select` and `delete`; `with check` for `insert`; both for
  `update`.**
- **Every function call wrapped as `(select …)`**, so it is evaluated once per
  statement as an InitPlan rather than once per row.
- **Permissive, never restrictive.** Permissive policies combine with `OR`,
  which is the intended semantics throughout.
- **An `update` policy requires a matching `select` policy** or the update
  silently fails to match rows. Both tables that accept updates have one.

Where one operation has both an ownership rule and a permission rule, the two
are expressed as `or` within a single policy rather than as two permissive
policies. This is a readability choice, not a performance one — permissive
policies are OR-ed regardless, and an earlier draft of this spec claimed a
speed benefit that is not supported by any measurement.

| Table | Operation | Clause | Rule |
|---|---|---|---|
| `profiles` | select | using | `id = (select auth.uid())` **or** `(select private.has_permission('profiles.read_all'))` |
| `profiles` | update | using + with check | `id = (select auth.uid())` |
| `profiles` | insert, delete | — | No policy. Created by trigger, removed by cascade. |
| `user_roles` | select | using | `user_id = (select auth.uid())` **or** `(select private.has_permission('roles.read_all'))` |
| `user_roles` | insert | with check | `(select private.has_permission('roles.assign'))` |
| `user_roles` | update | using + with check | `(select private.has_permission('roles.assign'))` |
| `user_roles` | delete | using | `(select private.has_permission('roles.assign'))` |
| `roles`, `permissions`, `role_permissions` | select | using | `true` |
| `roles`, `permissions`, `role_permissions` | insert, update, delete | — | No policy. Migration-only. |

Policy names are short descriptive sentences in double quotes, per Supabase
convention — `"Users can view their own profile"`, not `profiles_select_01`.

The three reference tables are readable by any authenticated user because they
describe the system's vocabulary rather than anybody's data. Having no write
policy, they are writable only by the migration (which runs as the tables'
owner, exempt from RLS because RLS is not forced) and by the `service_role`
client.

`profiles` has no insert policy by design, so a user cannot create a second
profile row. Its update policy repeats the ownership test in `with check` as
well as `using`, which is what prevents a user from moving their own row to
another `id` — `using` alone governs which rows are visible to update, not what
they may become.

### Indexing for policies

A column counts as indexed only when it is **first** in a btree index, so
composite primary keys do not cover their trailing columns. The policy filter
columns and the helper's join columns are covered as follows:

| Column | Covered by |
|---|---|
| `profiles.id` | primary key |
| `user_roles.user_id` | leading column of the composite primary key |
| `user_roles.role_key` | dedicated index (trailing in the PK) |
| `role_permissions.role_key` | leading column of the composite primary key |
| `role_permissions.permission_key` | dedicated index (trailing in the PK) |

## Environment variables

The project adopts Supabase's current key generation — publishable
(`sb_publishable_…`) and secret (`sb_secret_…`) — rather than the legacy
`anon` / `service_role` JWTs. They are independently revocable, and the
asymmetric signing keys that accompany them are what allow `getClaims()` to
verify locally instead of calling the auth server per request.

| Was | Becomes | Class |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | unchanged | Build arg |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Build arg |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY` | **Runtime only** |

The build-arg versus runtime split documented in `.env.example` and
`CLAUDE.md` is unchanged and remains the boundary that matters: `NEXT_PUBLIC_*`
values are inlined into the client bundle and are public by definition; the
secret key is set in Coolify and must never be a build arg, because a build arg
is baked into image layers readable by anyone who can pull the image.

Files touched by the rename: `.env.example`, `Dockerfile` (`ARG` and `ENV`),
`.github/workflows/ci.yml` (build placeholder),
`.github/workflows/build-and-push.yml` (build arg).

**Sequencing.** `build-and-push.yml` feeds the key from a GitHub *secret*. The
new keys must be generated in the Supabase dashboard and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` added as a repository secret **before**
this work merges; the old secret is removed after. Reversing that order breaks
the image build on `main`.

## Migrations

The Supabase CLI is a devDependency. The project is linked by ref; migrations
are hand-written SQL in `supabase/migrations/`, committed, and applied with
`supabase db push`.

```
db:new    supabase migration new <name>
db:push   supabase db push                       -- hosted project
db:types  supabase gen types typescript --linked > lib/supabase/database.types.ts
db:test   supabase db start && supabase test db  -- local container
db:stop   supabase stop --no-backup
```

`db:new`, `db:push` and `db:types` talk to the hosted project and need no
Docker. `db:test` needs it. `supabase db diff` also needs it but is not used —
migrations are authored by hand, which at this schema size is the simpler
trade and keeps the file a reviewable artifact rather than a generated one.

Migrations are **written to be replayable from empty**, because `db:test`
replays all of them into a fresh database on every run. This is a constraint
worth stating plainly: a migration that silently depends on the hosted
project's current state now fails in CI, which is the point.

**Migrations are still applied to production manually, not by CI.** The local
container proves a migration *runs*; it does not prove it is safe against live
data, and it holds none. Automating `db push` on merge would apply DDL to
production and would require CI to hold a privileged access token and the
database password — on a runner this spec has already noted is persistent and
root-capable. Phase 2 introduces the test project and this automation together,
the same rule `CLAUDE.md` already states for branches and hosts.

`lib/supabase/database.types.ts` is generated and committed, and is excluded
from lint and coverage. Regenerating it after a schema change is part of the
migration step, not a separate chore.

## Testing

Two suites, run by one command each, covering two different things.

### Application tests — Vitest

Repo convention throughout: colocated `*.test.ts`, `globals: false`,
`renderWithIntl` for components, never asserting user-facing copy as a literal.

- **Proxy cookie merge.** Mocked request/response asserting that cookies set by
  the Supabase step survive onto the next-intl response *including when
  next-intl returns a redirect*. The failure this guards is intermittent and
  production-only, so it is tested directly rather than by inspection.
- **Client factories** throw on missing environment variables rather than
  constructing a client that fails opaquely at first use.
- **`admin.ts` import guard** — a static assertion that the `service_role`
  client is imported nowhere but server-only paths, in the same shape as the
  existing `components/gold-ink.test.ts` token guard.

### Database tests — pgTAP

`npm run db:test` → `supabase db start && supabase test db`. Tests live in
`supabase/tests/`, run alphabetically, and each wraps itself in
`begin … rollback` so ordering never leaks state.

`supabase/tests/000-setup.sql` enables the extension and defines the
impersonation helpers:

```sql
create extension if not exists pgtap with schema extensions;
```

Assertions, at minimum:

| What | Asserted |
|---|---|
| RLS is on | Every table in `public` has RLS enabled — catches a future table added without it |
| Isolation | User A cannot see user B's `profiles` row |
| Elevation | An `admin` **can** see both, via `profiles.read_all` |
| Write protection | A non-admin cannot insert, update or delete in `user_roles` |
| Reference tables | `authenticated` can read `roles`/`permissions`/`role_permissions` and cannot write them |
| Provisioning | Inserting into `auth.users` produces exactly one `profiles` row and one `user` role |
| Self-service limits | A user can update their own `full_name` and cannot change their `id` |
| Helper safety | `private.has_permission` called directly by a non-admin returns `false` |

The last row is deliberately a test rather than a comment: it is the property
that makes granting `execute` to `authenticated` safe, and it was established
by experiment rather than by reading the documentation.

**Test helpers are written here, not installed.** Supabase's guide recommends
`basejump-supabase_test_helpers`, installed at test time through the `dbdev`
package registry. This project writes its own ~40-line equivalent
(`create_test_user`, `authenticate_as`, `clear_auth`) instead, for the same
reason `docs/superpowers/specs/2026-08-15-design-system-foundation-design.md`
rejected Storybook: it is a second dependency tree to maintain against an M8
budget. The specific aggravating factor here is that CI runs on a **public**
repository against a **persistent self-hosted runner whose user is in the
docker group** — pulling a third-party Postgres extension from a remote
registry into that environment on every run is a supply-chain exposure the
project does not need to accept for forty lines of SQL. If the helpers grow
beyond trivial, revisit.

### CI

Database tests run as a **separate job** from `lint-build-typecheck`, because
they need Docker and a different failure signal, and because the existing job's
comment is emphatic that it is tuned deliberately.

That new job **must carry the same fork-PR guard verbatim**:

```yaml
if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
```

Omitting it reintroduces the exact vulnerability the existing comment
documents — a fork PR reaching a root-capable persistent runner — through a new
door. This is the single highest-risk line in the CI change.

Two further points specific to this runner:

- **Use the vendored CLI (`npx supabase`), not `supabase/setup-cli@v1`.** The
  CLI is already a devDependency installed by `npm ci`, so the action adds a
  third-party dependency to a root-capable runner for no benefit.
- **Stop the database in an `if: always()` step.** The runner is persistent;
  `supabase db start` leaves a container and a bound port behind, and the next
  run — or a concurrent one on a different ref — collides with it.

`/api/health` deliberately does **not** gain a database check. Coolify polls it
continuously; a query per poll is avoidable load, and it would make an
unrelated Supabase blip present as "the application is down."

### Verified during design

The RLS *mechanism* was checked against a throwaway `postgres:17-alpine`
container rather than reasoned about, which is what caught two defects in an
earlier draft: `force row level security` silently reducing an admin's visible
rows from all to their own, and `revoke execute … from authenticated` making
every policy that calls the helper fail with `permission denied for function`.
Those findings are now encoded as pgTAP assertions above, so they cannot
regress silently.

## Files

**New**

```
lib/supabase/client.ts
lib/supabase/server.ts
lib/supabase/proxy.ts
lib/supabase/admin.ts
lib/supabase/database.types.ts          (generated)
lib/supabase/proxy.test.ts
lib/supabase/env.test.ts
lib/supabase/admin-import-guard.test.ts
supabase/config.toml
supabase/migrations/<ts>_auth_foundation.sql
supabase/tests/000-setup.sql
supabase/tests/010-rls-profiles.sql
supabase/tests/020-rls-user-roles.sql
supabase/tests/030-provisioning-trigger.sql
```

**Modified**

```
proxy.ts                                (compose Supabase + next-intl)
.env.example                            (key rename)
Dockerfile                              (ARG/ENV rename)
.github/workflows/ci.yml                (placeholder rename + db-tests job)
.github/workflows/build-and-push.yml    (build arg rename)
package.json                            (deps + db scripts)
CLAUDE.md                               (Supabase section, rules)
```

## Open items for the client

None. This work introduces no business rule. Pricing, turnaround times and the
grading scale remain client-supplied and are untouched here.
