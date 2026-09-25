# Auth Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete email/password lifecycle — sign up, confirm, sign in, sign out, forgot and reset password — with branded auth email, Turnstile bot protection, and a protected `/account` landing page.

**Architecture:** Each form is a Client Component (`AuthForm`) driven by `useActionState`, posting to a `"use server"` action that calls Supabase through `lib/supabase/server.ts`, maps `error.code` to a message key in one module, and redirects with next-intl's locale-aware `redirect`. Supabase Auth sends its own email (Mailpit locally, Cloudflare SMTP when hosted) from templates in `supabase/templates/`, and verifies Turnstile tokens itself. Confirmation links use `token_hash` behind a one-click POST, so a mail scanner's `GET` consumes nothing.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions), React 19.2 (`useActionState`), TypeScript strict, next-intl 4, `@supabase/ssr` 0.12 / `@supabase/supabase-js` 2.112 (auth-js 2.112.4), Supabase CLI 2.116, Cloudflare Turnstile (hand-written loader, no dependency), Sentry, Vitest 4 + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-auth-flows-design.md` — read it before Task 1. The plan argues from it; where the plan departs from it, *Deviations from the spec* below says so and why.

## Global Constraints

- **All user-facing copy lives in `messages/en.json`** under `auth.*` (plus `nav.account`). The email templates in `supabase/templates/` are the single exception — Supabase renders them, not our app.
- **Never assert user-facing copy as a literal in a test.** Import `messages/en.json` and assert against `messages.auth.…`.
- **Import `Link`, `redirect`, `usePathname` from `@/i18n/navigation`**, never from `next/*`.
- **In a Server Action, always `return redirect({ href, locale })`** with an explicit `locale` — Server Actions have no root params. `return` it (it returns `never`) so TypeScript narrows, and never call it inside a `try` block: it works by throwing.
- **Every action validates its locale with `resolveLocale()`** — the bound locale arrives from the browser and is attacker-controlled.
- **Map Supabase errors by `error.code` only, never by `error.message`.** Messages change between GoTrue releases, and some embed the submitted email address.
- **Sentry reports carry the flow and the error code, never the Supabase error object and never form data.** Report through `reportAuthError()` only. Never pass a `dataCollection` object to `Sentry.init`.
- **Sign-up, resend and forgot-password never reveal whether an account exists.** Codes whose appearance depends on that (`revealsAccount()`) are treated as success.
- **`getSession()` is used in exactly one place: `AccountLink`,** as a display hint. Everything that decides access uses `getClaims()` via `getUser()`/`requireUser()`.
- **Every action returns a *fresh* state object.** The Turnstile widget resets whenever the state object's identity changes; a shared module-level constant like `const SENT = { status: "sent" }` would silently stop the second submission working.
- **Password limits come from `lib/auth/password.ts` only** — the action check, the input's `minLength`, and the message interpolation all read the same constants.
- **Never write `text-gold`.** Gold text is `text-gold-ink`. `components/gold-ink.test.ts` enforces it.
- **Tests are colocated, `globals: false`** (import `describe`/`test`/`expect`/`vi` from `vitest`), component tests go through `renderWithIntl` from `@/test/i18n`, and server-side tests put `// @vitest-environment node` on line 1.
- **`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is a public build arg. The real Turnstile secret never enters the repo, CI, Coolify or the app** — it lives in the hosted Supabase Auth settings only.
- **No migration.** `private.handle_new_user` already provisions sign-ups. pgTAP is unchanged. `supabase/seed.sql` stays local-only and obviously synthetic.
- **The branch is `feature/auth-flows`,** already created. Commit after every task, conventional-commit style (`feat:`, `docs:`, `chore:`), ending every message with:

  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```

## Review Focus

1. **A per-address rate limit on sign-up, resend or forgot-password** (`over_email_send_rate_limit`, which GoTrue raises only for an address that has an account) must look exactly like success, or the 60-second resend window becomes an account-existence oracle. → Tests in Tasks 7 and 10.
2. **A second submission on the same page** — resend twice, or retry after a captcha failure — must carry a *fresh* Turnstile token, because tokens are single-use. The widget resets on every new action state, success included. → Tests in Tasks 4 and 5.
3. **A `next` value that browsers normalise into another origin** — `/\t/evil.test` (browsers strip tabs and newlines, leaving `//evil.test`), `/\evil.test`, `//evil.test` — must fall back to `/account`. → Tests in Task 2.
4. **A failed submission keeps what the user typed.** React 19 resets uncontrolled fields after a `<form action>` completes; a wrong password must not also wipe the email address. `AuthForm` submits through `onSubmit` + `startTransition`, which does not reset. → Test in Task 5.
5. **The header shows "Account" after signing in without a full reload.** The sign-in redirect is a client-side navigation, the layout's `AccountLink` does not remount, and `onAuthStateChange` does not fire for cookies a Server Action set. `AccountLink` re-reads the session when the pathname changes. → Test in Task 12.

## Deviations from the spec

Each is small, deliberate, and should be mentioned when the branch is reviewed.

| Spec says | Plan does | Why |
|---|---|---|
| Local Turnstile secret as `env(SUPABASE_AUTH_CAPTCHA_SECRET)` | The literal test secret `1x0000000000000000000000000000000AA` in `config.toml` | It is Cloudflare's *published* always-pass test value, not a credential. `env()` would make every developer and the CI `db-tests` job create an env file for it, and the CLI's `.env` lookup rules are not something we want the local stack to hinge on. |
| `app/[locale]/auth/confirm/` | `app/[locale]/(auth)/auth/confirm/` | Route groups do not change URLs — it is still `/auth/confirm` — and inside the group it gets the same centred card as the other auth pages. |
| Rate-limit codes → "Too many attempts" everywhere | On sign-up, resend and forgot-password, `over_email_send_rate_limit` (and `user_already_exists` / `email_exists`) is treated as success | The spec's enumeration section requires those flows to answer identically for registered and unregistered addresses, and a per-address rate limit only fires for a registered one. The enumeration rule wins. `over_email_send_rate_limit` is also raised for Supabase's project-wide hourly email cap, not only the per-address window, so suppressed occurrences are reported to Sentry as warnings (`reportSuppressedAuthError`) rather than silently vanishing. `over_request_rate_limit` is per calling IP, which — since every call originates from our server — is our server's IP; see `AUTH_SETUP.md`. |
| `/reset-password`: "`requireUser()`; without a session, redirect to `/forgot-password`" | A companion `getUser()` (returns `null`), used by the reset page and action | `requireUser()` sends the visitor to `/sign-in`; the reset page needs a different destination. |
| Error table | Adds `reauthentication_needed` → "request a new reset link" and `email_address_invalid` → "enter a valid email" | `secure_password_change = true` makes GoTrue raise `reauthentication_needed` when a signed-in user whose session is older than 24 h opens `/reset-password`. Unmapped, it would be a generic error and a Sentry event every time. |
| Files list | Adds `lib/auth/action-state.ts`, `components/auth/auth-heading.tsx`, `FieldDescription` in `components/ui/field.tsx`, `test/form-data.ts`, and an `auth:templates` npm script | A `"use server"` file may export only async functions, so the shared state type and helpers need their own module; the rest remove repetition. |
| — | The error alert uses neutral tokens (`bg-surface-sunken`, `border-hairline`) | The design system has no danger colour. Adding one is a design-system decision, not an auth one. Flag it if red is wanted. |
| `password_changed.html` has "a 'not you? reset your password' pointer" | The pointer is text, not a link | Supabase does not document `{{ .SiteURL }}` as available in *notification* templates. A link that renders as `/forgot-password` with no host would be worse than none. |

---

## File Structure

**Supabase (`supabase/`)**
- `config.toml` — confirmations on, password length 10, secure password change, 60 s resend window, Turnstile, template wiring
- `templates/confirmation.html`, `templates/recovery.html`, `templates/password_changed.html` — branded, table-based, no remote images
- `seed.sql` — seeded users get a real local password and identity rows

**Auth library (`lib/auth/`)**
- `password.ts` — policy constants, `passwordProblem()`
- `safe-next.ts` — `safeNext()`, the same-origin redirect guard
- `errors.ts` — `AuthErrorKey`, `authErrorKey()`, `revealsAccount()`, `reportAuthError()`
- `action-state.ts` — `AuthFormState`, `AuthAction`, `readField()`, `readEmail()`, `resolveLocale()`
- `require-user.ts` — `getUser()`, `requireUser()`

**Components**
- `components/auth/turnstile.tsx` — the widget and its script loader
- `components/auth/auth-form.tsx` — shared form: state, pending, error, sent message, Turnstile
- `components/auth/auth-heading.tsx` — h1 + lead for auth pages
- `components/ui/field.tsx` — gains `FieldDescription`
- `components/layout/account-link.tsx` — "Sign in" / "Account" in the header

**Routes (`app/[locale]/`)**
- `(auth)/layout.tsx` — centred card
- `(auth)/sign-up/{page.tsx,actions.ts}`
- `(auth)/sign-up/check-email/{page.tsx,actions.ts}`
- `(auth)/sign-in/{page.tsx,actions.ts}`
- `(auth)/forgot-password/{page.tsx,actions.ts}`
- `(auth)/auth/confirm/{page.tsx,actions.ts}`
- `(auth)/reset-password/{page.tsx,actions.ts}`
- `account/{page.tsx,actions.ts}` — landing page and sign-out

**Tooling and docs**
- `scripts/push-auth-templates.mjs` — pushes templates to a hosted project
- `test/form-data.ts` — `formData()` helper for action tests
- `vitest.config.mts`, `.env.example`, `Dockerfile`, `.github/workflows/ci.yml`, `.github/workflows/build-and-push.yml` — the Turnstile site key
- `docs/deployment/AUTH_SETUP.md` — hosted configuration runbook
- `docs/content-requests.md`, `CLAUDE.md`, the spec's status line

---

### Task 1: Local auth configuration, email templates and seed

Turns the local stack into the configuration the flows will run against, so every later task can be checked end to end. No application code.

**Files:**
- Modify: `supabase/config.toml`
- Create: `supabase/templates/confirmation.html`
- Create: `supabase/templates/recovery.html`
- Create: `supabase/templates/password_changed.html`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: nothing
- Produces: a local GoTrue that requires confirmation and a Turnstile token; email links of the form `{{ .SiteURL }}/auth/confirm?token_hash=…&type=email|recovery`; seeded users `user@example.test` / `admin@example.test` with password `password123!`

- [ ] **Step 1: Edit `[auth]`**

In `supabase/config.toml`, under `[auth]`, change:

```toml
additional_redirect_urls = ["https://127.0.0.1:3000"]
```

to

```toml
# No action passes a redirectTo — the email templates build their own links
# from `site_url` — so this list only needs the two ways a developer reaches
# the dev server.
additional_redirect_urls = ["http://localhost:3000", "http://127.0.0.1:3000"]
```

and change `minimum_password_length = 6` to:

```toml
# NIST SP 800-63B: length, no composition rules. Mirrored by
# PASSWORD_MIN_LENGTH in lib/auth/password.ts — change both together.
minimum_password_length = 10
```

- [ ] **Step 2: Enable Turnstile**

Replace the commented block

```toml
# [auth.captcha]
# enabled = true
# provider = "hcaptcha"
# secret = ""
```

with

```toml
[auth.captcha]
enabled = true
provider = "turnstile"
# Cloudflare's published always-pass TEST secret. Public by design — it is in
# Cloudflare's documentation — and it only ever passes tokens from the matching
# test site key (1x00000000000000000000AA). It is not a credential. The real
# secret lives in the hosted project's Auth settings and nowhere else; see
# docs/deployment/AUTH_SETUP.md.
#
# GoTrue calls Cloudflare's siteverify for every sign-up, sign-in, reset and
# resend, so the local stack needs internet access for those to succeed.
secret = "1x0000000000000000000000000000000AA"
```

- [ ] **Step 3: Edit `[auth.email]`**

Set these three values (leave the rest of the section as it is):

```toml
enable_confirmations = true
secure_password_change = true
max_frequency = "60s"
```

Add a comment above `max_frequency`: `# Mirrors the hosted default, so resend behaviour is tested as it will run.`

- [ ] **Step 4: Wire the templates**

Replace the commented `[auth.email.template.invite]` block and the commented `[auth.email.notification.password_changed]` block with:

```toml
# Applied to the LOCAL stack only. A hosted project gets the same files through
# `npm run auth:templates` (scripts/push-auth-templates.mjs), which reads the
# subjects and paths from this file — so this is their single source.
[auth.email.template.confirmation]
subject = "Confirm your email"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.recovery]
subject = "Reset your password"
content_path = "./supabase/templates/recovery.html"

[auth.email.notification.password_changed]
enabled = true
subject = "Your password was changed"
content_path = "./supabase/templates/password_changed.html"
```

- [ ] **Step 5: Write `supabase/templates/confirmation.html`**

Table-based with inline styles, as email clients require. No remote images. The button label is black on a gold fill — the same rule the site uses for gold (`--gold` is a fill; only `--gold-ink` is text on paper). The band's wordmark uses the bright gold, which passes on the brand black.

The link uses a raw `&`, exactly as Supabase's own template examples do.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Confirm your email</title>
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
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#1A1D29;">Confirm your email</h1>
                <p style="margin:0 0 24px;">Confirm this address to finish creating your account.</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#C9A227;border-radius:10px;">
                      <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email" style="display:inline-block;padding:14px 28px;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#1A1D29;text-decoration:none;">Confirm email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:14px;color:#5F616B;">The link works once and expires in one hour. If you did not create an account, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

- [ ] **Step 6: Write `supabase/templates/recovery.html`**

Identical to `confirmation.html` except:
- `<title>` and `<h1>`: `Reset your password`
- first paragraph: `Someone asked to reset the password for this address. Choose a new one to continue.`
- link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`, label `Choose a new password`
- closing paragraph: `The link works once and expires in one hour. If you did not ask for this, ignore this email — your password has not changed.`

Write the file out in full; do not leave it referencing the other one.

- [ ] **Step 7: Write `supabase/templates/password_changed.html`**

Same shell. No button and no template variables.
- `<title>` and `<h1>`: `Your password was changed`
- first paragraph: `The password for your account was just changed.`
- second paragraph (the closing one's styling): `If this was not you, reset your password straight away from the sign-in page, and reply to this email so we can help.`

Delete the button table entirely.

- [ ] **Step 8: Give the seeded users a password**

In `supabase/seed.sql`, replace the `insert into auth.users …` statement with the version below, and add the `auth.identities` insert right after it. Leave the header comment, the role grant and the profile updates as they are. Then add one line to the header comment: `-- Both seeded users sign in with the password password123! (local only).`

GoTrue scans the token columns into Go strings, so `NULL` there breaks sign-in with "converting NULL to string is unsupported" — they must be `''`. A user with no `auth.identities` row cannot sign in with a password.

```sql
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated',
   'user@example.test', extensions.crypt('password123!', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated',
   'admin@example.test', extensions.crypt('password123!', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

-- Password sign-in looks the user up through their email identity.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a1', 'email',
   '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"user@example.test","email_verified":true}',
   now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000a2', 'email',
   '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"admin@example.test","email_verified":true}',
   now(), now(), now())
on conflict (provider_id, provider) do nothing;
```

- [ ] **Step 9: Restart the stack and replay**

Config changes need a restart, not just a reset.

```bash
npm run db:stop && npm run db:start
npm run db:reset
npm run db:test
```

Expected: `db:reset` completes, and every pgTAP file passes. The schema did not change, so a failure here means the seed broke a provisioning test — read it before moving on.

- [ ] **Step 10: Prove sign-in, captcha and the confirmation email against the local GoTrue**

```bash
KEY=$(npx supabase status -o env | sed -nE 's/^(PUBLISHABLE_KEY|ANON_KEY)="?([^"]*)"?$/\2/p' | head -1)
AUTH=http://127.0.0.1:54321/auth/v1

# 1. The seeded user signs in. The dummy token is what the test site key produces.
curl -s "$AUTH/token?grant_type=password" -H "apikey: $KEY" -H 'Content-Type: application/json' \
  -d '{"email":"user@example.test","password":"password123!","gotrue_meta_security":{"captcha_token":"XXXX.DUMMY.TOKEN.XXXX"}}' | head -c 120; echo

# 2. Without a captcha token, the same request is refused.
curl -s "$AUTH/token?grant_type=password" -H "apikey: $KEY" -H 'Content-Type: application/json' \
  -d '{"email":"user@example.test","password":"password123!"}'; echo

# 3. A sign-up produces a confirmation email with a token_hash link.
curl -s "$AUTH/signup" -H "apikey: $KEY" -H 'Content-Type: application/json' \
  -d '{"email":"new@example.test","password":"long-enough-1","gotrue_meta_security":{"captcha_token":"XXXX.DUMMY.TOKEN.XXXX"}}' > /dev/null
curl -s http://127.0.0.1:54324/api/v1/message/latest | grep -o 'auth/confirm?token_hash=[^"]*type=email' | head -1
```

Expected:
1. JSON starting `{"access_token":` — the seed works.
2. JSON with `"error_code":"captcha_failed"` — Turnstile is enforced.
3. A line like `auth/confirm?token_hash=pkce_…&type=email` or `auth/confirm?token_hash=<hex>&type=email` — the template is live.

If (1) fails with a NULL-conversion error, a token column is missing from Step 8. If (2) *succeeds*, `[auth.captcha]` did not load — check the stack was restarted. Run `npm run db:reset` afterwards to drop `new@example.test`.

- [ ] **Step 11: Commit**

```bash
git add supabase/config.toml supabase/templates supabase/seed.sql
git commit -m "feat: configure local auth, email templates and seeded passwords

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Password policy and the `next` redirect guard

Two pure modules with no dependencies. Everything later leans on them.

**Files:**
- Create: `lib/auth/password.ts`
- Test: `lib/auth/password.test.ts`
- Create: `lib/auth/safe-next.ts`
- Test: `lib/auth/safe-next.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PASSWORD_MIN_LENGTH: 10`, `PASSWORD_MAX_BYTES: 72`
  - `type PasswordProblem = "passwordTooShort" | "passwordTooLong"`
  - `passwordProblem(password: string): PasswordProblem | null`
  - `DEFAULT_NEXT: "/account"`
  - `safeNext(value: unknown): string`

- [ ] **Step 1: Write the failing password test**

`lib/auth/password.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, passwordProblem } from "./password";

describe("passwordProblem", () => {
  test("rejects a password one character short", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe("passwordTooShort");
  });

  test("accepts a password at the minimum", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  test("counts characters, not UTF-16 units, for the minimum", () => {
    // Ten emoji are ten characters but twenty UTF-16 units.
    expect(passwordProblem("😀".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordProblem("😀".repeat(PASSWORD_MIN_LENGTH - 1))).toBe("passwordTooShort");
  });

  test("accepts exactly 72 bytes of multibyte text", () => {
    // "é" is two bytes in UTF-8: 36 of them are 72 bytes.
    expect(passwordProblem("é".repeat(PASSWORD_MAX_BYTES / 2))).toBeNull();
  });

  test("rejects 73 bytes, because bcrypt would silently truncate", () => {
    expect(passwordProblem(`${"é".repeat(PASSWORD_MAX_BYTES / 2)}a`)).toBe("passwordTooLong");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/auth/password.test.ts`
Expected: FAIL — `Failed to resolve import "./password"`.

- [ ] **Step 3: Implement `lib/auth/password.ts`**

```ts
/**
 * The password policy, per NIST SP 800-63B: a minimum length and nothing else
 * — no composition rules. Supabase's leaked-password check (HaveIBeenPwned)
 * is enabled on the hosted project once it is on the Pro plan.
 *
 * These constants are the single source for the action check, the inputs'
 * `minLength`, and the messages' `{min}`/`{max}`. `supabase/config.toml`'s
 * `minimum_password_length` mirrors the minimum and must change with it.
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * bcrypt hashes only the first 72 BYTES and ignores the rest, silently — two
 * passwords sharing a 72-byte prefix would both work. Rejecting longer ones is
 * the only way to make that impossible.
 */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem = "passwordTooShort" | "passwordTooLong";

