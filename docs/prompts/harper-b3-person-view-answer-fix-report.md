# REPORT — Harper B3 person-view answer fix + Stage help text

**Repo:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git`  
**Branch:** `checkpoint/harper-prep-hub`  
**Prompt:** `docs/prompts/harper-b3-person-view-answer-fix.md`

---

## 1. Report-first findings

### Coach item kinds that can need seeker input
Need input when `harperQuestion` is set (`CheatSheetCoachItems.tsx` / `coachItemIsComplete` in `coach.ts` **19–23**). ID prefixes from `assignCoachItemIds` (`coach.ts` **70–118**):

| Kind | ID pattern | Shown in person profile? |
|------|------------|--------------------------|
| Overview gaps | `overview:gap:{n}` | No (standing / B3) |
| Likely questions | `{sectionKey}:likely:{n}` | **Yes** — only coach list in `CheatSheetPersonBody` |
| Recruiter flag answers | `{sectionKey}:flagAnswers:{n}` | No (guidance only; not in PersonBody) |
| HM drill-downs | `{sectionKey}:drill:{n}` | No |
| HM gaps | `{sectionKey}:gap:{n}` | No |

### How CheatSheetPersonBody rendered each (before this fix)
- caresAbout / positioning / keyStatements / questionsToAsk: display only (`CheatSheetPersonBody.tsx` **112–175**).
- likelyQuestions → `CheatSheetCoachItems` with `canEdit && showCoachAnswerForms` (**146–150**). Harper passed `showCoachAnswerForms={false}` so unanswered `harperQuestion` items had **no** answer form on Harper.
- Answer path when forms on: `answerCheatSheetCoachAction` → `answerCheatSheetCoachItem` (`service.ts` **959+**), creates `cheatSheet:{itemId}` turns.

### Double render?
**Yes.** After answering, the turn lands in `interviewerSection` → separate `QuestionList` (`HarperPersonView` previously **159–173**), while the profile still showed `sampleAnswer` under the same likely question.

---

## 2. What changed (file and line)

1. **Inline answers on Harper** — `CheatSheetCoachItems.tsx`: forms when `canEdit && !jobsActive`; if a matching Harper QA item exists, render `QuestionList` once under the coach prompt (`cheat-sheet-coach-harper-qa`). `HarperPersonView.tsx`: `showCoachAnswerForms` on, passes `coachQaItems` / `jobsActive` / `showReply`.
2. **Each question once** — `personViewListQuestions` / `coachItemIdFromCheatSheetTarget` in `harper-layout.ts`; list excludes profile likely-question coach turns; person-prep stays in `harper-person-qa`.
3. **Batch A Edit / Show replies / Ignore** — via `QuestionList`/`QuestionCard` under the coach item when a turn exists.
4. **Stage help** — `interview.ts` `sectionHelp` set to the exact new string.

---

## 3. Every file changed

**New**
- `docs/prompts/harper-b3-person-view-answer-fix.md`
- `docs/prompts/harper-b3-person-view-answer-fix-report.md`
- `src/lib/consultation/harper-b3-person-view-answer-fix.test.ts`

**Modified**
- `src/components/CheatSheetCoachItems.tsx`
- `src/components/CheatSheetPersonBody.tsx`
- `src/components/HarperPersonView.tsx`
- `src/lib/consultation/harper-layout.ts`
- `src/lib/product-config/interview.ts`
- `src/lib/consultation/harper-batch-b3.test.ts` (expect forms on Harper, not `showCoachAnswerForms={false}`)

---

## 4. Tests

**Added:** `harper-b3-person-view-answer-fix.test.ts` — all prompt assertions.

**Changed:** `harper-batch-b3.test.ts` — B3 no longer forces `showCoachAnswerForms={false}`; asserts forms + `personViewListQuestions` instead.

**Results**
- Full suite: **253** files / **1883** tests pass (Postgres)
- `npx tsc --noEmit -p tsconfig.json`: pass
- `npm run lint`: pass (0 errors)
- `npm run build`: pass

---

## 5. Commit / branch

- Branch: `checkpoint/harper-prep-hub`
- Commit: _(after push)_
- Not merged to main; main not pushed.

---

## 6. Unchanged confirmation

Cheat Sheet page still defaults to answer forms (no `showCoachAnswerForms={false}`). Stage assign/add behavior, Outreach, prompts, planning, learnings, Phase 1 gate, serialization, and paid-call types unchanged. Render paths do not enqueue jobs or call `runPaidStructuredCall`.
