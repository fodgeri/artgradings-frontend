# Auth flows — signup, confirmation, sign-in, password reset, auth email

**Date:** 2026-09-23
**Status:** Implemented — see docs/superpowers/plans/2026-09-25-auth-flows.md for deviations
**Module:** M2 — Accounts & auth

## Goal

Let a visitor create an account with an email and password, confirm the
address, sign in, sign out, and recover a forgotten password — on top of the
Supabase foundation (`2026-08-18-supabase-foundation-design.md`), which already
provides the clients, session refresh in `proxy.ts`, and a provisioning trigger
that gives every new `auth.users` row a `profiles` row and the `user` role.

The auth emails those flows depend on are delivered through Cloudflare Email
Service, as the estimate's M2 line requires.

The deliverable is the complete email/password lifecycle, a protected
`/account` page for it to land on, and the hosted configuration written down
well enough to reproduce on the production project at launch.

## Non-goals

- **Social sign-in.** Google and Facebook are not needed now. Nothing here
  precludes them: adding a provider is Supabase configuration plus a button
  that calls `signInWithOAuth`, and `/auth/confirm`'s neighbour
  `/auth/callback` would handle the code exchange.
- **Profile and settings.** Editing `full_name`, changing email, changing
  password while signed in, and account deletion are the next M2 spec.
  `/account` here is deliberately a landing page, not a settings screen.
- **Transactional email beyond auth.** Order-status and payment-confirmation
  mail is sent by our own code (M3–M7) through Cloudflare's REST API or SMTP,
  with next-intl templates. It is a different mechanism from the one below and
  gets its own design when the first such email exists.
- **Admin gating.** Roles and permissions already exist and RLS enforces them.
  Gating an admin *route* is M5, which is when there is an admin route.
- **MFA.** Not in the estimate.
- **Collecting profile data at signup.** Email and password only. Full name is
  collected in profile settings or at first submission (M3); shipping address
  where it is used (M6).

## Decisions

### Email delivery: Supabase custom SMTP → Cloudflare SMTP

Three mechanisms were considered:

1. **Supabase custom SMTP pointed at Cloudflare.** Supabase Auth sends its own
   mail; we give it Cloudflare's SMTP submission endpoint.
2. **Supabase Send Email hook.** Supabase calls an endpoint of ours with the
   token; we render the email with next-intl and send it via Cloudflare's REST
   API.
3. **Supabase's built-in sender.** Rate-limited to a handful of messages per
   hour and unbranded; a development convenience only.

**Chosen: 1.** It is the production configuration Supabase documents, and it is
configuration rather than code:

- **No new public endpoint.** A hook receiver is a webhook — it must verify a
  signature, and it puts our application in the delivery path. If the app is
  down, nobody can confirm an account or reset a password.
- **Cloudflare Email Service offers SMTP submission** (beta since 2026-06) on
  `smtp.mx.cloudflare.net:465`, implicit TLS, username the literal string
  `api_token`, password a Cloudflare API token with **Email Sending: Edit**. It
  shares the pipeline, DKIM signing, limits and logs of the REST API.
- **The cost is that templates are single-language.** Supabase's templates are
  one HTML file per email type. That is correct for an English-only launch.
  When a second language ships, auth mail moves to option 2 — at which point
  the order-status email design will already have built the rendering side.
  This is recorded so it is a known switch, not a surprise.

### Form mechanics: Server Actions

Each form posts to a Server Action that uses `lib/supabase/server.ts`, driven
by `useActionState` for pending state and inline errors. This is the pattern
Supabase's own Next.js SSR guide uses.

The reason is where logic lives, not progressive enhancement. Mapping Supabase
error codes to message keys, deciding what to tell the user without leaking
whether an account exists, capturing unexpected failures in Sentry, and
redirecting — all of that happens on the server, in one place per flow, and is
unit-testable without a browser. The alternative, calling `supabase.auth.*`
from the browser client, spreads it across Client Components.