export function passwordProblem(password: string): PasswordProblem | null {
  // Array.from splits by code point, so an emoji counts as one character.
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) {
    return "passwordTooShort";
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return "passwordTooLong";
  }
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/auth/password.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing `safeNext` test**

`lib/auth/safe-next.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";

import { DEFAULT_NEXT, safeNext } from "./safe-next";

describe("safeNext", () => {
  test.each(["/account", "/submit?x=1", "/account#orders", "/a/b/c"])(
    "accepts the same-origin path %s",
    (path) => {
      expect(safeNext(path)).toBe(path);
    },
  );

  test.each([
    ["protocol-relative", "//evil.test"],
    ["backslash protocol-relative", "/\\evil.test"],
    ["absolute URL", "https://evil.test"],
    ["javascript URL", "javascript:alert(1)"],
    ["relative path", "account"],
    ["empty string", ""],
    // Browsers strip tab and newline from URLs before parsing, so each of
    // these becomes `//evil.test` in the address bar.
    ["tab before the second slash", "/\t/evil.test"],
    ["newline before the second slash", "/\n/evil.test"],
    ["backslash later in the path", "/ok\\..\\evil"],
  ])("rejects a %s", (_label, value) => {
    expect(safeNext(value)).toBe(DEFAULT_NEXT);
  });

  test.each([undefined, null, 42, ["/account"], { href: "/account" }])(
    "rejects the non-string %j",
    (value) => {
      expect(safeNext(value)).toBe(DEFAULT_NEXT);
    },
  );
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run lib/auth/safe-next.test.ts`
Expected: FAIL — `Failed to resolve import "./safe-next"`.

- [ ] **Step 7: Implement `lib/auth/safe-next.ts`**

```ts
/** Where sign-in lands when no usable `next` was supplied. */
export const DEFAULT_NEXT = "/account";

/**
 * Browsers remove tab, CR and LF from a URL before parsing it, so
 * `/\t/evil.test` becomes `//evil.test`. Any control character, and any
 * backslash (which browsers treat as `/`), rejects the whole value.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

/**
 * Returns `value` only if it is a path on this origin, otherwise
 * `DEFAULT_NEXT`. The result is a locale-less path — pass it to
 * `redirect({ href, locale })` from `@/i18n/navigation`, which adds the prefix.
 *
 * Without this, `/sign-in?next=//evil.test` is an open redirect that borrows
 * our domain's credibility for a phishing link.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_NEXT;
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_NEXT;
  if (UNSAFE.test(value)) return DEFAULT_NEXT;
  return value;
}
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `npx vitest run lib/auth`
Expected: PASS, all tests. Also run `npx eslint lib/auth` — expected: no output.

- [ ] **Step 9: Commit**

```bash
git add lib/auth/password.ts lib/auth/password.test.ts lib/auth/safe-next.ts lib/auth/safe-next.test.ts
git commit -m "feat: add the password policy and the sign-in redirect guard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Auth copy, error mapping and action state

Adds every string the auth flows need in one go, so later tasks reference keys that already exist; the error module that maps Supabase codes onto them; and the shared state type the actions and the form agree on.

**Files:**
- Modify: `messages/en.json`
- Create: `lib/auth/errors.ts`
- Test: `lib/auth/errors.test.ts`
- Create: `lib/auth/action-state.ts`
- Test: `lib/auth/action-state.test.ts`
- Create: `test/form-data.ts`

**Interfaces:**
- Consumes: `PasswordProblem` from Task 2 (its members must be keys of `auth.errors`)
- Produces:
  - `type AuthErrorKey = keyof (typeof messages)["auth"]["errors"]`
  - `type AuthFlow = "signUp" | "resend" | "signIn" | "forgotPassword" | "confirm" | "resetPassword" | "signOut"`
  - `AUTH_ERROR_KEYS: Readonly<Record<string, AuthErrorKey>>`
  - `authErrorKey(error: AuthError, flow: AuthFlow): AuthErrorKey`
  - `revealsAccount(error: AuthError): boolean`
  - `reportAuthError(error: AuthError, flow: AuthFlow): void`
  - `type AuthFormState = { status: "idle" } | { status: "sent" } | { status: "error"; errorKey: AuthErrorKey }`
  - `type AuthAction = (locale: string, previous: AuthFormState, formData: FormData) => Promise<AuthFormState>`
  - `initialAuthState: AuthFormState`
  - `readField(formData: FormData, name: string): string`
  - `readEmail(formData: FormData): string | null`
  - `resolveLocale(value: string): Locale`
  - `formData(fields: Record<string, string>): FormData` (test helper)

- [ ] **Step 1: Add the copy**

In `messages/en.json`, add `"account": "Account"` to `nav` (after `"signIn"`), and add this top-level `auth` object after `faq`:

```json
"auth": {
  "fields": {
    "email": "Email",
    "password": "Password",
    "newPassword": "New password",
    "passwordHint": "At least {min} characters."
  },
  "signUp": {
    "title": "Create your account",
    "lead": "An account lets you submit cards and follow them through grading.",
    "submit": "Create account",
    "haveAccount": "Already have an account? <link>Sign in</link>"
  },
  "checkEmail": {
    "title": "Check your inbox",
    "lead": "We've sent a confirmation link to the address you signed up with. Open it to activate your account.",
    "resendLead": "Nothing after a few minutes? Check your spam folder, or enter your address to send the link again.",
    "submit": "Send the link again",
    "sent": "If that address has an account waiting for confirmation, a new link is on its way."
  },
  "signIn": {
    "title": "Sign in",
    "lead": "Welcome back.",
    "submit": "Sign in",
    "forgotPassword": "Forgot your password?",
    "noAccount": "New here? <link>Create an account</link>",
    "linkExpired": "That link has expired or was already used. Sign in, or ask for a new link."
  },
  "forgotPassword": {
    "title": "Reset your password",
    "lead": "Enter the address you signed up with and we'll email you a link to choose a new password.",
    "submit": "Send reset link",
    "sent": "If an account exists for that address, a reset link is on its way.",
    "backToSignIn": "<link>Back to sign in</link>"
  },
  "confirm": {
    "emailTitle": "Confirm your email",
    "recoveryTitle": "Reset your password",
    "lead": "One more step — continue to finish.",
    "submit": "Continue"
  },
  "resetPassword": {
    "title": "Choose a new password",
    "lead": "Saving it signs you out on every other device.",
    "submit": "Save password"
  },
  "account": {
    "title": "Your account",
    "signedInAs": "Signed in as {email}",
    "signOut": "Sign out"
  },
  "errors": {
    "invalidCredentials": "That email and password don't match an account.",
    "emailNotConfirmed": "Confirm your email address first. <resend>Send the link again</resend>",
    "weakPassword": "Choose a stronger password: at least {min} characters, and not one known from a data breach.",
    "passwordTooShort": "Use at least {min} characters.",
    "passwordTooLong": "That password is too long. Use at most {max} characters — fewer if it has accented letters or emoji.",
    "invalidEmail": "Enter a valid email address.",
    "captchaFailed": "We couldn't verify the request. Please try again.",
    "rateLimited": "Too many attempts. Wait a moment and try again.",
    "samePassword": "Your new password must be different from the current one.",
    "reauthenticationNeeded": "For your security, ask for a new reset link and try again.",
    "generic": "Something went wrong. Please try again."
  }
}
```

Run: `npx vitest run messages`
Expected: PASS — every new string parses as ICU (the `<link>` and `<resend>` tags included).

- [ ] **Step 2: Write the failing errors test**

`lib/auth/errors.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";

const mocks = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { AUTH_ERROR_KEYS, authErrorKey, reportAuthError, revealsAccount } = await import("./errors");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authErrorKey", () => {
  test.each(Object.entries(AUTH_ERROR_KEYS))(
    "%s maps to a message that exists",
    (_code, key) => {
      // Checked against the real messages file, so renaming a key fails here.
      expect(messages.auth.errors[key]).toBeTypeOf("string");
    },
  );

  test("maps a known code without reporting it", () => {
    const error = new AuthError("Invalid login credentials", 400, "invalid_credentials");
    expect(authErrorKey(error, "signIn")).toBe("invalidCredentials");
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("maps an unknown code to generic and reports it", () => {
    const error = new AuthError("Database error", 500, "unexpected_failure");
    expect(authErrorKey(error, "signUp")).toBe("generic");
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("maps a code-less error (network failure) to generic and reports it", () => {
    expect(authErrorKey(new AuthError("fetch failed"), "signIn")).toBe("generic");
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("does not treat an inherited property name as a code", () => {
    const error = new AuthError("odd", 400, "toString");
    expect(authErrorKey(error, "signIn")).toBe("generic");
  });
});

describe("reportAuthError", () => {
  test("sends the flow and code, never the Supabase message", () => {
    // GoTrue embeds the submitted address in some messages.
    const error = new AuthError('Email address "someone@example.test" is invalid', 400, "odd_code");
    reportAuthError(error, "signUp");

    const [reported, context] = mocks.captureException.mock.calls[0];
    expect(JSON.stringify([String(reported), context])).not.toContain("someone@example.test");
    expect(context).toMatchObject({
      tags: { "auth.flow": "signUp", "auth.code": "odd_code", "auth.status": "400" },
    });
  });
});

describe("revealsAccount", () => {
  test.each(["over_email_send_rate_limit", "user_already_exists", "email_exists"])(
    "%s depends on whether the account exists",
    (code) => {
      expect(revealsAccount(new AuthError("x", 429, code))).toBe(true);
    },
  );

  test.each(["captcha_failed", "over_request_rate_limit", "weak_password"])(
    "%s does not",
    (code) => {
      expect(revealsAccount(new AuthError("x", 400, code))).toBe(false);
    },
  );

  test("a code-less error does not", () => {
    expect(revealsAccount(new AuthError("fetch failed"))).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/auth/errors.test.ts`
Expected: FAIL — `Failed to resolve import "./errors"`.

- [ ] **Step 4: Implement `lib/auth/errors.ts`**

```ts
import * as Sentry from "@sentry/nextjs";
import type { AuthError } from "@supabase/supabase-js";

import type messages from "@/messages/en.json";

/** Every message under `auth.errors` — the only errors an auth form can show. */
export type AuthErrorKey = keyof (typeof messages)["auth"]["errors"];

