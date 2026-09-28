# Profile and settings — name, email change, password change, account deletion

**Date:** 2026-09-28
**Status:** Implemented — see docs/superpowers/plans/2026-09-28-profile-settings.md for deviations
**Module:** M2 — Accounts & auth

## Goal

Let a signed-in user edit their name, change their email address, change their
password, and delete their account — the four things
`2026-09-23-auth-flows-design.md` deferred to this spec. That spec delivered
the email/password lifecycle and a landing `/account` page; this one delivers
`/account/settings`.

The estimate's M2 line is "Felhasználói profil és beállítások" — profile and
settings. Account deletion is not named in it, but an EU platform holding
names and, from M6, shipping addresses has to offer erasure; it is included on
that basis.

## Non-goals

- **Avatar.** Nothing in the estimate needs one.
- **Shipping address.** Collected where it is used, in M6.
- **Notification preferences.** There are no notifications to prefer until
  M3–M7 send order mail.
- **A "sign out everywhere" button.** Password change evicts other sessions
  (below); a standalone control is not in the estimate.
- **MFA.** Not in the estimate.
- **Data export** (the GDPR access right). Raised with the client alongside the
  retention question, not built.
- **An "account deleted" email.** Supabase has no such template, and our own
  transactional mail mechanism arrives with the first order email (M3). Until
  then deletion is confirmed on screen only. Recorded as a known gap.
- **Requiring names.** Names are optional here, as is standard for profile
  settings. They are required where they are used: at first submission (M3)
  and as the shipping recipient (M6).

## Decisions

### Deletion is a hard delete through the service-role client

Three models were considered:

1. **Hard delete** — the auth user is removed; everything that cascades goes
   with it.
2. **Soft delete** — `deleteUser(id, true)` anonymises the user and keeps the
   row.
3. **Deletion by request** — a button notifies an admin, who deletes by hand.

**Chosen: 1.** Soft delete keeps a derived form of the address, which is
harder to argue is erasure. Deletion by request is manual labour with no admin
UI until M5.

Two mechanisms can perform a hard delete:

- **`auth.admin.deleteUser()` via `lib/supabase/admin.ts`.** GoTrue removes the
  user with their identities, sessions and refresh tokens — the supported path.
- **A `SECURITY DEFINER` SQL function** deleting `auth.users where id =
  auth.uid()`, called over RPC. It keeps the service-role key out of the app
  but bypasses GoTrue's own cleanup, and places a user-callable "destroy
  myself" function in the exposed schema that every later migration has to
  reason around.

**Chosen: `auth.admin.deleteUser()`.** Its single caller is
`lib/auth/delete-current-user.ts`, which becomes the **only entry in
`admin-import-guard.test.ts`'s allowlist**. `deleteCurrentUser()` takes **no
argument**: it reads the verified `sub` from `getClaims()` itself, so no call
site can hand it another user's id. That is the smallest possible opening in
the guard, and the reason it is a module rather than two lines in an action.

### The deletion contract for tables that do not exist yet

Deletion is simple today because only `profiles` and `user_roles` reference
`auth.users`, and both cascade. The rule chosen now binds M3, M4, M5 and M7,
so it is written down here and in CLAUDE.md:

- **Nothing new `cascade`s from `auth.users`.** Only `profiles` and
  `user_roles` do.
- **Orders, payments and their logs reference the user `on delete set null`.**
  Personal fields on them (names, addresses) are scrubbed at deletion; the
  mechanism belongs to the M3/M7 design that introduces those fields.
- **Graded cards stay in the Pop Report.** They are public data about a card,
  not about its former owner.
- **Deletion is refused while the user has an order that is not finished** —
  their cards may physically be with the grader or in transit. M3 implements
  the check in `deleteAccount`; today there are no orders, so it cannot fire.
- **How long accounting records must be retained** is a legal question, not an
  engineering one. It is added to `docs/content-requests.md` for the client and
  their lawyer.

### Re-authentication: the current password, for password change and deletion

A settings page is reached with a session that may not be the owner's — an
unlocked laptop, a stolen cookie. The two irreversible or credential-changing
actions ask for the **current password**:

- **Password change** and **account deletion** re-verify it with
  `signInWithPassword` on the session client. Sign-in has Turnstile enabled, so
  both forms carry the widget and forward `captchaToken`. As a side effect the
  check mints a fresh session, which is what `secure_password_change`'s
  24-hour rule requires — no separate `reauthenticate()` step.
