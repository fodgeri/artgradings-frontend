---
name: update-deps
description: Audit and update npm dependencies to latest stable versions safely, respecting compatibility constraints. Run npm audit, classify updates by risk, update in groups, and verify build.
argument-hint: "--security-only | --dry-run"
---

# Update Dependencies

Safely update all npm dependencies to their latest stable versions while respecting inter-package compatibility constraints. Updates are grouped by risk tier, verified after each group, and reported at the end.

## Arguments

- `--security-only` — Only apply updates that fix known vulnerabilities (from `npm audit`)
- `--dry-run` — Analyze and report what would be updated, but don't actually install anything
- No arguments — Full update of all packages to latest stable

## Workflow

1. **Audit** — assess current state
2. **Classify** — sort packages into risk-ordered groups
3. **Check constraints** — verify compatibility pairs before updating
4. **Update in groups** — install each group, verify build after each
5. **Final verification** — full build + lint
6. **Report** — summary of changes, skips, and any issues

---

## Step 1: Audit Current State

Run these commands in parallel to understand what needs updating:

```bash
npm audit 2>&1 || true
```

```bash
npm outdated --long 2>&1 || true
```

```bash
cat package.json | node -e "const p=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(p); console.log('overrides:', JSON.stringify(j.overrides||{},null,2))"
```

Record:
- Total vulnerabilities by severity (critical, high, moderate, low)
- Packages that are outdated and their current → wanted → latest versions
- Any `overrides` in package.json that must be kept in sync

---

## Step 2: Classify Updates into Risk Tiers

Process packages from `npm outdated` output and sort them into these groups, **in order of priority**:

### Tier 1: Security Fixes (Critical + High)
Packages flagged by `npm audit` with critical or high severity. These are updated first.

### Tier 2: Ecosystem Syncs (Must-Match Pairs)
Packages that must be updated together. See the **Compatibility Constraints** section below.

### Tier 3: Safe Minor/Patch Updates
Non-0.x packages where the update is a minor or patch bump. These are generally safe.

### Tier 4: Major Version Bumps
Non-0.x packages with a new major version. Check changelogs for breaking changes.

### Tier 5: 0.x Packages (Minor = Breaking)
Packages on version 0.x where even minor bumps can be breaking. Always check changelogs.

### Already at Latest (Skip)
Do NOT attempt to update packages that are already at their latest version. Check `npm outdated` — if a package does not appear, it's already current.

If `--security-only` flag was passed, ONLY process Tier 1 packages plus any Tier 2 pairs that include a Tier 1 package.

---

## Step 3: Compatibility Constraints

**CRITICAL**: Before updating any package in a constrained pair, check that the versions are compatible. Update constrained packages TOGETHER in a single `npm install` command.

### Must-Match Pairs

| Packages | Rule | How to Check |
|---|---|---|
| `@supabase/ssr` ↔ `@supabase/supabase-js` | `@supabase/ssr` declares peerDep on supabase-js | `npm view @supabase/ssr@latest peerDependencies` |
| `tailwindcss` ↔ `@tailwindcss/postcss` | Must be exact same version | `npm view @tailwindcss/postcss@latest version` |
| `three` ↔ `@types/three` | Must match major.minor | `npm view three@latest version` and `npm view @types/three@latest version` |
| `next` ↔ `eslint-config-next` | Should match major.minor | `npm view eslint-config-next@latest version` |
| `@aws-sdk/client-s3` ↔ `@aws-sdk/s3-request-presigner` | Must use same version | Update both to same version |
| `@types/react` ↔ `@types/react-dom` | Must match exactly | Update both together |

### Version Lock Rules

| Package | Rule |
|---|---|
| `eslint` | Stay on current major unless `eslint-config-next` explicitly supports the next major. Check: `npm view eslint-config-next@latest peerDependencies` |
| `@types/node` | Stay on current major unless the project's Node.js engine version changes |
| `@types/react` / `@types/react-dom` | After updating, also update the `overrides` section in `package.json` to match |

### 0.x Packages (Minor = Breaking)

These packages follow 0.x semver where minor version bumps can contain breaking changes. **Do NOT auto-update** — check changelogs first:

- `@anthropic-ai/sdk`
- `lucide-react`
- `meilisearch`
- `sharp`
- Any other package with version < 1.0.0

For each 0.x package with an available update:
1. Run `npm view <package>@latest version` to see the target version
2. Check the changelog or release notes for breaking changes
3. If breaking changes exist, note them in the report and **skip** the update (unless it's a security fix)
4. If no breaking changes, include in the update

---

## Step 4: Update in Groups

For each tier (in order 1 → 5), do the following:

### 4a. Install the Group

```bash
npm install <package1>@latest <package2>@latest ...
```

For constrained pairs, always install them in the same command:
```bash
npm install tailwindcss@latest @tailwindcss/postcss@latest
```

For `@types/react` and `@types/react-dom`, after installing also update `package.json` overrides:
```bash
# Check current overrides
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.overrides)"
# Then edit package.json to update the overrides section to match the new @types/react version
```

### 4b. Verify After Each Group

After each group of updates, run:

```bash
npm run build 2>&1
```

If the build **fails**:
1. Read the error output carefully
2. Determine which package from the group caused the failure
3. Revert the problematic package: `npm install <package>@<previous-version>`
4. Add the package to the "skipped" list with the reason
5. Re-run build to confirm it passes before moving to the next group

If the build **passes**, move to the next group.

### 4c. Dev Dependencies

Dev dependencies (`@types/*`, `eslint-*`, `tsx`, etc.) should be installed with `--save-dev`:
```bash
npm install --save-dev <package>@latest
```

---

## Step 5: Final Verification

After all groups are processed:

```bash
npm run build
```

```bash
npm run lint
```

```bash
npm audit 2>&1 || true
```

If lint fails with auto-fixable issues:
```bash
npm run lint -- --fix
```

---

## Step 6: Report

Present a summary table to the user:

```
## Dependency Update Report

### Updated
| Package | Previous | New | Tier |
|---|---|---|---|
| @aws-sdk/client-s3 | 3.x.x | 3.y.y | Security |
| ... | ... | ... | ... |

### Skipped (with reasons)
| Package | Available | Reason |
|---|---|---|
| sharp | 0.33.x | 0.x package, breaking changes in changelog |
| ... | ... | ... |

### Already at Latest
- package1, package2, package3, ...

### Vulnerability Summary
- Before: X critical, Y high, Z moderate
- After: X critical, Y high, Z moderate

### Build Status: PASS / FAIL
### Lint Status: PASS / FAIL
```

If `--dry-run` was passed, present the same report but with "Would update" / "Would skip" language and do NOT actually install anything.

---

## Important Notes

- **Never use `npm update`** — it only updates within semver ranges in package.json. Always use `npm install <package>@latest` for actual updates.
- **Never use `--force` or `--legacy-peer-deps`** unless a specific peer dep conflict is analyzed and confirmed safe. If peer dep conflicts arise, report them and let the user decide.
- **Lock file**: `package-lock.json` will be modified. This is expected. Do NOT delete it.
- **Do not commit** — just update. The user will decide when to commit (or use `/git-pr-workflow`).
- **Check `npm outdated` output carefully** — the "Wanted" column shows the max version allowed by the current semver range in package.json, while "Latest" shows the actual latest published version. We want to go to "Latest".