/** Which flow failed. Sent to Sentry as a tag. */
export type AuthFlow =
  | "signUp"
  | "resend"
  | "signIn"
  | "forgotPassword"
  | "confirm"
  | "resetPassword"
  | "signOut";

/**
 * Supabase `error.code` → message key. Keyed by the stable code, never by
 * `error.message`: messages change between GoTrue releases, and some embed the
 * submitted email address.
 *
 * `otp_expired` is absent on purpose: the confirm action turns any failure
 * into `/sign-in?error=link_expired` rather than an inline error.
 */
export const AUTH_ERROR_KEYS: Readonly<Record<string, AuthErrorKey>> = {
  invalid_credentials: "invalidCredentials",
  email_not_confirmed: "emailNotConfirmed",
  weak_password: "weakPassword",
  captcha_failed: "captchaFailed",
  over_request_rate_limit: "rateLimited",
  over_email_send_rate_limit: "rateLimited",
  same_password: "samePassword",
  reauthentication_needed: "reauthenticationNeeded",
  email_address_invalid: "invalidEmail",
};

/**
 * Codes whose appearance depends on whether the address has an account.
 * `over_email_send_rate_limit` is per user: GoTrue only raises it for an
 * address it already knows, inside the resend window. The other two only
 * appear when confirmations are off, and are listed defensively.
 */
const ACCOUNT_REVEALING = new Set([
  "over_email_send_rate_limit",
  "user_already_exists",
  "email_exists",
]);

/**
 * True when showing this error would tell a stranger an account exists.
 * Sign-up, resend and forgot-password treat such errors as success.
 */
export function revealsAccount(error: AuthError): boolean {
  return error.code !== undefined && ACCOUNT_REVEALING.has(error.code);
}

/**
 * Reports an auth failure we did not expect. An action that returns `{error}`
 * instead of throwing is invisible to Sentry unless it reports explicitly.
 *
 * A fresh Error, not the Supabase one: `error.message` can contain the email
 * address, and `sendDefaultPii` being off does not scrub an exception message.
 */
export function reportAuthError(error: AuthError, flow: AuthFlow): void {
  Sentry.captureException(new Error(`Unexpected Supabase Auth error in ${flow}`), {
    tags: {
      "auth.flow": flow,
      "auth.code": error.code ?? "none",
      "auth.status": String(error.status ?? "none"),
      "auth.error": error.name,
    },
  });
}

/** The message key to show for `error`; reports anything unmapped. */
export function authErrorKey(error: AuthError, flow: AuthFlow): AuthErrorKey {
  // Object.hasOwn, not `in` or a bare lookup: `toString` is on the prototype.
  if (error.code !== undefined && Object.hasOwn(AUTH_ERROR_KEYS, error.code)) {
    return AUTH_ERROR_KEYS[error.code];
  }
  reportAuthError(error, flow);
  return "generic";
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run lib/auth/errors.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the test helper `test/form-data.ts`**

```ts
/** Builds the FormData a Server Action receives, for action tests. */
export function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}
```

- [ ] **Step 7: Write the failing action-state test**

`lib/auth/action-state.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";

import { formData } from "@/test/form-data";

import { readEmail, readField, resolveLocale } from "./action-state";

describe("readField", () => {
  test("returns a string field", () => {
    expect(readField(formData({ password: "secret" }), "password")).toBe("secret");
  });

  test("returns an empty string for a missing field", () => {
    expect(readField(formData({}), "password")).toBe("");
  });

  test("returns an empty string for a file where a string was expected", () => {
    const data = new FormData();
    data.set("password", new Blob(["x"]), "x.txt");
    expect(readField(data, "password")).toBe("");
  });
});

describe("readEmail", () => {
  test("trims surrounding whitespace", () => {
    expect(readEmail(formData({ email: "  user@example.test \n" }))).toBe("user@example.test");
  });

  test.each(["", "user", "user@", "user@example", "a b@example.test"])(
    "rejects %j",
    (email) => {
      expect(readEmail(formData({ email }))).toBeNull();
    },
  );
});

describe("resolveLocale", () => {
  test("keeps a supported locale", () => {
    expect(resolveLocale("en")).toBe("en");
  });

  test("falls back to the default for anything else", () => {
    // The bound locale comes from the browser and can be anything.
    expect(resolveLocale("xx")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run lib/auth/action-state.test.ts`
Expected: FAIL — `Failed to resolve import "./action-state"`.

- [ ] **Step 9: Implement `lib/auth/action-state.ts`**

```ts
import { hasLocale, type Locale } from "next-intl";

import { routing } from "@/i18n/routing";

import type { AuthErrorKey } from "./errors";

/**
 * What an auth action hands back to its form. `sent` is the "if an account
 * exists, we've emailed it" outcome; every other success redirects instead of
 * returning.
 *
 * Lives here rather than beside the actions because a `"use server"` module
 * may only export async functions.
 */
export type AuthFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; errorKey: AuthErrorKey };

/**
 * The shape every form action has. `locale` is bound by `AuthForm` from the
 * active locale — it comes from the browser, so validate it with
 * `resolveLocale()` before use.
 */
export type AuthAction = (
  locale: string,
  previous: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

export const initialAuthState: AuthFormState = { status: "idle" };

/** A text field's value, or "" when it is missing or not a string. */
export function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Deliberately loose — Supabase does the real validation. This only stops
 * obviously malformed input before it becomes a round trip and a Sentry event.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The trimmed `email` field, or null when it is not plausibly an address. */
export function readEmail(formData: FormData): string | null {
  const email = readField(formData, "email").trim();
  return EMAIL_SHAPE.test(email) ? email : null;
}

/** `value` if it is a supported locale, otherwise the default. */
export function resolveLocale(value: string): Locale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
```

- [ ] **Step 10: Run the auth library tests**

Run: `npx vitest run lib/auth messages`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add messages/en.json lib/auth/errors.ts lib/auth/errors.test.ts lib/auth/action-state.ts lib/auth/action-state.test.ts test/form-data.ts
git commit -m "feat: add auth copy, Supabase error mapping and action state

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Turnstile widget and site-key plumbing

**Files:**
- Create: `components/auth/turnstile.tsx`
- Test: `components/auth/turnstile.test.tsx`
- Modify: `vitest.config.mts`
- Modify: `.env.example`
- Modify: `Dockerfile`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/build-and-push.yml`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `Turnstile({ resetKey }: { resetKey: unknown })` — a Client Component that renders a hidden `<input name="captchaToken">` inside whatever form contains it, and resets the widget whenever `resetKey` changes identity
  - `turnstileSiteKey(): string` — throws `NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set` when missing

- [ ] **Step 1: Give the test environment the public test site key**

In `vitest.config.mts`, inside `test: { … }`, after `include`, add:

```ts
    // Cloudflare's published always-pass TEST site key. Components read
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY at render time and throw without it, so
    // every test that renders an auth form needs it set.
    env: {
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
```

- [ ] **Step 2: Write the failing test**

`components/auth/turnstile.test.tsx`:

```tsx
import { waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithIntl } from "@/test/i18n";

import { Turnstile, turnstileSiteKey } from "./turnstile";

const api = {
  render: vi.fn((_container: HTMLElement, _options: Record<string, unknown>) => "widget-1"),
  reset: vi.fn(),
  remove: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  window.turnstile = api;
});

afterEach(() => {
  delete window.turnstile;
  vi.unstubAllEnvs();
});

function tokenInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[name="captchaToken"]');
  if (!input) throw new Error("no captchaToken input");
  return input;
}

async function renderedOptions() {
  await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
  return api.render.mock.calls[0][1] as { callback: (token: string) => void } & Record<string, unknown>;
}

describe("Turnstile", () => {
  test("renders one invisible-unless-needed widget with the site key and locale", async () => {
    renderWithIntl(<Turnstile resetKey={0} />);
    expect(await renderedOptions()).toMatchObject({
      sitekey: "1x00000000000000000000AA",
      language: "en",
      appearance: "interaction-only",
      "response-field": false,
    });
  });

  test("writes the token into the hidden captchaToken input", async () => {
    const { container } = renderWithIntl(<Turnstile resetKey={0} />);
    const options = await renderedOptions();
    act(() => options.callback("token-abc"));
    expect(tokenInput(container).value).toBe("token-abc");
  });

  test("resets the widget and clears the token when resetKey changes", async () => {
    const { container, rerender } = renderWithIntl(<Turnstile resetKey={{ status: "idle" }} />);
    const options = await renderedOptions();
    act(() => options.callback("token-abc"));

    rerender(<Turnstile resetKey={{ status: "error" }} />);

    expect(api.reset).toHaveBeenCalledWith("widget-1");
    expect(tokenInput(container).value).toBe("");
  });

  test("resets again for a second outcome that looks the same", async () => {
    // Resend twice: both return { status: "sent" }, but each is a new object,
    // and the second request needs a fresh single-use token.
    const { rerender } = renderWithIntl(<Turnstile resetKey={{ status: "idle" }} />);
    await renderedOptions();
    rerender(<Turnstile resetKey={{ status: "sent" }} />);
    rerender(<Turnstile resetKey={{ status: "sent" }} />);
    expect(api.reset).toHaveBeenCalledTimes(2);
  });

  test("does not reset on first render", async () => {
    renderWithIntl(<Turnstile resetKey={{ status: "idle" }} />);
    await renderedOptions();
    expect(api.reset).not.toHaveBeenCalled();
  });

  test("removes the widget on unmount", async () => {
    const { unmount } = renderWithIntl(<Turnstile resetKey={0} />);
    await renderedOptions();
    unmount();
    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });

});