The forms do **not** work without JavaScript: Turnstile needs it to produce a
token. This is stated so nobody later assumes otherwise.

### Confirmation links: `token_hash`, behind a click

Supabase offers two link styles. **PKCE** (`?code=`) exchanges a code against a
verifier cookie set by the browser that started the flow — so a link opened on
a different device, or in the mail app's in-app browser, fails. **Token hash**
(`?token_hash=…&type=…`, verified with `verifyOtp`) has no such dependency.
Token hash is chosen; the templates build the link themselves from
`{{ .SiteURL }}`, so no action passes `emailRedirectTo` or `redirectTo` — the
destination is decided by `/auth/confirm` from the link's `type`.

The link does not verify on `GET`. Corporate mail scanners (Outlook Safe Links
and similar) fetch every URL in an inbound message, and a single-use token
consumed by the scanner leaves the user with "link expired" on their first
click. `/auth/confirm` therefore renders a page with one button; the button
posts to a Server Action that calls `verifyOtp`. A scanner's `GET` consumes
nothing. This is the standard mitigation and costs one click.

### Bot protection: Turnstile, verified by Supabase

**This is outside the estimate** (≈ 3–4 h) and was added deliberately; it must
be raised with the client as a scope addition.

Cloudflare Turnstile protects sign-up, sign-in, forgot-password and
resend-confirmation. Supabase Auth verifies Turnstile natively: the Server
Action passes the widget's token as `options.captchaToken`, and Auth calls
siteverify itself with the secret held in its own settings. We write no
siteverify code and the secret never reaches our application.

### Authorization stays out of the proxy

Unchanged from the foundation spec: `proxy.ts` rotates tokens and decides
nothing. A protected page calls `requireUser()`, which reads `getClaims()` and
redirects to sign-in when there is none. RLS remains the security boundary for
data; `requireUser()` only decides which page to show.

### The header stays static

The public pages prerender as static HTML. Reading the session in the header —
a Server Component in the root layout — would read cookies and make every page
dynamic. Instead the header's "Sign in" link becomes a small Client Component,
`AccountLink`, that renders "Sign in" on the server and switches to "Account"
after hydration if the browser client reports a session (`getSession()` plus
`onAuthStateChange`). It is a display hint, never an authorization decision, so
the unverified `getSession()` is appropriate here and nowhere else.

## Routes

All routes are under `app/[locale]/` and locale-aware. The four unauthenticated
forms share a route group `(auth)` whose layout centres a single `Card`.

| Route | Kind | Behaviour |
|---|---|---|
| `/sign-up` | page + action | Validate, `signUp({email, password, options: {captchaToken}})`, redirect to `/sign-up/check-email`. The same destination whether or not the address is already registered. |
| `/sign-up/check-email` | page + action | "Check your inbox". A resend form — an email field and Turnstile — calls `resend({type: "signup", email})` and always reports success. The address is typed again rather than carried over: putting it in the redirect's search params would write it into access logs, browser history and Sentry breadcrumbs. |
| `/sign-in` | page + action | `signInWithPassword({email, password, options: {captchaToken}})`, then redirect to a sanitised `next` or `/account`. Reads `?error=link_expired` to explain a failed confirmation. |
| `/forgot-password` | page + action | `resetPasswordForEmail(email, {captchaToken})`, then the same "if an account exists, we've sent a link" state regardless of outcome. |
| `/auth/confirm` | page + action | `GET` renders a confirm button, consuming nothing. The action calls `verifyOtp({type, token_hash})`: `email` → `/account`, `recovery` → `/reset-password`, failure → `/sign-in?error=link_expired`. |
| `/reset-password` | page + action | `requireUser()`; without a session, redirect to `/forgot-password`. `updateUser({password})`, then `signOut({scope: "others"})` so a reset evicts whoever else holds a session, then `/account`. |
| `/account` | page | `requireUser()`. Shows the signed-in email and a sign-out button. Extended by the profile spec. |
| — | action | `signOut({scope: "local"})`, then `/`. POST only, via a form. |