- **Email change does not ask for it.** `double_confirm_changes` already
  requires a click from the *old* inbox, which a stolen session cannot make.
- **Name change does not ask for it.** The row is the user's own and reversible.

Supabase's `reauthenticate()` (a 6-digit code by email) was rejected: it only
gates password updates natively, so deletion would need the password check
anyway — two mechanisms, and an email on every change.

The email address sent to `signInWithPassword` comes from `auth.getUser()`,
not from the JWT claims. After an email change completes on another device,
this device's claims carry the old address until the next refresh (up to an
hour); signing in with it would fail, and the user would be told their current
password is wrong.

`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD` (the
`current_password` attribute of `updateUser`) is not used. It would also apply
to `/reset-password`, whose user by definition does not know their current
password.

**`/reset-password` requires a recovery-origin session.** The auth-flows spec
let any signed-in session use it, which made it a back door around everything
above: the same unlocked laptop or stolen cookie could set a password there
with no current password and no Turnstile, evict the owner, and then pass the
deletion re-verification with the password it had just chosen. The page and
its action now admit only a session whose `amr` claim holds an `otp` entry
stamped within the last hour (`isRecoverySession` in
`lib/auth/recovery-session.ts`). Any other session is sent to
`/account/settings`; no session still goes to `/forgot-password`.

Observed on the local stack (GoTrue v2.196): a verified recovery link yields
`amr: [{method: "otp", timestamp}]`, a password sign-in
`[{method: "password", …}]`, and a refresh keeps the original entry and its
timestamp — so the window cannot be stretched by refreshing. GoTrue records
*every* verified email link as `otp` (sign-up confirmation and email change
too), so the gate admits "a session minted from the account's inbox within the
hour" rather than strictly "a recovery session". That is the same authority:
whoever controls the inbox can request a recovery link anyway. The alternative,
a marker cookie set by `/auth/confirm`, was rejected because the holder of a
stolen session can set any cookie they like; the `amr` entry is signed by Auth
and cannot be forged. One hour matches `otp_expiry` and `jwt_expiry`. A user who
opens the link and leaves the form for longer is sent to settings and must
request a new link.

### Email change: enumeration stays closed, so pending state is not shown

`updateUser({email})` to an address another account holds returns
`email_exists`. Showing that tells a signed-in user whether an address is
registered. As on sign-up, the enumeration rule wins: `email_exists` is treated
as success — "we've sent a link to both inboxes" — and reported to Sentry as a
suppressed warning.

That decision has a consequence. The page could show "change to x@… pending",
read from `new_email` — but `new_email` is set for a real change and not for a
suppressed one, so the indicator would leak exactly what the message hides. The
page therefore **does not show a pending change**. The success message says to
check both inboxes; a repeated request overwrites the previous one.

### Settings live at `/account/settings`

M3 puts order status tracking "in the user account", so `/account` becomes the
orders overview. Settings get their own route now rather than being moved out
later. One page, four cards, each its own form and Server Action, so a failure
in one does not reset the others.

### Names are two columns

`profiles.full_name` is replaced by `first_name` and `last_name`. Shipping
carriers and invoices want the parts separately, and a locale that puts the
family name first (Hungarian) can then format it without parsing. The form
always asks first name, then last name; *display* order is a formatting
concern for when a second locale is scoped.

No application code reads `full_name` — only the seed and pgTAP — so dropping
the column is rollback-safe: the image currently deployed never touches it.

## Routes

| Route | Kind | Behaviour |
|---|---|---|
| `/account` | page | Unchanged, plus a link to Settings. |
| `/account/settings` | page + actions | `requireUser()`. Cards: **Name**, **Email**, **Password**, **Delete account**. |
| `/auth/confirm` | page + action | Gains the `email_change` link type. |
| `/account-deleted` | page | In the `(auth)` group, static: the account is gone. A notice on the static home page would make it dynamic. |

## Flows

Every action, before anything else: resolves the bound locale with
`resolveLocale()`; reads the user from verified claims (`getClaims()`) and
redirects to `/sign-in?next=/account/settings` without them — a protected page
does not protect the action behind it; returns a **fresh** state object. **No
user id or email is ever read from form data.**

### 1. Name

- Fields `firstName`, `lastName`; `autocomplete="given-name"` /
  `"family-name"`.
- Each is trimmed; whitespace-only becomes `null`; each at most **100
  characters**, counted as code points to match Postgres `char_length`.
