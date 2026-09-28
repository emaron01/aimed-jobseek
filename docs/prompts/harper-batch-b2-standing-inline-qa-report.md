# Harper Batch B2 — Where you stand inline Q&A — Report

**Repo:** `C:\Repos\aimed-jobseek` (`origin` → `https://github.com/emaron01/aimed-jobseek.git`). Aimed Outreach was not read or touched.  
**Prompt saved:** `docs/prompts/harper-batch-b2-standing-inline-qa.md`  
**Plan:** Batch B2 of `docs/prompts/harper-prep-hub-plan-report.md` (PO decisions override the plan where they differ — no “Other” section).  
**Date:** 2026-09-28

---

## 1. Mapping of every former General question → Where you stand topic

Former **General** = every `ConsultationQaItem` that is **not** `person-prep:*` (Batch A `buildHarperQaLayout`). Mapping is `partitionGeneralQuestionsForStanding` in `src/lib/consultation/harper-layout.ts`.

| Former General `targetKey` | Topic under Where you stand | Notes |
|---|---|---|
| Standing requirement keys present in the current standing list (`required:…`, `outcome:…`, `competency:…`, `mission:…`, `preferred:…` when they appear as standing assessments) | That requirement row (rating + reason + inline `QuestionList`) | Gap Q&A and seeker answers travel on the same card |
| `why-this-company` | Dedicated topic **“Why you want to work at this company”** | Once; label from `consultationConversationCopy.whyThisCompanyTarget` |
| `chronology` | Dedicated topic **“Career walk-through”** | Once; label from `consultationConversationCopy.careerWalkThroughTarget` |
| `role-expertise:*` | Dedicated topic (kind `role-expertise`) | Reserved for Batch D; **renders only when questions exist** — no empty placeholder |
| `person-prep:{contactId}` | **Not General** — stays under interviewer section (Batch A / Batch B3 person view) | Unchanged this batch |

### No clear topic (report only — **not** rendered as “Other”)

| `targetKey` pattern | Why unmapped |
|---|---|
| `cheatSheet:{itemId}` | Coach-item answers live in Harper turns but are not a Where you stand requirement or dedicated standing topic; plan defers them to the interviewer profile (Batch B3). Until then they are **unmapped and not rendered** in the default Harper view. |
| Any other non–person-prep key that is not `why-this-company`, not `chronology`, not `role-expertise:*`, and not in the current standing requirement key set | Same: `unmapped` array only — no UI bucket |

---

## 2. Answers not tied to a question or gap (report only)

No orphan-answer **handler** was built (per PO).

- In `buildConsultationQaView`, seeker answers attach to their primary question item (or to a synthetic host with copy “Your answer” when no consultant question is found — existing qa-view behavior).
- Batch B2 partition moves **whole** `ConsultationQaItem`s (question + `seekerAnswers` + statements). Gap answers therefore render under the matching requirement when `targetKey` matches.
- **No live-account scan** of orphaned SEEKER turns was run. Synthetic hosts whose `targetKey` is unmapped (e.g. `cheatSheet:*`) follow the unmapped rule above and are not shown. Product owner should verify on a fresh account.

---

## 3. What changed (file + line)

| Change | Where |
|---|---|
| `ROLE_EXPERTISE_TARGET_PREFIX`, `CHRONOLOGY_TARGET_KEY` constants | `src/lib/consultation/contract.ts` **7–9** |
| `careerWalkThroughTarget` copy | `src/lib/product-config/consultation.ts` **109** |
| `partitionGeneralQuestionsForStanding` + standing-topic types; `HARPER_GENERAL_ANCHOR` documented as standing-topics alias | `src/lib/consultation/harper-layout.ts` **16–17**, **45–65**, **153–230** |
| Partition General → standing; pass `dedicatedTopics` / `requirementQuestions`; Thread only gets interviewers | `src/components/ConsultationSection.tsx` **24–26**, **333–336**, **481–600** |
| Inline `QuestionList` under dedicated topics + each requirement; summary/counts/ratings kept; Answer jump link removed; Share/Ignore for gaps with no question; `#harper-general` on topics root | `src/components/ConsultationStanding.tsx` (full rewrite of render path; topics **329–344**, requirements + inline Q **345+**, Share/Ignore **261–299**) |
| Removed free-floating General list; exported `QuestionList`; interviewer sections only | `src/components/ConsultationThread.tsx` **417–454** (`QuestionList`), **457–511** (`ConsultationThread`) |

---

## 4. Anchors whose target changed