`next` is accepted only as a same-origin path: it must start with `/`, and must
not start with `//` or `/\`, which browsers treat as protocol-relative. Anything
else falls back to `/account`. It is carried from `requireUser()`'s redirect
through the sign-in form as a hidden field.

Confirmation always lands on `/account`, not the `next` the user may have
started from. Carrying `next` through the email would mean encoding it into the
template's link, and the round trip through someone's inbox is not worth it for
a one-time event.

## Error handling

Every expected outcome from Supabase maps to a message key under
`auth.errors.*`. The mapping lives in one module and is keyed by the stable
`error.code` field, never by message text.

| Supabase code | Shown as |
|---|---|
| `invalid_credentials` | One generic "email or password is incorrect" — never which of the two |
| `email_not_confirmed` | "Confirm your email first", with a link to `/sign-up/check-email` |
| `weak_password` | The password policy |
| `captcha_failed` | "Verification failed, try again" — and the widget resets |
| `over_request_rate_limit`, `over_email_send_rate_limit` | "Too many attempts, wait a moment" |
| `otp_expired` | Handled by the confirm redirect, `link_expired` |
| `same_password` | "Choose a password you haven't used here" (reset only) |
| anything else | Generic failure; **`Sentry.captureException`** |

The last row is the one CLAUDE.md warns about: an action that returns `{error}`
instead of throwing is invisible to Sentry unless it reports explicitly. The
report carries the error code and the flow name, **never the email address** —
`sendDefaultPii` is off and nothing here attaches user data by hand.

**Account enumeration.** Sign-up and forgot-password produce the same response
for a registered and an unregistered address; with confirmations enabled,
Supabase returns an obfuscated user for an existing one rather than an error,
so this holds without extra work. Sign-in returns one message for every
credential failure.

**Password policy** follows NIST SP 800-63B: minimum 10 characters, no
composition rules, maximum 72 *bytes* (bcrypt truncates beyond that, silently —
so the action rejects it rather than letting two passwords collide). The limits
live in one constant used by the action, the input's `minLength`, and the
message's interpolation. Supabase's leaked-password check (HaveIBeenPwned)
requires the Pro plan, which the estimate budgets; it is enabled on the hosted
project when that plan is active.

## Turnstile

`components/auth/turnstile.tsx` — a Client Component, hand-written rather than
a dependency, because the whole integration is:

- load `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`
  once;
- `turnstile.render(el, {sitekey, language: locale, appearance:
  "interaction-only", callback})` into a hidden input named `captchaToken`;
- `turnstile.reset()` whenever the action returns an error, because tokens are
  single-use;
- `turnstile.remove()` on unmount.

Managed mode with `interaction-only` appearance means most visitors see nothing
and only suspicious traffic is shown a challenge.

| Value | Where | Class |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Docker build arg, `.env.local` | Public |
| Turnstile secret | Supabase Auth settings (hosted); `env(SUPABASE_AUTH_CAPTCHA_SECRET)` in `config.toml` (local) | Secret, never in our runtime |

Locally both use Cloudflare's published **test keys that always pass**
(site key `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`), documented in `.env.example` the same
way the local Supabase keys are. The real widget is created in the Cloudflare
dashboard for the deployed hostname.

Should a Content-Security-Policy be added later, `challenges.cloudflare.com`
must be allowed in `script-src` and `frame-src`.

## Email

### Local

Unchanged: Supabase delivers to Mailpit (`http://localhost:54324`). No SMTP is
configured locally, so no Cloudflare credential exists on a developer machine.

### Hosted

Custom SMTP in the Supabase dashboard (Authentication → Emails → SMTP):

