# Submission flow setup — R2, runtime settings, the maintenance job

Everything the M3 submission flow needs on a host that **does not travel with
the image or the migrations**. It is applied by hand to the current (dev-backed)
host now, and repeated, as a checklist, for production at launch. Spec:
`docs/superpowers/specs/2026-10-22-submission-flow-design.md`.

Every setting here is a **runtime** variable set in Coolify. None is
`NEXT_PUBLIC_*` and none is a build arg: a build arg is baked into the image
layers (see *Secrets* in `CLAUDE.md`), and these must differ per host without a
rebuild.

Local development needs none of it. `supabase/config.toml` creates a private
`card-photos` bucket in the local Supabase Storage, whose S3 endpoint stands in
for R2; `.env.example` lists the local values (`R2_ENDPOINT`, `R2_REGION=local`
and the two keys from `npx supabase status -o env`).

## Before merging the submission-flow branch

- [ ] **Run `npm run db:push` BEFORE merging, not after.** The branch adds five
      migrations — `order_catalog`, `orders`, `order_functions`,
      `order_system_functions` and `account_deletion_guard` — and the new app
      code reads the order tables; with `AUTO_DEPLOY` the new image goes live on
      merge. Pushing first is safe: they only add tables, functions and a
      trigger on deleting a user, which refuses only while an order is
      unfinished, and the old image creates no orders.
- [ ] Set the runtime variables below in Coolify before the new image starts,
      or the first photo upload fails (`R2_*`) and the printables throw
      (`SITE_URL`).
- [ ] **Verify the R2 S3 client against the real R2 bucket on the first
      deploy.** Merging deploys to a host that uses real R2, and only the local
      Supabase Storage stand-in has been exercised. AWS SDK v3
      (`@aws-sdk/client-s3`) adds CRC32 checksum headers by default, and
      Cloudflare's guidance has been to construct the client with
      `requestChecksumCalculation: "WHEN_REQUIRED"` and
      `responseChecksumValidation: "WHEN_REQUIRED"`. `lib/storage/r2.ts`
      sets neither today. On the deployed host: upload a photo, view it,
      remove it, and run `npm run job maintenance` once (it answers 202 with
      `{accepted}`; the work runs afterwards). Then check: the object is gone
      from the bucket, `select count(*) from private.photo_deletions` is 0,
      and the `maintenance` row of `private.job_runs` has an advanced
      `last_success_started_at` / `last_finished_at`. Add the two
      options if any step fails.

## Cloudflare R2

Card photos are stored in R2, in a **private** bucket. The browser never
talks to R2: uploads go through a Server Action, and photos are served back
through `GET /api/photos/[id]`, which reads the photo row with the customer's
session (so RLS proves ownership on every request) and streams the object.
Object keys are `card-photos/<card id>/<photo id>` and contain no personal
data.

- [ ] **Cloudflare dashboard → R2 → Create bucket.** One bucket per
      environment (for example `artgradings-dev`, later `artgradings-prod`).
      Location: EU jurisdiction. **Leave public access off** — no `r2.dev`
      subdomain, no custom domain.
- [ ] **R2 → Manage API tokens → Create API token.** Permission **Object Read
      & Write**, **scoped to that one bucket** (not "all buckets"), no expiry
      or a calendar reminder before it. Copy the *Access Key ID* and *Secret
      Access Key* — the secret is shown once.
- [ ] **Coolify → the application → Environment Variables**, runtime (not
      "build variable"):

      | Variable | Value |
      |---|---|
      | `R2_ACCOUNT_ID` | the Cloudflare account id (the endpoint is derived from it) |
      | `R2_ACCESS_KEY_ID` | the token's access key id |
      | `R2_SECRET_ACCESS_KEY` | the token's secret |
      | `R2_BUCKET_NAME` | the bucket name |
      | `R2_ENDPOINT`, `R2_REGION` | **unset** — they exist for the local stand-in only |

The R2 configuration is read in one place, `lib/storage/env.ts`.

