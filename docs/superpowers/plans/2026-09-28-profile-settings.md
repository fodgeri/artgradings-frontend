# Profile and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can edit their first and last name, change their email address, change their password, and delete their account, from `/account/settings`.

**Architecture:** One settings page of four cards, each an `AuthForm` posting to its own Server Action in `app/[locale]/account/settings/actions.ts`. Names move from `profiles.full_name` to `first_name`/`last_name` by migration. Password change and deletion re-verify the current password with `signInWithPassword`; deletion goes through `lib/auth/delete-current-user.ts`, the only file allowed to import the service-role client. Email change uses Supabase's double-confirm flow through the existing `/auth/confirm`.

**Tech Stack:** Next.js 16 App Router (Server Actions), React 19, next-intl, `@supabase/ssr` + `@supabase/supabase-js`, Postgres/pgTAP via the Supabase CLI, Vitest 4 + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-profile-settings-design.md` — read it before Task 1. Where this plan departs from it, *Deviations from the spec* says so and why.

## Global Constraints

- **All user-facing copy lives in `messages/en.json`** under `auth.*`. The email templates in `supabase/templates/` are the single exception — Supabase renders them.
- **Never assert user-facing copy as a literal in a test.** Import `messages/en.json` and assert against `messages.auth.…`.
- **Import `Link`, `redirect` from `@/i18n/navigation`**, never from `next/*`.
- **In a Server Action, always `return redirect({ href, locale })`** with an explicit locale, never inside a `try` block — it works by throwing.
- **Every action validates its locale with `resolveLocale()`** and reads the user from verified claims (`requireUser()`) before anything else. **No user id or email is ever read from form data.**
- **Every action returns a *fresh* state object** (never a shared constant) — the Turnstile widget resets when the state object's identity changes.
- **Map Supabase errors by `error.code` only, never by `error.message`.** Report through `reportAuthError()` / `reportSuppressedAuthError()` / `reportProfileError()` only — never the error object, never form data.
- **Email change never reveals whether another account holds an address.** `revealsAccount()` codes are treated as success.
- **`lib/supabase/admin.ts` is imported by `lib/auth/delete-current-user.ts` and nothing else.** `deleteCurrentUser()` takes no argument.
- **Password limits come from `lib/auth/password.ts`; the name limit from `lib/auth/profile-name.ts`** (`NAME_MAX_LENGTH = 100`), mirrored by the migration's check constraints.
- **Never write `text-gold`.** Gold text is `text-gold-ink`. There is no danger colour; do not invent one.
- **Tests are colocated, `globals: false`** (import `describe`/`test`/`expect`/`vi` from `vitest`), component tests use `renderWithIntl` from `@/test/i18n`, server-side tests put `// @vitest-environment node` on line 1.
- **Async Server Components are not unit-tested** (Vitest cannot render them). Put testable UI in a synchronous component beside the page.
- **Migrations are hand-written and replay from empty.** `database.types.ts` is regenerated with `npm run db:types`, never hand-edited. `supabase/seed.sql` stays local-only and obviously synthetic.
- **The branch is `feature/profile-settings`,** already created. Commit after every task, conventional-commit style, ending every message with:

  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```

## Review Focus

1. **Email change as an account-existence oracle.** A taken address returns `email_exists`; a free one sends mail and then, on a quick resubmit, `over_email_send_rate_limit`. If those two looked different, submitting an address twice would reveal whether it is registered. Both — and `user_already_exists` — must return the same `sent` state. → Test in Task 5.
2. **Stale claims after an email change.** Once a change completes on another device, this device's JWT carries the old address for up to an hour. Password change and deletion must re-verify against the address from `auth.getUser()`, not the claims, or the user is told their correct password is wrong. → Tests in Task 6.
3. **A wrong current password must stop everything.** No `signOut`, no `updateUser`, no `deleteCurrentUser` — and an empty one must not reach Supabase at all. → Tests in Task 6.
4. **The first email-change link, clicked twice.** After the first confirmation the token is spent; a second click on the same page would land on "link expired". The confirm form hides its button once it reports the partial state. → Tests in Tasks 3 and 7.
5. **Deletion failing half-way.** If the admin delete fails, the session must be untouched and the user must stay on the page with an error. If it succeeds but `signOut` fails, the auth cookies must still be cleared. → Tests in Tasks 4 and 6.

## Deviations from the spec

| Spec says | Plan does | Why |
|---|---|---|
| Extract cookie clearing into `lib/auth/clear-auth-cookies.ts` | `lib/auth/end-local-session.ts`: `signOut({scope: "local"})`, falling back to clearing cookies by hand | auth-js's `signOut` already ignores the 401/403/404 a deleted user's token produces and removes the session itself. Calling it, with the sign-out action's existing fallback, is the same logic in one place, and it clears whatever chunk count the session actually has. |
| `first_name`/`last_name` `check (char_length(...) <= 100)` | `check (char_length(...) between 1 and 100)` | The app stores a blank name as `null`. Forbidding `''` in the database too means "name present" is `is not null` everywhere M3 and M6 check it, whatever wrote the row. |
| Email tests: "rate limit → `rateLimited`" | `over_email_send_rate_limit` on email change is treated as success, via `revealsAccount()` | Review Focus 1: a rate-limit error for a free address next to a silent success for a taken one is an oracle. The enumeration rule wins, as on sign-up. |
| `AuthForm` unchanged | Gains `resetOnSent`, `doneOnSent`, `submitVariant`, and the `{nameMax}` interpolation | Password fields must clear after a change; the partial email-change confirmation must not offer a second click; the delete button is ghost-styled. |
| Files list | Adds `app/[locale]/account/settings/settings-cards.tsx` | The page is an async Server Component, which Vitest cannot render. The cards are a synchronous component the page feeds, and that is what gets tested. |
| `email_changed` notice: "no link — same reasoning as `password_changed`" | Same, and its "not you?" line says to contact support | The old inbox can no longer reset the password — reset mail now goes to the new address. The support contact is a new content request. |
| Auth-flows spec: `/reset-password` accepts any signed-in session | Page and action require `isRecoverySession()` — an `amr` `otp` entry stamped within the hour; any other session goes to `/account/settings` | Final review: any session could set a password there with no current password and no Turnstile, evict the owner, then pass the deletion re-verification. GoTrue records every verified email link as `otp` (observed), so the gate means "minted from the inbox within the hour" — the authority a recovery link grants anyway. A marker cookie was rejected: a stolen session's holder can set any cookie; `amr` is signed. |
| Email change: "enumeration stays closed" | On-screen response uniform; the requester's-inbox side channel accepted | GoTrue checks for a taken address before sending, so only a free address mails the requester's own inbox. No code can close that; it is bounded by the per-user send frequency. |

---

## File Structure

**Database (`supabase/`)**
- `migrations/<ts>_profile_names.sql` — `first_name`, `last_name`; drop `full_name`
- `tests/030-rls-profiles.sql`, `tests/050-provisioning.sql` — moved to the new columns
- `tests/060-profile-names.sql` — the length and emptiness checks
- `seed.sql` — first/last names for the two seeded users
- `config.toml` — `email_change` template, `email_changed` notice
- `templates/email_change.html`, `templates/email_changed.html`

**Auth library (`lib/auth/`)**
- `profile-name.ts` — `NAME_MAX_LENGTH`, `normalizeName()`, `nameTooLong()`
- `errors.ts` — new flows, `reportProfileError()`
- `end-local-session.ts` — `endLocalSession(supabase, flow)`
- `delete-current-user.ts` — `deleteCurrentUser()`, the only service-role caller

**Components**
- `components/auth/auth-form.tsx` — `resetOnSent`, `doneOnSent`, `submitVariant`, `{nameMax}`

**Routes (`app/[locale]/`)**
- `account/page.tsx` — Settings link
- `account/actions.ts` — `signOut` uses `endLocalSession`
- `account/settings/actions.ts` — `updateName`, `changeEmail`, `changePassword`, `deleteAccount`
- `account/settings/settings-cards.tsx` — the four cards
- `account/settings/page.tsx` — loads the profile and address, renders the cards
- `(auth)/auth/confirm/{actions.ts,page.tsx}` — `email_change`
- `(auth)/account-deleted/page.tsx`

**Other**
- `lib/supabase/admin.ts` (comment), `lib/supabase/admin-import-guard.test.ts` (allowlist), `lib/supabase/database.types.ts` (regenerated)
- `scripts/push-auth-templates.mjs` (+ test)
- `messages/en.json`
- `docs/deployment/AUTH_SETUP.md`, `docs/content-requests.md`, `CLAUDE.md`, the spec's status line

---

### Task 1: Names as two columns

**Files:**
- Create: `supabase/migrations/<timestamp>_profile_names.sql` (via `npm run db:new profile_names`)
- Create: `supabase/tests/060-profile-names.sql`
- Modify: `supabase/tests/030-rls-profiles.sql`, `supabase/tests/050-provisioning.sql`, `supabase/seed.sql`
- Regenerate: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `public.profiles.first_name text null`, `public.profiles.last_name text null`, each `char_length` 1–100; `full_name` gone. Generated types expose `first_name: string | null`, `last_name: string | null` on `profiles` Row/Update.

The local stack must be running: `npm run db:start` (Docker). If it is already running, leave it.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/060-profile-names.sql`:

```sql
-- The name columns' limits. The application enforces the same rule in
-- lib/auth/profile-name.ts; these checks hold whatever writes the row.
begin;
select plan(6);

select tests.clear_auth();
select tests.create_user('names@example.test') as uid \gset
select tests.authenticate_as(:'uid');

-- Inside $$ psql variables are not interpolated, so each statement targets
-- the impersonated user through auth.uid().
select lives_ok(
  $$update public.profiles
       set first_name = repeat('a', 100), last_name = repeat('b', 100)
     where id = auth.uid()$$,
  '100-character names are accepted'
);

-- char_length counts characters, not bytes: 100 two-byte letters still fit.
select lives_ok(
  $$update public.profiles set first_name = repeat('é', 100) where id = auth.uid()$$,
  'the limit counts characters, not bytes'
);

select throws_ok(
  $$update public.profiles set first_name = repeat('a', 101) where id = auth.uid()$$,
  '23514', null,
  'a 101-character first name is rejected'
);

select throws_ok(
  $$update public.profiles set last_name = repeat('b', 101) where id = auth.uid()$$,
  '23514', null,
  'a 101-character last name is rejected'
);

-- Absent is null, never the empty string, so "has a name" is `is not null`.
select throws_ok(
  $$update public.profiles set first_name = '' where id = auth.uid()$$,
  '23514', null,
  'an empty name is rejected'
);

select lives_ok(
  $$update public.profiles set first_name = null, last_name = null where id = auth.uid()$$,
  'names can be cleared to null'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Move the existing tests to the new columns**

In `supabase/tests/030-rls-profiles.sql`, replace the last two assertions' block:

```sql
-- A user may rename themselves.
select tests.authenticate_as(:'alice_id');
update public.profiles set first_name = 'Alice' where id = :'alice_id'::uuid;
select is(
  (select first_name from public.profiles where id = :'alice_id'::uuid),
  'Alice',
  'a user can update their own profile'
);

-- But not anybody else. The update matches no visible row rather than raising.
update public.profiles set first_name = 'hacked' where id = :'bob_id'::uuid;
select tests.clear_auth();
select is(
  (select first_name from public.profiles where id = :'bob_id'::uuid),
  null,
  'a user cannot update another user''s profile'
);
```

In `supabase/tests/050-provisioning.sql`, change `set full_name = 'Fresh', updated_at = 'epoch'` to `set first_name = 'Fresh', updated_at = 'epoch'`.

- [ ] **Step 3: Run pgTAP to verify it fails**

Run: `npm run db:test`
Expected: FAIL — `column "first_name" of relation "profiles" does not exist` in 030, 050 and 060.

- [ ] **Step 4: Write the migration**

Run `npm run db:new profile_names`, then put this in the created file:

```sql
-- Names as two columns. Carriers (M6) and invoices (M7) want them separately,
-- and a locale that writes the family name first can format them without
-- parsing one string.
--
-- Dropping full_name is rollback-safe: no application code ever read it —
-- only seed.sql and pgTAP did — so the image running before this migration
-- is unaffected by its absence.
alter table public.profiles
  add column first_name text,
  add column last_name text,
  drop column full_name;

-- Between 1 and 100 CHARACTERS (char_length, not octet_length), matching
-- NAME_MAX_LENGTH in lib/auth/profile-name.ts, which counts code points.
-- The lower bound makes absent always null, never '': "has a name" is then
-- `is not null` everywhere M3 and M6 ask.
alter table public.profiles
  add constraint profiles_first_name_length
    check (char_length(first_name) between 1 and 100),
  add constraint profiles_last_name_length
    check (char_length(last_name) between 1 and 100);
```

Policies, grants and the `updated_at` trigger are unchanged: the update policy is row-scoped, not column-scoped.

- [ ] **Step 5: Update the seed**

In `supabase/seed.sql`, replace the two `full_name` updates at the end:

```sql
update public.profiles
set first_name = 'Example', last_name = 'User'
where id = '00000000-0000-0000-0000-0000000000a1';

update public.profiles
set first_name = 'Example', last_name = 'Admin'
where id = '00000000-0000-0000-0000-0000000000a2';
```

- [ ] **Step 6: Replay and test**

Run: `npm run db:reset && npm run db:test`
Expected: reset replays every migration and the seed without error; every pgTAP file passes, including `060-profile-names.sql` (6 tests).

- [ ] **Step 7: Regenerate the types**

Run: `npm run db:types`
Expected: `lib/supabase/database.types.ts` changes only in `profiles` — `full_name` replaced by `first_name` and `last_name` in Row, Insert and Update. Check with `git diff lib/supabase/database.types.ts`.

Then `npx tsc --noEmit` — expected: no errors (nothing in the app read `full_name`). If `.next/types` is missing and tsc complains about `PageProps`, run `npm run build` first (CLAUDE.md: CI runs build before typecheck for this reason).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/tests supabase/seed.sql lib/supabase/database.types.ts
git commit -m "feat: split profile names into first_name and last_name

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The name rule and the new error keys

**Files:**
- Create: `lib/auth/profile-name.ts`, `lib/auth/profile-name.test.ts`
- Modify: `lib/auth/errors.ts`, `lib/auth/errors.test.ts`, `messages/en.json`

**Interfaces:**
- Produces:
  - `NAME_MAX_LENGTH: 100`
  - `normalizeName(raw: string): string | null`
  - `nameTooLong(name: string | null): boolean`
  - `AuthFlow` gains `"updateName" | "changeEmail" | "changePassword" | "deleteAccount"`
  - `reportProfileError(error: { code?: string }, flow: AuthFlow): void`
  - `auth.errors` keys `currentPasswordIncorrect`, `nameTooLong` (uses `{nameMax}`), `emailUnchanged` — so `AuthErrorKey` includes them

- [ ] **Step 1: Write the failing tests**

Create `lib/auth/profile-name.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";

import { NAME_MAX_LENGTH, nameTooLong, normalizeName } from "./profile-name";

describe("normalizeName", () => {
  test("trims surrounding whitespace", () => {
    expect(normalizeName("  Ada \t")).toBe("Ada");
  });

  test("keeps inner spaces", () => {
    expect(normalizeName("Mary Ann")).toBe("Mary Ann");
  });

  test.each(["", "   ", "\n\t "])("turns %j into null", (raw) => {
    expect(normalizeName(raw)).toBeNull();
  });
});

describe("nameTooLong", () => {
  test("the limit is 100, mirroring the database check", () => {
    expect(NAME_MAX_LENGTH).toBe(100);
  });

  test("null is never too long", () => {
    expect(nameTooLong(null)).toBe(false);
  });

  test("accepts exactly the limit and rejects one more", () => {
    expect(nameTooLong("a".repeat(100))).toBe(false);
    expect(nameTooLong("a".repeat(101))).toBe(true);
  });

  test("counts an astral character as one, as Postgres char_length does", () => {
    // "𝒜" is two UTF-16 code units; String.length would count 200.
    expect(nameTooLong("𝒜".repeat(100))).toBe(false);
  });
});
```

Append to `lib/auth/errors.test.ts` — first add `reportProfileError` to the destructured import on the `await import("./errors")` line, then add:

```ts
describe("reportProfileError", () => {
  test("sends the flow and the Postgres code, never the message", () => {
    // A check-constraint message names the column and can echo the value.
    reportProfileError(
      { code: "23514", message: 'new row violates check constraint "x" — value Someone' },
      "updateName",
    );

    const [reported, context] = mocks.captureException.mock.calls[0];
    expect(JSON.stringify([String(reported), context])).not.toContain("Someone");
    expect(context).toMatchObject({ tags: { "auth.flow": "updateName", "db.code": "23514" } });
  });

  test("tolerates an error without a code", () => {
    reportProfileError({}, "updateName");
    expect(mocks.captureException.mock.calls[0][1]).toMatchObject({
      tags: { "db.code": "none" },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/auth/profile-name.test.ts lib/auth/errors.test.ts`
Expected: FAIL — cannot resolve `./profile-name`; `reportProfileError is not a function`.

- [ ] **Step 3: Implement**

Create `lib/auth/profile-name.ts`:

```ts
/**
 * The name rule. The single source for the action check, the inputs'
 * `maxLength`, and the `{nameMax}` message interpolation. The migration's
 * `profiles_*_name_length` checks mirror it and must change with it.
 *
 * A guard against abuse, not a naming rule: nothing here decides what a
 * valid name looks like.
 */
