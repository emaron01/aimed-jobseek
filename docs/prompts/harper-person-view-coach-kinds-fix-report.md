# REPORT — Harper person-view coach kinds (flagAnswers, drill, gap)

**Repo:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git`  
**Branch:** `checkpoint/harper-prep-hub`  
**Prompt:** `docs/prompts/harper-person-view-coach-kinds-fix.md`

---

## 0. STEP 0 — Deployed commit check (`6540360..655eff6`)

| Commit | Message | Files |
|--------|---------|-------|
| `5e9b0de` | Harper Batch B3: person view, search, Add Interview Contact, and assign-only Stage interviewer. | **Code + docs** (actions, ConsultationSection, HarperPeopleFilter, HarperPersonView, stages, interview config, tests, B3 prompt/report) |
| `8b8e7e7` | Document Harper Batch B3 commit hash in the implement report. | **docs only** (`harper-batch-b3-implement-report.md`) |
| `14b6fcd` | Fix Harper B3 person-view coach answers (once, inline) and Stage interview help text. | **Code + docs** (CheatSheetCoachItems/PersonBody, HarperPersonView, harper-layout, interview sectionHelp, tests, answer-fix prompt/report) |
| `655eff6` | Document Harper B3 person-view answer-fix commit hash. | **docs only** (`harper-b3-person-view-answer-fix-report.md`) |

**Plain statement:** Commits other than `5e9b0de` and `14b6fcd` in this range (`8b8e7e7`, `655eff6`) change **only docs/**. No non-approved code slipped in via those tip commits. Production at `655eff6` is the tip of the approved B3 + answer-fix chain (plus two docs-only follow-ups).

---

## 1. Report-first findings

### Where they render on Cheat Sheet today
- **Nowhere in current UI.** `CheatSheetPersonBody` only wires `section.likelyQuestions` into `CheatSheetCoachItems`.
- Labels still exist in `applicationSummaryConfig.sections` (`flagAnswers`, `drillDowns`, etc.) but are unused on the summary page.
- **Historical UI** (removed in `e0df7cf`): recruiter block (60-second summary, why company/role, logistics, compensation, **flagAnswers** with answer forms) and hiring-manager block (scorecard, first 90 days, **drillDowns**, **gaps** with answer forms) — see `7812234` `CheatSheetPersonBody`.

### Generation / harperQuestion
- **Current prompt** (`application-summary.ts` person mode) asks only for caresAbout / positioning / keyStatements / **likelyQuestions** / questionsToAsk — does **not** instruct recruiter.flagAnswers or hiringManager.drill/gaps.
- **Legacy prompt** (pre-simplification) did generate those with sampleAnswer XOR harperQuestion for RECRUITER / HIRING_MANAGER section kinds.
- `assignCoachItemIds` / `collectCoachItems` / `answerCheatSheetCoachItem` still support these ids (`:flagAnswers:`, `:drill:`, `:gap:`).
- Fixture/`cheat-sheet-coach.test.ts` still stores HM **gaps** with `harperQuestion` and answers them via the existing path → turns `cheatSheet:{itemId}`.

### Answers as turns
- Yes, when answered: `targetKey = cheatSheet:{itemId}` (e.g. `cheatSheet:contact:c1:gap:1`). Those can appear in interviewer QuestionList unless excluded by profile ids.

---

## 2. What changed

Harper-only (`showRoleKindCoachSections`, default **false** so Cheat Sheet unchanged):
- Restore recruiter + HM surrounding guidance + `CheatSheetCoachItems` for flagAnswers / drillDowns / gaps (`CheatSheetPersonBody.tsx`).
- `personSectionRoleCoachViews` / `personProfileCoachItemIds` in `coach.ts`.
- Harper passes `showRoleKindCoachSections` and uses full profile coach ids for dedupe (`HarperPersonView.tsx`).

---

## 3. Files changed

**New:** prompt, this report, `harper-person-view-coach-kinds.test.ts`  
**Modified:** `coach.ts`, `CheatSheetPersonBody.tsx`, `HarperPersonView.tsx`

---

## 4. Tests / checks

**Added:** `src/lib/consultation/harper-person-view-coach-kinds.test.ts`  
**Changed existing:** none

| Check | Result |
|-------|--------|
| Full suite (+ Postgres) | **254** files / **1888** tests pass |
| `npx tsc --noEmit -p tsconfig.json` | pass |
| `npm run lint` | pass (0 errors) |
| `npm run build` | pass |

---

## 5. Commit / branch

- Branch: `checkpoint/harper-prep-hub`
- Commit: _(after push)_
- Not merged to main; main not pushed.

---

## 6. Scope

Cheat Sheet default path unchanged. No Stage/Outreach/prompts/paid-call changes. Render still enqueue-free.