| Setting | Value |
|---|---|
| Host | `smtp.mx.cloudflare.net` |
| Port | `465` |
| Username | `api_token` |
| Password | Cloudflare API token, **account-owned**, scoped to **Email Sending: Edit** only |
| Sender | `no-reply@<client domain>` — see *Client dependencies* |
| Sender name | `ART Gradings` |

The token lives in Supabase and nowhere else: not in the repo, not in Coolify,
not in CI. Enabling custom SMTP lifts Supabase's built-in rate limit; the email
rate limit (Authentication → Rate Limits) is then set deliberately rather than
left at the default.

### Templates

`supabase/templates/`, wired through `config.toml`:

| File | Config key | Link |
|---|---|---|
| `confirmation.html` | `[auth.email.template.confirmation]` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` |
| `recovery.html` | `[auth.email.template.recovery]` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| `password_changed.html` | `[auth.email.notification.password_changed]` | none — a security notice with a "not you? reset your password" pointer |

Table-based HTML with inline styles, as email clients require: the brand black
`#1A1D29` band with the wordmark as text, paper `#FAFAF8` body, a gold button.
Because the button sits on paper, its label follows the same rule as the site —
`--gold-ink` `#805B10` for gold text, or black text on a gold fill. No remote
images, so nothing depends on a hosted asset.

`config.toml` applies the templates locally only. On a hosted project they are
applied once through the Management API
(`PATCH /v1/projects/{ref}/config/auth`) from a small script,
`scripts/push-auth-templates.mjs`, reading the same files — run by hand after a
template changes, like `db push`, and for the same reason: CI does not hold a
privileged Supabase token.

The email copy is functional UI copy, written by us like the form labels. It is
not in `messages/*.json` because Supabase, not our app, renders it; that is the
single-language limitation above, and it is why the templates' strings are
listed in `docs/content-requests.md` as needing translation when a second
locale is scoped.

## Configuration

### `supabase/config.toml`

| Key | From | To | Why |
|---|---|---|---|
| `auth.email.enable_confirmations` | `false` | `true` | Accounts must own their address before orders ship to it |
| `auth.minimum_password_length` | `6` | `10` | Policy above |
| `auth.email.secure_password_change` | `false` | `true` | Changing a password requires a login within 24 h; a recovery session is fresh by construction |
| `auth.email.max_frequency` | `"1s"` | `"60s"` | Mirror the hosted default so resend behaviour is tested as it will run |
| `auth.site_url` / `additional_redirect_urls` | — | localhost variants | `{{ .SiteURL }}` in templates |
| `[auth.captcha]` | commented | `enabled`, `provider = "turnstile"`, `secret = "env(SUPABASE_AUTH_CAPTCHA_SECRET)"` | |
| template sections | commented | the three above | |

No migration. Signup is already provisioned by `private.handle_new_user`.

### Hosted dev project (dashboard, recorded in the runbook)

Site URL and redirect allowlist for the deployed dev hostname; confirmations on;
minimum length 10; secure password change on; Turnstile secret; custom SMTP;
templates via the script; leaked-password protection once on Pro.

### Build and runtime

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is added to the `Dockerfile` `ARG`s,
`build-and-push.yml`'s build args (a repository *variable* — it is public), and
`ci.yml`'s placeholder env. No new runtime secret reaches the app.

### Seed

`supabase/seed.sql` currently gives its two users an empty
`encrypted_password`, so they cannot sign in with a password. They get a
documented local password (`extensions.crypt('password123!', extensions.gen_salt('bf'))`),
matching `auth.identities` rows, and the empty-string token columns GoTrue
expects instead of `NULL`. The exact column set is verified against the local
GoTrue at implementation time rather than asserted here. The file stays
local-only and obviously synthetic.

## Files