export const NAME_MAX_LENGTH = 100;

/** Trimmed, or null when nothing is left — absent is null, never "". */
export function normalizeName(raw: string): string | null {
  const name = raw.trim();
  return name === "" ? null : name;
}

export function nameTooLong(name: string | null): boolean {
  // Array.from splits by code point, matching Postgres char_length.
  return name !== null && Array.from(name).length > NAME_MAX_LENGTH;
}
```

In `lib/auth/errors.ts`, extend the union:

```ts
export type AuthFlow =
  | "signUp"
  | "resend"
  | "signIn"
  | "forgotPassword"
  | "confirm"
  | "resetPassword"
  | "signOut"
  | "updateName"
  | "changeEmail"
  | "changePassword"
  | "deleteAccount";
```

and add after `reportSuppressedAuthError`:

```ts
/**
 * Reports a failed profile write. PostgREST errors are not `AuthError`s, so
 * `reportAuthError` does not take them.
 *
 * The Postgres code only — never the message, which for a check-constraint
 * violation names the column and can echo the value.
 */
export function reportProfileError(error: { code?: string }, flow: AuthFlow): void {
  Sentry.captureException(new Error(`Unexpected profile error in ${flow}`), {
    tags: { "auth.flow": flow, "db.code": error.code ?? "none" },
  });
}
```

In `messages/en.json`, add to `auth.errors` (before `generic`):

```json
"currentPasswordIncorrect": "That isn't your current password.",
"nameTooLong": "Keep each name to {nameMax} characters or fewer.",
"emailUnchanged": "That's already your email address.",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/auth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/profile-name.ts lib/auth/profile-name.test.ts lib/auth/errors.ts lib/auth/errors.test.ts messages/en.json
git commit -m "feat: add the profile name rule and settings error keys

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: AuthForm options for settings forms

