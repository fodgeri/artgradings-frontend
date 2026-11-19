# Pop Report search and scheduled jobs — Meilisearch, Vault, Cron

The Pop Report's search is a derived Meilisearch index of public cards.
Postgres is authoritative; the index is rebuilt from it at any time. The
index is private: the browser never reaches Meilisearch, and no search key is
`NEXT_PUBLIC_*`. All settings below are **runtime**, never build args.

## Meilisearch on Coolify

- [ ] Add a service from the image `getmeili/meilisearch:v1.35.1`.
- [ ] A **persistent volume** at `/meili_data`.
- [ ] **No public port.** Attach it to the same Docker network as the app so
      the app reaches it by service name, for example `http://meilisearch:7700`.
- [ ] Environment: `MEILI_ENV=production`, `MEILI_NO_ANALYTICS=true` and
      `MEILISEARCH_MASTER_KEY` (the service's `MEILI_MASTER_KEY`), a fresh
      `openssl rand -hex 32`. The master key lives in the container only; the
      app never reads it.
- [ ] Mint an **admin-scoped key** with the master key, from inside the
      container or the app network:

      ```sh
      curl -X POST http://meilisearch:7700/keys \
        -H "Authorization: Bearer $MEILISEARCH_MASTER_KEY" \
        -H 'Content-Type: application/json' \
        -d '{"name":"app","description":"artgradings app","actions":["*"],"indexes":["pop_cards*"],"expiresAt":null}'
      ```

- [ ] On the **app**, set `MEILISEARCH_HOST` (`http://meilisearch:7700`) and
      `MEILISEARCH_API_KEY` (the minted key's `key` value). Not the master key.

Locally: `npm run search:start` / `npm run search:stop`
(`docker-compose.meilisearch.yml`, same image version).

## Vault secrets (per Supabase project)

`private.call_job` signs each job call with the Vault `jobs_secret` and posts
to the Vault `jobs_base_url`. Set both on each project (local seeds its own
values; never reuse them):

```sql
select vault.create_secret('<https://site>', 'jobs_base_url');
select vault.create_secret('<same as JOBS_SECRET>', 'jobs_secret');
```

`jobs_secret` must equal the app's `JOBS_SECRET` (`openssl rand -hex 32`,
fresh per environment). Rotating it means updating both together.

## First index build

- [ ] After deploy, from the app container: `npm run search:reindex`
      (needs `JOBS_SECRET`; set `JOBS_BASE_URL` if the app is not on
      `localhost:3000`). It triggers the `search-rebuild` job, which builds
      a temporary `pop_cards_rebuild_*` index, applies the settings and swaps it in.
- [ ] Run `npm run search:reindex` again whenever `POP_INDEX_SETTINGS`
      changes; settings reach the live index only through a rebuild.

## Checks

- [ ] `select * from cron.job_run_details order by start_time desc limit 10;`
      shows recent successful runs of each schedule.
- [ ] `select * from private.job_runs;` shows `search-delta` advancing every
      few minutes and `maintenance` hourly.
- [ ] `GET /api/health`: `jobs.overdue` is empty (it can lag up to 10 minutes: the health check memoises the overdue answer). Health always returns 200 by
      design; read the body.
- [ ] The index document count equals the number of public cards:
      `GET /indexes/pop_cards/stats` (`numberOfDocuments`) against the paged
      count of `select * from search_public_card_ids(null, 1000)` (pass the
      last id as the first argument to fetch the next page).
