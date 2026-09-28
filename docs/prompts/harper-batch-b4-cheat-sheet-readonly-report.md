# Harper Batch B4 — Cheat Sheet read-only — report

## 1. Forms removed and links added

### Forms removed from the Cheat Sheet page

| Former form | Where | Change |
|-------------|-------|--------|
| Coach reply `ApplicationActionForm` / `answerCheatSheetCoachAction` under likely questions | `CheatSheetCoachItems.tsx` (was ~85–106); shown when CS passed default `showCoachAnswerForms` | Summary page now passes `showCoachAnswerForms={false}` and `harperLinkContactId` (`summary/page.tsx` **279–280**). Read-only branch never mounts the reply form (`CheatSheetCoachItems.tsx` **51–52**, **64–134**). |
| Harper `QuestionList` reply/edit forms for coach QA on CS | Same widget when `qaItems` present | CS read-only path displays answer text + link only; does not render `QuestionList` (`CheatSheetCoachItems.tsx` **64–134**). |

Build persona / generate section / regenerate cheat sheet forms **kept** (`CheatSheetPersonBody.tsx`, `summary/page.tsx` **203–211**).

Harper person view still uses answer forms (`HarperPersonView.tsx` keeps `showCoachAnswerForms` without `harperLinkContactId`).

### Links added

| Link | When | Target | File / lines |
|------|------|--------|--------------|
| **Edit** | Answered coach item with ConsultationTurn | `/campaigns/{id}/consultation?person=contact:{contactId}#harper-q:{questionTurnId}` | `CheatSheetCoachItems.tsx` **77–84**; `workspaceHarperQuestionHref` in `workspace-links.ts` |
| **Edit** | Answered with `sampleAnswer` only (no turn yet) | `…#harper-coach:{itemId}` | `CheatSheetCoachItems.tsx` **85–87** |
| **Answer** | Unanswered needing input; turn exists | `…#harper-q:{questionTurnId}` | `CheatSheetCoachItems.tsx` **77–84** |
| **Answer** | Unanswered needing input; no turn | `…#harper-coach:{itemId}` | `CheatSheetCoachItems.tsx` **88–90** |

Labels: `consultationConversationCopy.editAnswer` = `"Edit"`, `answerGap` = `"Answer"`.

### Anchor format for unanswered coach items (no turn)

**`harper-coach:{coachItemId}`** — e.g. `harper-coach:contact:{contactId}:likely:1`

- Helper: `harperCoachItemAnchorId` in `harper-layout.ts` **29–34**
- Set as `id` on each coach `<li>` in `CheatSheetCoachItems.tsx` (**61**, **95**, **137**) so Harper person view has the target
- Fragment only; never shown as visible text

Deep-link person selection: `?person=contact:{id}` on Harper (`consultation/page.tsx`, `HarperFilterProvider` `initialPersonKey`).

---

## 2. Notes From Interviews With {Name}

**Compiler:** `compileNotesFromInterviewsWithPerson` / `notesFromInterviewsWithHeading` in `interview-notes.ts`.

**Sources (per contact):**
1. Newly gained information — `cheatSheetNotesJson` via `notesByContactId`
2. Notes before / notes after — every stage where the contact is an interviewer

**Order:** by interview/note date, then kind (gained → before → after). Deduped by stable `id`.

**UI:** `NotesFromInterviewsSection` in `CheatSheetPersonBody.tsx`; heading exactly `Notes From Interviews With {Name}`. Renders nothing when the list is empty.

**Did any of these already render on the Cheat Sheet?**
- **Yes — newly gained notes** under `applicationSummaryConfig.sections.gainedInformation` ("What you learned for this interview") in each person body.
- **Partially — notes after** appeared in the bottom Interview stages list as `stageType: notesAfter` (not per person, no notes before).
- **No — notes before** were not on the Cheat Sheet.

**Once:** Person sections now own the compiled list (replacing the old gained-information block for contacts). The stages list no longer inlines `notesAfter` (`summary/page.tsx`), so each note text appears once on the page for that person section.

---

## 3. Files changed

| File | Role |
|------|------|
| `docs/prompts/harper-batch-b4-cheat-sheet-readonly.md` | Prompt |
| `docs/prompts/harper-batch-b4-cheat-sheet-readonly-report.md` | This report |
| `src/app/(app)/campaigns/[id]/summary/page.tsx` | Read-only CS; notes; coach QA load |
| `src/app/(app)/campaigns/[id]/consultation/page.tsx` | Pass `?person=` |
| `src/components/CheatSheetCoachItems.tsx` | Read-only links + coach anchors |
| `src/components/CheatSheetPersonBody.tsx` | Interview notes section; link props |
| `src/components/ConsultationSection.tsx` | `initialPersonKey` → filter |
| `src/components/HarperPeopleFilter.tsx` | Select person + scroll to `harper-q` / `harper-coach` |
| `src/lib/application/workspace-links.ts` | Question / coach / contact hrefs with `?person=` |
| `src/lib/consultation/harper-layout.ts` | `harperCoachItemAnchorId` |
| `src/lib/application-summary/interview-notes.ts` | **New** notes compiler |
| `src/lib/application-summary/coach-qa.ts` | **New** read-only coach QA load |
| `src/lib/consultation/harper-batch-b4.test.ts` | **New** B4 tests |
| `src/lib/consultation/harper-b3-person-view-answer-fix.test.ts` | Updated CS assertion for B4 |

---

## 4. Tests

**Added:** `src/lib/consultation/harper-batch-b4.test.ts` — no CS answer forms; Edit/Answer hrefs + anchors; content/search/print; notes compile once / empty hidden; generation controls; no enqueue/paid call.

**Changed existing:** `harper-b3-person-view-answer-fix.test.ts` — the case that asserted “CS still shows answer forms (unchanged until B4)” now asserts B4 read-only CS + Harper keeps forms. **Why:** B4 deliberately removes CS answering; leaving the old assertion would fail for the correct product change.

| Check | Result |
|-------|--------|
| Full suite (+ Postgres) | **254** files / **1891** tests pass |
| `npx tsc --noEmit -p tsconfig.json` | pass |
| `npm run lint` | pass (0 errors; 2 pre-existing warnings) |
| `npm run build` | pass |

---

## 5. Commit / branch

- Branch: `checkpoint/harper-prep-hub`
- Commit: *(filled after commit)*
- Pushed checkpoint only; **main not merged or pushed**

---

## 6. Unchanged scope

Harper beyond anchors / person deep-link select+scroll; Stage; Outreach; Harper prompts/planning; learnings; cheat-sheet generation/regenerate/build controls; Phase 1 gate; serialization; paid calls — **unchanged**. Rendering loads coach QA and notes read-only (no enqueue, no `runPaidStructuredCall`).