**Files:**
- Modify: `components/auth/auth-form.tsx`, `components/auth/auth-form.test.tsx`

**Interfaces:**
- Consumes: `NAME_MAX_LENGTH` (Task 2), the `nameTooLong` message (Task 2).
- Produces: `AuthForm` props
  - `resetOnSent?: boolean` — clear every field after a `sent` state
  - `doneOnSent?: boolean` — hide the submit button after a `sent` state
  - `submitVariant?: "gold" | "ink" | "ghost"` — defaults to the button's default (`gold`)
  - error messages receive `{ min, max, nameMax }`

- [ ] **Step 1: Write the failing tests**

In `components/auth/auth-form.test.tsx`, replace `renderForm` with:

```tsx
function renderForm(
  props: {
    captcha?: boolean;
    sentMessage?: string;
    resetOnSent?: boolean;
    doneOnSent?: boolean;
    submitVariant?: "gold" | "ink" | "ghost";
  } = {},
) {
  return renderWithIntl(
    <AuthForm
      action={action}
      submitLabel={messages.auth.signIn.submit}
      captcha={props.captcha ?? false}
      sentMessage={props.sentMessage}
      resetOnSent={props.resetOnSent}
      doneOnSent={props.doneOnSent}
      submitVariant={props.submitVariant}
    >
      <Field label={messages.auth.fields.email}>
        <FieldInput type="email" name="email" required />
      </Field>
    </AuthForm>,
  );
}
```

and add inside `describe("AuthForm", …)`:

```tsx
  test("interpolates the name limit into an error", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "nameTooLong" });
    const { user } = renderForm();
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("100");
  });

  test("keeps the fields after success by default", async () => {
    action.mockResolvedValue({ status: "sent" });
    const { user } = renderForm({ sentMessage: messages.auth.forgotPassword.sent });
    await submit(user);

    await screen.findByRole("status");
    expect(screen.getByLabelText(messages.auth.fields.email)).toHaveValue("user@example.test");
  });

  test("clears the fields after success with resetOnSent", async () => {
    action.mockResolvedValue({ status: "sent" });
    const { user } = renderForm({ sentMessage: messages.auth.forgotPassword.sent, resetOnSent: true });
    await submit(user);

    await screen.findByRole("status");
    await waitFor(() =>
      expect(screen.getByLabelText(messages.auth.fields.email)).toHaveValue(""),
    );
  });

  test("keeps the fields after an error even with resetOnSent", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "invalidCredentials" });
    const { user } = renderForm({ resetOnSent: true });
    await submit(user);

    await screen.findByRole("alert");
    expect(screen.getByLabelText(messages.auth.fields.email)).toHaveValue("user@example.test");
  });

  test("hides the submit button once sent with doneOnSent", async () => {
    action.mockResolvedValue({ status: "sent" });
    const { user } = renderForm({ sentMessage: messages.auth.forgotPassword.sent, doneOnSent: true });
    await submit(user);

    await screen.findByRole("status");
    expect(
      screen.queryByRole("button", { name: messages.auth.signIn.submit }),
    ).not.toBeInTheDocument();
  });

  test("keeps the submit button after an error with doneOnSent", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "generic" });
    const { user } = renderForm({ doneOnSent: true });
    await submit(user);

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: messages.auth.signIn.submit })).toBeInTheDocument();
  });

  test("styles the submit button with submitVariant", () => {
    renderForm({ submitVariant: "ghost" });
    // `ghost` is the only variant built on the `glass` utility.
    expect(screen.getByRole("button", { name: messages.auth.signIn.submit }).className).toContain(
      "glass",
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/auth/auth-form.test.tsx`
Expected: FAIL — the name-limit alert does not contain "100" (next-intl reports a missing `nameMax` argument), the reset/done/variant tests fail, and TypeScript flags the unknown props.

- [ ] **Step 3: Implement**

In `components/auth/auth-form.tsx`:

Imports become:

```tsx
import { useLocale, useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { Turnstile } from "@/components/auth/turnstile";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type AuthAction, initialAuthState } from "@/lib/auth/action-state";
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { NAME_MAX_LENGTH } from "@/lib/auth/profile-name";
```

Add to the doc comment, after the "Needs JavaScript" paragraph:

```tsx
 * `resetOnSent` clears the form after success — for password fields, which
 * must not linger. `doneOnSent` removes the submit button after success — for
 * a single-use token, where a second click can only fail.
```

Signature and body:

```tsx
export function AuthForm({
  action,
  submitLabel,
  sentMessage,
  captcha = true,
  resetOnSent = false,
  doneOnSent = false,
  submitVariant,
  children,
}: {
  action: AuthAction;
  submitLabel: string;
  sentMessage?: string;
  captcha?: boolean;
  resetOnSent?: boolean;
  doneOnSent?: boolean;
  submitVariant?: ButtonProps["variant"];
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("auth.errors");
  const boundAction = useMemo(() => action.bind(null, locale), [action, locale]);
  const [state, formAction, pending] = useActionState(boundAction, initialAuthState);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSent && state.status === "sent") form.current?.reset();
  }, [state, resetOnSent]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const done = doneOnSent && state.status === "sent";

  return (
    <form ref={form} onSubmit={handleSubmit} className="flex flex-col">
```

In the `t.rich` values, add `nameMax: NAME_MAX_LENGTH,` after `max: PASSWORD_MAX_BYTES,`.

Replace the button:

```tsx
      {!done && (
        <Button type="submit" variant={submitVariant} disabled={pending} className="w-full">
          {submitLabel}
        </Button>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/auth`
Expected: PASS, the existing AuthForm and Turnstile tests included.

- [ ] **Step 5: Commit**

```bash
git add components/auth/auth-form.tsx components/auth/auth-form.test.tsx
git commit -m "feat: let AuthForm reset or finish after success, and pick its button

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ending the local session, and the deletion primitive

**Files:**
- Create: `lib/auth/end-local-session.ts`, `lib/auth/end-local-session.test.ts`
- Create: `lib/auth/delete-current-user.ts`, `lib/auth/delete-current-user.test.ts`
- Modify: `app/[locale]/account/actions.ts`, `lib/supabase/admin.ts` (comment only), `lib/supabase/admin-import-guard.test.ts`

**Interfaces:**
- Consumes: `reportAuthError`, `AuthFlow` (Task 2); `createClient` (`lib/supabase/server.ts`); `createAdminClient` (`lib/supabase/admin.ts`).
- Produces:
  - `endLocalSession(supabase: SessionClient, flow: AuthFlow): Promise<void>` where `SessionClient = Pick<Awaited<ReturnType<typeof createClient>>, "auth">`
  - `deleteCurrentUser(): Promise<{ error: AuthError | null }>`

- [ ] **Step 1: Write the failing tests**

Create `lib/auth/end-local-session.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  captureException: vi.fn(),
  cookieNames: [] as string[],
  deleteCookie: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => mocks.cookieNames.map((name) => ({ name, value: "x" })),
    delete: mocks.deleteCookie,
  }),
}));

const { endLocalSession } = await import("./end-local-session");

// Only `auth.signOut` is used; the cast keeps the fake to what matters.
const supabase = { auth: { signOut: mocks.signOut } } as unknown as Parameters<
  typeof endLocalSession
>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieNames = [
    "sb-127-auth-token.0",
    "sb-127-auth-token.1",
    "sb-127-auth-token-code-verifier",
    "NEXT_LOCALE",
  ];
});

describe("endLocalSession", () => {
  test("signs this browser out and leaves the cookies to Supabase", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await endLocalSession(supabase, "signOut");

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("on a failure, clears the auth cookies itself and reports", async () => {
    mocks.signOut.mockResolvedValue({ error: new AuthError("fetch failed") });
    await endLocalSession(supabase, "deleteAccount");

    const deleted = mocks.deleteCookie.mock.calls.map(([name]) => name);
    expect(deleted.sort()).toEqual([
      "sb-127-auth-token-code-verifier",
      "sb-127-auth-token.0",
      "sb-127-auth-token.1",
    ]);
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.captureException.mock.calls[0][1]).toMatchObject({
      tags: { "auth.flow": "deleteAccount" },
    });
  });
});
```

Create `lib/auth/delete-current-user.test.ts`:

```ts
// @vitest-environment node
import { AuthError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
// Mocked, so the real module's `import "server-only"` never loads here.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }),
}));

