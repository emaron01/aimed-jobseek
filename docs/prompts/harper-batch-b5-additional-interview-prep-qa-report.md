# Harper Batch B5 — Additional Interview Prep Q&A — report

## 1. Direct roles and where the section renders

**Identification:** Hiring Team persona `involvement === "DIRECT"` (from persona profile JSON via `personaNarrative` / `buildCheatSheetPeople`). Indirect and unknown → no section.

**Renders (display-only):**
- Harper person view: `HarperPersonInlineProfile` → `AdditionalInterviewPrepQa` (`HarperPersonView.tsx` after primary Q&A; entries from `ConsultationSection.tsx` ~789–817).
- Cheat Sheet person section (including print): `CheatSheetPersonBody` → same component (`summary/page.tsx` ~280–307; body end of person content). Heading: exact string `Additional Interview Prep Q&A`.

## 2. Answered-question list: assemble, order, exclude

**Assemble:** `consultationItemIsAnswered` — has talking point, resume bullet, or non-empty seeker answer; ignored items excluded.

**Order (Harper display order):** `orderedAnsweredHarperQuestions` —
1. Dedicated standing topics (why-this-company, chronology, …)
2. Standing requirement rows (same order as Where you stand UI)
3. Interviewer sections (layout / stage-date order)

**Exclude within a profile:** drop turn ids already in that contact’s interviewer section (coach + person-prep) via `profilePrimaryQuestionTurnIdsFromInterviewerSection`. Empty list → component returns `null` (no heading).

**Answer text:** `consultationItemDisplayAnswer` — talking point, else resume bullet, else latest seeker reply (same records Harper’s primary card uses).

## 3. Edit link targets

| Item home | Href |
|-----------|------|
| Standing / general | `/campaigns/{id}/consultation#harper-q:{questionTurnId}` (`workspaceHarperStandingQuestionHref`) |
| Another person’s primary card | `…?person=contact:{id}#harper-q:{questionTurnId}` |
| Coach item fallback | `…#harper-coach:{itemId}` when needed |

No forms in the section — text link `"Edit"` only.

## 4. Files changed

| File | Role |
|------|------|
| `docs/prompts/harper-batch-b5-additional-interview-prep-qa.md` | Prompt |
| `docs/prompts/harper-batch-b5-additional-interview-prep-qa-report.md` | This report |
| `src/lib/consultation/additional-prep-qa.ts` | **New** assemble / filter / heading |
| `src/lib/consultation/harper-display-qa.ts` | **New** read-only load for Cheat Sheet |
| `src/components/AdditionalInterviewPrepQa.tsx` | **New** display-only UI |
| `src/components/HarperPersonView.tsx` | Mount section |
| `src/components/CheatSheetPersonBody.tsx` | Mount section |
| `src/components/ConsultationSection.tsx` | Compute entries; pass involvement |
| `src/app/(app)/campaigns/[id]/summary/page.tsx` | Direct CS entries |
| `src/lib/application/workspace-links.ts` | Standing question href |
| `src/lib/consultation/harper-batch-b5.test.ts` | **New** tests |

## 5. Tests

**Added:** `harper-batch-b5.test.ts` — Direct/Indirect; order; no repeats; empty hidden; Edit hrefs; same records; invariant; no enqueue/paid call; CS+Harper wiring.

**Changed existing:** none.

| Check | Result |
|-------|--------|
| Full suite (+ Postgres) | **255** files / **1898** tests pass |
| `npx tsc --noEmit -p tsconfig.json` | pass |
| `npm run lint` | pass (0 errors; 2 pre-existing warnings) |
| `npm run build` | pass |

## 6. Commit / branch

- Branch: `checkpoint/harper-prep-hub` (updated from main before work)
- Commit: `72dc5bb5f638cf1fa9fc12d7a1cebc41abd95487`
- Pushed checkpoint only; **main not merged or pushed**

## 7. Unchanged scope

Asking, answering, storage, Harper prompts/planning, learnings, Stage, Outreach, cheat-sheet generation, Phase 1 gate, serialization, paid calls — **unchanged**. Section is a secondary display of existing `ConsultationQaItem` records; render invariant still uses primary slots only.