```
app/[locale]/(auth)/layout.tsx
app/[locale]/(auth)/sign-up/{page.tsx,actions.ts}
app/[locale]/(auth)/sign-up/check-email/{page.tsx,actions.ts}
app/[locale]/(auth)/sign-in/{page.tsx,actions.ts}
app/[locale]/(auth)/forgot-password/{page.tsx,actions.ts}
app/[locale]/(auth)/reset-password/{page.tsx,actions.ts}
app/[locale]/auth/confirm/{page.tsx,actions.ts}
app/[locale]/account/{page.tsx,actions.ts}      # sign-out action
lib/auth/errors.ts          # Supabase code → message key
lib/auth/safe-next.ts       # same-origin redirect guard
lib/auth/password.ts        # policy constants + byte-length check
lib/auth/require-user.ts
components/auth/turnstile.tsx
components/auth/auth-form.tsx   # shared field/error/submit layout
components/layout/account-link.tsx
messages/en.json            # `auth` namespace, `nav.account`
supabase/config.toml
supabase/templates/{confirmation,recovery,password_changed}.html
supabase/seed.sql
scripts/push-auth-templates.mjs
docs/deployment/AUTH_SETUP.md   # hosted configuration runbook
```

Each `actions.ts` is `"use server"`, validates its `FormData`, calls Supabase,
and returns `{status, errorKey?}` or redirects via `@/i18n/navigation`'s
`redirect` with an explicit `locale`. Server Actions have no root params, so the
locale arrives as a bound argument from the page.

## Testing

Repo conventions throughout: colocated tests, `globals: false`,
`renderWithIntl`, assertions against `messages.auth.*`, never literal copy.

- **`safe-next`** — accepts `/account`, `/submit?x=1`; rejects `//evil.test`,
  `/\evil.test`, `https://evil.test`, `javascript:`, empty, and non-strings.
- **`errors`** — every code in the table maps to an existing message key
  (checked against `messages/en.json`, so a renamed key fails), and an unknown
  code maps to the generic key *and* reports to Sentry.
- **`password`** — 9 characters rejected, 10 accepted, a 72-byte multibyte
  string accepted and 73 bytes rejected.
- **Each action** — with `lib/supabase/server.ts` mocked: the success redirect,
  each mapped error, `captchaToken` forwarded, and for sign-up and
  forgot-password that a registered and an unregistered address produce an
  identical result.
- **Confirm action** — `email` and `recovery` redirect to their destinations;
  a failed `verifyOtp` redirects to `link_expired`; an unknown `type` is
  refused without calling Supabase.
- **`requireUser`** — no claims redirects with `next`; claims return the user.
- **Forms** — render labels from messages, show a returned error, disable the
  submit while pending.
- **`AccountLink`** — "Sign in" with no session, "Account" after an auth state
  change.
- **Turnstile** — mocked `window.turnstile`: renders once, writes the token to
  the hidden input, resets on error, removes on unmount.

pgTAP is unchanged: the schema does not change.

**Manual verification on the local stack**, each flow end to end with Mailpit:
sign up → email → confirm → `/account`; resend; sign in with a wrong password;
sign in unconfirmed; forgot → email → reset → other session evicted →
password-changed email; expired link; sign out. Automated E2E is M8.

## Client dependencies

These block hosted email, not development:

- **The sending domain.** Cloudflare Email Sending requires the `from` domain
  to be onboarded on the Cloudflare account, which also publishes SPF, DKIM and
  DMARC. That needs the client's domain on Cloudflare DNS. Until it is, the
  account can send only to verified destination addresses — enough to test the
  hosted dev project, not to let anyone else sign up.
- **The sender address and name.** `no-reply@…` and `ART Gradings` are
  placeholders until the client confirms them.
- **Turnstile scope.** The addition above, to be agreed.

All three are added to `docs/content-requests.md`.

## At launch

The production Supabase project needs every hosted setting in
`docs/deployment/AUTH_SETUP.md` repeated by hand — none of it travels with
migrations — plus a production Turnstile widget for the production hostname and
the templates pushed with the script. The runbook is written as a checklist for
exactly that moment.
