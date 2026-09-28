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
      requirements. Email OTP expiry **3600 seconds (1 hour)** — the templates
      promise "expires in one hour".
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

      Once the email-per-hour cap is hit, it looks like success to users: sign-up,
      resend and forgot-password treat `over_email_send_rate_limit` as
      indistinguishable from the per-address resend window, so the enumeration
      protection swallows the error and no email goes out. Watch Sentry for
      `Suppressed Supabase Auth error` warnings with `auth.code =
      over_email_send_rate_limit` — that is how a cap hit becomes visible.
- [ ] **Per-IP auth limits key on the app server's IP.** Supabase rate-limits
      sign-in/sign-up/verify/token-refresh per calling IP, and every call comes
      from our server, so these limits are effectively site-wide. On hosted
      projects raise them deliberately (Authentication → Rate Limits). Before
      production, decide between forwarding the end-user IP (an auth-only
      server client using the secret key that sends `Sb-Forwarded-For`, with
      forwarding enabled on the project — never used for data queries, since
      the secret key bypasses RLS) and documented raised limits. **Launch
      blocker.**
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
