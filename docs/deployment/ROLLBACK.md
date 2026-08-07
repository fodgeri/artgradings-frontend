# Rollback

You are probably reading this under pressure. Two levers, in strict order of
preference. Try lever 1 first — it is almost always the right one.

---

## Lever 1 — Retag a known-good image (preferred)

Fast, surgical, no data implications. The image for **every** past commit on
`main` is still in GHCR, because `build-and-push.yml` never cancels in-progress
builds.

**1. Find the last good SHA**

```bash
gh run list --workflow=build-and-push.yml --limit 10
```

Or ask the currently-deployed instance what it is running:

```bash
curl -s https://<domain>/api/health | jq .sha
```

**2. Retag and push**

```bash
OWNER=<owner>
IMG=ghcr.io/$OWNER/artgradings-frontend
SHA=<good-sha>

docker pull "$IMG:prod-$SHA"
docker tag  "$IMG:prod-$SHA" "$IMG:prod-latest"
docker push "$IMG:prod-latest"
```

**3. Deploy**

Click **Deploy** in Coolify on the netcup host. (If `AUTO_DEPLOY=true`, firing
the webhook works too — but a click is fine and is one less thing to get wrong.)

**4. Verify — do not skip**

```bash
curl -s https://<domain>/api/health | jq .sha
```

Must return `<good-sha>`. If it returns the bad SHA, Coolify has not finished
pulling; wait and retry before investigating anything else.

---

## Lever 2 — netcup Copy-On-Write snapshot (last resort)

Restores the **whole box** — Coolify's own state, every other container, and any
data written to disk since the snapshot. Everything since that point is lost.

Use this only when the host itself is broken (Coolify won't start, disk
corruption, a bad system-level change). **Never** use it to undo a bad deploy —
lever 1 does that without collateral damage.

---

## What neither lever rolls back: the database

Supabase is a managed service. It sits outside both levers entirely.

Rolling code back **across a migration** that dropped or renamed a column leaves
the old code querying a schema that no longer matches. It will fail at runtime,
and the failure may be partial and confusing — some pages fine, some 500ing.

This is why migrations must be backwards-compatible:

> Never drop or rename a column in the same release that stops using it. Split
> it across two releases, so a one-step rollback is always safe.

Release N stops writing the column. Release N+1, once N is confirmed stable,
drops it. That ordering is what makes lever 1 safe to use without thinking.

**If a rollback appears to require a schema change, stop and get the developer.**
Do not hand-edit production SQL under time pressure. A wrong `ALTER TABLE` on
production is not recoverable by either lever above.