## `SITE_URL`

- [ ] **`SITE_URL`** = the public origin of the host, e.g.
      `https://<domain>`, no trailing path.

The parcel label and the submission form carry a QR code that encodes
`<SITE_URL>/o/<reference>`. That is printed on paper and stuck on parcels, so
the origin it names must be the one customers and staff will reach for as long
as the paper exists. The pages that render the code throw if `SITE_URL` is
unset.

## `JOBS_SECRET` and the scheduled jobs

Scheduled work is run by **Supabase Cron** (pg_cron), not by Coolify. The
schedule lives in the `job_scheduling` migration: draft expiry is pure SQL
(`expire-stale-drafts`), and the app jobs (`maintenance`, `search-delta`,
`search-rebuild`) are `POST /api/jobs/<job>` calls that `private.call_job`
signs with an HMAC and the Vault secret `jobs_secret`, sent to the Vault
`jobs_base_url`. The route verifies the signature (5-minute window) against
`JOBS_SECRET`, answers 202 and does the work in `after()`. Without
`JOBS_SECRET` the route returns 404; a bad signature, 401.

`maintenance` drains the queue of R2 objects whose rows are gone
(`lib/jobs/run-maintenance.ts`) and internally returns `{ deletedPhotos }` (not persisted, and not returned by the route, which only answers `{accepted}`). It no longer
expires drafts; the SQL cron does that.

- [ ] **`JOBS_SECRET`** = `openssl rand -hex 32`. Runtime variable, never
      logged. It must equal the project's Vault `jobs_secret`.
- [ ] **Set the Vault secrets** (`jobs_base_url`, `jobs_secret`) on each
      Supabase project; the SQL is in `SEARCH_SETUP.md`.
- [ ] **Delete the old Coolify scheduled task** (the hourly `wget` with a
      Bearer token against `/api/jobs/maintenance`). That route no longer
      accepts a Bearer token; left in place it only logs 401s.
- [ ] Check a run: `select * from private.job_runs`, and
      `select * from cron.job_run_details order by start_time desc limit 10`.

Failures inside the job are reported to Sentry (`reportOrderError`, flow
`maintenance`). An R2 failure leaves that batch queued for the next run.

## `PAYMENT_PROVIDER`

`PAYMENT_PROVIDER=fake` switches on the **test payment page**
(`/account/orders/<reference>/pay`), whose *Pay* button marks an order paid
without any money moving. Unset, the page and its actions are 404, and
*Continue to payment* lands on the order page, which shows the order as
awaiting payment and says that online payment is not available yet, with no
*Pay* action. M7 adds Stripe as a real provider behind the same boundary
(`lib/payments/provider.ts`).

- On the current dev-backed host it may be `fake`, for demos.

## Launch checklist

- [ ] **`PAYMENT_PROVIDER` is unset or a real provider in production — never
      `fake`.** With `fake`, any customer can mark their own order paid.
- [ ] **`SITE_URL` is the production origin before the first real label is
      printed.** A label printed with the wrong origin cannot be recalled.
- [ ] **Repeat the R2 check against the production bucket**: upload, view
      and remove a photo, then run the maintenance job once (see *Before
      merging*).
- [ ] The production R2 bucket is its own bucket with its own scoped token —
      never the dev bucket.
- [ ] **Production `JOBS_SECRET` is a fresh `openssl rand -hex 32` value**,
      equal to that project's Vault `jobs_secret`. `.env.example` carries a
      known local value (`local-jobs-secret`); it must never reach production.
      The Vault secrets and the cron schedule exist on the production project
      (`SEARCH_SETUP.md`).
- [ ] The catalog (services, tiers, prices, caps, turnarounds, add-ons, the
      identification fee, shipping zones) holds the client's price list, not
      the placeholders — see `docs/content-requests.md`.
- [ ] `/terms` exists. It is a deliberate 404 until the lawyer's text arrives,
      and the submit summary links to it.
