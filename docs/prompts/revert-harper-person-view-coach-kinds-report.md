# Revert Harper person-view coach-kinds — report

## 1. Revert commit

- **Hash:** `fa1edab7e1497d98747c309a4ec500ec4b63eba2`
- **Message:** Revert "Fix Harper person-view rendering for flagAnswers, drill, and gap coach kinds."
- **Reverts:** `9185503f74220a853943a606e972b8e4e3be2747`
- **Branch:** `checkpoint/harper-prep-hub`
- **Method:** `git revert 9185503` (no force-push, no history rewrite)

**Files changed by the revert commit:**

| Path | Change |
|------|--------|
| `src/components/CheatSheetPersonBody.tsx` | restored pre-9185503 |
| `src/components/HarperPersonView.tsx` | restored pre-9185503 |
| `src/lib/application-summary/coach.ts` | restored pre-9185503 |
| `src/lib/consultation/harper-person-view-coach-kinds.test.ts` | deleted |

Conflict during revert: `docs/prompts/harper-person-view-coach-kinds-fix-report.md` (modify/delete vs `d976746`). Prompt and report for the rejected change were **kept** in `docs/prompts/` as instructed. No new application code was added.

## 2. No restored sections remain

- `src/` has **zero** matches for `showRoleKindCoachSections` or `personSectionRoleCoachViews` (only historical mentions in `docs/prompts/`).
- `CheatSheetPersonBody.tsx` has **no** restored Recruiter / Hiring Manager coach section blocks.
- `git diff 655eff6 HEAD -- src/` is empty (application code matches tip before the rejected change).
- `git diff 655eff6 HEAD` is docs-only: kept coach-kinds prompt + report under `docs/prompts/`.

## 3. Checks

| Check | Result |
|-------|--------|
| Full suite (+ real Postgres via `npm run db:test:up`) | **253** files / **1883** tests pass |
| `npx tsc --noEmit -p tsconfig.json` | pass |
| `npm run lint` | pass (0 errors; 2 pre-existing warnings in `step0-assess-hiring-team-drafts.ts`) |
| `npm run build` | pass |

## 4. Push / main

- Pushed `checkpoint/harper-prep-hub` with a normal push (no `--force`).
- **main was not merged, not checked out for change, and not pushed.**