describe("turnstileSiteKey", () => {
  // Tested as a function rather than through a render: React 19 reports
  // uncaught render errors instead of rethrowing them, so `expect(render)
  // .toThrow()` is not a reliable way to see this.
  test("returns the configured key", () => {
    expect(turnstileSiteKey()).toBe("1x00000000000000000000AA");
  });

  test("fails loudly when the key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(() => turnstileSiteKey()).toThrow("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run components/auth/turnstile.test.tsx`
Expected: FAIL — `Failed to resolve import "./turnstile"`.

- [ ] **Step 4: Implement `components/auth/turnstile.tsx`**

The token goes into an uncontrolled hidden input through a ref, not React state: tokens arrive from a third-party callback and are cleared from an effect, and `setState` in an effect body trips `react-hooks/set-state-in-effect`.

```tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page, however many widgets mount. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);

  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded without defining window.turnstile"));
    };
    script.onerror = () => {
      scriptPromise = null; // let the next mount try again
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * The public site key. Throws when unset, and is called during render, so a
 * build without the build arg fails at prerender instead of shipping a sign-up
 * page nobody can submit.
 */
export function turnstileSiteKey(): string {
  // Written out in full: Next inlines NEXT_PUBLIC_* by literal textual match.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) throw new Error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set");
  return siteKey;
}

/**
 * Cloudflare Turnstile, verified by Supabase Auth — never by us. The token
 * reaches the Server Action as the `captchaToken` form field, which passes it
 * to Supabase as `options.captchaToken`.
 *
 * `interaction-only`: most visitors see nothing; only suspicious traffic gets
 * a challenge. Tokens are single-use, so the widget resets whenever `resetKey`
 * changes identity — `AuthForm` passes its action state, which is a new object
 * after every submission, success included.
 *
 * Should a Content-Security-Policy be added, `challenges.cloudflare.com` must
 * be allowed in `script-src` and `frame-src`.
 */
export function Turnstile({ resetKey }: { resetKey: unknown }) {
  const siteKey = turnstileSiteKey();
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const widgetId = useRef<string | null>(null);
  const lastResetKey = useRef(resetKey);

  useEffect(() => {
    let cancelled = false;
    const setToken = (token: string) => {
      if (input.current) input.current.value = token;
    };

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId.current =
          turnstile.render(container.current, {
            sitekey: siteKey,
            language: locale,
            appearance: "interaction-only",
            // We own the hidden input; don't let Turnstile add a second one.
            "response-field": false,
            callback: setToken,
            "expired-callback": () => setToken(""),
            "error-callback": () => setToken(""),
          }) ?? null;
      })
      .catch((error: unknown) => {
        // Without the widget every submission fails captcha — worth knowing.
        Sentry.captureException(error);
      });

    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, locale]);

  useEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    if (input.current) input.current.value = "";
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  return (
    <>
      <input ref={input} type="hidden" name="captchaToken" defaultValue="" />
      <div ref={container} className="mb-[18px] empty:hidden" />
    </>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run components/auth/turnstile.test.tsx`
Expected: PASS, 8 tests. Then `npx eslint components/auth` — expected: no output. Every ref here is read and written only inside effects and callbacks, never during render, which is what the `react-hooks` rules require.

- [ ] **Step 6: Add the site key to `.env.example`**

In the BAKED AT BUILD TIME block, after `NEXT_PUBLIC_SENTRY_DSN=`, add:

```bash
# Cloudflare Turnstile site key — public, it ships in the page. Locally use
# Cloudflare's always-pass TEST key below, which pairs with the test secret in
# supabase/config.toml. The real key is created in the Cloudflare dashboard for
# the deployed hostname (docs/deployment/AUTH_SETUP.md). The matching SECRET
# never appears here: Supabase Auth verifies tokens itself.
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

Also add the same line to your own `.env.local` so `npm run dev` works.

- [ ] **Step 7: Add the build arg to the `Dockerfile`**

After `ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT`, add `ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY`. In the `ENV` block, after the `NEXT_PUBLIC_SENTRY_ENVIRONMENT=…` line, add:

```dockerfile
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
```

- [ ] **Step 8: Add it to both workflows**

In `.github/workflows/ci.yml`, in the Build step's `env:`, after `NEXT_PUBLIC_SENTRY_DSN: ""`, add:

```yaml
          # Cloudflare's always-pass test key. Required: the sign-up pages
          # prerender the Turnstile component, which throws without a key.
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA
```

In `.github/workflows/build-and-push.yml`, in `build-args:`, after the `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` line, add:

```yaml
            NEXT_PUBLIC_TURNSTILE_SITE_KEY=${{ vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY }}
```

It is a repository **variable**, not a secret — the value is public. **The variable must exist before this branch merges**, or the image build fails at prerender. `docs/deployment/AUTH_SETUP.md` (Task 14) lists it as a pre-merge step.

- [ ] **Step 9: Run the full unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add components/auth/turnstile.tsx components/auth/turnstile.test.tsx vitest.config.mts .env.example Dockerfile .github/workflows/ci.yml .github/workflows/build-and-push.yml
git commit -m "feat: add the Turnstile widget and its site-key build arg

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The shared auth form, heading, field description and card layout

**Files:**
- Create: `components/auth/auth-form.tsx`
- Test: `components/auth/auth-form.test.tsx`
- Create: `components/auth/auth-heading.tsx`
- Modify: `components/ui/field.tsx`
- Modify: `components/ui/field.test.tsx`
- Create: `app/[locale]/(auth)/layout.tsx`

**Interfaces:**
- Consumes: `AuthAction`, `AuthFormState`, `initialAuthState` (Task 3); `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_BYTES` (Task 2); `Turnstile` (Task 4)
- Produces:
  - `AuthForm({ action, submitLabel, sentMessage?, captcha?, children }: { action: AuthAction; submitLabel: string; sentMessage?: string; captcha?: boolean; children: ReactNode })`
  - `AuthHeading({ title, lead }: { title: string; lead?: string })`
  - `FieldDescription({ children }: { children: ReactNode })` — must be rendered inside `Field`

- [ ] **Step 1: Write the failing `FieldDescription` test**

Append to `components/ui/field.test.tsx` (and add `FieldDescription` to its import from `./field`):

```tsx
  test("links a description to the input", () => {
    renderWithIntl(
      <Field label="Password">
        <FieldInput type="password" />
        <FieldDescription>At least ten characters.</FieldDescription>
      </Field>,
    );
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      "At least ten characters.",
    );
  });
```

This file already uses literal design-gallery strings, not messages, because it tests a primitive, not copy.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/ui/field.test.tsx`
Expected: FAIL — `FieldDescription` is not exported.

- [ ] **Step 3: Implement `FieldDescription`**

Append to `components/ui/field.tsx`:

```tsx
/**
 * Help text under a control. Base UI's Field wires it to the control's
 * `aria-describedby`, so screen readers announce it with the input.
 */
export function FieldDescription({ children }: { children: ReactNode }) {
  return (
    <BaseField.Description className="text-sm text-muted">{children}</BaseField.Description>
  );
}
```

Run: `npx vitest run components/ui/field.test.tsx`
Expected: PASS.

- [ ] **Step 4: Write the failing `AuthForm` test**

`components/auth/auth-form.test.tsx`:

```tsx
import { waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Field, FieldInput } from "@/components/ui/field";
import type { AuthAction, AuthFormState } from "@/lib/auth/action-state";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { AuthForm } from "./auth-form";

const action = vi.fn<AuthAction>();

beforeEach(() => {
  action.mockReset();
});

afterEach(() => {
  delete window.turnstile;
});

function renderForm(props: { captcha?: boolean; sentMessage?: string } = {}) {
  return renderWithIntl(
    <AuthForm
      action={action}
      submitLabel={messages.auth.signIn.submit}
      captcha={props.captcha ?? false}
      sentMessage={props.sentMessage}
    >
      <Field label={messages.auth.fields.email}>
        <FieldInput type="email" name="email" required />
      </Field>
    </AuthForm>,
  );
}

async function submit(user: ReturnType<typeof renderForm>["user"], email = "user@example.test") {
  await user.type(screen.getByLabelText(messages.auth.fields.email), email);
  await user.click(screen.getByRole("button", { name: messages.auth.signIn.submit }));
}

describe("AuthForm", () => {
  test("calls the action with the locale and the form's data", async () => {
    action.mockResolvedValue({ status: "idle" });
    const { user } = renderForm();
    await submit(user);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const [locale, , data] = action.mock.calls[0];
    expect(locale).toBe("en");
    expect(data.get("email")).toBe("user@example.test");
  });

  test("shows the error the action returns", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "invalidCredentials" });
    const { user } = renderForm();
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.auth.errors.invalidCredentials,
    );
  });

  test("interpolates the password limits into an error", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "passwordTooShort" });
    const { user } = renderForm();
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("10");
  });

  test("links the unconfirmed-email error to the resend page", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "emailNotConfirmed" });
    const { user } = renderForm();
    await submit(user);

    const alert = await screen.findByRole("alert");
    expect(alert.querySelector("a")).toHaveAttribute("href", "/sign-up/check-email");
  });

  test("keeps what the user typed after an error", async () => {
    action.mockResolvedValue({ status: "error", errorKey: "invalidCredentials" });
    const { user } = renderForm();
    await submit(user);

    await screen.findByRole("alert");
    expect(screen.getByLabelText(messages.auth.fields.email)).toHaveValue("user@example.test");
  });

  test("shows the sent message", async () => {
    action.mockResolvedValue({ status: "sent" });
    const { user } = renderForm({ sentMessage: messages.auth.forgotPassword.sent });
    await submit(user);

    expect(await screen.findByRole("status")).toHaveTextContent(
      messages.auth.forgotPassword.sent,
    );
  });

  test("disables the submit button while the action is pending", async () => {
    let finish: (state: AuthFormState) => void = () => {};
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderForm();
    await submit(user);

    const button = screen.getByRole("button", { name: messages.auth.signIn.submit });
    await waitFor(() => expect(button).toBeDisabled());
    await act(async () => finish({ status: "idle" }));
    expect(button).toBeEnabled();
  });

  test("submits the Turnstile token with the form", async () => {
    const render = vi.fn((_el: HTMLElement, _options: Record<string, unknown>) => "w1");
    window.turnstile = { render, reset: vi.fn(), remove: vi.fn() };
    action.mockResolvedValue({ status: "idle" });

    const { user } = renderForm({ captcha: true });
    await waitFor(() => expect(render).toHaveBeenCalled());
    const options = render.mock.calls[0][1] as { callback: (token: string) => void };
    act(() => options.callback("token-abc"));
    await submit(user);

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][2].get("captchaToken")).toBe("token-abc");
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run components/auth/auth-form.test.tsx`
Expected: FAIL — `Failed to resolve import "./auth-form"`.

- [ ] **Step 6: Implement `components/auth/auth-form.tsx`**

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useMemo,
} from "react";

import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type AuthAction, initialAuthState } from "@/lib/auth/action-state";
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

/**
 * The shared shell of every auth form: pending state, the inline error, the
 * "we've emailed you" message, Turnstile, and the submit button.
 *
 * Submits through `onSubmit` + `startTransition` rather than `<form action>`.
 * React 19 resets uncontrolled fields after a form action completes, which
 * would wipe the email address every time a password is wrong. Native
 * validation (`required`, `type="email"`, `minLength`) still runs, because
 * `submit` only fires once it passes.
 *
 * Needs JavaScript — Turnstile does too. Nothing here pretends otherwise.
 */
export function AuthForm({
  action,
  submitLabel,
  sentMessage,
  captcha = true,
  children,
}: {
  action: AuthAction;
  submitLabel: string;
  sentMessage?: string;
  captcha?: boolean;
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("auth.errors");
  const boundAction = useMemo(() => action.bind(null, locale), [action, locale]);
  const [state, formAction, pending] = useActionState(boundAction, initialAuthState);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      {children}

      {captcha && <Turnstile resetKey={state} />}

      {state.status === "error" && (
        <p
          role="alert"
          className="mb-[18px] rounded-control border border-hairline bg-surface-sunken px-3.5 py-3 text-sm text-ink"
        >
          {t.rich(state.errorKey, {
            min: PASSWORD_MIN_LENGTH,
            max: PASSWORD_MAX_BYTES,
            resend: (chunks) => (
              <Link
                href="/sign-up/check-email"
                className="focus-ring font-semibold text-gold-ink underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}

      {state.status === "sent" && sentMessage && (
        <p
          role="status"
          className="mb-[18px] rounded-control border border-gold-line bg-gold-soft px-3.5 py-3 text-sm text-ink"
        >
          {sentMessage}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npx vitest run components/auth/auth-form.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 8: Write `components/auth/auth-heading.tsx`**

```tsx
/** The h1 and lead at the top of every auth page. */
export function AuthHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="mb-8">
      <h1 className="font-serif text-h2 text-ink">{title}</h1>
      {lead && <p className="mt-3 text-muted">{lead}</p>}
    </div>
  );
}
```

- [ ] **Step 9: Write `app/[locale]/(auth)/layout.tsx`**

```tsx
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";

