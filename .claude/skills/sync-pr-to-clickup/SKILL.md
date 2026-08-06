# Sync PR to ClickUp

Sync a GitHub PR description to a ClickUp task in Hungarian, and create a manual testing subtask.

## Arguments

This skill requires one argument and has one optional argument:
1. **PR number** (required) - The GitHub PR number (e.g., `69`)
2. **ClickUp task URL** (optional) - The ClickUp task URL (e.g., `https://app.clickup.com/t/86c7rxmhm`)

Examples:
- Update existing task: `/sync-pr-to-clickup 69 https://app.clickup.com/t/86c7rxmhm`
- Create new task: `/sync-pr-to-clickup 69`

## Workflow

### Step 1: Parse Arguments
Extract the PR number and (optionally) the ClickUp task ID from the arguments.
- If a ClickUp URL is provided, extract the task ID from the last segment (e.g., `86c7rxmhm` from `https://app.clickup.com/t/86c7rxmhm`)
- If no ClickUp URL is provided, a new task will be created in the Testing list

### Step 2: Fetch PR Details
Get the PR description from GitHub:
```bash
gh pr view {PR_NUMBER} --json title,body
```

### Step 3: Determine Task Mode

**Mode A — Existing task (ClickUp URL provided):**
- Use `mcp__clickup__clickup_get_task` to fetch current task details
- Get the `list_id` for creating subtasks
- Continue to Step 4

**Mode B — New task (no ClickUp URL):**
- A new task will be created in Step 5
- Use list ID `901520272158` (Testing list in Cardstrade space)

### Step 4: Translate PR Description to Hungarian
Translate the PR description to Hungarian, maintaining:
- Technical terms (API endpoints, database fields, etc.)
- Markdown formatting
- Code blocks unchanged

### Step 5: Create or Update ClickUp Task

**Mode A — Update existing task:**
- Tool: `mcp__clickup__clickup_update_task`
- Set `markdown_description` with the Hungarian translation
- Add a link to the GitHub PR at the bottom

**Mode B — Create new task:**
- Tool: `mcp__clickup__clickup_create_task`
- `name`: Use the PR title (translated to Hungarian)
- `list_id`: `901520272158` (Testing list)
- `markdown_description`: Hungarian translation of the PR description + GitHub PR link at the bottom
- Save the returned task ID for creating the subtask

### Step 6: Extract Test Plan
From the PR description, extract the "Test plan" section if it exists.
If no test plan exists, generate one based on the PR changes.

### Step 7: Create Testing Subtask
Use the ClickUp MCP tool to create a subtask:
- Tool: `mcp__clickup__clickup_create_task`
- Name: "Manualis tesztelesi utmutato" (Manual testing guide)
- Set `parent` to the main task ID (existing or newly created)
- Set `list_id`: use the list from the existing task (Mode A) or `901520272158` (Mode B)
- Include detailed testing steps in Hungarian with checkboxes

## Translation Guidelines

### Section Headers
- Summary → Osszefoglalo
- Features → Funkciok
- Database Schema → Adatbazis sema
- API Endpoints → API vegpontok
- Security → Biztonsag
- Test plan → Tesztelesi terv
- Environment Variables → Kornyezeti valtozok

### Common Terms
- tracking → kovetes
- click → kattintas
- signup/registration → regisztracio
- referral → ajanlas/referral
- user → felhasznalo
- dashboard → dashboard (keep as-is)
- cookie → cookie (keep as-is)
- hash → hash (keep as-is)

### Testing Subtask Structure
The testing subtask should include:
1. **Elofeltelek** (Prerequisites) - environment setup, migrations, etc.
2. **Tesztelesi forgatokonyvek** (Test scenarios) - numbered sections with:
   - Clear steps as checkboxes `- [ ]`
   - **Elvart:** (Expected:) results for each test
3. **Biztonsagi tesztek** (Security tests) - edge cases and error handling

## Output

After completion, report:
- Created/updated task URL
- Created subtask URL
- Summary of what was synced

## Example Output (existing task)

```
PR #69 synced to ClickUp:
- Task updated: https://app.clickup.com/t/86c7rxmhm
- Subtask created: https://app.clickup.com/t/86c7uvmaf

Synced content:
- PR title and description (translated to Hungarian)
- 8 test scenarios in manual testing subtask
```

## Example Output (new task)

```
PR #91 synced to ClickUp:
- Task created: https://app.clickup.com/t/86c8abcde
- Subtask created: https://app.clickup.com/t/86c8fghij

Synced content:
- New task created in Testing list with PR title and description (translated to Hungarian)
- 5 test scenarios in manual testing subtask
```
