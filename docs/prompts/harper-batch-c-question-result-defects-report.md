# Harper Batch C — question and result defects (8b–8e) — implement report

**Repo:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git`  
**Branch pushed:** `checkpoint/harper-prep-hub`  
**Prompt saved:** `docs/prompts/harper-batch-c-question-result-defects.md`  
**Aimed Outreach:** not read or touched.

---

## 1. Defects

### 8b. Company mission / pitch → Harper gap question

**Root cause:** `looksLikeCompanyPitch` only matched a narrow opener/marker set, so mission-like required/outcome/preferred/competency text still entered `evidenceTargets` and could become gaps/questions. Outcomes/competencies/preferred were not pitch-filtered at target construction.

**Fix:** Expanded openers/markers and a we/mission purpose heuristic in `looksLikeCompanyPitch` (`assess.ts` **593–625**). `evidenceTargets` now skips pitch-like text for required, outcomes, competencies, preferred, and mission (**244–288**). `openGaps` / `isCompanyMissionOrTagline` remain the second gate.

**Bounded:** Deterministic exclude at target construction — no paid replan, no regeneration loop.

### 8c. Seeker reply echoed as Harper result (including meta-commentary)

**Root cause:** `isRawSeekerResult` only caught exact/joined/fragment copies, not paraphrases or results that describe the question instead of answering it.

**Fix:** Added `isParaphrasedSeekerReply` and `isQuestionMetaCommentary` in `results.ts` (**42–95**); wired into `isRawSeekerResult` (**114–124**). `polishAnswerWithQuality` already rejects raw interview/bullet text and regenerates within `qualityRegenerationAttempts` (`service.ts` **598–652**); quality feedback strings tightened (**639–645**).

**Bounded:** Fixed for-loop `attempt <= qualityRegenerationAttempts` (config value **2** → at most initial + 2 regenerations). No unbounded replan.

### 8d. Orphan / context-free STAR template question

**Root cause:** Model text like “Tell me what happened, what you did, and what the result was.” passed `questionTextForGap` / `planQuestionRound` with no subject check.

**Fix:** `looksLikeContextFreeTemplateQuestion` (`questions.ts` **125–150**); empty return from `questionTextForGap` (**245–254**); drop with reason in `questionForGap` (**321–330**) and chronology slot (**504–508**). Rejected questions are dropped — never replaced by a template.

**Bounded:** Plan-time drop only; no paid regeneration for the dropped slot.

### 8e. Near-duplicate career walk-throughs (different employers)

**Root cause:** `questionNearDuplicate` used token/Jaccard/substring rules that miss Merion→OpenText vs Aerotek→OpenText walk-throughs; chronology-once only checked `targetKey === "chronology"`.

**Fix:** Pattern-based `looksLikeCareerWalkThrough` / `questionIntentClass` (`questions.ts` **63–96**); same intent class ⇒ near-duplicate (**104–106**). `planQuestionRound` keeps at most one walk-through per application via `walkThroughKept` (**468–488**), including prior asked texts that match the pattern.

**Bounded:** Dedup at plan time; no extra paid call.

---

## 2. Prompt STOP

No defect required changing Harper prompt text. None stopped for prompt approval.

---

## 3. What is shown when a result still fails in 8c

After the quality loop still returns raw/meta content, `polishAnswerWithQuality` returns `{ ok: false, message: consultationConversationCopy.generationFailed }`. Callers invoke `failGeneration`, which sets `generationStatus: "FAILED"` and `generationError` to the seeker-facing copy:

**“Harper could not finish this coaching. Retry.”**

No interview answer or resume bullet is stored as Harper’s result.

---

## 4. How question intent is determined in 8e (no guessing)

Intent class `"chronology"` is assigned only when:

1. `targetKey === "chronology"`, or  
2. `looksLikeCareerWalkThrough(text)` matches **explicit** patterns: “career walk-through” language; guide-through + career/roles/experience/background/path/progression; “starting with …” + guide-through + accomplishments/moved-on; guide-through + “from … to …”.

Employer names are **not** used for similarity. Two walk-throughs with different employers share intent because both match the same pattern class, not because Merion≈Aerotek.

---

## 5. Every file changed

| File | Role |
|------|------|
| `docs/prompts/harper-batch-c-question-result-defects.md` | Saved implement prompt |
| `docs/prompts/harper-batch-c-question-result-defects-report.md` | This report |
| `src/lib/consultation/assess.ts` | 8b pitch detection + evidenceTargets filter |
| `src/lib/consultation/questions.ts` | 8d context-free reject; 8e walk-through intent / one-per-app |
| `src/lib/consultation/results.ts` | 8c paraphrase + meta raw checks |
| `src/lib/consultation/service.ts` | Quality feedback wording for raw/meta |
| `src/lib/consultation/results.test.ts` | Meta/paraphrase unit assertions |
| `src/lib/consultation/harper-batch-c.test.ts` | Batch C + B5 regression tests |

---

## 6. Tests

**Added**

- `harper-batch-c.test.ts`: 8b–8e, regeneration bound, B5 regression (own `cheatSheet:contact:{id}:likely:{n}` and interviewer questions excluded from Additional Interview Prep Q&A).
- `results.test.ts`: new case for paraphrase + meta commentary.

**Changed existing**

- `results.test.ts` only: added one new `it(...)` (no behavior change to prior cases).

**Results**

| Check | Result |
|-------|--------|
| `npm test` (full suite, incl. real Postgres) | **1905 passed**, 256 files, 0 failures |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass (retry after `.next` race) |
| `npm run lint` | **0 errors** (2 pre-existing warnings in `scripts/step0-assess-hiring-team-drafts.ts`) |

---

## 7. Commit and branch

- **Branch:** `checkpoint/harper-prep-hub` (updated from `main` at `7a0f6b5` before work; no merge to main)
- **Commit:** *(filled after commit)*

---

## 8. Scope confirmation

Only Batch C defects 8b–8e, the quality-feedback strings used by the existing polish loop, Batch C / B5 regression tests, and this report/prompt. No Harper prompt text, layout, Stage, Outreach, Cheat Sheet UI, learnings, role-expertise (Batch D), Phase 1 gate, serialization, migrations, or schema changes.