| Anchor | Before (Batch A) | After (Batch B2) |
|---|---|---|
| `#harper-standing` | Where you stand section | **Unchanged** — still `id={HARPER_STANDING_ANCHOR}` on the standing `<section>` |
| `#harper-general` | Free-floating “General questions” list in `ConsultationThread` | **Moved** — now on the standing topics root (`data-testid="harper-standing-topics"`) inside `ConsultationStanding`. Alias so older links do not 404. |
| `#harper-q:{questionTurnId}` | Question card in General or interviewer list | **Same id attribute** on `QuestionCard`; **DOM location** for former General questions is now under the standing topic/requirement (inline). Interviewer questions unchanged. |
| `#harper-contact:{contactId}` | Interviewer section in Thread | **Unchanged** |

---

## 5. Every file changed (this batch)

**Implementation**
- `src/lib/consultation/contract.ts`
- `src/lib/consultation/harper-layout.ts` (new partition + types; file already introduced in Batch A)
- `src/lib/product-config/consultation.ts`
- `src/components/ConsultationSection.tsx`
- `src/components/ConsultationStanding.tsx`
- `src/components/ConsultationThread.tsx`

**Tests**
- `src/lib/consultation/harper-batch-b2.test.ts` (**new**)
- `src/lib/consultation/harper-batch-a.test.ts` (updated for B2 layout/anchors/Answer removal)
- `src/lib/consultation/harper-batch-a-ignore.test.ts` (Answer → inline)
- `src/lib/consultation/standing.test.ts` (Answer → inline)
- `src/lib/application/no-ai-on-view.test.ts` (extend Harper render no paid call / no enqueue; assert partition + QuestionList)

**Docs**
- `docs/prompts/harper-batch-b2-standing-inline-qa.md` (prompt saved before work)
- `docs/prompts/harper-batch-b2-standing-inline-qa-report.md` (this report)

**Not changed by B2:** Stage / Outreach / Cheat Sheet page components, Harper prompts (`prompt-content/consultation.ts` content for planning), consultation planning/learnings, Phase 1 paid-call gate, application-job serialization, paid-call call sites.

---

## 6. Tests added or changed + full suite

### Added
- `src/lib/consultation/harper-batch-b2.test.ts` — default standing + summary; no free-floating General; why-company + career walk-through once each; gap answers under gap topic; Batch A behaviors inline; `#harper-q` on QuestionCard; reply gating; role-expertise reserved without empty UI; unmapped `cheatSheet` reported not rendered as Other.

### Changed existing (reasons — not weakened to force green)
| File | Why |
|---|---|
| `harper-batch-a.test.ts` | Layout/anchor expectations: General is inline under standing; `#harper-general` on standing topics; Answer jump removed; why-company partitions to dedicated topic |
| `harper-batch-a-ignore.test.ts` | Answer jump removed; Share+Ignore when no question; QuestionList present |
| `standing.test.ts` | `answerGap` no longer in Standing UI |
| `no-ai-on-view.test.ts` | Assert `partitionGeneralQuestionsForStanding` on section; no paid call / enqueue on thread + standing; QuestionList on standing |

### Full suite (real Postgres)

```
npm run db:test:up    # TEST Postgres 127.0.0.1:5435, aimedjobseek_test
npm test              # vitest run

Test Files  250 passed (250)
     Tests  1858 passed (1858)
```

Real-Postgres-backed tests ran as part of this suite against `:5435`. No new failures.

---

## 7. Confirmation — out-of-scope surfaces unchanged by B2

| Surface | Status |
|---|---|
| Stage (timeline / stage detail) | Not modified in this batch |
| Outreach page | Not modified in this batch |
| Cheat Sheet page | Not modified in this batch |
| Person view / search (Batch B3) | Not started; person-prep sections remain Batch A Thread sections |
| Harper prompts / planning / learnings | Not modified |
| Phase 1 paid-call gate / serialization / paid calls | Not modified |
| Rendering enqueues jobs or paid calls | Asserted: Consultation page/section/thread/standing have no `enqueueApplicationJob` / `runPaidStructuredCall` on render |

---

## Product behavior summary

1. **Where you stand** remains Harper’s default (standing panel before Thread).
2. Summary counts (`Strong N, Partial N, None N`) and requirement ratings/reasons unchanged.
3. No free-floating General question list.
4. Why-company and career walk-through are dedicated standing topics (when present), each once.
5. Gap questions + answers inline under their requirement; Share/Ignore only when no answerable question; Answer jump link removed.
6. `#harper-q:…` still on the question card at its new inline position.
7. Role-expertise namespace reserved; empty section never rendered.
