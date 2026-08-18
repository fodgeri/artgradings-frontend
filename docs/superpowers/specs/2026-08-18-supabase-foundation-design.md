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
- **A local Supabase stack.** Explicitly rejected — see *Environment strategy*.
- **Automated migration deployment.** Applying DDL to production from CI, with
  no test project to rehearse against, is a worse risk than a manual step. See
  *Migrations*.
- **A `role_permissions` admin UI.** Roles are assignable via SQL and the
  `roles.assign` permission exists, but no screen consumes it until M5.

## Decisions and their rationale

### Environment strategy: cloud-only

A hosted EU project already exists. No local CLI stack (`supabase start`) is
introduced, so Docker is not a prerequisite for working on the database.

The cost is named rather than absorbed: **without an ephemeral database there is
no automated RLS testing.** See *Testing* for what this does and does not
cover. This is the single largest known gap in the work, and it closes when the
phase-2 test project lands alongside `develop` — the same pairing
`docs/deployment/CICD_PIPELINE.md` already requires of a branch and a host.

### Roles: table-resolved, not JWT-resolved

Two mechanisms were considered for getting a user's role into a policy:

1. **Custom Access Token Hook** — a Postgres function injects the role into the
   JWT at issue time; policies read `auth.jwt()`.
2. **Lookup in the database** — a `SECURITY DEFINER` helper reads the role
   tables; policies call the helper.

**Chosen: 2.** Three reasons, in order of weight:

- **It is entirely versioned SQL.** The auth hook is enabled through dashboard
  configuration, not a migration. With cloud-only development and a phase-2
  test project still to be created, every piece of un-versioned configuration
  is something that must later be reproduced by hand with no diff to check it
  against.
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

RLS is `enable`d **and** `force`d on all five tables. `force` closes the
table-owner path; the `service_role` client continues to bypass policies
through its `BYPASSRLS` role attribute, which is unaffected and is the intended
behaviour for `admin.ts`.

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

revoke execute on function private.has_permission(text)
  from public, anon, authenticated, service_role;
```

Four properties, each of which is required rather than stylistic:

- **`security definer` prevents infinite recursion.** The function reads
  `user_roles`, and `user_roles`' own policy calls the function. Without the
  RLS bypass this recurses until Postgres raises a stack-depth error — during
  login, and presenting as nothing resembling a permissions problem.
- **The identity check is inside the body.** `auth.uid()` is read within the
  function, not passed in by the caller. A `SECURITY DEFINER` function that
  accepts the user it should act as is an authorization bypass.
- **It lives in `private`, not `public`.** The `public` schema is exposed
  through PostgREST; a security-definer function there is callable over the
  API.
- **`execute` is revoked from every role**, including `service_role`. Policies
  invoke it as the definer, so no application role needs the grant.

### Policies

All policies are declared `to authenticated`, so anonymous requests
short-circuit without evaluating the expression. All function calls are wrapped
as `(select …)` so they evaluate once per statement as an InitPlan rather than
once per row.

Where a table needs both an ownership rule and a permission rule for the same
command, they are combined into **one policy with `or`** rather than two
permissive policies. Permissive policies are OR-ed anyway, and a single policy
evaluates more cheaply.

| Table | Command | Rule |
|---|---|---|
| `profiles` | select | `id = (select auth.uid())` **or** `has_permission('profiles.read_all')` |
| `profiles` | update | `id = (select auth.uid())`, both `using` and `with check` |
| `profiles` | insert / delete | No policy. Rows are created by the trigger and removed by cascade. |
| `user_roles` | select | `user_id = (select auth.uid())` **or** `has_permission('roles.read_all')` |
| `user_roles` | insert / update / delete | `has_permission('roles.assign')` |
| `roles` | select | `true` |
| `permissions` | select | `true` |
| `role_permissions` | select | `true` |
| `roles`, `permissions`, `role_permissions` | write | No policy. Migration-only. |

The three reference tables are readable by any authenticated user because they
describe the system's vocabulary, not anybody's data. They have no write
policy, so with RLS forced they are unwritable except by migration or the
`service_role` client.

`profiles` has no insert policy by design, so a user cannot create a second
profile row. Its update policy repeats the ownership test in `with check` as
well as `using`, which is what prevents a user from moving their own row to
another `id` — `using` alone would permit the write and only restrict which
rows are visible to update.

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
db:push   supabase db push
db:types  supabase gen types typescript --linked > lib/supabase/database.types.ts
```

None of these require Docker. `supabase db diff` does, which is why migrations
are authored rather than diffed — an acceptable trade at this schema size.

**Migrations are applied manually, not by CI.** Automating `db push` on merge
would apply DDL to production automatically and would require CI to hold a
privileged access token and the database password. With no test project to
rehearse against, that trade is bad. Phase 2 introduces the test project and
this automation together — the same rule `CLAUDE.md` already states for
branches and hosts.

`lib/supabase/database.types.ts` is generated and committed, and is excluded
from lint and coverage. Regenerating it after a schema change is part of the
migration step, not a separate chore.

## Testing

Following repo convention: Vitest, colocated `*.test.ts`, `globals: false`,
never asserting user-facing copy as a literal.

**Covered:**

- **Proxy cookie merge.** Mocked request/response asserting that cookies set by
  the Supabase step survive onto the next-intl response *including when
  next-intl returns a redirect*. This is the highest-risk code in the change
  and the failure it guards is intermittent, so it is tested directly rather
  than by inspection.
- **Client factories** throw on missing environment variables rather than
  constructing a client that fails opaquely at first use.
- **`admin.ts` import guard** — a static assertion that the `service_role`
  client is imported nowhere but server-only paths, in the same shape as the
  existing `components/gold-ink.test.ts` token guard.

**Not covered — RLS policy behaviour.** There is no ephemeral database, so
pgTAP cannot run. In its place, `supabase/tests/rls-manual.sql` holds
impersonation snippets (`set local role authenticated;
set local request.jwt.claims …`) asserting that user A cannot read user B's
profile, that a non-admin cannot write `user_roles`, and that the reference
tables reject writes. These are reviewable and repeatable but **run by hand**,
paired with Supabase's Security Advisor after each push.

This is stated as a gap rather than a mitigation. The security boundary of this
platform is not automatically verified until the phase-2 test project exists.

`/api/health` deliberately does **not** gain a database check. Coolify polls it
continuously; a query per poll is avoidable load, and it would make an
unrelated Supabase blip present as "the application is down."

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
supabase/tests/rls-manual.sql
```

**Modified**

```
proxy.ts                                (compose Supabase + next-intl)
.env.example                            (key rename)
Dockerfile                              (ARG/ENV rename)
.github/workflows/ci.yml                (placeholder rename)
.github/workflows/build-and-push.yml    (build arg rename)
package.json                            (deps + db scripts)
CLAUDE.md                               (Supabase section, rules)
```

## Open items for the client

None. This work introduces no business rule. Pricing, turnaround times and the
grading scale remain client-supplied and are untouched here.