/**
 * The unauthenticated auth pages share one centred card. A route group, so
 * it changes no URL: `/sign-in`, not `/(auth)/sign-in`.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Section>
      <Container>
        <Card className="mx-auto w-full max-w-[440px] p-6 sm:p-10">{children}</Card>
      </Container>
    </Section>
  );
}
```

- [ ] **Step 10: Run the suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors. `components/gold-ink.test.ts` passes — only `text-gold-ink` is used.

- [ ] **Step 11: Commit**

```bash
git add components/auth/auth-form.tsx components/auth/auth-form.test.tsx components/auth/auth-heading.tsx components/ui/field.tsx components/ui/field.test.tsx "app/[locale]/(auth)/layout.tsx"
git commit -m "feat: add the shared auth form, heading and card layout

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `getUser` and `requireUser`

**Files:**
- Create: `lib/auth/require-user.ts`
- Test: `lib/auth/require-user.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `redirect` from `@/i18n/navigation`
- Produces:
  - `type AuthUser = { id: string; email: string }`
  - `getUser(): Promise<AuthUser | null>`
  - `requireUser({ locale, next }: { locale: Locale; next: string }): Promise<AuthUser>` — redirects to `/sign-in?next=<next>` when signed out. `next` is a locale-less path.

- [ ] **Step 1: Write the failing test**

`lib/auth/require-user.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));

const { getUser, requireUser } = await import("./require-user");

const CLAIMS = { data: { claims: { sub: "user-1", email: "user@example.test" } }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUser", () => {
  test("returns the user from verified claims", async () => {
    mocks.getClaims.mockResolvedValue(CLAIMS);
    expect(await getUser()).toEqual({ id: "user-1", email: "user@example.test" });
  });

  test("returns null without a session", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    expect(await getUser()).toBeNull();
  });

  test("returns null when the claims do not verify", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthError("invalid JWT") });
    expect(await getUser()).toBeNull();
  });
});

describe("requireUser", () => {
  test("returns the user when signed in", async () => {
    mocks.getClaims.mockResolvedValue(CLAIMS);
    await expect(requireUser({ locale: "en", next: "/account" })).resolves.toEqual({
      id: "user-1",
      email: "user@example.test",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("redirects to sign-in, carrying next, when signed out", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(requireUser({ locale: "en", next: "/account" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: { pathname: "/sign-in", query: { next: "/account" } },
      locale: "en",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/auth/require-user.test.ts`
Expected: FAIL — `Failed to resolve import "./require-user"`.

- [ ] **Step 3: Implement `lib/auth/require-user.ts`**

```ts
import type { Locale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthUser = { id: string; email: string };

/**
 * The signed-in user, or null. Reads `getClaims()`, which verifies the JWT —
 * never `getSession()`, which trusts whatever the cookie says.
 *
 * This decides which PAGE to show. RLS remains the boundary for DATA.
 */
export async function getUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { id: data.claims.sub, email: data.claims.email ?? "" };
}

/**
 * The signed-in user, or a redirect to sign-in that brings them back to
 * `next` (a locale-less path such as "/account") afterwards.
 */
export async function requireUser({
  locale,
  next,
}: {
  locale: Locale;
  next: string;
}): Promise<AuthUser> {
  const user = await getUser();
  if (!user) {
    return redirect({ href: { pathname: "/sign-in", query: { next } }, locale });
  }
  return user;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/auth/require-user.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/require-user.ts lib/auth/require-user.test.ts
git commit -m "feat: add getUser and requireUser

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Sign-up and check-email

**Files:**
- Create: `app/[locale]/(auth)/sign-up/actions.ts`
- Test: `app/[locale]/(auth)/sign-up/actions.test.ts`
- Create: `app/[locale]/(auth)/sign-up/page.tsx`
- Test: `app/[locale]/(auth)/sign-up/page.test.tsx`
- Create: `app/[locale]/(auth)/sign-up/check-email/actions.ts`
- Test: `app/[locale]/(auth)/sign-up/check-email/actions.test.ts`
- Create: `app/[locale]/(auth)/sign-up/check-email/page.tsx`

**Interfaces:**
- Consumes: `AuthForm`, `AuthHeading`, `Field`, `FieldInput`, `FieldDescription` (Task 5); `readEmail`, `readField`, `resolveLocale`, `AuthFormState` (Task 3); `authErrorKey`, `revealsAccount` (Task 3); `passwordProblem`, `PASSWORD_MIN_LENGTH` (Task 2)
- Produces: `signUp: AuthAction`, `resendConfirmation: AuthAction`; routes `/sign-up`, `/sign-up/check-email`

- [ ] **Step 1: Write the failing sign-up action test**

`app/[locale]/(auth)/sign-up/actions.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: mocks.signUp } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { signUp } = await import("./actions");

const EMAIL = "new@example.test";
const VALID = { email: EMAIL, password: "long-enough-1", captchaToken: "token-abc" };
const CHECK_EMAIL = { href: "/sign-up/check-email", locale: "en" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signUp", () => {
  test("signs up with the captcha token and redirects to check-email", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });

    await expect(signUp("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: VALID.password,
      options: { captchaToken: "token-abc" },
    });
    expect(mocks.redirect).toHaveBeenCalledWith(CHECK_EMAIL);
  });

  test("trims the email address", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    await expect(
      signUp("en", initialAuthState, formData({ ...VALID, email: `  ${EMAIL} ` })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.signUp.mock.calls[0][0].email).toBe(EMAIL);
  });

  test.each([
    ["an existing account", null],
    ["a per-address rate limit", new AuthError("rate limited", 429, "over_email_send_rate_limit")],
    ["user_already_exists", new AuthError("exists", 422, "user_already_exists")],
  ])("answers %s exactly like a new address", async (_label, error) => {
    // With confirmations on, Supabase returns an obfuscated user for an
    // existing address rather than an error; the per-address rate limit only
    // fires for an address it knows. Neither may leak.
    mocks.signUp.mockResolvedValue({ data: {}, error });
    await expect(signUp("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(CHECK_EMAIL);
  });

  test("rejects a malformed email without calling Supabase", async () => {
    const result = await signUp("en", initialAuthState, formData({ ...VALID, email: "nope" }));
    expect(result).toEqual({ status: "error", errorKey: "invalidEmail" });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  test("rejects a short password without calling Supabase", async () => {
    const result = await signUp("en", initialAuthState, formData({ ...VALID, password: "short" }));
    expect(result).toEqual({ status: "error", errorKey: "passwordTooShort" });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  test("rejects a password over 72 bytes without calling Supabase", async () => {
    const result = await signUp(
      "en",
      initialAuthState,
      formData({ ...VALID, password: "é".repeat(37) }),
    );
    expect(result).toEqual({ status: "error", errorKey: "passwordTooLong" });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  test.each([
    ["weak_password", "weakPassword"],
    ["captcha_failed", "captchaFailed"],
    ["over_request_rate_limit", "rateLimited"],
  ])("shows %s as %s", async (code, errorKey) => {
    mocks.signUp.mockResolvedValue({ data: {}, error: new AuthError("x", 400, code) });
    expect(await signUp("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey,
    });
  });

  test("reports an unexpected error to Sentry without the address", async () => {
    mocks.signUp.mockResolvedValue({
      data: {},
      error: new AuthError(`Database error saving ${EMAIL}`, 500, "unexpected_failure"),
    });
    expect(await signUp("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey: "generic",
    });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.captureException.mock.calls, (_k, v) => (v instanceof Error ? v.message : v))).not.toContain(EMAIL);
  });

  test("falls back to the default locale for an unknown one", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    await expect(signUp("xx", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(CHECK_EMAIL);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/[locale]/(auth)/sign-up/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Implement `app/[locale]/(auth)/sign-up/actions.ts`**

```ts
"use server";

import { redirect } from "@/i18n/navigation";
import {
  type AuthFormState,
  readEmail,
  readField,
  resolveLocale,
} from "@/lib/auth/action-state";
import { authErrorKey, revealsAccount } from "@/lib/auth/errors";
import { passwordProblem } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates an account and sends the confirmation email. Registered and
 * unregistered addresses get the same answer — the check-email page — so the
 * form cannot be used to test whether someone has an account.
 *
 * No `emailRedirectTo`: the template builds its link from Site URL, and
 * `/auth/confirm` decides where to go from the link's `type`.
 */
export async function signUp(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  if (!email) return { status: "error", errorKey: "invalidEmail" };

  const password = readField(formData, "password");
  const problem = passwordProblem(password);
  if (problem) return { status: "error", errorKey: problem };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { captchaToken: readField(formData, "captchaToken") },
  });

  if (error && !revealsAccount(error)) {
    return { status: "error", errorKey: authErrorKey(error, "signUp") };
  }

  return redirect({ href: "/sign-up/check-email", locale: resolveLocale(locale) });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "app/[locale]/(auth)/sign-up/actions.test.ts"`
Expected: PASS.

- [ ] **Step 5: Write the sign-up page**

`app/[locale]/(auth)/sign-up/page.tsx`:

```tsx
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldDescription, FieldInput } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

import { signUp } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("title") };
}