- `update profiles set first_name, last_name where id = sub` through
  `lib/supabase/server.ts`, so RLS is the boundary. The update asks for the row
  back (`.select("id").single()`): an update that silently matches nothing —
  the failure mode of a missing `select` policy — becomes an error, not a
  false "Saved".
- No Turnstile.

### 2. Email

- Field `email`, validated with `readEmail()`. Equal (case-insensitively) to
  the current address → `emailUnchanged`, without calling Supabase.
- `updateUser({ email })`. With `double_confirm_changes`, Supabase mails a link
  to each address. Result: "we've sent a confirmation link to both your current
  and your new address".
- `email_exists` → the same success, reported with
  `reportSuppressedAuthError`.
- **Confirmation** — `/auth/confirm` accepts `type=email_change`:
  - The **first** of the two links verifies but cannot complete the change, and
    creates no session. The action returns an inline "now confirm from your
    other inbox" state on the confirm page, which needs no session, so it works
    on whichever device opened the mail.
  - The **second** completes the change, returns a session, and redirects to
    `/account/settings`.
  - Failure → `/sign-in?error=link_expired`, as today.
  - **Verify at implementation:** what `verifyOtp` returns after the first link
    (expected: no error, no session), and the `email_change` template's
    variables — whether each of the two mails renders its own `{{ .TokenHash }}`.
- On completion Supabase sends the **`email_changed` notice** to the old
  address, matching `password_changed`.

### 3. Password

Fields `currentPassword`, `password`, Turnstile. In order:

1. `passwordProblem(password)`.
2. `signInWithPassword({ email: <from getUser()>, password: currentPassword,
   options: { captchaToken } })`. `invalid_credentials` →
   `currentPasswordIncorrect`, and nothing further runs.
3. `signOut({ scope: "others" })`. Failure → `sessionsNotRevoked`, password
   unchanged. Eviction precedes the change for the reason documented in
   `/reset-password`: done afterwards, a failure is unrecoverable by retry.
4. `updateUser({ password })`. `same_password` is already mapped.

Supabase sends `password_changed`. The form clears its password fields on
success.

### 4. Delete account

Fields `currentPassword`, Turnstile, beside copy that says plainly the deletion
is permanent and what it removes. In order:

1. Verify the password exactly as in flow 3, step 2.
2. `deleteCurrentUser()`. Failure → generic error, reported; nothing has
   changed, the session is intact, and a retry is safe.
3. Clear the auth cookies. The session no longer exists server-side, so
   `signOut` would fail; the cookie-clearing code already in the sign-out
   action is extracted into `lib/auth/clear-auth-cookies.ts` and used by both.
4. Redirect to `/account-deleted`.

Cookies are cleared only after deletion succeeds, so there is no state where
the account survives but the browser believes it is gone, or the reverse. An
access token already issued stays valid until `jwt_expiry` (at most an hour),
but matches no row: every policy keys on `auth.uid()`, and the rows are gone.
`AccountLink` re-reads the session on navigation and shows "Sign in".

**Styling.** The design system has no danger colour; the auth error alert is
neutral for the same reason. The card uses a ghost button and neutral tokens.
Adding a danger colour is a design-system decision, flagged at review rather
than made here.

## Error handling

New `auth.errors` keys:

| Key | When |
|---|---|
| `currentPasswordIncorrect` | `invalid_credentials` from the re-verification in flows 3 and 4 |
| `nameTooLong` | A name over 100 characters |
| `emailUnchanged` | The new address equals the current one |

`AuthFlow` gains `updateName`, `changeEmail`, `changePassword`,
`deleteAccount`; unmapped Supabase codes report through `reportAuthError` as
today.

The name update fails with a PostgREST error, not an `AuthError`, which
`reportAuthError` does not accept. A sibling, `reportProfileError(error,
flow)`, reports the Postgres `code` only — **never the message**, because a
check-constraint violation message names the column and can echo the value.

## Data

### Migration

```sql
alter table public.profiles
  add column first_name text check (char_length(first_name) <= 100),
  add column last_name  text check (char_length(last_name)  <= 100),
  drop column full_name;
```

Policies, grants and triggers are unchanged: the update policy is row-scoped
and `updated_at` is set by the existing trigger. `database.types.ts` is
regenerated. `supabase/seed.sql` sets `first_name`/`last_name` for its two
users (`Example` / `User`, `Example` / `Admin`).

### Configuration

`supabase/config.toml` — `double_confirm_changes` and `secure_password_change`
are already `true`. Added:

