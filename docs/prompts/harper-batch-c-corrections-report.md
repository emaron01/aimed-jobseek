# Harper Batch C corrections — implement report

**Repo:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git`  
**Branch:** `checkpoint/harper-prep-hub`  
**Prompt saved:** `docs/prompts/harper-batch-c-corrections.md`  
**Aimed Outreach:** not read or touched.

---

## 1. FIX 1 — Walk-through intent (final rule)

**Final rule** (`looksLikeCareerWalkThrough` in `question-detection.ts` **20–49**): chronology only when the question asks for the seeker’s **roles or career in sequence**:

1. Phrase “career walk-through”, or  
2. “walk (me) through” **and** one of `career` / `roles` / `path` / `progression` (not bare `experience` or `background`), or  
3. “starting with …” + guide-through + accomplishments / roles / moved on / left / next, or  
4. “from … to …” **only when** also mentioning career / roles / accomplishments / moved on / each role.

**Positives:** Merion→OpenText and Aerotek→OpenText starting-with walk-throughs; “Walk me through your career.”; “Walk me through your career from Merion to OpenText…”.  
**Negatives (not chronology):** “Walk me through your experience building a front-line management layer.”; “Walk me through how you went from an unreliable forecast to 5-10% accuracy.”; “Walk me through your background with MEDDIC.”

---

## 2. FIX 2 — Paraphrase / meta decision + validation

### How it decides

| Helper | File / lines | Decision |
|--------|--------------|----------|
| `isQuestionMetaCommentary` | `results.ts` **97–111** | True if meta patterns (`clarified that`, `reframed`, `company statement`, `needed to be … interview question`, etc.) **and** no first-person experience signal (`I led/built/owned…`, `my team/role/work`, `at …`). |
| `isParaphrasedSeekerReply` | `results.ts` **42–91** | Nearly-verbatim only: skip `In my words…` and `result: …` frames; require ≥5 content tokens and ≥40 alpha chars; flag if alpha-normalized equality **or** length delta ≤ **0.08** and token Jaccard ≥ **0.95**. |
| `isRawSeekerResult` | `results.ts` **126–137** | Meta **or** exact **or** joined **or** fragment **or** nearly-verbatim paraphrase. |

### Validation counts

| Source | Checked | Flagged |
|--------|---------|---------|
| Local dev DB approved `INTERVIEW_ANSWER` / `RESUME_BULLET` with seeker replies | **2** | **0** |
| Fixture / unit polished-coaching examples | covered in suite | **0** legitimate polished cases flagged |

**Change made:** tightened paraphrase from ~0.85 Jaccard / 0.22 length (which treated polished restatements as raw) to nearly-verbatim thresholds above. Meta commentary still rejected. Verbatim echoes and “Clarified that a company statement…” still rejected.

---

## 3. FIX 3 — Failed result is item-only

| Change | Location |
|--------|----------|
| `finishItemNeedsMoreDetail` — sets seeker `analysisJson.needsMoreDetail: true`, deletes Harper statements for that item, sets session `READY` / `generationError: null` | `service.ts` **788–824** |
| Why-company and evidence polish failures call it instead of `failGeneration` | `service.ts` **1636–1654**, **1658–1676**, **1858–1876**, **1881–1899** |
| Copy: `needsMoreDetailToShape` = exact “Add a bit more detail so Harper can shape this answer.” | `consultation.ts` **98–99** |
| QA view exposes `needsMoreDetail` from latest seeker analysis | `qa-view.ts` **39**, **137–139**, **432** |
| Question card shows that exact copy when no Harper result | `ConsultationThread.tsx` **338–345** |

No session FAILED and no “Harper could not finish this coaching. Retry.” for this path. Seeker answer kept. Next reply uses the normal reply path (no auto-retry / no paid call until the seeker adds detail).

---

## 4. FIX 4 — Canned-question guard

**Existing guard:** `consultation.test.ts` **1904–1925** (`contains no deterministic consultation narrative generators`) reads `questions.ts` and asserts it does **not** contain `/Tell a story|Walk me through|concrete result/i`, `/Do you have experience with/i`, or `{requirement}` — forbidding canned question **generators** in planning code.

**Option chosen:** move intent/template **detection** into `question-detection.ts` (detection-only module). `questions.ts` imports it; join/`GUIDE_THROUGH` workaround removed.

**Why:** the guard’s purpose is to stop generating askable canned questions from `questions.ts`. Detection patterns that reject/classify model text are not generators; isolating them keeps the guard honest without string-building evasion. Guard still forbids canned text in `questions.ts` and asserts detection is not a planner (`planQuestionRound` / `questionTextForGap` absent from detection).

---

## 5. FIX 5 — CSC posting filter

Permanent fixture `csc-senior-director-sales-fixture.ts` from local DB posting “Senior Director of Sales” (mission contains “most valuable digital brands”).

**Excluded (pitch):**
- Mission: “Join us to help protect the world's most valuable digital brands while building a disciplined, world-class sales organization defined by execution excellence, leadership depth, and sustainable growth.”

**Kept by pitch (all responsibilities, required, outcomes, competencies):**
- All 5 responsibilities (channel motion, brand protection selling, manager bench / forecast cadence, hire/develop managers, open logos with MEDDIC)  
- All 6 required items (10+ years leadership, front-line managers, MEDDIC/forecast, channel motion, digital brand protection selling, new logos/renewals)  
- Outcomes: channel motion; sell brand protection / domain services  
- Competency: front-line manager bench + forecast cadence  

**Also kept by pitch (prompt examples):** “Deliver North America revenue targets…”, “Build and operationalize a repeatable, scalable sales process.”

**Note:** outcome “Sell digital brand protection…” may merge with a similar required item via `sameRequirementMeaning` in `evidenceTargets` — not a pitch false positive.

**Rule change for FIX 5:** none required; mission excluded, all real requirements kept.

---

## 6. Files changed

- `docs/prompts/harper-batch-c-corrections.md`  
- `docs/prompts/harper-batch-c-corrections-report.md`  
- `src/lib/consultation/question-detection.ts` *(new)*  
- `src/lib/consultation/csc-senior-director-sales-fixture.ts` *(new)*  
- `src/lib/consultation/questions.ts`  
- `src/lib/consultation/results.ts`  
- `src/lib/consultation/service.ts`  
- `src/lib/consultation/qa-view.ts`  
- `src/lib/product-config/consultation.ts`  
- `src/components/ConsultationThread.tsx`  
- `src/lib/consultation/harper-batch-c.test.ts`  
- `src/lib/consultation/results.test.ts`  
- `src/lib/consultation/consultation.test.ts`  

---

## 7. Tests

**Added / updated:** chronology negatives/positives; nearly-verbatim vs polished coaching; FIX 3 copy/session READY/view flag; FIX 4 guard + detection module; FIX 5 CSC fixture (responsibilities + required + scorecard).

**Existing tests changed (why):**
- `results.test.ts` — paraphrase case retargeted to nearly-verbatim + polished pass (FIX 2).  
- `consultation.test.ts` — narrative-generator guard acknowledges detection module (FIX 4).  
- `harper-batch-c.test.ts` — 8c/8e and new FIX 1–5 cases.

| Check | Result |
|-------|--------|
| `npm test` | **1909 passed**, 256 files |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | **0 errors** (2 pre-existing warnings in `scripts/step0-assess-hiring-team-drafts.ts`) |

---

## 8. Commit / branch

- **Branch:** `checkpoint/harper-prep-hub` (not merged to main)  
- **Commit:** *(filled after commit)*

---

## 9. Scope confirmation

Only the five Batch C corrections above (plus tests/report/prompt). No Harper prompt text, layout redesign, Stage, Outreach, Cheat Sheet, learnings, Phase 1 gate, or serialization changes. `ConsultationThread` only shows the FIX 3 needs-more-detail copy under the affected item.
