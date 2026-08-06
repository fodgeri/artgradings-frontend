---
name: git-pr-workflow
description: Create a new branch, commit changes, push to GitHub, and create a PR. Use when you're ready to submit your changes for review.
argument-hint: [branch-name, optional - will be auto-generated from commit message if not provided]
---

# Git PR Workflow

Create a new branch from current changes, commit, push to GitHub, and create a pull request.

## Workflow

1. **Check git status**: Review uncommitted changes
2. **Create branch**: Create a new feature branch
3. **Stage files**: Add relevant files (exclude local settings)
4. **Commit**: Create a descriptive commit message
5. **Push**: Push branch to origin with upstream tracking
6. **Create PR**: Open a pull request on GitHub

## Commands to Run

### Step 1: Check Current State
```bash
git status
git diff --stat
git log --oneline -3
```

### Step 2: Create New Branch
Use a descriptive branch name following the convention:
- `feat/` for new features
- `fix/` for bug fixes
- `refactor/` for refactoring
- `docs/` for documentation

```bash
git checkout -b feat/your-feature-name
```

### Step 3: Stage Files
Stage specific files, excluding local settings:
```bash
git add path/to/file1 path/to/file2
```

**Files to typically EXCLUDE:**
- `.claude/settings.local.json`
- `.env.local`
- `node_modules/`
- Any local configuration files

### Step 4: Commit Changes
Use conventional commit format with a descriptive message:
```bash
git commit -m "$(cat <<'EOF'
feat: short description of change

- Detail 1
- Detail 2
- Detail 3

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Commit message conventions:**
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `test:` - Test additions/changes

### Step 5: Push to Origin
```bash
git push -u origin your-branch-name
```

### Step 6: Create Pull Request
```bash
gh pr create --title "feat: short description" --body "$(cat <<'EOF'
## Summary
- Change 1
- Change 2
- Change 3

## Test plan
- [ ] Test case 1
- [ ] Test case 2
- [ ] Test case 3

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## PR Body Template

```markdown
## Summary
- Brief bullet points of what changed

## Test plan
- [ ] Manual testing steps
- [ ] Edge cases to verify
- [ ] Regression checks

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Output

After completion, report to the user:
- Branch name created
- Commit hash and message summary
- PR URL
- Any warnings (uncommitted files, etc.)

## Tips

- Always run `npm run lint` and `npx tsc --noEmit` before committing
- Keep commits focused on a single logical change
- Write PR descriptions that help reviewers understand the context
- Link related issues in the PR body if applicable
