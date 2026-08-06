---
name: fix-pr-reviews
description: Use when addressing automated PR review feedback — either the self-hosted multi-model AI reviewer (ai-review.yml, comments headed "🤖 Review by <model>") or legacy Copilot reviews. Fetches the latest review(s), classifies REAL vs false-positive findings, fixes the real ones, commits, pushes, and re-triggers review.
argument-hint: [PR number, optional - defaults to current branch's PR]
---

# Fix PR Review Issues

Fetch the latest automated review(s) for a PR, analyze each finding to determine if it's a REAL issue, fix all REAL issues, then commit and push.

This repo has **two** review sources. Handle whichever is present (often the self-hosted one; Copilot may return later):

| Source | Mechanism | How to fetch |
|---|---|---|
| **Self-hosted multi-model** (current) | `.github/workflows/ai-review.yml` runs a matrix of models (GLM-5.2, Kimi K2.7, GPT-5.5) on a self-hosted runner; each posts ONE **issue comment** as `github-actions[bot]` headed `## 🤖 Review by <model>` | PR issue comments |
| **Copilot** (legacy/future) | A formal **review** with inline review comments; `user.login` contains `copilot` | reviews + review comments API |

## Workflow

1. **Identify the PR** — provided number, else detect from branch
2. **Detect the source(s)** present and fetch the latest review(s)
3. **Parse findings** (text findings for self-hosted; inline comments for Copilot)
4. **Aggregate + dedupe** across reviewers (the 3 models overlap and sometimes disagree)
5. **Classify** each finding REAL vs FALSE
6. **Fix REAL issues** (new migration file for DB changes — never edit applied migrations)
7. **Verify** — `npm run lint` and `npx tsc --noEmit` (ignore transient `.next/` errors)
8. **Commit + push**
9. **Re-trigger review** (source-aware) and report

## Step 1 — PR number
```bash
gh pr view --json number -q .number      # omit if number was given
```

## Step 2 — Fetch the latest review(s)

### Self-hosted multi-model (primary)
Each leg posts one issue comment via `gh pr comment`. Fetch issue comments and keep the bodies headed `🤖 Review by`:
```bash
gh pr view <PR> --json comments \
  -q '.comments[] | select(.body | test("🤖 Review by")) | "=== \(.createdAt) ===\n\(.body)\n"'
```
- A push (`synchronize`) cancels the in-progress run and posts a **fresh batch** (3 comments), so take the **most recent comment per model** (group by the `Review by <model>` header; newest `createdAt` wins). Ignore older batches.
- If no `🤖 Review by` comments exist yet, the review may still be running — check `gh run list --workflow=ai-review.yml --branch <branch>`; wait for it to finish before proceeding.

### Copilot (only if present)
```bash
gh api repos/{owner}/{repo}/pulls/<PR>/reviews          # find latest where user.login ~ copilot, note id
gh api repos/{owner}/{repo}/pulls/<PR>/reviews/<id>/comments
```

## Step 3 — Parse self-hosted findings

Each comment body contains:
- Findings as bullets: `[severity] path:line — problem, then the fix`
- A final line: `VERDICT: APPROVE` or `VERDICT: CHANGES NEEDED`

**Severity tiers** (from the reviewer agent):
- `[critical]` — breaks production, leaks data, or is exploitable. **Presumptively REAL — verify and fix.**
- `[warning]` — a real bug or measurable regression. **Presumptively REAL — verify and fix.**
- `[suggestion]` — an improvement, never blocks. **Fix only if low-cost and correct; otherwise record as skipped with a one-line reason.**

Do **not** defer to the `VERDICT` line for what to fix — an `APPROVE` review can still carry a real `[warning]`, and a `CHANGES NEEDED` can be a false positive. Evaluate every finding on technical merit.

## Step 4 — Aggregate + dedupe across models

The 3 models overlap and sometimes **disagree on the same code** (e.g. one flags an RLS policy as a leak, another calls the security model correct). Therefore:
- **Group findings by `(file, line, gist)`.** A point raised by multiple models is one item, not three.
- **When models conflict, resolve it by reading the code yourself** — open the file, confirm the actual behavior (RLS/PostgREST exposure, outlier filtering, FK existence, etc.). The verdict that matches the code wins; don't average opinions.
- A real issue raised by only ONE model is still real — coverage, not consensus, decides.

## Issue Classification

For EACH finding, classify REAL or FALSE.

### REAL (Must Fix)
- Actual bugs / logic errors, unhandled null/undefined, wrong async/await
- Security or data-exposure issues (e.g. `FOR SELECT USING (true)` exposing raw rows/provenance via PostgREST; RLS not mirroring public-card filters)
- Missing error handling that could crash
- Measurable performance problems
- Incorrect API usage / broken functionality, race conditions, data corruption

### FALSE (Skip, with reason)
- Style/formatting/naming (ESLint/Prettier own these)
- Framework-pattern misunderstandings (e.g. Next.js async params)
- Suggestions on code that already handles the case correctly
- Overly pedantic / unnecessary-complexity suggestions
- Duplicate of another finding already fixed

## Output Format (before fixing)
List the deduped analysis, noting which models raised each and the severity:
```
F1 (catalog_price_points.sql:55) [critical] GPT-5.5: REAL — public RLS USING(true) exposes provenance + inactive catalogs → restrict policy / drop columns
F2 (primary_image_trigger.sql:41 + catalog_price_points.sql:326) [warning] Kimi: REAL — hero-image query omits is_publicly_visible/moderation_status filters
F3 (price-graph.tsx:131) [suggestion] GLM: SKIP (cosmetic) — externalCount badge edge case, doesn't affect series
F4 (estimate-catalog-prices/route.ts) [suggestion] GLM: REAL (cheap) — fail fast when SYSTEM_USER_ID unset instead of hardcoded UUID
```
Then fix all REAL items.

## Database Migration Rules

**NEVER edit an existing migration file** — it may already be applied. Create a NEW migration that alters/drops/recreates the object (e.g. fixing an RPC from `20260626120000_x.sql` → new `20260626150000_fix_x.sql` that `CREATE OR REPLACE`s it). After schema changes, run `npm run gen:types`.

## Verify
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "^.next/" | grep -c "error TS"   # expect 0
npm run lint
```

## Commit Message Format
```
fix: address PR review feedback

- Fixed: [brief description of each REAL issue fixed]
- Skipped: [count] suggestion(s)/false positive(s) — [one-line reason each]
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Step 9 — Re-trigger review (source-aware)

- **Self-hosted:** pushing the fix commit auto-re-runs `ai-review.yml` (it triggers on `pull_request: synchronize`, `cancel-in-progress`). Nothing extra needed. To force a run without a push: `gh workflow run ai-review.yml --ref <branch>`. The reviewer is re-review-aware and will only re-raise what's still relevant.
- **Copilot:** `gh pr edit <PR> --add-reviewer @copilot`.

## Step 10 — Report
- PR number and which source(s) were reviewed (and which models)
- Findings analyzed, deduped count, how many REAL (fixed) vs skipped (with reasons)
- That review was re-triggered (auto on push for self-hosted)
- Suggest re-running this skill after the new review batch lands