export default function SignUpPage() {
  const t = useTranslations("auth");

  return (
    <>
      <AuthHeading title={t("signUp.title")} lead={t("signUp.lead")} />
      <AuthForm action={signUp} submitLabel={t("signUp.submit")}>
        <Field label={t("fields.email")}>
          <FieldInput type="email" name="email" autoComplete="email" required />
        </Field>
        <Field label={t("fields.password")}>
          <FieldInput
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <FieldDescription>
            {t("fields.passwordHint", { min: PASSWORD_MIN_LENGTH })}
          </FieldDescription>
        </Field>
      </AuthForm>
      <p className="mt-6 text-sm text-muted">
        {t.rich("signUp.haveAccount", {
          link: (chunks) => (
            <Link href="/sign-in" className="focus-ring font-semibold text-gold-ink hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}
```

- [ ] **Step 6: Write the page test**

`app/[locale]/(auth)/sign-up/page.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import SignUpPage from "./page";

describe("SignUpPage", () => {
  test("asks for an email and a policy-length password", () => {
    renderWithIntl(<SignUpPage />);
    expect(screen.getByLabelText(messages.auth.fields.email)).toHaveAttribute("type", "email");
    const password = screen.getByLabelText(messages.auth.fields.password);
    expect(password).toHaveAttribute("minLength", String(PASSWORD_MIN_LENGTH));
    expect(password).toHaveAttribute("autoComplete", "new-password");
  });

  test("links to sign-in", () => {
    // The link text lives inside the rich message's <link> tag; take it from
    // there rather than duplicating the copy.
    const linkText = /<link>(.*)<\/link>/.exec(messages.auth.signUp.haveAccount)?.[1] ?? "";
    renderWithIntl(<SignUpPage />);
    expect(screen.getByRole("link", { name: linkText })).toHaveAttribute("href", "/sign-in");
  });
});
```

Run: `npx vitest run "app/[locale]/(auth)/sign-up/page.test.tsx"`
Expected: PASS.

- [ ] **Step 7: Write the failing resend test**

`app/[locale]/(auth)/sign-up/check-email/actions.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({ resend: vi.fn(), captureException: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { resend: mocks.resend } }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { resendConfirmation } = await import("./actions");

const VALID = { email: "new@example.test", captchaToken: "token-abc" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resendConfirmation", () => {
  test("resends the signup email with the captcha token", async () => {
    mocks.resend.mockResolvedValue({ data: {}, error: null });
    expect(await resendConfirmation("en", initialAuthState, formData(VALID))).toEqual({
      status: "sent",
    });
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.test",
      options: { captchaToken: "token-abc" },
    });
  });

  test("reports success inside the per-address resend window", async () => {
    mocks.resend.mockResolvedValue({
      data: {},
      error: new AuthError("wait", 429, "over_email_send_rate_limit"),
    });
    expect(await resendConfirmation("en", initialAuthState, formData(VALID))).toEqual({
      status: "sent",
    });
  });

  test("returns a new state object every time", async () => {
    // The Turnstile widget resets on state identity.
    mocks.resend.mockResolvedValue({ data: {}, error: null });
    const first = await resendConfirmation("en", initialAuthState, formData(VALID));
    const second = await resendConfirmation("en", first, formData(VALID));
    expect(second).not.toBe(first);
  });

  test("shows a failed captcha", async () => {
    mocks.resend.mockResolvedValue({ data: {}, error: new AuthError("x", 400, "captcha_failed") });
    expect(await resendConfirmation("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey: "captchaFailed",
    });
  });

  test("rejects a malformed email without calling Supabase", async () => {
    expect(
      await resendConfirmation("en", initialAuthState, formData({ ...VALID, email: "nope" })),
    ).toEqual({ status: "error", errorKey: "invalidEmail" });
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run "app/[locale]/(auth)/sign-up/check-email/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 9: Implement `app/[locale]/(auth)/sign-up/check-email/actions.ts`**

```ts
"use server";

import { type AuthFormState, readEmail, readField } from "@/lib/auth/action-state";
import { authErrorKey, revealsAccount } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends the confirmation email again. Always reports "sent" unless the
 * failure says nothing about the address (a failed captcha, an IP rate
 * limit). The address is typed again rather than carried in the URL, which
 * would write it into access logs, history and Sentry breadcrumbs.
 */
export async function resendConfirmation(
  _locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  if (!email) return { status: "error", errorKey: "invalidEmail" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { captchaToken: readField(formData, "captchaToken") },
  });

  if (error && !revealsAccount(error)) {
    return { status: "error", errorKey: authErrorKey(error, "resend") };
  }

  return { status: "sent" };
}
```

- [ ] **Step 10: Write the check-email page**

`app/[locale]/(auth)/sign-up/check-email/page.tsx`:

```tsx
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldInput } from "@/components/ui/field";

import { resendConfirmation } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.checkEmail");
  return { title: t("title") };
}

export default function CheckEmailPage() {
  const t = useTranslations("auth");

  return (
    <>
      <AuthHeading title={t("checkEmail.title")} lead={t("checkEmail.lead")} />
      <p className="mb-6 text-sm text-muted">{t("checkEmail.resendLead")}</p>
      <AuthForm
        action={resendConfirmation}
        submitLabel={t("checkEmail.submit")}
        sentMessage={t("checkEmail.sent")}
      >
        <Field label={t("fields.email")}>
          <FieldInput type="email" name="email" autoComplete="email" required />
        </Field>
      </AuthForm>
    </>
  );
}
```

- [ ] **Step 11: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add "app/[locale]/(auth)/sign-up"
git commit -m "feat: add sign-up and the check-email resend page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Sign-in

**Files:**
- Create: `app/[locale]/(auth)/sign-in/actions.ts`
- Test: `app/[locale]/(auth)/sign-in/actions.test.ts`
- Create: `app/[locale]/(auth)/sign-in/page.tsx`

**Interfaces:**
- Consumes: `safeNext` (Task 2); `readEmail`, `readField`, `resolveLocale` (Task 3); `authErrorKey` (Task 3); `AuthForm`, `AuthHeading` (Task 5)
- Produces: `signIn: AuthAction`; route `/sign-in`, which reads `?next=` and `?error=link_expired`

- [ ] **Step 1: Write the failing test**

`app/[locale]/(auth)/sign-in/actions.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { signIn } = await import("./actions");

const VALID = { email: "user@example.test", password: "password123!", captchaToken: "token-abc" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signIn", () => {
  test("signs in with the captcha token and lands on /account by default", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });

    await expect(signIn("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "password123!",
      options: { captchaToken: "token-abc" },
    });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test("returns to a same-origin next", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await expect(
      signIn("en", initialAuthState, formData({ ...VALID, next: "/submit?x=1" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/submit?x=1", locale: "en" });
  });

  test("ignores an off-site next", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await expect(
      signIn("en", initialAuthState, formData({ ...VALID, next: "//evil.test" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test.each([
    ["invalid_credentials", "invalidCredentials"],
    ["email_not_confirmed", "emailNotConfirmed"],
    ["captcha_failed", "captchaFailed"],
    ["over_request_rate_limit", "rateLimited"],
  ])("shows %s as %s", async (code, errorKey) => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: new AuthError("x", 400, code) });
    expect(await signIn("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("treats a missing password as bad credentials without calling Supabase", async () => {
    expect(await signIn("en", initialAuthState, formData({ ...VALID, password: "" }))).toEqual({
      status: "error",
      errorKey: "invalidCredentials",
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  test("does not apply the sign-up password policy", async () => {
    // Existing passwords predate any policy change and must keep working.
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await expect(
      signIn("en", initialAuthState, formData({ ...VALID, password: "short" })),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/[locale]/(auth)/sign-in/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Implement `app/[locale]/(auth)/sign-in/actions.ts`**

```ts
"use server";

import { redirect } from "@/i18n/navigation";
import {
  type AuthFormState,
  readEmail,
  readField,
  resolveLocale,
} from "@/lib/auth/action-state";
import { authErrorKey } from "@/lib/auth/errors";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs in and returns to `next`, or `/account`. Every credential failure is
 * the same message — never which of email or password was wrong.
 *
 * The password policy is NOT applied here: it governs new passwords, and an
 * existing one must keep working if the policy ever tightens.
 */
export async function signIn(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  const password = readField(formData, "password");
  if (!email || !password) return { status: "error", errorKey: "invalidCredentials" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: readField(formData, "captchaToken") },
  });

  if (error) return { status: "error", errorKey: authErrorKey(error, "signIn") };

  return redirect({ href: safeNext(formData.get("next")), locale: resolveLocale(locale) });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "app/[locale]/(auth)/sign-in/actions.test.ts"`
Expected: PASS.

- [ ] **Step 5: Write the sign-in page**

`app/[locale]/(auth)/sign-in/page.tsx`. Async because it reads `searchParams`, which makes this one page dynamic — correct, since what it shows depends on the query.

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldInput } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { safeNext } from "@/lib/auth/safe-next";

import { signIn } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("title") };
}

export default async function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
  const { error, next } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <>
      <AuthHeading title={t("signIn.title")} lead={t("signIn.lead")} />

      {error === "link_expired" && (
        <p
          role="status"
          className="mb-6 rounded-control border border-gold-line bg-gold-soft px-3.5 py-3 text-sm text-ink"
        >
          {t("signIn.linkExpired")}
        </p>
      )}

      <AuthForm action={signIn} submitLabel={t("signIn.submit")}>
        {/* Sanitised here for rendering and again in the action, which is
            the check that counts: this field is editable in the browser. */}
        <input type="hidden" name="next" value={safeNext(next)} />
        <Field label={t("fields.email")}>
          <FieldInput type="email" name="email" autoComplete="email" required />
        </Field>
        <Field label={t("fields.password")}>
          <FieldInput type="password" name="password" autoComplete="current-password" required />
        </Field>
      </AuthForm>

      <div className="mt-6 flex flex-col gap-2 text-sm text-muted">
        <Link href="/forgot-password" className="focus-ring self-start text-gold-ink hover:underline">
          {t("signIn.forgotPassword")}
        </Link>
        <p>
          {t.rich("signIn.noAccount", {
            link: (chunks) => (
              <Link href="/sign-up" className="focus-ring font-semibold text-gold-ink hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Typecheck the page**

`PageProps` is generated during the build.

Run: `npm run build && npx tsc --noEmit`
Expected: build succeeds; `tsc` reports no errors. In the build output, `/sign-in` is marked dynamic (`ƒ`) and `/sign-up`, `/sign-up/check-email` static (`○` or `●`).

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/(auth)/sign-in"
git commit -m "feat: add sign-in

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The confirmation link

**Files:**
- Create: `app/[locale]/(auth)/auth/confirm/actions.ts`
- Test: `app/[locale]/(auth)/auth/confirm/actions.test.ts`
- Create: `app/[locale]/(auth)/auth/confirm/page.tsx`

**Interfaces:**
- Consumes: `readField`, `resolveLocale` (Task 3); `reportAuthError` (Task 3); `AuthForm`, `AuthHeading` (Task 5)
- Produces: `confirmToken: AuthAction`; route `/auth/confirm?token_hash=…&type=email|recovery`

- [ ] **Step 1: Write the failing test**

`app/[locale]/(auth)/auth/confirm/actions.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { confirmToken } = await import("./actions");

const LINK_EXPIRED = {
  href: { pathname: "/sign-in", query: { error: "link_expired" } },
  locale: "en",
};

async function confirm(fields: Record<string, string>) {
  await expect(confirmToken("en", initialAuthState, formData(fields))).rejects.toThrow(
    "NEXT_REDIRECT",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmToken", () => {
  test("an email confirmation lands on /account", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await confirm({ token_hash: "hash-1", type: "email" });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "hash-1" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test("a recovery link lands on /reset-password", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await confirm({ token_hash: "hash-1", type: "recovery" });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "hash-1" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/reset-password", locale: "en" });
  });

  test("an expired link goes to sign-in quietly", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: {},
      error: new AuthError("Email link is invalid or has expired", 403, "otp_expired"),
    });
    await confirm({ token_hash: "hash-1", type: "email" });
    expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("an unexpected failure also goes to sign-in, and is reported", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: new AuthError("boom", 500, "unexpected_failure") });
    await confirm({ token_hash: "hash-1", type: "email" });
    expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test.each(["signup", "magiclink", "invite", "email_change", "toString", "constructor", ""])(
    "refuses type %j without calling Supabase",
    async (type) => {
      await confirm({ token_hash: "hash-1", type });
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
    },
  );

  test("refuses a missing token without calling Supabase", async () => {
    await confirm({ type: "email" });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/[locale]/(auth)/auth/confirm/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Implement `app/[locale]/(auth)/auth/confirm/actions.ts`**

```ts
"use server";

import { redirect } from "@/i18n/navigation";
import { type AuthFormState, readField, resolveLocale } from "@/lib/auth/action-state";
import { reportAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * The only link types our templates emit, and where each lands. Anything else
 * is refused before Supabase is called — a link we did not write is not one
 * we should act on.
 */
const DESTINATIONS = {
  email: "/account",
  recovery: "/reset-password",
} as const;

type LinkType = keyof typeof DESTINATIONS;

function isLinkType(value: string): value is LinkType {
  // Object.hasOwn, not `in`: `toString` and `constructor` are inherited.
  return Object.hasOwn(DESTINATIONS, value);
}

/**
 * Verifies an emailed token_hash and signs the user in. Runs on the button's
 * POST, never on the link's GET, so a mail scanner that prefetches the link
 * consumes nothing.
 */
export async function confirmToken(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);
  const linkExpired = {
    href: { pathname: "/sign-in", query: { error: "link_expired" } },
    locale: target,
  };

  const type = readField(formData, "type");
  const tokenHash = readField(formData, "token_hash");
  if (!isLinkType(type) || !tokenHash) return redirect(linkExpired);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // An expired or reused link is routine. Anything else is ours to look at.
    if (error.code !== "otp_expired") reportAuthError(error, "confirm");
    return redirect(linkExpired);
  }

  return redirect({ href: DESTINATIONS[type], locale: target });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "app/[locale]/(auth)/auth/confirm/actions.test.ts"`
Expected: PASS.

- [ ] **Step 5: Write the confirm page**

`app/[locale]/(auth)/auth/confirm/page.tsx`. The `GET` renders a button and consumes nothing:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";

import { confirmToken } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.confirm");
  return { title: t("emailTitle") };
}

export default async function ConfirmPage({ searchParams }: PageProps<"/[locale]/auth/confirm">) {
  const { token_hash: tokenHash, type } = await searchParams;
  const t = await getTranslations("auth.confirm");

  return (
    <>
      <AuthHeading
        title={type === "recovery" ? t("recoveryTitle") : t("emailTitle")}
        lead={t("lead")}
      />
      {/* No captcha: the token is the proof, and it is single-use. */}
      <AuthForm action={confirmToken} submitLabel={t("submit")} captcha={false}>
        <input type="hidden" name="token_hash" value={typeof tokenHash === "string" ? tokenHash : ""} />
        <input type="hidden" name="type" value={typeof type === "string" ? type : ""} />
      </AuthForm>
    </>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(auth)/auth"
git commit -m "feat: confirm emailed links behind a single click

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Forgot password and reset password

**Files:**
- Create: `app/[locale]/(auth)/forgot-password/actions.ts`
- Test: `app/[locale]/(auth)/forgot-password/actions.test.ts`
- Create: `app/[locale]/(auth)/forgot-password/page.tsx`
- Create: `app/[locale]/(auth)/reset-password/actions.ts`
- Test: `app/[locale]/(auth)/reset-password/actions.test.ts`
- Create: `app/[locale]/(auth)/reset-password/page.tsx`

**Interfaces:**
- Consumes: `readEmail`, `readField`, `resolveLocale` (Task 3); `authErrorKey`, `revealsAccount`, `reportAuthError` (Task 3); `passwordProblem`, `PASSWORD_MIN_LENGTH` (Task 2); `getUser` (Task 6); `AuthForm`, `AuthHeading`, `FieldDescription` (Task 5)
- Produces: `requestPasswordReset: AuthAction`, `resetPassword: AuthAction`; routes `/forgot-password`, `/reset-password`

- [ ] **Step 1: Write the failing forgot-password test**

`app/[locale]/(auth)/forgot-password/actions.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(), captureException: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { requestPasswordReset } = await import("./actions");

const VALID = { email: "user@example.test", captchaToken: "token-abc" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestPasswordReset", () => {
  test("requests the email with the captcha token and reports sent", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    expect(await requestPasswordReset("en", initialAuthState, formData(VALID))).toEqual({
      status: "sent",
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("user@example.test", {
      captchaToken: "token-abc",
    });
  });

  test.each([
    ["an unknown address", null],
    ["a per-address rate limit", new AuthError("wait", 429, "over_email_send_rate_limit")],
  ])("answers %s exactly like a known one", async (_label, error) => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error });
    expect(await requestPasswordReset("en", initialAuthState, formData(VALID))).toEqual({
      status: "sent",
    });
  });

  test.each([
    ["captcha_failed", "captchaFailed"],
    ["over_request_rate_limit", "rateLimited"],
  ])("shows %s, which says nothing about the account", async (code, errorKey) => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: new AuthError("x", 400, code) });
    expect(await requestPasswordReset("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey,
    });
  });

  test("rejects a malformed email without calling Supabase", async () => {
    expect(
      await requestPasswordReset("en", initialAuthState, formData({ ...VALID, email: "nope" })),
    ).toEqual({ status: "error", errorKey: "invalidEmail" });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/[locale]/(auth)/forgot-password/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Implement `app/[locale]/(auth)/forgot-password/actions.ts`**

```ts
"use server";

import { type AuthFormState, readEmail, readField } from "@/lib/auth/action-state";
import { authErrorKey, revealsAccount } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Emails a recovery link. The answer is "if an account exists, we've sent a
 * link" whether or not one does. No `redirectTo`: the recovery template links
 * to `/auth/confirm?type=recovery`, which lands on `/reset-password`.
 */
export async function requestPasswordReset(
  _locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  if (!email) return { status: "error", errorKey: "invalidEmail" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    captchaToken: readField(formData, "captchaToken"),
  });

  if (error && !revealsAccount(error)) {
    return { status: "error", errorKey: authErrorKey(error, "forgotPassword") };
  }

  return { status: "sent" };
}
```

Run: `npx vitest run "app/[locale]/(auth)/forgot-password/actions.test.ts"`
Expected: PASS.

- [ ] **Step 4: Write the forgot-password page**

`app/[locale]/(auth)/forgot-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldInput } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";

import { requestPasswordReset } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgotPassword");
  return { title: t("title") };
}

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");

  return (
    <>
      <AuthHeading title={t("forgotPassword.title")} lead={t("forgotPassword.lead")} />
      <AuthForm
        action={requestPasswordReset}
        submitLabel={t("forgotPassword.submit")}
        sentMessage={t("forgotPassword.sent")}
      >
        <Field label={t("fields.email")}>
          <FieldInput type="email" name="email" autoComplete="email" required />
        </Field>
      </AuthForm>
      <p className="mt-6 text-sm text-muted">
        {t.rich("forgotPassword.backToSignIn", {
          link: (chunks) => (
            <Link href="/sign-in" className="focus-ring text-gold-ink hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}
```

- [ ] **Step 5: Write the failing reset-password test**

`app/[locale]/(auth)/reset-password/actions.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: mocks.getClaims, updateUser: mocks.updateUser, signOut: mocks.signOut },
  }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { resetPassword } = await import("./actions");

const VALID = { password: "a-new-password-1" };
const SIGNED_IN = { data: { claims: { sub: "user-1", email: "user@example.test" } }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue(SIGNED_IN);
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("resetPassword", () => {
  test("sets the password, evicts other sessions, and lands on /account", async () => {
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: VALID.password });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test("still lands on /account when evicting other sessions fails", async () => {
    // The password HAS changed. Telling the user it failed would be false.
    mocks.signOut.mockResolvedValue({ error: new AuthError("boom", 500, "unexpected_failure") });
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("sends a visitor without a session to forgot-password", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/forgot-password", locale: "en" });
  });

  test("applies the password policy before calling Supabase", async () => {
    expect(await resetPassword("en", initialAuthState, formData({ password: "short" }))).toEqual({
      status: "error",
      errorKey: "passwordTooShort",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  test.each([
    ["same_password", "samePassword"],
    ["weak_password", "weakPassword"],
    ["reauthentication_needed", "reauthenticationNeeded"],
  ])("shows %s as %s", async (code, errorKey) => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: new AuthError("x", 422, code) });
    expect(await resetPassword("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey,
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "app/[locale]/(auth)/reset-password/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 7: Implement `app/[locale]/(auth)/reset-password/actions.ts`**

```ts
"use server";

import { redirect } from "@/i18n/navigation";
import { type AuthFormState, readField, resolveLocale } from "@/lib/auth/action-state";
import { authErrorKey, reportAuthError } from "@/lib/auth/errors";
import { passwordProblem } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Sets a new password for the signed-in user — normally the session the
 * recovery link just created — then signs out every OTHER session, so a
 * reset evicts whoever else holds one.
 *
 * Checks the session itself: a page being protected does not protect the
 * action behind it.
 */
export async function resetPassword(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);

  const password = readField(formData, "password");
  const problem = passwordProblem(password);
  if (problem) return { status: "error", errorKey: problem };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return redirect({ href: "/forgot-password", locale: target });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", errorKey: authErrorKey(error, "resetPassword") };

  // The password has changed whatever happens next, so a failure here is
  // reported, not shown.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) reportAuthError(signOutError, "resetPassword");

  return redirect({ href: "/account", locale: target });
}
```

Run: `npx vitest run "app/[locale]/(auth)/reset-password/actions.test.ts"`
Expected: PASS.

- [ ] **Step 8: Write the reset-password page**

`app/[locale]/(auth)/reset-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Field, FieldDescription, FieldInput } from "@/components/ui/field";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { getUser } from "@/lib/auth/require-user";

import { resetPassword } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.resetPassword");
  return { title: t("title") };
}

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;

  // Without a session there is nothing to reset — ask for a link instead.
  if (!(await getUser())) {
    return redirect({ href: "/forgot-password", locale: resolveLocale(locale) });
  }

  const t = await getTranslations("auth");

  return (
    <>
      <AuthHeading title={t("resetPassword.title")} lead={t("resetPassword.lead")} />
      {/* No captcha: only a signed-in session reaches this form. */}
      <AuthForm action={resetPassword} submitLabel={t("resetPassword.submit")} captcha={false}>
        <Field label={t("fields.newPassword")}>
          <FieldInput
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <FieldDescription>
            {t("fields.passwordHint", { min: PASSWORD_MIN_LENGTH })}
          </FieldDescription>
        </Field>
      </AuthForm>
    </>
  );
}
```

- [ ] **Step 9: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add "app/[locale]/(auth)/forgot-password" "app/[locale]/(auth)/reset-password"
git commit -m "feat: add forgot-password and reset-password

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The account page and sign-out

**Files:**
- Create: `app/[locale]/account/actions.ts`
- Test: `app/[locale]/account/actions.test.ts`
- Create: `app/[locale]/account/page.tsx`

**Interfaces:**
- Consumes: `requireUser` (Task 6); `resolveLocale` (Task 3); `reportAuthError` (Task 3)
- Produces: `signOut(locale: string): Promise<void>`; route `/account`

- [ ] **Step 1: Write the failing test**

`app/[locale]/account/actions.test.ts`:

```ts
// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { signOut } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signOut", () => {
  test("signs out this browser only and goes home", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await expect(signOut("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/", locale: "en" });
  });

  test("reports a failure and still goes home", async () => {
    mocks.signOut.mockResolvedValue({ error: new AuthError("boom", 500, "unexpected_failure") });
    await expect(signOut("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/", locale: "en" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/[locale]/account/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Implement `app/[locale]/account/actions.ts`**

```ts
"use server";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { reportAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out this browser — `local`, so signing out on a phone does not end the
 * laptop's session. POST only: it is bound to a form, never a link, so a
 * prefetch or a crawler cannot sign anyone out.
 */
export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) reportAuthError(error, "signOut");
  return redirect({ href: "/", locale: resolveLocale(locale) });
}
```

Run: `npx vitest run "app/[locale]/account/actions.test.ts"`
Expected: PASS.

- [ ] **Step 4: Write the account page**

`app/[locale]/account/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";

import { signOut } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.account");
  return { title: t("title") };
}

/**
 * Where sign-in and confirmation land. Deliberately a landing page, not a
 * settings screen — profile and settings are the next M2 spec.
 */
export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const locale = resolveLocale((await params).locale);
  const user = await requireUser({ locale, next: "/account" });
  const t = await getTranslations("auth.account");

  return (
    <Section>
      <Container>
        <Card className="mx-auto w-full max-w-[560px] p-6 sm:p-10">
          <h1 className="font-serif text-h2 text-ink">{t("title")}</h1>
          <p className="mt-3 text-muted">{t("signedInAs", { email: user.email })}</p>
          <form action={signOut.bind(null, locale)} className="mt-8">
            <Button type="submit" variant="ghost">
              {t("signOut")}
            </Button>
          </form>
        </Card>
      </Container>
    </Section>
  );
}
```

- [ ] **Step 5: Build and typecheck**

Run: `npm run build && npx tsc --noEmit`
Expected: build succeeds, no type errors. `/account`, `/reset-password` and `/auth/confirm` are dynamic (`ƒ`); `/sign-up`, `/sign-up/check-email` and `/forgot-password` are static.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/account"
git commit -m "feat: add the account landing page and sign-out

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `AccountLink` in the header

**Files:**
- Create: `components/layout/account-link.tsx`
- Test: `components/layout/account-link.test.tsx`
- Modify: `components/layout/site-header.tsx`
- Modify: `components/layout/site-header.test.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client`; `Link`, `usePathname` from `@/i18n/navigation`
- Produces: `AccountLink({ className }: { className?: string })`

- [ ] **Step 1: Write the failing test**

`components/layout/account-link.test.tsx`:

```tsx
import { act } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

type Listener = (event: string, session: object | null) => void;

const mocks = vi.hoisted(() => ({
  pathname: "/",
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as Listener | null,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: (callback: Listener) => {
        mocks.listener = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
    },
  }),
}));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  usePathname: () => mocks.pathname,
}));

const { AccountLink } = await import("./account-link");

const SESSION = { data: { session: { access_token: "t" } } };
const NO_SESSION = { data: { session: null } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/";
  mocks.listener = null;
});

describe("AccountLink", () => {
  test("says Sign in without a session", async () => {
    mocks.getSession.mockResolvedValue(NO_SESSION);
    renderWithIntl(<AccountLink />);
    expect(await screen.findByRole("link", { name: messages.nav.signIn })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  test("says Account once a session is found", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    renderWithIntl(<AccountLink />);
    expect(await screen.findByRole("link", { name: messages.nav.account })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  test("follows an auth state change", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    renderWithIntl(<AccountLink />);
    await screen.findByRole("link", { name: messages.nav.account });

    act(() => mocks.listener?.("SIGNED_OUT", null));

    expect(screen.getByRole("link", { name: messages.nav.signIn })).toBeInTheDocument();
  });

  test("re-reads the session after a navigation", async () => {
    // A Server Action's redirect after sign-in is a client-side navigation:
    // this component does not remount, and onAuthStateChange does not fire
    // for cookies the server set.
    mocks.getSession.mockResolvedValue(NO_SESSION);
    const { rerender } = renderWithIntl(<AccountLink />);
    await screen.findByRole("link", { name: messages.nav.signIn });

    mocks.getSession.mockResolvedValue(SESSION);
    mocks.pathname = "/account";
    rerender(<AccountLink />);

    expect(await screen.findByRole("link", { name: messages.nav.account })).toBeInTheDocument();
  });

  test("unsubscribes on unmount", async () => {
    mocks.getSession.mockResolvedValue(NO_SESSION);
    const { unmount } = renderWithIntl(<AccountLink />);
    await screen.findByRole("link", { name: messages.nav.signIn });
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/layout/account-link.test.tsx`
Expected: FAIL — `Failed to resolve import "./account-link"`.

- [ ] **Step 3: Implement `components/layout/account-link.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * "Sign in", or "Account" once the browser holds a session.
 *
 * Renders "Sign in" on the server and switches after hydration, so the header
 * — and every public page — stays static. Reading the session on the server
 * would read cookies and make every page dynamic.
 *
 * This is a DISPLAY HINT, never an authorization decision, which is why the
 * unverified `getSession()` is acceptable here and nowhere else. `/account`
 * checks for real with `requireUser()`.
 *
 * Re-reads on every pathname change: signing in redirects client-side, this
 * component does not remount, and `onAuthStateChange` does not fire for
 * cookies a Server Action set.
 */
export function AccountLink({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(data.session !== null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(session !== null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname]);

  return (
    <Link href={signedIn ? "/account" : "/sign-in"} className={className}>
      {signedIn ? t("account") : t("signIn")}
    </Link>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run components/layout/account-link.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Use it in the header**

In `components/layout/site-header.tsx`, add `import { AccountLink } from "@/components/layout/account-link";` and replace

```tsx
            <Link
              href="/sign-in"
              className="focus-ring hidden text-sm font-medium text-muted transition-colors duration-150 hover:text-ink sm:block"
            >
              {t("signIn")}
            </Link>
```

with

```tsx
            <AccountLink className="focus-ring hidden text-sm font-medium text-muted transition-colors duration-150 hover:text-ink sm:block" />
```

- [ ] **Step 6: Keep the header test focused on the header**

`AccountLink` reaches for the browser Supabase client and the router, neither of which the header test is about. At the top of `components/layout/site-header.test.tsx`, after the `vitest` import, add:

```tsx
import { vi } from "vitest";

// AccountLink has its own tests; here it would need a Supabase client and a
// router context the header does not care about.
vi.mock("./account-link", () => ({ AccountLink: () => null }));
```

(Merge `vi` into the existing `vitest` import line rather than adding a second import.)

- [ ] **Step 7: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/layout/account-link.tsx components/layout/account-link.test.tsx components/layout/site-header.tsx components/layout/site-header.test.tsx
git commit -m "feat: show Account in the header once signed in

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The template push script

**Files:**
- Create: `scripts/push-auth-templates.mjs`
- Test: `scripts/push-auth-templates.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `supabase/config.toml`'s template sections (Task 1)
- Produces: `readTemplateSections(toml: string): Record<string, Record<string, string | boolean>>`, `buildPayload(sections, readFile: (path: string) => string): Record<string, string | boolean>`; npm script `auth:templates`

- [ ] **Step 1: Write the failing test**

`scripts/push-auth-templates.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { buildPayload, readTemplateSections } from "./push-auth-templates.mjs";

const toml = readFileSync("supabase/config.toml", "utf8");
const readFile = (path: string) => readFileSync(path, "utf8");

describe("readTemplateSections", () => {
  test("reads subject, path and enabled from the template sections only", () => {
    const sections = readTemplateSections(toml);
    expect(Object.keys(sections).sort()).toEqual([
      "auth.email.notification.password_changed",
      "auth.email.template.confirmation",
      "auth.email.template.recovery",
    ]);
    expect(sections["auth.email.notification.password_changed"].enabled).toBe(true);
  });

  test("ignores commented-out sections", () => {
    expect(readTemplateSections('# [auth.email.template.invite]\n# subject = "x"\n')).toEqual({});
  });
});

describe("buildPayload", () => {
  const payload = buildPayload(readTemplateSections(toml), readFile);

  test("sets every Management API field", () => {
    expect(Object.keys(payload).sort()).toEqual([
      "mailer_notifications_password_changed_enabled",
      "mailer_subjects_confirmation",
      "mailer_subjects_password_changed_notification",
      "mailer_subjects_recovery",
      "mailer_templates_confirmation_content",
      "mailer_templates_password_changed_notification_content",
      "mailer_templates_recovery_content",
    ]);
  });

  test("links confirmation and recovery through /auth/confirm with the right type", () => {
    expect(payload.mailer_templates_confirmation_content).toContain(
      "/auth/confirm?token_hash={{ .TokenHash }}&type=email",
    );
    expect(payload.mailer_templates_recovery_content).toContain(
      "/auth/confirm?token_hash={{ .TokenHash }}&type=recovery",
    );
  });

  test("fails when a section is missing", () => {
    expect(() => buildPayload({}, readFile)).toThrow("auth.email.template.confirmation");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/push-auth-templates.test.ts`
Expected: FAIL — `Failed to resolve import "./push-auth-templates.mjs"`.

- [ ] **Step 3: Implement `scripts/push-auth-templates.mjs`**

```js
// Pushes supabase/templates/* to a HOSTED Supabase project.
//
// config.toml applies the templates to the local stack only; a hosted project
// needs the Management API. Run by hand after a template changes, like
// `npm run db:push`, and for the same reason: CI does not hold a privileged
// Supabase token.
//
//   SUPABASE_ACCESS_TOKEN=sbp_… npm run auth:templates
//
// The project ref comes from SUPABASE_PROJECT_REF, or from the one
// `supabase link` recorded. Subjects and file paths are read from
// supabase/config.toml, which stays their single source.

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** config.toml section → Management API field for each setting. */
const FIELDS = {
  "auth.email.template.confirmation": {
    subject: "mailer_subjects_confirmation",
    content_path: "mailer_templates_confirmation_content",
  },
  "auth.email.template.recovery": {
    subject: "mailer_subjects_recovery",
    content_path: "mailer_templates_recovery_content",
  },
  "auth.email.notification.password_changed": {
    enabled: "mailer_notifications_password_changed_enabled",
    subject: "mailer_subjects_password_changed_notification",
    content_path: "mailer_templates_password_changed_notification_content",
  },
};

/**
 * Reads the `[auth.email.template.*]` and `[auth.email.notification.*]`
 * sections. Not a TOML parser: those sections hold only quoted strings and
 * booleans, which JSON.parse reads identically. Commented lines never match.
 *
 * @param {string} toml
 * @returns {Record<string, Record<string, string | boolean>>}
 */
export function readTemplateSections(toml) {
  const sections = {};
  let current = null;

  for (const line of toml.split("\n")) {
    const header = line.match(/^\[(auth\.email\.(?:template|notification)\.[a-z_]+)\]\s*$/);
    if (header) {
      current = header[1];
      sections[current] = {};
      continue;
    }
    if (line.startsWith("[")) {
      current = null;
      continue;
    }
    const pair = current && line.match(/^(\w+)\s*=\s*(.+?)\s*$/);
    if (pair) sections[current][pair[1]] = JSON.parse(pair[2]);
  }

  return sections;
}

/**
 * The PATCH body: subjects and flags as-is, `content_path` replaced by the file.
 *
 * @param {Record<string, Record<string, string | boolean>>} sections
 * @param {(path: string) => string} readFile
 * @returns {Record<string, string | boolean>}
 */
export function buildPayload(sections, readFile) {
  const payload = {};

  for (const [section, fields] of Object.entries(FIELDS)) {
    const values = sections[section];
    if (!values) throw new Error(`supabase/config.toml has no [${section}] section`);

    for (const [key, field] of Object.entries(fields)) {
      if (!(key in values)) throw new Error(`[${section}] has no ${key}`);
      payload[field] = key === "content_path" ? readFile(values[key]) : values[key];
    }
  }

  return payload;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const linked = "supabase/.temp/project-ref";
  const ref =
    process.env.SUPABASE_PROJECT_REF ??
    (existsSync(linked) ? readFileSync(linked, "utf8").trim() : undefined);

  if (!token || !ref) {
    console.error("Set SUPABASE_ACCESS_TOKEN, and SUPABASE_PROJECT_REF unless the project is linked.");
    process.exit(1);
  }

  const payload = buildPayload(
    readTemplateSections(readFileSync("supabase/config.toml", "utf8")),
    (path) => readFileSync(path, "utf8"),
  );

  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`Supabase answered ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  console.log(`Pushed ${Object.keys(payload).length} auth email settings to ${ref}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scripts/push-auth-templates.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the npm script**

In `package.json` `"scripts"`, after `"db:types"`, add:

```json
"auth:templates": "node scripts/push-auth-templates.mjs"
```

Run: `npm run auth:templates` with no environment set.
Expected: exits 1 with `Set SUPABASE_ACCESS_TOKEN, and SUPABASE_PROJECT_REF unless the project is linked.` — nothing is sent. **Do not run it against a hosted project from here**; that is a human step in the runbook.

- [ ] **Step 6: Lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors. (`allowJs` lets the `.ts` test import the `.mjs`; the JSDoc annotations are what give `payload` a type the test can index.)

- [ ] **Step 7: Commit**

```bash
git add scripts/push-auth-templates.mjs scripts/push-auth-templates.test.ts package.json
git commit -m "feat: add a script that pushes auth email templates to a hosted project

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Runbook, docs, and end-to-end verification

**Files:**
- Create: `docs/deployment/AUTH_SETUP.md`
- Modify: `docs/content-requests.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-23-auth-flows-design.md` (status line only)

**Interfaces:**
- Consumes: everything above
- Produces: the hosted-configuration checklist the launch will follow

- [ ] **Step 1: Write `docs/deployment/AUTH_SETUP.md`**

```markdown
# Auth setup — hosted Supabase project

Everything here is configuration that **does not travel with migrations**. It
is applied by hand to the hosted dev project now, and repeated, as a
checklist, on the production project at launch. Spec:
`docs/superpowers/specs/2026-09-23-auth-flows-design.md`.

Local development needs none of it: `supabase/config.toml` configures the local
stack, Mailpit catches the email, and Cloudflare's Turnstile test keys always
pass.

## Before merging the auth branch

- [ ] **GitHub → Settings → Secrets and variables → Actions → Variables:** add
      `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. A *variable*, not a secret — the value
      ships in the page. Until the real widget exists, use the test key
      `1x00000000000000000000AA`. **Without it the image build fails at
      prerender**, because the sign-up pages render the Turnstile component.

## Hosted project settings

Supabase dashboard, for the project in question:

- [ ] **Authentication → URL Configuration:** Site URL is the deployed origin
      (the email links are built from it). Redirect URLs: the same origin.
- [ ] **Authentication → Sign In / Providers → Email:** *Confirm email* on.
      *Secure password change* on. Minimum password length **10** (mirrors
      `PASSWORD_MIN_LENGTH` in `lib/auth/password.ts`). No character
      requirements.
- [ ] **Leaked password protection** on — requires the Pro plan. Until the
      project is on Pro, record here that it is off.
- [ ] **Authentication → Attack Protection:** CAPTCHA on, provider
      **Turnstile**, secret = the widget's secret (below). The secret lives
      here and nowhere else — not the repo, not CI, not Coolify.
- [ ] **Authentication → Emails → SMTP Settings:** custom SMTP on.

      | Setting | Value |
      |---|---|
      | Host | `smtp.mx.cloudflare.net` |
      | Port | `465` |
      | Username | `api_token` |
      | Password | Cloudflare API token, account-owned, **Email Sending: Edit** only |
      | Sender email | `no-reply@<client domain>` (pending — see content requests) |
      | Sender name | `ART Gradings` (pending) |

- [ ] **Authentication → Rate Limits:** custom SMTP lifts the built-in email
      limit, so set *emails per hour* deliberately (start at 30 and watch).
- [ ] **Email templates:** `SUPABASE_ACCESS_TOKEN=<personal token> npm run
      auth:templates`. Uses the linked project ref, or `SUPABASE_PROJECT_REF`.
      Rerun whenever a file in `supabase/templates/` changes.

## Cloudflare

- [ ] **Turnstile → Add widget** for the deployed hostname, mode *Managed*.
      The site key goes to the GitHub variable above (and needs a rebuild —
      it is baked in); the secret goes to Supabase.
- [ ] **Email Service → Sending:** onboard the sending domain. This publishes
      SPF, DKIM and DMARC and needs the client's domain on Cloudflare DNS.
      Until then the account can only send to verified destination addresses
      — enough to test, not to let anyone sign up.

## Verify

On the deployed site: sign up with a real inbox → the email arrives from the
configured sender with the branded template → the link lands on `/auth/confirm`
→ Continue → `/account`. Then forgot password → email → reset → the
"password changed" email arrives. Check Sentry for any
`Unexpected Supabase Auth error` events.

## At launch

Repeat every box above on the production project, with a **production**
Turnstile widget for the production hostname, and rebuild the image with the
production build args — never retag a dev image.
```

- [ ] **Step 2: Add the client dependencies to `docs/content-requests.md`**

Add a section after *Needed — copy the design never wrote*:

```markdown
## Auth email and bot protection

Blocks hosted email, not development.

| Item | Current placeholder | What is needed |
|---|---|---|
| Sending domain | none | The client's domain on Cloudflare DNS, so Cloudflare Email Sending can onboard it (SPF, DKIM, DMARC). Until then only verified test inboxes receive auth email. |
| Sender address and name | `no-reply@<domain>`, `ART Gradings` | Confirmation of both. |
| Turnstile | built | **Outside the estimate (≈ 3–4 h), added deliberately.** Needs the client's agreement as a scope addition. |
| Auth email copy | English, in `supabase/templates/*.html` | Functional copy we wrote. Supabase renders it, so it is **not** in `messages/*.json`: when a second locale is scoped, these three templates need translating and auth email moves to Supabase's Send Email hook (see the spec). |
```

- [ ] **Step 3: Update `CLAUDE.md`**

Under *Repo state*, change the "Built so far" paragraph's ending from "…and the three M1 public pages — landing, `/how-it-works` and `/faq`." to "…the three M1 public pages — landing, `/how-it-works` and `/faq` — and the M2 auth flows: sign-up, confirmation, sign-in, sign-out, password reset, and a landing `/account` page."

Replace "Not yet built: all auth UI — signup, login and password reset are M2." with "Not yet built: profile and settings (the next M2 spec)."

Add a section after *Supabase*:

```markdown
## Auth

Email/password through Supabase Auth. Spec:
`docs/superpowers/specs/2026-09-23-auth-flows-design.md`; hosted configuration:
`docs/deployment/AUTH_SETUP.md`.

- **Forms post to Server Actions** (`app/[locale]/(auth)/*/actions.ts`)
  through `components/auth/auth-form.tsx`. Actions validate, call Supabase,
  map `error.code` through `lib/auth/errors.ts`, and `return redirect({href,
  locale})`. Never map by `error.message` — it changes, and it can contain the
  email address.
- **Report unexpected auth errors with `reportAuthError()`,** never by
  capturing the Supabase error object.
- **Sign-up, resend and forgot-password never reveal whether an account
  exists.** `revealsAccount()` lists the codes treated as success.
- **Confirmation links are `token_hash`, verified on a button's POST,** never
  on the link's GET — mail scanners prefetch links.
- **Turnstile is verified by Supabase,** not by us. Locally, the always-pass
  test keys; the real secret lives only in the hosted Auth settings.
- **`getSession()` appears once, in `AccountLink`,** as a display hint.
  Everything that decides access uses `getUser()`/`requireUser()` (verified
  claims). RLS remains the boundary for data.
- **Auth email templates are in `supabase/templates/`,** applied locally by
  `config.toml` and to a hosted project by `npm run auth:templates`. They are
  English-only by construction; see the spec before adding a locale.
- **Seeded users** (`user@example.test`, `admin@example.test`) sign in locally
  with `password123!`.
```

- [ ] **Step 4: Mark the spec implemented**

In `docs/superpowers/specs/2026-09-23-auth-flows-design.md`, change `**Status:** Approved, not yet implemented` to `**Status:** Implemented — see docs/superpowers/plans/2026-09-25-auth-flows.md for deviations`.

- [ ] **Step 5: Run every automated check**

```bash
npm run lint
npm test
npm run build
npx tsc --noEmit
npm run db:reset && npm run db:test
```

Expected: all pass. If any fails, stop and fix it before the manual pass.

- [ ] **Step 6: Walk every flow on the local stack**

`npm run db:start` (if stopped), `npm run dev`, Mailpit at `http://localhost:54324`. Needs internet (GoTrue calls Cloudflare siteverify). Tick each:

- [ ] Sign up with `walk@example.test` → check-email page → Mailpit has the branded email → its link opens `/auth/confirm` with a Continue button (and loading the link alone did **not** confirm) → Continue → `/account` shows the address → header says "Account".
- [ ] Check-email resend with the same address twice within a minute → both say "sent".
- [ ] Sign up again with `walk@example.test` → check-email page, no error.
- [ ] Sign out → home → header says "Sign in".
- [ ] Sign in with a wrong password → the generic message, and the email field still holds the address.
- [ ] Sign up `unconfirmed@example.test`, don't confirm, sign in → "Confirm your email first" with a working resend link.
- [ ] Visit `/account` signed out → `/sign-in?next=%2Faccount` → sign in → `/account`.
- [ ] Visit `/sign-in?next=//evil.test`, sign in → `/account`.
- [ ] Sign in as `user@example.test` in a second browser. In the first, forgot-password → Mailpit → link → Continue → `/reset-password` → a new password → `/account`; Mailpit has the "password changed" email; the second browser is signed out on its next navigation.
- [ ] Open a used confirmation link again → Continue → sign-in page with the "link has expired" notice.
- [ ] Visit `/reset-password` signed out → `/forgot-password`.

Record anything that did not behave, and fix it before continuing.

- [ ] **Step 7: Commit**

```bash
git add docs/deployment/AUTH_SETUP.md docs/content-requests.md CLAUDE.md docs/superpowers/specs/2026-09-23-auth-flows-design.md
git commit -m "docs: add the auth setup runbook and record the auth conventions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Hand back**

Report to the user: every check's result, the manual walkthrough's result, the *Deviations from the spec* table, and the three human steps that must precede or follow merging — the `NEXT_PUBLIC_TURNSTILE_SITE_KEY` repository variable (**before** merge), the hosted project checklist in `AUTH_SETUP.md`, and the client items in `content-requests.md`. Then use superpowers:finishing-a-development-branch.