const { deleteCurrentUser } = await import("./delete-current-user");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteCurrentUser", () => {
  test("hard-deletes the user named by the verified claims, and only them", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await deleteCurrentUser()).toEqual({ error: null });
    // Exactly one argument: a second `true` would make it a soft delete.
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  });

  test("passes the admin API's error back", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    const failure = new AuthError("boom", 500, "unexpected_failure");
    mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: failure });

    expect(await deleteCurrentUser()).toEqual({ error: failure });
  });

  test("deletes nothing without a verified session", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });

    const { error } = await deleteCurrentUser();
    expect(error).toBeInstanceOf(AuthSessionMissingError);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
```

In `lib/supabase/admin-import-guard.test.ts`, change the allowlist and add a test inside the `describe`:

```ts
const ADMIN_ALLOWLIST: string[] = [join("lib", "auth", "delete-current-user.ts")];
```

```ts
  test("the allowlist is exactly the account-deletion module", () => {
    // Widening this is a security decision; the test makes it a visible one.
    expect(ADMIN_ALLOWLIST).toEqual([join("lib", "auth", "delete-current-user.ts")]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/auth/end-local-session.test.ts lib/auth/delete-current-user.test.ts lib/supabase/admin-import-guard.test.ts`
Expected: FAIL — the two modules cannot be resolved; the guard's "allowlisted files still exist" test fails because `lib/auth/delete-current-user.ts` does not exist yet.

- [ ] **Step 3: Implement**

Create `lib/auth/end-local-session.ts`:

```ts
import { cookies } from "next/headers";

import type { createClient } from "@/lib/supabase/server";

import { type AuthFlow, reportAuthError } from "./errors";

/**
 * The cookies @supabase/ssr stores a session in: `sb-<ref>-auth-token`, its
 * chunks (`.0`, `.1`, …) and the PKCE `-code-verifier`.
 */
const AUTH_COOKIE = /^sb-.+-auth-token/;

export type SessionClient = Pick<Awaited<ReturnType<typeof createClient>>, "auth">;

/**
 * Ends the session in THIS browser — `local`, so other devices are untouched.
 *
 * auth-js removes the session itself when the revoke call answers 401, 403 or
 * 404 — which is what a deleted user's token gets — but not when loading the
 * session fails first (an expired token it cannot refresh). In that case the
 * cookies are cleared by hand: a user must never leave believing a browser is
 * signed out when it is not.
 */
export async function endLocalSession(supabase: SessionClient, flow: AuthFlow): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (!error) return;

  reportAuthError(error, flow);
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (AUTH_COOKIE.test(name)) cookieStore.delete(name);
  }
}
```

Create `lib/auth/delete-current-user.ts`:

```ts
import { type AuthError, AuthSessionMissingError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Permanently deletes the SIGNED-IN user: their auth record, identities and
 * sessions, and — by cascade — their profile and role assignments.
 *
 * The only file allowed to import the service-role client (see
 * `admin-import-guard.test.ts`). It takes no argument on purpose: the id comes
 * from the verified claims read here, so no caller can hand it someone else's.
 *
 * A hard delete — `deleteUser(id)` with no second argument. Future tables must
 * follow the deletion contract in
 * docs/superpowers/specs/2026-09-28-profile-settings-design.md: nothing new
 * cascades from auth.users.
 */
export async function deleteCurrentUser(): Promise<{ error: AuthError | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return { error: new AuthSessionMissingError() };

  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  return { error };
}
```

Replace `app/[locale]/account/actions.ts` with:

```ts
"use server";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { endLocalSession } from "@/lib/auth/end-local-session";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out this browser — `local`, so signing out on a phone does not end the
 * laptop's session. POST only: it is bound to a form, never a link, so a
 * prefetch or a crawler cannot sign anyone out.
 */
export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient();
  await endLocalSession(supabase, "signOut");
  return redirect({ href: "/", locale: resolveLocale(locale) });
}
```

In `lib/supabase/admin.ts`, replace the paragraph starting "Nothing uses it yet." with:

```ts
 * Its one caller is `lib/auth/delete-current-user.ts` — account deletion needs
 * `auth.admin.deleteUser`. `admin-import-guard.test.ts` keeps it that way;
 * the M7 webhooks will be the next deliberate addition.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib app/\[locale\]/account`
Expected: PASS — including the unchanged `app/[locale]/account/actions.test.ts`, which now exercises `endLocalSession` through the action.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/end-local-session.ts lib/auth/end-local-session.test.ts lib/auth/delete-current-user.ts lib/auth/delete-current-user.test.ts lib/supabase/admin.ts lib/supabase/admin-import-guard.test.ts "app/[locale]/account/actions.ts"
git commit -m "feat: add account deletion's service-role primitive and endLocalSession

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Settings actions — name and email

**Files:**
- Create: `app/[locale]/account/settings/actions.ts`, `app/[locale]/account/settings/actions.test.ts`

**Interfaces:**
- Consumes: `readField`, `readEmail`, `resolveLocale`, `AuthFormState` (`lib/auth/action-state.ts`); `requireUser` (`lib/auth/require-user.ts`); `authErrorKey`, `revealsAccount`, `reportSuppressedAuthError`, `reportProfileError` (Task 2); `normalizeName`, `nameTooLong` (Task 2).
- Produces (all `AuthAction`-shaped: `(locale: string, previous: AuthFormState, formData: FormData) => Promise<AuthFormState>`):
  - `updateName` — fields `firstName`, `lastName`
  - `changeEmail` — field `email`
  - Success returns `{ status: "sent" }`.

- [ ] **Step 1: Write the failing tests**

Create `app/[locale]/account/settings/actions.test.ts` (Task 6 appends to it; the mocks cover both tasks):

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => {
  const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() };
  query.update.mockImplementation(() => query);
  query.eq.mockImplementation(() => query);
  query.select.mockImplementation(() => query);
  return {
    query,
    from: vi.fn(() => query),
    getClaims: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    deleteCurrentUser: vi.fn(),
    endLocalSession: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    redirect: vi.fn((args: unknown) => {
      throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: mocks.getClaims,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  }),
}));
vi.mock("@/lib/auth/delete-current-user", () => ({ deleteCurrentUser: mocks.deleteCurrentUser }));
vi.mock("@/lib/auth/end-local-session", () => ({ endLocalSession: mocks.endLocalSession }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

const actions = await import("./actions");

// The claims and Auth deliberately disagree about the address: after an email
// change completes elsewhere, the JWT lags by up to an hour. Actions must use
// Auth's.
const CLAIMS = { data: { claims: { sub: "user-1", email: "stale@example.test" } }, error: null };
const AUTH_USER = { data: { user: { id: "user-1", email: "current@example.test" } }, error: null };
const SIGN_IN = { href: { pathname: "/sign-in", query: { next: "/account/settings" } }, locale: "en" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue(CLAIMS);
  mocks.getUser.mockResolvedValue(AUTH_USER);
});

describe("updateName", () => {
  const { updateName } = actions;

  test("saves both trimmed names on the signed-in user's own row", async () => {
    mocks.query.single.mockResolvedValue({ data: { id: "user-1" }, error: null });

    const result = await updateName(
      "en",
      initialAuthState,
      formData({ firstName: "  Ada ", lastName: "Lovelace", id: "someone-else" }),
    );

    expect(result).toEqual({ status: "sent" });
    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.query.update).toHaveBeenCalledWith({ first_name: "Ada", last_name: "Lovelace" });
    expect(mocks.query.eq).toHaveBeenCalledWith("id", "user-1");
    expect(mocks.query.select).toHaveBeenCalledWith("id");
  });

  test("clears a whitespace-only name to null", async () => {
    mocks.query.single.mockResolvedValue({ data: { id: "user-1" }, error: null });
    await updateName("en", initialAuthState, formData({ firstName: "   ", lastName: "" }));
    expect(mocks.query.update).toHaveBeenCalledWith({ first_name: null, last_name: null });
  });

  test("rejects a name over the limit without writing", async () => {
    const result = await updateName(
      "en",
      initialAuthState,
      formData({ firstName: "a".repeat(101), lastName: "B" }),
    );
    expect(result).toEqual({ status: "error", errorKey: "nameTooLong" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("an update that returns no row is an error, and is reported", async () => {
    // What a missing select policy looks like: nothing matched, nothing raised.
    mocks.query.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    });

    const result = await updateName("en", initialAuthState, formData({ firstName: "Ada", lastName: "" }));

    expect(result).toEqual({ status: "error", errorKey: "generic" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.captureException.mock.calls[0][1]).toMatchObject({
      tags: { "auth.flow": "updateName", "db.code": "PGRST116" },
    });
  });

  test("without a session, sends the user to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(
      updateName("en", initialAuthState, formData({ firstName: "Ada", lastName: "" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("changeEmail", () => {
  const { changeEmail } = actions;

  test("asks Supabase to change the address and reports it sent", async () => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: null });
    const result = await changeEmail("en", initialAuthState, formData({ email: " new@example.test " }));
    expect(result).toEqual({ status: "sent" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ email: "new@example.test" });
  });

  test("rejects a malformed address without calling Supabase", async () => {
    const result = await changeEmail("en", initialAuthState, formData({ email: "not-an-address" }));
    expect(result).toEqual({ status: "error", errorKey: "invalidEmail" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  test("rejects the current address, compared case-insensitively, against Auth not the JWT", async () => {
    const result = await changeEmail("en", initialAuthState, formData({ email: "CURRENT@example.test" }));
    expect(result).toEqual({ status: "error", errorKey: "emailUnchanged" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  test.each(["email_exists", "user_already_exists", "over_email_send_rate_limit"])(
    "treats %s exactly like success, and reports it as suppressed",
    async (code) => {
      // A taken address (email_exists) and a free one resubmitted quickly
      // (over_email_send_rate_limit) must be indistinguishable, or submitting
      // an address twice reveals whether it is registered.
      mocks.updateUser.mockResolvedValue({ data: {}, error: new AuthError("x", 422, code) });
      const result = await changeEmail("en", initialAuthState, formData({ email: "new@example.test" }));
      expect(result).toEqual({ status: "sent" });
      expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
      expect(mocks.captureException).not.toHaveBeenCalled();
    },
  );

  test("maps an invalid address from Supabase", async () => {
    mocks.updateUser.mockResolvedValue({
      data: {},
      error: new AuthError("x", 400, "email_address_invalid"),
    });
    const result = await changeEmail("en", initialAuthState, formData({ email: "new@example.test" }));
    expect(result).toEqual({ status: "error", errorKey: "invalidEmail" });
  });

  test("reports an unexpected failure", async () => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: new AuthError("x", 500, "unexpected_failure") });
    const result = await changeEmail("en", initialAuthState, formData({ email: "new@example.test" }));
    expect(result).toEqual({ status: "error", errorKey: "generic" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("without a session, sends the user to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(
      changeEmail("en", initialAuthState, formData({ email: "new@example.test" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
  });

  test("when Auth no longer knows the user, sends them to sign in", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthError("gone", 403) });
    await expect(
      changeEmail("en", initialAuthState, formData({ email: "new@example.test" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/[locale]/account/settings"`
Expected: FAIL — cannot resolve `./actions`.

- [ ] **Step 3: Implement**

Create `app/[locale]/account/settings/actions.ts`:

```ts
"use server";

import type { Locale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import {
  type AuthFormState,
  readEmail,
  readField,
  resolveLocale,
} from "@/lib/auth/action-state";
import {
  authErrorKey,
  reportProfileError,
  reportSuppressedAuthError,
  revealsAccount,
} from "@/lib/auth/errors";
import { nameTooLong, normalizeName } from "@/lib/auth/profile-name";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/** Where a signed-out visitor comes back to after signing in. */
const SETTINGS = "/account/settings";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The signed-in user's CURRENT address, from Auth rather than the JWT: after
 * an email change completes on another device, this device's claims carry the
 * old address until the next refresh — up to an hour. No address means Auth
 * no longer recognises the session, which is treated as signed out.
 */
async function currentEmail(supabase: ServerClient, locale: Locale): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return redirect({ href: { pathname: "/sign-in", query: { next: SETTINGS } }, locale });
  return email;
}

/**
 * Saves the first and last name. Both optional: blank clears to null, as the
 * database requires. RLS is the boundary — the update is scoped to the
 * verified user id, never an id from the form.
 *
 * The row is read back so that an update matching nothing — how a missing
 * `select` policy fails — is an error rather than a false "saved".
 */
export async function updateName(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await requireUser({ locale: resolveLocale(locale), next: SETTINGS });

  const firstName = normalizeName(readField(formData, "firstName"));
  const lastName = normalizeName(readField(formData, "lastName"));
  if (nameTooLong(firstName) || nameTooLong(lastName)) {
    return { status: "error", errorKey: "nameTooLong" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", user.id)
    .select("id")
    .single();

  if (error) {
    reportProfileError(error, "updateName");
    return { status: "error", errorKey: "generic" };
  }
  return { status: "sent" };
}

/**
 * Starts an email change. With secure email change on, Supabase mails a link
 * to BOTH addresses and changes nothing until both are clicked — which is why
 * this does not ask for the password: a stolen session cannot click the link
 * in the old inbox.
 *
 * Never reveals whether another account holds the new address. A taken
 * address (`email_exists`) and a free one resubmitted within the resend window
 * (`over_email_send_rate_limit`) both answer "sent"; were they different,
 * submitting an address twice would test whether it is registered.
 */
export async function changeEmail(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);
  await requireUser({ locale: target, next: SETTINGS });

  const email = readEmail(formData);
  if (!email) return { status: "error", errorKey: "invalidEmail" };

  const supabase = await createClient();
  const current = await currentEmail(supabase, target);
  if (email.toLowerCase() === current.toLowerCase()) {
    return { status: "error", errorKey: "emailUnchanged" };
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    if (!revealsAccount(error)) {
      return { status: "error", errorKey: authErrorKey(error, "changeEmail") };
    }
    reportSuppressedAuthError(error, "changeEmail");
  }
  return { status: "sent" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/[locale]/account/settings"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/account/settings/actions.ts" "app/[locale]/account/settings/actions.test.ts"
git commit -m "feat: add the name and email-change settings actions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Settings actions — password and deletion

**Files:**
- Modify: `app/[locale]/account/settings/actions.ts`, `app/[locale]/account/settings/actions.test.ts`

**Interfaces:**
- Consumes: everything Task 5 consumes, plus `passwordProblem` (`lib/auth/password.ts`), `reportAuthError` (Task 2), `deleteCurrentUser`, `endLocalSession` (Task 4).
- Produces (`AuthAction`-shaped):
  - `changePassword` — fields `currentPassword`, `password`, `captchaToken`; success `{ status: "sent" }`
  - `deleteAccount` — fields `currentPassword`, `captchaToken`; success redirects to `/account-deleted`

- [ ] **Step 1: Write the failing tests**

Append to `app/[locale]/account/settings/actions.test.ts`:

```ts
describe("changePassword", () => {
  const { changePassword } = actions;
  const VALID = {
    currentPassword: "old-password!",
    password: "new-password-123",
    captchaToken: "token-abc",
  };

  beforeEach(() => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  });

  test("re-verifies against Auth's address, evicts other sessions, then changes the password", async () => {
    const result = await changePassword(
      "en",
      initialAuthState,
      formData({ ...VALID, email: "attacker@example.test" }),
    );

    expect(result).toEqual({ status: "sent" });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "current@example.test",
      password: "old-password!",
      options: { captchaToken: "token-abc" },
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateUser.mock.invocationCallOrder[0],
    );
  });

  test("a wrong current password stops before anything changes", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const result = await changePassword("en", initialAuthState, formData(VALID));

    expect(result).toEqual({ status: "error", errorKey: "currentPasswordIncorrect" });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  test("an empty current password never reaches Supabase", async () => {
    const result = await changePassword(
      "en",
      initialAuthState,
      formData({ ...VALID, currentPassword: "" }),
    );
    expect(result).toEqual({ status: "error", errorKey: "currentPasswordIncorrect" });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  test("applies the password policy before re-verifying", async () => {
    const result = await changePassword("en", initialAuthState, formData({ ...VALID, password: "short" }));
    expect(result).toEqual({ status: "error", errorKey: "passwordTooShort" });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  test("maps a failed captcha", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthError("x", 400, "captcha_failed"),
    });
    const result = await changePassword("en", initialAuthState, formData(VALID));
    expect(result).toEqual({ status: "error", errorKey: "captchaFailed" });
  });

  test("a failed eviction leaves the password unchanged, and is reported", async () => {
    mocks.signOut.mockResolvedValue({ error: new AuthError("fetch failed") });
    const result = await changePassword("en", initialAuthState, formData(VALID));

    expect(result).toEqual({ status: "error", errorKey: "sessionsNotRevoked" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("maps same_password", async () => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: new AuthError("x", 422, "same_password") });
    const result = await changePassword("en", initialAuthState, formData(VALID));
    expect(result).toEqual({ status: "error", errorKey: "samePassword" });
  });

  test("without a session, sends the user to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(changePassword("en", initialAuthState, formData(VALID))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  const { deleteAccount } = actions;
  const VALID = { currentPassword: "old-password!", captchaToken: "token-abc" };

  beforeEach(() => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    mocks.deleteCurrentUser.mockResolvedValue({ error: null });
    mocks.endLocalSession.mockResolvedValue(undefined);
  });

  test("re-verifies, deletes, ends the session here, and says goodbye", async () => {
    await expect(deleteAccount("en", initialAuthState, formData(VALID))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "current@example.test",
      password: "old-password!",
      options: { captchaToken: "token-abc" },
    });
    expect(mocks.deleteCurrentUser).toHaveBeenCalledWith();
    expect(mocks.endLocalSession).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.anything() }),
      "deleteAccount",
    );
    expect(mocks.deleteCurrentUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.endLocalSession.mock.invocationCallOrder[0],
    );
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account-deleted", locale: "en" });
  });

  test("a wrong current password deletes nothing", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const result = await deleteAccount("en", initialAuthState, formData(VALID));

    expect(result).toEqual({ status: "error", errorKey: "currentPasswordIncorrect" });
    expect(mocks.deleteCurrentUser).not.toHaveBeenCalled();
    expect(mocks.endLocalSession).not.toHaveBeenCalled();
  });

  test("a failed deletion keeps the session and reports", async () => {
    mocks.deleteCurrentUser.mockResolvedValue({
      error: new AuthError("boom", 500, "unexpected_failure"),
    });
    const result = await deleteAccount("en", initialAuthState, formData(VALID));

    expect(result).toEqual({ status: "error", errorKey: "generic" });
    expect(mocks.endLocalSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.captureException.mock.calls[0][1]).toMatchObject({
      tags: { "auth.flow": "deleteAccount" },
    });
  });

  test("without a session, sends the user to sign in and deletes nothing", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(deleteAccount("en", initialAuthState, formData(VALID))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
    expect(mocks.deleteCurrentUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/[locale]/account/settings"`
Expected: FAIL — `changePassword` and `deleteAccount` are undefined.

- [ ] **Step 3: Implement**

In `app/[locale]/account/settings/actions.ts`, replace the `@/lib/auth/errors` import and add three imports, so the import block reads:

```ts
import type { Locale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import {
  type AuthFormState,
  readEmail,
  readField,
  resolveLocale,
} from "@/lib/auth/action-state";
import { deleteCurrentUser } from "@/lib/auth/delete-current-user";
import { endLocalSession } from "@/lib/auth/end-local-session";
import {
  type AuthFlow,
  authErrorKey,
  reportAuthError,
  reportProfileError,
  reportSuppressedAuthError,
  revealsAccount,
} from "@/lib/auth/errors";
import { passwordProblem } from "@/lib/auth/password";
import { nameTooLong, normalizeName } from "@/lib/auth/profile-name";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
```

Add after `currentEmail`:

```ts
/**
 * Re-verifies the current password by signing in with it — Turnstile
 * included, since sign-in requires it. Returns an error state, or null when
 * the password is right.
 *
 * Signing in also mints a fresh session on `supabase`, which is what secure
 * password change's 24-hour rule asks for; no separate reauthenticate step.
 */
async function verifyCurrentPassword(
  supabase: ServerClient,
  formData: FormData,
  flow: AuthFlow,
  locale: Locale,
): Promise<AuthFormState | null> {
  const password = readField(formData, "currentPassword");
  if (!password) return { status: "error", errorKey: "currentPasswordIncorrect" };

  const email = await currentEmail(supabase, locale);
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: readField(formData, "captchaToken") },
  });

  if (!error) return null;
  if (error.code === "invalid_credentials") {
    return { status: "error", errorKey: "currentPasswordIncorrect" };
  }
  return { status: "error", errorKey: authErrorKey(error, flow) };
}
```

Append the two actions:

```ts
/**
 * Changes the password of a signed-in user who knows the current one.
 *
 * Other sessions are evicted BEFORE the change, as on /reset-password: done
 * afterwards, a failed eviction could only be reported, and a retry would stop
 * at `same_password` before reaching it. Supabase sends the password-changed
 * email itself.
 */
export async function changePassword(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);
  await requireUser({ locale: target, next: SETTINGS });

  const password = readField(formData, "password");
  const problem = passwordProblem(password);
  if (problem) return { status: "error", errorKey: problem };

  const supabase = await createClient();
  const refused = await verifyCurrentPassword(supabase, formData, "changePassword", target);
  if (refused) return refused;

  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    reportAuthError(signOutError, "changePassword");
    return { status: "error", errorKey: "sessionsNotRevoked" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", errorKey: authErrorKey(error, "changePassword") };

  return { status: "sent" };
}

/**
 * Permanently deletes the signed-in user's account, after re-verifying the
 * password.
 *
 * Nothing changes until `deleteCurrentUser` succeeds, so a failure leaves the
 * account and this session intact and a retry is safe. Only then is this
 * browser's session ended — auth-js tolerates the revoked token a deleted
 * user now holds.
 *
 * M3 adds a check here: deletion is refused while the user has an unfinished
 * order (the deletion contract in the profile-settings spec).
 */
export async function deleteAccount(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);
  await requireUser({ locale: target, next: SETTINGS });

  const supabase = await createClient();
  const refused = await verifyCurrentPassword(supabase, formData, "deleteAccount", target);
  if (refused) return refused;

  const { error } = await deleteCurrentUser();
  if (error) {
    reportAuthError(error, "deleteAccount");
    return { status: "error", errorKey: "generic" };
  }

  await endLocalSession(supabase, "deleteAccount");
  return redirect({ href: "/account-deleted", locale: target });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/[locale]/account/settings"`
Expected: PASS — all four `describe` blocks.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/account/settings/actions.ts" "app/[locale]/account/settings/actions.test.ts"
git commit -m "feat: add the password-change and account-deletion actions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Confirming an email change

**Files:**
- Modify: `app/[locale]/(auth)/auth/confirm/actions.ts`, `app/[locale]/(auth)/auth/confirm/actions.test.ts`, `app/[locale]/(auth)/auth/confirm/page.tsx`
- Create: `supabase/templates/email_change.html`, `supabase/templates/email_changed.html`
- Modify: `supabase/config.toml`, `scripts/push-auth-templates.mjs`, `scripts/push-auth-templates.test.ts`, `messages/en.json`

**Interfaces:**
- Consumes: `AuthForm`'s `doneOnSent` (Task 3).
- Produces: `/auth/confirm?token_hash=…&type=email_change` — first link returns `{ status: "sent" }` inline; second redirects to `/account/settings`. Messages `auth.confirm.emailChangeTitle`, `auth.confirm.emailChangePartial`.

- [ ] **Step 1: Write the failing tests**

In `app/[locale]/(auth)/auth/confirm/actions.test.ts`:

Remove `"email_change"` from the refused-types list, so it reads:

```ts
  test.each(["signup", "magiclink", "invite", "toString", "constructor", ""])(
```

Add inside `describe("confirmToken", …)`:

```ts
  test("the second email-change link completes the change and lands on settings", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "t" } },
      error: null,
    });
    await confirm({ token_hash: "hash-1", type: "email_change" });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email_change", token_hash: "hash-1" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account/settings", locale: "en" });
  });

  test("the first email-change link reports the partial step in place", async () => {
    // With secure email change on, the first of the two links verifies but
    // completes nothing and signs no one in: auth-js returns no user and no
    // session.
    mocks.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    const result = await confirmToken(
      "en",
      initialAuthState,
      formData({ token_hash: "hash-1", type: "email_change" }),
    );
    expect(result).toEqual({ status: "sent" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("an expired email-change link goes to sign-in quietly", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthError("expired", 403, "otp_expired"),
    });
    await confirm({ token_hash: "hash-1", type: "email_change" });
    expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
  });
```

In `scripts/push-auth-templates.test.ts`, update the expectations:

```ts
    expect(Object.keys(sections).sort()).toEqual([
      "auth.email.notification.email_changed",
      "auth.email.notification.password_changed",
      "auth.email.template.confirmation",
      "auth.email.template.email_change",
      "auth.email.template.recovery",
    ]);
```

```ts
    expect(Object.keys(payload).sort()).toEqual([
      "mailer_notifications_email_changed_enabled",
      "mailer_notifications_password_changed_enabled",
      "mailer_subjects_confirmation",
      "mailer_subjects_email_change",
      "mailer_subjects_email_changed_notification",
      "mailer_subjects_password_changed_notification",
      "mailer_subjects_recovery",
      "mailer_templates_confirmation_content",
      "mailer_templates_email_change_content",
      "mailer_templates_email_changed_notification_content",
      "mailer_templates_password_changed_notification_content",
      "mailer_templates_recovery_content",
    ]);
```

and add to the link test:

```ts
    expect(payload.mailer_templates_email_change_content).toContain(
      "/auth/confirm?token_hash={{ .TokenHash }}&type=email_change",
    );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/[locale]/(auth)/auth/confirm" scripts`
Expected: FAIL — `email_change` is refused; the config has no email-change sections.

- [ ] **Step 3: Implement the confirm action and page**

In `app/[locale]/(auth)/auth/confirm/actions.ts`:

```ts
const DESTINATIONS = {
  email: "/account",
  recovery: "/reset-password",
  email_change: "/account/settings",
} as const;
```

Replace the tail of `confirmToken` from `const { error } = await supabase.auth.verifyOtp(...)` with:

```ts
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // An expired or reused link is routine. Anything else is ours to look at.
    if (error.code !== "otp_expired") reportAuthError(error, "confirm");
    return redirect(linkExpired);
  }

  // Secure email change needs a click in BOTH inboxes. The first verifies but
  // completes nothing and signs no one in, so there is nowhere to redirect to;
  // the page says what is left. The second returns a session.
  if (type === "email_change" && !data.session) return { status: "sent" };

  return redirect({ href: DESTINATIONS[type], locale: target });
```

In `app/[locale]/(auth)/auth/confirm/page.tsx`, replace the heading and form:

```tsx
  const title =
    type === "recovery"
      ? t("recoveryTitle")
      : type === "email_change"
        ? t("emailChangeTitle")
        : t("emailTitle");

  return (
    <>
      <AuthHeading title={title} lead={t("lead")} />
      {/* No captcha: the token is the proof, and it is single-use — which is
          also why the button goes once the first email-change link succeeds. */}
      <AuthForm
        action={confirmToken}
        submitLabel={t("submit")}
        sentMessage={t("emailChangePartial")}
        doneOnSent
        captcha={false}
      >
```

(keep the two hidden inputs and the closing tags as they are).

In `messages/en.json`, add to `auth.confirm`:

```json
"emailChangeTitle": "Confirm your email change",
"emailChangePartial": "Confirmed. Now open the link we sent to your other address — the change takes effect once both are confirmed."
```

- [ ] **Step 4: Add the templates and wire them**

Create `supabase/templates/email_change.html` — same shell as `confirmation.html`, with this title, heading, body and link:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Confirm your email change</title>
  </head>
  <body style="margin:0;padding:0;background:#FAFAF8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E4E3DF;border-radius:13px;overflow:hidden;">
            <tr>
              <td style="background:#1A1D29;padding:24px 32px;font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.18em;color:#C9A227;">
                ART GRADINGS
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1A1D29;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#1A1D29;">Confirm your email change</h1>
                <p style="margin:0 0 24px;">A request was made to change the email address on your account from {{ .Email }} to {{ .NewEmail }}. To protect your account we've sent a link to both addresses, and the change happens only once both are confirmed.</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#C9A227;border-radius:10px;">
                      <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change" style="display:inline-block;padding:14px 28px;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#1A1D29;text-decoration:none;">Confirm the change</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:14px;color:#5F616B;">The link works once and expires in one hour. If you did not ask for this, ignore this email — your address stays the same — and consider changing your password.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

Create `supabase/templates/email_changed.html` — the `password_changed.html` shell with:

- `<title>` and `<h1>`: `Your email address was changed`
- body paragraph: `The email address on your account was just changed. Account emails will go to the new address from now on.`
- footer paragraph: `If this was not you, contact ART Gradings support straight away — password reset links now go to the new address.`

In `supabase/config.toml`, after `[auth.email.template.recovery]`:

```toml
[auth.email.template.email_change]
subject = "Confirm your email change"
content_path = "./supabase/templates/email_change.html"
```

and after `[auth.email.notification.password_changed]`:

```toml
[auth.email.notification.email_changed]
enabled = true
subject = "Your email address was changed"
content_path = "./supabase/templates/email_changed.html"
```

In `scripts/push-auth-templates.mjs`, extend `FIELDS` (the field names were read from the Supabase CLI binary):

```js
  "auth.email.template.email_change": {
    subject: "mailer_subjects_email_change",
    content_path: "mailer_templates_email_change_content",
  },
  "auth.email.notification.email_changed": {
    enabled: "mailer_notifications_email_changed_enabled",
    subject: "mailer_subjects_email_changed_notification",
    content_path: "mailer_templates_email_changed_notification_content",
  },
```

Restart the local stack so it picks up the config: `npx supabase stop && npm run db:start`. Expected: starts without a config error.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "app/[locale]/(auth)" scripts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(auth)/auth/confirm" supabase/templates supabase/config.toml scripts messages/en.json
git commit -m "feat: confirm email changes through /auth/confirm

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The settings page

**Files:**
- Create: `app/[locale]/account/settings/settings-cards.tsx`, `app/[locale]/account/settings/settings-cards.test.tsx`, `app/[locale]/account/settings/page.tsx`
- Create: `app/[locale]/(auth)/account-deleted/page.tsx`
- Modify: `app/[locale]/account/page.tsx`, `messages/en.json`

**Interfaces:**
- Consumes: the four actions (Tasks 5–6); `AuthForm` options (Task 3); `NAME_MAX_LENGTH` (Task 2); `PASSWORD_MIN_LENGTH`.
- Produces: `SettingsCards({ firstName: string | null, lastName: string | null, email: string })`; routes `/account/settings`, `/account-deleted`.

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add `"settings": "Settings"` to `auth.account`, and add to `auth`:

```json
"settings": {
  "title": "Settings",
  "backToAccount": "Back to your account",
  "name": {
    "title": "Name",
    "lead": "How we address you. Optional here — we'll ask when a submission needs it.",
    "firstName": "First name",
    "lastName": "Last name",
    "submit": "Save name",
    "saved": "Your name has been saved."
  },
  "email": {
    "title": "Email",
    "current": "Your address is {email}.",
    "newEmail": "New email address",
    "submit": "Change email",
    "sent": "We've sent a confirmation link to both your current and your new address. The change takes effect once both are confirmed."
  },
  "password": {
    "title": "Password",
    "lead": "Changing it signs you out on every other device within the hour.",
    "currentPassword": "Current password",
    "submit": "Change password",
    "changed": "Your password has been changed."
  },
  "delete": {
    "title": "Delete account",
    "lead": "This permanently deletes your account, your name and your sign-in. It cannot be undone.",
    "submit": "Delete my account"
  }
},
"accountDeleted": {
  "title": "Your account has been deleted",
  "lead": "Your account and everything stored with it are gone.",
  "home": "Back to the home page"
}
```

- [ ] **Step 2: Write the failing test**

Create `app/[locale]/account/settings/settings-cards.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

// The real actions import the service-role client, whose `server-only` import
// throws outside a server bundle. The cards only need something to bind.
vi.mock("./actions", () => ({
  updateName: vi.fn(),
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

const { SettingsCards } = await import("./settings-cards");

const s = messages.auth.settings;

function renderCards() {
  return renderWithIntl(
    <SettingsCards firstName="Ada" lastName={null} email="user@example.test" />,
  );
}

describe("SettingsCards", () => {
  test("shows the four sections", () => {
    renderCards();
    for (const title of [s.name.title, s.email.title, s.password.title, s.delete.title]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
  });

  test("prefills the names, with autocomplete hints and the length limit", () => {
    renderCards();
    const first = screen.getByLabelText(s.name.firstName);
    expect(first).toHaveValue("Ada");
    expect(first).toHaveAttribute("autoComplete", "given-name");
    expect(first).toHaveAttribute("maxLength", "100");
    expect(screen.getByLabelText(s.name.lastName)).toHaveValue("");
  });

  test("shows the current address", () => {
    renderCards();
    expect(
      screen.getByText(s.email.current.replace("{email}", "user@example.test")),
    ).toBeInTheDocument();
  });

  test("puts Turnstile on the password and delete forms only", () => {
    const { container } = renderCards();
    const forms = [...container.querySelectorAll("form")];
    const hasCaptcha = forms.map((form) => form.querySelector('input[name="captchaToken"]') !== null);
    // Order: name, email, password, delete.
    expect(hasCaptcha).toEqual([false, false, true, true]);
  });

  test("asks for the current password before a change or a deletion", () => {
    renderCards();
    const current = screen.getAllByLabelText(s.password.currentPassword);
    expect(current).toHaveLength(2);
    for (const input of current) expect(input).toHaveAttribute("autoComplete", "current-password");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run "app/[locale]/account/settings/settings-cards.test.tsx"`
Expected: FAIL — cannot resolve `./settings-cards`.

- [ ] **Step 4: Implement the cards**

Create `app/[locale]/account/settings/settings-cards.tsx`:

```tsx
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldInput } from "@/components/ui/field";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { NAME_MAX_LENGTH } from "@/lib/auth/profile-name";

import { changeEmail, changePassword, deleteAccount, updateName } from "./actions";

function SettingsCard({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-serif text-h3 text-ink">{title}</h2>
      {lead && <p className="mt-2 text-muted">{lead}</p>}
      <div className="mt-6">{children}</div>
    </Card>
  );
}

/**
 * The four settings forms. Separate from the page because the page is an
 * async Server Component, which Vitest cannot render; this one is not.
 *
 * Each card is its own form and action, so one failing does not reset the
 * others. Turnstile appears only where the action signs in to re-verify the
 * password, because sign-in is what requires it.
 */
export function SettingsCards({
  firstName,
  lastName,
  email,
}: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const t = useTranslations("auth");

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard title={t("settings.name.title")} lead={t("settings.name.lead")}>
        <AuthForm
          action={updateName}
          submitLabel={t("settings.name.submit")}
          sentMessage={t("settings.name.saved")}
          captcha={false}
        >
          <Field label={t("settings.name.firstName")}>
            <FieldInput
              name="firstName"
              autoComplete="given-name"
              maxLength={NAME_MAX_LENGTH}
              defaultValue={firstName ?? ""}
            />
          </Field>
          <Field label={t("settings.name.lastName")}>
            <FieldInput
              name="lastName"
              autoComplete="family-name"
              maxLength={NAME_MAX_LENGTH}
              defaultValue={lastName ?? ""}
            />
          </Field>
        </AuthForm>
      </SettingsCard>

      <SettingsCard title={t("settings.email.title")} lead={t("settings.email.current", { email })}>
        {/* No password and no captcha: the link sent to the OLD inbox is the proof. */}
        <AuthForm
          action={changeEmail}
          submitLabel={t("settings.email.submit")}
          sentMessage={t("settings.email.sent")}
          resetOnSent
          captcha={false}
        >
          <Field label={t("settings.email.newEmail")}>
            <FieldInput type="email" name="email" autoComplete="email" required />
          </Field>
        </AuthForm>
      </SettingsCard>

      <SettingsCard title={t("settings.password.title")} lead={t("settings.password.lead")}>
        <AuthForm
          action={changePassword}
          submitLabel={t("settings.password.submit")}
          sentMessage={t("settings.password.changed")}
          resetOnSent
        >
          <Field label={t("settings.password.currentPassword")}>
            <FieldInput
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label={t("fields.newPassword")}>
            <FieldInput
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
            />
            <FieldDescription>{t("fields.passwordHint", { min: PASSWORD_MIN_LENGTH })}</FieldDescription>
          </Field>
        </AuthForm>
      </SettingsCard>

      <SettingsCard title={t("settings.delete.title")} lead={t("settings.delete.lead")}>
        {/* Ghost, not red: the design system has no danger colour yet. */}
        <AuthForm
          action={deleteAccount}
          submitLabel={t("settings.delete.submit")}
          submitVariant="ghost"
        >
          <Field label={t("settings.password.currentPassword")}>
            <FieldInput
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </Field>
        </AuthForm>
      </SettingsCard>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "app/[locale]/account/settings"`
Expected: PASS.

- [ ] **Step 6: Add the pages and the Settings link**

Create `app/[locale]/account/settings/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { SettingsCards } from "./settings-cards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.settings");
  return { title: t("title") };
}

/**
 * Profile and settings. The address shown comes from Auth, not the JWT, which
 * lags an email change made on another device by up to an hour.
 */
export default async function SettingsPage({ params }: PageProps<"/[locale]/account/settings">) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser({ locale, next: "/account/settings" });
  const t = await getTranslations("auth.settings");

  const supabase = await createClient();
  const [{ data: profile, error }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name").eq("id", user.id).single(),
    supabase.auth.getUser(),
  ]);
  // Every user has a profile (the provisioning trigger). Failing to read it is
  // an outage, reported by onRequestError — the message carries no user data.
  if (error || !profile) throw new Error("Could not load the profile for the settings page");

  return (
    <Section>
      <Container>
        <div className="mx-auto w-full max-w-[640px]">
          <Link href="/account" className="focus-ring text-sm font-semibold text-gold-ink underline">
            {t("backToAccount")}
          </Link>
          <h1 className="mt-4 mb-8 font-serif text-h2 text-ink">{t("title")}</h1>
          <SettingsCards
            firstName={profile.first_name}
            lastName={profile.last_name}
            email={auth.user?.email ?? user.email}
          />
        </div>
      </Container>
    </Section>
  );
}
```

Create `app/[locale]/(auth)/account-deleted/page.tsx`:

```tsx
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthHeading } from "@/components/auth/auth-heading";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.accountDeleted");
  return { title: t("title") };
}

/**
 * Where deletion lands. Its own static page: a notice on the home page would
 * need to read the request and make it dynamic.
 */
export default function AccountDeletedPage() {
  const t = useTranslations("auth.accountDeleted");

  return (
    <>
      <AuthHeading title={t("title")} lead={t("lead")} />
      <Link href="/" className={buttonVariants({ variant: "ghost", className: "w-full" })}>
        {t("home")}
      </Link>
    </>
  );
}
```

In `app/[locale]/account/page.tsx`, import `Link` from `@/i18n/navigation` and `buttonVariants` from `@/components/ui/button`, and replace the sign-out `<form>` with:

```tsx
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/account/settings" className={buttonVariants({ variant: "gold" })}>
              {t("settings")}
            </Link>
            <form action={signOut.bind(null, locale)}>
              <Button type="submit" variant="ghost">
                {t("signOut")}
              </Button>
            </form>
          </div>
```

Update its doc comment: `/account` is the landing page that M3's orders will fill; settings live at `/account/settings`.

- [ ] **Step 7: Build and run everything**

Run: `npm run lint && npm run build && npx tsc --noEmit && npm test`
Expected: all pass. The build's route list shows `/[locale]/account-deleted` as static (●/○) and `/[locale]/account/settings` as dynamic (ƒ).

- [ ] **Step 8: Commit**

```bash
git add "app/[locale]/account" "app/[locale]/(auth)/account-deleted" messages/en.json
git commit -m "feat: add the settings page and the account-deleted page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/deployment/AUTH_SETUP.md`, `docs/content-requests.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-09-28-profile-settings-design.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: The runbook**

In `docs/deployment/AUTH_SETUP.md`:

- In the *Email* provider checklist item, add *Secure email change* on (both addresses must confirm) next to *Secure password change*.
- Add a checklist item under *Hosted project settings*:

  ```markdown
  - [ ] **Coolify → the app's environment:** `SUPABASE_SECRET_KEY` is set (runtime
        env, never a build arg). Account deletion calls the Auth admin API with
        it; without it, deleting an account fails with a generic error and a
        Sentry event.
  ```
- In *Email templates*, note the script now pushes five settings groups, including the email-change template and the email-changed notice.
- In *Verify*, append: change the name; change the email and click both links, then check the old address receives "Your email address was changed"; change the password and see another browser signed out; delete a throwaway account and confirm it can no longer sign in.
- Update the spec reference line to name both specs.

- [ ] **Step 2: Content requests**

In `docs/content-requests.md`, add a section before *Deferred by decision, not missing*:

```markdown
## Accounts and personal data

| Item | Current state | What is needed |
|---|---|---|
| Retention after account deletion | Deletion is a hard delete; today only the profile and roles exist | **How long order and payment records must be kept, and which fields**, once M3/M7 create them. A legal question for the client and their lawyer; it decides how M3/M7 scrub a deleted user's orders. Does not block M2. |
| Data export | Not built | Whether the client wants a self-service GDPR access request, or handles such requests by email. |
| Deletion wording | Functional copy we wrote (`auth.settings.delete`) | The client may want their lawyer to see it alongside the privacy policy. |
| Support contact | The "email changed" notice says "contact ART Gradings support" with no address | A support address for account-security notices. |
| Turnstile | Now also on the password-change and delete forms | Part of the existing Turnstile scope addition; no further cost. |
```

- [ ] **Step 3: CLAUDE.md**

- *Repo state*: add profile and settings to what is built, and replace "Not yet built: profile and settings (the next M2 spec)." with the next unbuilt item, which is M3 (the submission flow).
- *Supabase* rules, add:

  ```markdown
  - **Account deletion is a hard delete, and nothing new may `cascade` from
    `auth.users`.** Only `profiles` and `user_roles` do. Orders, payments and
    their logs reference the user `on delete set null` and scrub personal fields;
    graded cards stay in the Pop Report; deletion is refused while an order is
    unfinished. See `docs/superpowers/specs/2026-09-28-profile-settings-design.md`.
  ```
- In the existing `lib/supabase/admin.ts` rule, name its one allowlisted caller, `lib/auth/delete-current-user.ts`, whose `deleteCurrentUser()` takes no argument.
- *Auth* section, add:

  ```markdown
  - **Settings live at `/account/settings`** (spec
    `docs/superpowers/specs/2026-09-28-profile-settings-design.md`). Password
    change and deletion re-verify the current password with
    `signInWithPassword`, so those forms carry Turnstile; email change relies on
    Supabase's double confirmation instead. The address they verify against
    comes from `auth.getUser()`, never the JWT claims, which lag an email change.
  - **Email change never reveals whether an address is taken** —
    `revealsAccount()` codes, the rate limit included, answer "sent".
  ```

- [ ] **Step 4: The spec's status**

In `docs/superpowers/specs/2026-09-28-profile-settings-design.md`, change `**Status:** Approved, not yet implemented` to `**Status:** Implemented — see docs/superpowers/plans/2026-09-28-profile-settings.md for deviations`.

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs: record the settings runbook steps, content requests and deletion contract

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Verification on the local stack

Run by the controller, not a subagent — it needs a browser and Mailpit.

- [ ] **Step 1: Every automated check**

```bash
npm run lint && npm run build && npx tsc --noEmit && npm test && npm run db:reset && npm run db:test
```

Expected: all pass.

- [ ] **Step 2: Manual, with `npm run dev` and Mailpit (http://localhost:54324)**

Signed in as `user@example.test` / `password123!`:

1. `/account` → Settings. Names show `Example` / `User`. Change to `Ada` / blank → "saved"; reload → `Ada` / empty.
2. Change email to `new@example.test` → "sent". Mailpit has two "Confirm your email change" mails, one per address. **Record whether each carries its own token hash** (the spec's open question). Open the first link → Continue → the partial message, button gone. Open the other → Continue → `/account/settings` showing `new@example.test`. The old address receives "Your email address was changed".
3. Change email to `admin@example.test` → the same "sent" message; Mailpit receives nothing for it.
4. In a second browser, sign in as the same user. In the first, change the password → "changed", fields cleared; the "password changed" mail arrives. Within the hour the second browser is signed out (or immediately on its next token refresh).
5. Wrong current password on the password form → "That isn't your current password."
6. Delete the account → `/account-deleted`, header shows "Sign in". Signing in with the account fails. `select * from profiles where id = '…a1'` and `user_roles` in Studio (http://localhost:54323) return nothing.

Afterwards `npm run db:reset` restores the seed.

- [ ] **Step 3: Record findings**

Anything the manual run contradicts in the plan or spec (for instance the email-change token hashes) is added to this plan's *Deviations* table and committed.