| Section | Content |
|---|---|
| `[auth.email.template.email_change]` | `supabase/templates/email_change.html`; link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change` |
| `[auth.email.notification.email_changed]` | `enabled = true`, `supabase/templates/email_changed.html`, no link — same reasoning as `password_changed` |

`scripts/push-auth-templates.mjs` gains both sections in `FIELDS` (field names
verified against the Management API at implementation). The hosted project's
"Secure email change" and "Secure password change" toggles are added to the
checklist in `docs/deployment/AUTH_SETUP.md`: none of them travel with
migrations.

## Files

```
supabase/migrations/<ts>_profile_names.sql
supabase/tests/030-rls-profiles.sql, 050-provisioning.sql   # new columns
supabase/tests/0xx-profile-names.sql                        # length checks
supabase/seed.sql
supabase/config.toml
supabase/templates/{email_change,email_changed}.html
scripts/push-auth-templates.mjs
lib/supabase/database.types.ts                              # regenerated
lib/supabase/admin-import-guard.test.ts                     # one allowlist entry
lib/auth/delete-current-user.ts
lib/auth/clear-auth-cookies.ts
lib/auth/errors.ts                                          # flows, keys, reportProfileError
lib/auth/profile-name.ts                                    # trim / null / length rule
app/[locale]/account/page.tsx                               # Settings link
app/[locale]/account/actions.ts                             # uses clear-auth-cookies
app/[locale]/account/settings/{page.tsx,actions.ts}
app/[locale]/(auth)/auth/confirm/actions.ts                 # email_change
app/[locale]/(auth)/account-deleted/page.tsx
messages/en.json                                            # auth.settings, auth.errors
docs/deployment/AUTH_SETUP.md
docs/content-requests.md                                    # retention, data export, deletion copy
CLAUDE.md                                                   # deletion contract, allowlist entry
```

## Testing

Repo conventions: colocated, `globals: false`, `renderWithIntl`, copy asserted
from `messages/en.json`, `// @vitest-environment node` for server code.

- **`profile-name`** — trims; whitespace-only → `null`; 100 code points
  accepted, 101 rejected; an astral character counts as one.
- **Name action** — saves both; clears to `null`; `nameTooLong`; no row
  returned → generic error and `reportProfileError`; no claims → sign-in.
- **Email action** — success state; `email_exists` indistinguishable from
  success and reported as suppressed; `emailUnchanged` without calling
  Supabase; rate limit → `rateLimited`.
- **Password action** — wrong current password → `currentPasswordIncorrect`
  and `updateUser` never called; `captchaToken` forwarded; the email used is
  `getUser()`'s, not the claims'; eviction before update; failed eviction →
  `sessionsNotRevoked`, `updateUser` never called; `same_password`.
- **Delete action** — wrong password → nothing deleted; success clears cookies
  and redirects to `/account-deleted`; admin failure → generic error, cookies
  intact.
- **Every action** — a `userId`/`email` field in the form data is ignored.
- **`deleteCurrentUser`** — deletes `claims.sub` and nothing else; without
  claims, does not call the admin API.
- **Confirm action** — `email_change` first link → inline state; second →
  `/account/settings`; failure → `link_expired`; unknown types still refused.
- **Admin guard** — the allowlist is exactly `lib/auth/delete-current-user.ts`.
- **Settings page** — the four cards render with their labels; the password and
  delete forms carry Turnstile, the name and email forms do not.
- **pgTAP** — 101-character `first_name`/`last_name` rejected; a user updates
  their own names and not another's (`030`, `050` moved to the new columns).

**Manual verification on the local stack with Mailpit:** change and clear the
name; change email, click the first link (inline message), the second (lands on
settings, new address shown), `email_changed` reaches the old address; change
email to the other seeded user's address (same message, no mail to it); change
password in one browser and see another evicted, with the `password_changed`
mail; delete the account, see `/account-deleted`, confirm sign-in fails and the
`profiles`/`user_roles` rows are gone.

## Client dependencies

Added to `docs/content-requests.md`:

- **Retention of order and payment records after deletion** — how long, and
  which fields. Legal, blocking M3/M7's scrub design rather than this spec.
- **Data export** — whether the client wants a self-service GDPR access
  request, or handles it by email.
- **Deletion copy** — the "what is removed" wording is ours and functional; the
  client may want their lawyer to see it alongside the privacy policy.
- **Turnstile** — the password and delete forms add two uses to the existing
  scope-addition item; no further cost.
