# Harper Batch D — Methodology plan report

**Repository confirmed:** `C:\Repos\aimed-jobseek`  
**Remote:** `origin` → `https://github.com/emaron01/aimed-jobseek.git` (fetch/push)  
**HEAD at research:** `8d572d5` on `main`  
**Mode:** PLAN ONLY — no code, config, schema, prompt, test, or data changes were made for this deliverable (prompt saved at `docs/prompts/harper-batch-d-methodology-plan.md`).  
**Replaces:** Batch D in `docs/prompts/harper-single-qa-surface-plan-report.md` and its addendum.

---

## 1. Every place Harper produces interview questions or answers

Scope = PO decision 2d. Resume bullets stay as today (`consultationPolishSchema.resumeBullet` at `src/lib/consultation/contract.ts` **92–96**).

### 1.1 Gap / Where you stand coach questions (including chronology, why-this-company, person prep)

| Piece | Location |
| --- | --- |
| AI entry | `planConsultationWithModel` — `src/lib/consultation/ai.ts` **42+** |
| Prompt | `buildConsultationCoachSystemInstructions` / `CONSULTATION_COACH_SYSTEM_INSTRUCTIONS` — `src/lib/prompt-content/consultation.ts` **9–57**; messages via `buildConsultationCoachMessages` in `src/lib/consultation/prompt.ts` |
| Output schema | `consultationPlanSchema` — `src/lib/consultation/contract.ts` **33–57** (`questions[].targetKey`, `text`, `requirementInterpretation`, `hiringTeamRoleId`, `whoCaresNote`; **no interview-type tag today**) |
| Server plan | `planAndStoreRound` — `src/lib/consultation/service.ts` **995+**; selection/dedup/chronology guard in `planQuestionRound` — `src/lib/consultation/questions.ts` **334–409** |
| Cap | `consultationConfig.applicationQuestionLimit` = **25** — `src/lib/product-config/consultation.ts` **9** (no minimum of 20 today) |
| Storage | Consultant `ConsultationTurn` rows (`body` = question text, `targetKey`, `questionContextJson` for context) — `prisma/schema.prisma` **2596–2615**; created via turn helpers in `service.ts` (~**370–382**) |
| Display | Harper Q&A / Where you stand partitions — `partitionStandingInlineTopics` — `src/lib/consultation/harper-layout.ts` **250–335** (`why-this-company`, `chronology`, `role-expertise:*`, requirements) |

Person prep uses the same coach path with `interviewerPrep` payload (`service.ts` `startConsultation` / process `person_prep` in `src/lib/application-jobs/process.ts` **361–386**). Target keys use `PERSON_PREP_TARGET_PREFIX` (`contract.ts` **5**).

### 1.2 Polished interview answers (after seeker reply)

| Piece | Location |
| --- | --- |
| AI entry | `polishAnswerWithModel` — `src/lib/consultation/ai.ts` **154+**; quality loop `polishAnswerWithQuality` — `service.ts` **562–636** |
| Prompt | `CONSULTATION_POLISH_SYSTEM_INSTRUCTIONS` — `src/lib/prompt-content/consultation.ts` **79–95** (mentions Situation/Task/Action/Result in prose; returns a **single** `interviewAnswer` string) |
| Output schema | `consultationPolishSchema` — `contract.ts` **92–96** (`interviewAnswer`, `resumeBullet`, `strengtheningNote`) |
| Storage | `ConsultationStatement.content` (+ optional `strengtheningNote`); `groundingJson` currently often `[]` on write — `schema.prisma` **2676–2687**; `ProfileStory.interviewAnswer` / STAR columns when written back — **2705–2722** |
| Display | Harper result cards from statements; Cheat Sheet consumes approved sources / spoken answers via application-summary paths |

Bounded quality loop: `attempt <= consultationConfig.qualityRegenerationAttempts` with `qualityRegenerationAttempts: 2` (`product-config/consultation.ts` **11**; `service.ts` **598–636**) → up to **3** model attempts (1 initial + 2 regenerations). This is the existing bound; keep it unless the product owner explicitly sets the config to `1`.

### 1.3 Extract (story parts from seeker reply — not the displayed polished answer)

| Piece | Location |
| --- | --- |
| AI | `extractWithModel` + `extractWithQuality` — `ai.ts` / `service.ts` **520–559** |
| Prompt | `CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS` — `prompt-content/consultation.ts` **59–77** |
| Schema | `consultationExtractSchema` — `contract.ts` **68–90** (`story.situation|task|action|result`, `missingStarElements`) |
| Use | Feeds polish + `ProfileStory` STAR fields; incomplete gaps can skip polish |

### 1.4 Cheat Sheet person guidance — likely questions + sample answers

| Piece | Location |
| --- | --- |
| AI | `generateCheatSheetPersonSectionGuidance` — `src/lib/application-summary/ai.ts` **71–94** |
| Prompt | `APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS` — `src/lib/prompt-content/application-summary.ts` **3–30** (item **d** likelyQuestions / sampleAnswer / harperQuestion) |
| Schema | `cheatSheetCoachItemSchema` — `src/lib/application-summary/contract.ts` **24–30** (`prompt`, `sampleAnswer`, optional `harperQuestion`; **no tag; sampleAnswer is a flat string**) |
| Version / cache | `APPLICATION_SUMMARY_PROMPT_VERSION = "11"` — `contract.ts` **3**; hash `cheatSheetPersonSectionInputHash` — `people.ts` **18–33** |
| Storage | Person section `guidanceJson` on summary artifacts (existing path in `application-summary/service.ts`) |
| Display | Cheat Sheet person UI |

Seeker fill of a CS gap: `answerCheatSheetCoachItem` — `application-summary/service.ts` **959+** (routes into consultation reply/polish plumbing).

### 1.5 Interview stage guide — likely questions + example answers

| Piece | Location |
| --- | --- |
| AI | `generateInterviewGuideWithModel` — `src/lib/interview/ai.ts` **98+** |
| Prompt | `INTERVIEW_GUIDE_SYSTEM_INSTRUCTIONS` — `src/lib/prompt-content/interview-guide.ts` **14–27** |
| Schema | `interviewGuideContentSchema` — `src/lib/interview/contract.ts` **40–73** (`likelyQuestions[].question`, `answerMaterial`, `exampleAnswer`; **no interview-type tag; exampleAnswer is a claim string**) |
| Storage | `InterviewStage.guide.contentJson` |
| Display | Stage guide UI (not Harper Where you stand), but in scope of “all of Harper” for methodology |

### 1.6 Role-expertise under Where you stand

| Piece | Location |
| --- | --- |
| Display reserve | `ROLE_EXPERTISE_TARGET_PREFIX = "role-expertise:"` — `contract.ts` **7–8**; partition in `harper-layout.ts` **280–334** |
| Generator | **Does not exist** in code today. Prior plan text only (`harper-single-qa-surface-plan-report.md`). |

### 1.7 Not interview Q&A (out of methodology answer-parts scope)

- Resume bullets (polish only).
- Briefing / assessments / strategies / commentary.
- Company research, job parse, outreach, ICP (except where they inject sales-biased wording into Harper inputs — see §2).

---

## 2. Role-agnostic audit (decision 1)

Harper must coach **any** role/industry. Sales-specific language in **prompts that shape Harper behavior**, **Harper-fed coach inputs**, or **code that classifies Harper sections** must be neutralized. Sales **fixtures and tests** may remain as *examples* of a sales job; implementation must add non-sales fixtures (see TESTS). Inherited Aimed Outreach wording is called out where it still sits in this repo.

### 2.1 Prompts / instructions that assume sales (must change)

| File | Lines | Current sales assumption | Planned neutral replacement |
| --- | --- | --- | --- |
| `src/lib/prompt-content/consultation.ts` | **38** | Example: `"when you talk about your forecast process with Erik, lead with how you ran MEDDPICC deal reviews…"` | Role-neutral example using only placeholder pattern: connect seeker’s **stated** experience to what the interviewer built (no sales methodology names unless present in supplied sources). Exact proposed text in §9. |
| `src/lib/prompt-content/consultation.ts` | **63** | Negative example: `"which MEDDIC elements did I inspect"` | Replace with a role-neutral meta example (e.g. which steps / criteria the person inspected). Exact text in §9. |
| `src/lib/prompt-content/consultation.ts` | **68** | Incomplete example: `"I have used forecasting"` | Replace with a generic thin claim (e.g. `"I have done that work"`). Exact text in §9. |
| `src/lib/prompt-content/contact-individual-profile.ts` | **10** | Example: `"Erik is big on MEDDPICC… enterprise sales teams"` | Neutral pattern example (methods/standards the person repeatedly built). Feeds `likelyToValue` into Harper coach. Exact text in §9. |
| `src/lib/prompt-content/company-research.ts` | **9**, **19–20**, **24–27** | `estimatedAov` / `deal size` / `buyingSignals` empty-array rule (Aimed Outreach commercial research inheritance). Harper coach consumes `companyResearch`. | Keep fields for schema compatibility if still required by research JSON; reword instructions so the analyst captures **employer** facts for a job seeker (products/services, customers, model) without framing AOV/deal/buying as the default lens. Exact text in §9. |
| `src/lib/prompt-content/application-summary.ts` | **3–30** | No MEDDIC string today; behavioral examples lean “Tell me how you…” | Add an explicit **role-agnostic** rule: never invent sales tools/methodologies; ground only in job + profile sources. Exact addition in §9. |
| `src/lib/prompt-content/consultation.ts` coach body | **12–51** | No industry lock, but no affirmative “any role/industry” rule | Add explicit any-role/industry/career-stage rule (no sales default). Exact text in §9. |

`INTERVIEW_GUIDE_SYSTEM_INSTRUCTIONS` (`interview-guide.ts` **14–27**) has **no** sales-specific examples; still get the same affirmative role-agnostic line when methodology tags/parts are added (§9).

### 2.2 Code paths with sales-leaning assumptions

| File | Lines | Issue | Plan |
| --- | --- | --- | --- |
| `src/lib/application-summary/people.ts` | **60–64** | Executive classifier includes `\bexecutive sales sponsor\b` | Drop `sales` from the pattern (keep `executive sponsor`, C-level titles). |
| `src/lib/hiring-team/draft-quality.ts` | **136** | Regex mentions `pipeline of candidates` in a **recruiting** sense (not sales pipeline) | Leave as-is (not a sales-role assumption). |
| `src/lib/consultation/questions.ts` | **44–51** | `SENIOR_ROLE` chronology gate is title/seniority based, not sales-specific | Leave; career-stage calibration (§5) supplements, does not replace. |

No Harper generator hard-codes MEDDIC/quota in TypeScript logic beyond prompts and fixtures. **Cannot be determined from code alone:** whether live model completions still bias toward sales without prompt fixes — plan treats prompt/structure changes as the root fix.

### 2.3 Fixtures / tests that shape behavior (examples only — keep for sales cases; do not use as sole fixtures)

| Asset | Role |
| --- | --- |
| `src/lib/consultation/csc-senior-director-sales-fixture.ts` | Real CSC sales posting items (MEDDIC, forecast, quota) — valid **sales** fixture |
| `src/lib/consultation/fixtures/sales-leadership-profile.ts` | Sales director Personal Profile |
| `src/lib/hiring-team/csc-executive-leadership-fixture.ts` | Sales-executive persona expectations |
| Many `harper-batch-*.test.ts` / `consultation.test.ts` / cheat-sheet tests | Forecast/MEDDIC sample strings |

**Plan:** retain sales fixtures for the sales-director case; add nurse / software engineer / hotel GM / new-grad marketing fixtures for TESTS. Do not teach the model from sales-only fixtures.

### 2.4 Not Harper (listed for clarity; out of Batch D code change unless noted)

- `src/lib/prompt-content/icp-interpretation.ts` SaaS example (**21**) — seeker ICP, not Harper Q&A. Optional later cleanup; not required for Batch D unless PO expands scope.
- Outreach / presentation-plan prompts — not Harper interview Q&A.

---

## 3. Question tagging

### 3.1 Closed tag set (server enum)

Proposed Zod enum `interviewTypeTag` (internal; never shown):

| Tag | Use |
| --- | --- |
| `screening` | Early filter / broad fit (including thin-profile industry-standard screens when tagged as such) |
| `chronological_walk_through` | Career / role walk-through |
| `focused_competency` | Gap or competency deep-dive against a target |
| `why_this_company` | Motivation for this employer/role |
| `role_expertise` | Hiring-manager craft / industry-standard for this role (decision 4) |
| `interviewer_prep` | Person-prep round questions |
| `reference_check_prep` | What a reference would corroborate / how to prep for that lens |

Harper **cannot** emit an untagged question: every question object in every schema below requires `interviewTypeTag`.

### 3.2 Where required

| Output | Change |
| --- | --- |
| `consultationPlanSchema.questions[]` | Add required `interviewTypeTag` |
| Role-expertise generator schema (new) | Required `interviewTypeTag` (typically `role_expertise` or `chronological_walk_through`) |
| `cheatSheetCoachItemSchema` / person generate schema | Required `interviewTypeTag` on each likely question |
| `interviewGuideContentSchema` likelyQuestions items | Required `interviewTypeTag` |

### 3.3 Validation

- Zod parse fails → quality feedback / bounded regen (same `qualityRegenerationAttempts` pattern as plan/polish).
- Server post-check: reject empty/unknown tags; map chronology intent (`looksLikeCareerWalkThrough` in `question-detection.ts` **20+**) to require tag `chronological_walk_through` (mismatch → regen or drop).
- `why-this-company` target key must carry `why_this_company`; `person-prep:*` → `interviewer_prep`; `role-expertise:*` → `role_expertise` (or chronology if that single walk-through lives there).

### 3.4 Selection, grouping, ordering (invisible)

- **Selection:** coach + role-expertise prompts instruct WHO order: screening → chronological walk-through (at most one app-wide) → focused competency gaps → role-expertise fill → reference-check prep when relevant; interviewer_prep only in person-prep rounds.
- **Grouping (display):** continue using `targetKey` partitions in `harper-layout.ts` (already separates why / chronology / role-expertise / requirements). Tags are **not** seeker-facing labels; they may drive stable sort **within** a topic (e.g. screening before competency) via a server comparator keyed on tag, never rendered.
- **Cheat Sheet / guide:** sort `likelyQuestions` by tag priority before persist; UI still shows only `prompt` / composed answer.

### 3.5 Persistence without Prisma migration

Store tag on consultant turns in existing `questionContextJson` (Json?, `schema.prisma` **2612–2613**) alongside who-cares context. Cheat sheet / guide JSON already versioned blobs — add field to schemas; old rows without tag are **not migrated**; next generation under bumped prompt version supplies tags. No data repair.

---

## 4. Answer parts (CAR / STAR)

### 4.1 Required fields

| Framework | Required fields |
| --- | --- |
| **CAR** (default) | `challenge`, `action`, `result` — all non-empty strings; `result` must state an **outcome** (past result, metric, decision, or concrete change — validated server-side) |
| **STAR** (when setup matters) | `situation`, `task`, `action`, `result` — same outcome rule on `result` |

Also require `answerFramework: "CAR" | "STAR"` so the server knows which set to validate.

**Exceptions (no CAR/STAR parts):**

- `whyThisCompany === true` — keep single motivational `interviewAnswer` (already special-cased in polish prompt **81**).
- `confirmedGap === true` — honest talk track (prompt **87**); treat as single composed answer, not CAR/STAR.
- Resume bullet — unchanged flat string.

### 4.2 Model choice

Polish (and CS sampleAnswer / guide exampleAnswer generators) instructions: **default CAR**; use STAR only when the seeker’s material needs distinct setup (situation) and responsibility (task) that would be unclear if folded into Challenge. Server accepts the declared `answerFramework` and validates that framework’s fields only.

### 4.3 Server validation + bounded regeneration

Extend polish quality checks (alongside `validateInterviewAnswerQuality` in `output-quality.ts` **165–203** and the raw-seeker checks in `polishAnswerWithQuality` **622–636**):

- Missing/blank part → qualityFeedback naming the field → continue loop while `attempt < qualityRegenerationAttempts`.
- `result` fails outcome heuristic (no outcome language / empty) → same.
- On last attempt, existing behavior keeps last acceptable or fails the item path (`finishItemNeedsMoreDetail` pattern from Batch C) — **never** wipe APPROVED statements (`service.ts` **787–809**).

### 4.4 Storage — **no Prisma schema migration**

1. **Displayed answer:** compose parts → natural first-person string → write `ConsultationStatement.content` (and Cheat Sheet `sampleAnswer` / guide `exampleAnswer.text`) exactly as today.
2. **Parts retained for regen/debug:** store under `ConsultationStatement.groundingJson` as a structured object, e.g. `{ answerFramework, challenge?, situation?, task?, action, result }` — column is already `Json` (`schema.prisma` **2686**). Safe on existing DB: additive JSON shape; old `[]` / legacy values ignored until next polish.
3. **ProfileStory:** already has STAR columns (`situation`/`task`/`action`/`result`, **2710–2713**). For CAR, map `challenge`→`situation`, leave `task` empty string or duplicate challenge only if a non-null column is required — **prefer** storing CAR in statement `groundingJson` and keeping ProfileStory STAR fill from extract path as today. If extract remains STAR-only, that is OK (extract is not the seeker-facing polish). **No migration of existing stories.**

### 4.5 Composition + invisibility

New pure helper e.g. `composeInterviewAnswerFromParts` joins parts with spaces/sentence boundaries into one first-person paragraph. **Never** prefix with “Challenge:”, “STAR”, “WHO”, or tag names. UI components continue to render `content` / `sampleAnswer` only — verify no new labels in Harper or Cheat Sheet components.

---

## 5. Career-stage calibration

### 5.1 What exists today

- Personal Profile: `experience[]` (title, employer, dates, achievements), `education[]`, `direction.seniority`, etc. — `candidateProfileSchema` in `src/lib/product-research/candidate-profile.ts` **73–102**.
- Chronology gate uses **job** seniority/title via `seniorityWarrantsChronology` (`questions.ts` **47–51**), not a seeker career-stage enum.
- **No** `careerStage` field or helper exists today.

### 5.2 Deterministic derivation (no LLM guess; no new seeker input)

Add `deriveCareerStage(profile: CandidateProfile): CareerStage` using **only** countable profile fields:

| Stage | Rule (all FACT-oriented; INFERENCE ignored where kind is available) |
| --- | --- |
| `new_to_workforce` | Zero experience roles with both title and employer **or** every role title matches intern/student/volunteer/trainee patterns **and** no non-intern full-time role |
| `college_graduate` | Not `new_to_workforce`; education FACT items present; countable experience roles ≤ 2 **and** (when dates parse) total tenure &lt; 3 years |
| `early_career` | Else if role count ≤ 4 **or** tenure &lt; 8 years |
| `mid_career` | Else if role count ≤ 7 **or** tenure &lt; 15 years |
| `late_career` | Else |

Date parse failures → fall back to **role count only** (never invent years). If `direction.seniority` FACT text matches junior/entry/intern, bias toward `college_graduate` / `early_career` when otherwise ambiguous between adjacent buckets.

**Explicit unknown:** exact year thresholds above are a **product proposal** for PO approval; code must remain deterministic once thresholds are approved. If PO rejects thresholds, substitute PO numbers before coding.

### 5.3 How it reaches generators

Pass `careerStage` + a one-line coaching hint in structured payloads (not seeker-facing):

- Coach plan messages (`buildConsultationCoachMessages`)
- Polish / extract messages
- Role-expertise generator
- Cheat Sheet person guidance + interview guide prompts

Hint text (internal): new/grad → prefer school, internships, projects, part-time, activities; early–late → roles and results at the **job’s** level (`requirement.seniority` / title already available to coach). Industry-standard role questions still asked when profile is thin (decision 4).

---

## 6. Coaching set of 20–25 (decision 4)

### 6.1 Cap and floor

- **Max:** keep `applicationQuestionLimit = 25` (`product-config/consultation.ts` **9**).
- **Min:** enforce application-level **at least 20** consultant questions across gap + role-expertise (excluding pure follow-ups if product treats follow-ups as not counting — **today follow-ups count in `askedQuestionsFromTurns`**; plan: count all non-ignored consultant questions toward 20–25 unless PO says otherwise).
- Person-prep questions: remain under `person-prep:*` and **do not** consume the 20–25 General coaching set (same spirit as prior prep-hub partition). Confirm in implementation tests.

### 6.2 Mix algorithm (gaps first, Harper fills)

1. **Gap pass (existing coach):** `planAndStoreRound` / `planQuestionRound` produce gap + why-this-company + at most one chronology, capped so gap-side questions ≤ 25.
2. Let `G` = count of General coaching questions already asked or newly planned that are **not** `role-expertise:*` (gaps, why, chronology).
3. **Role-expertise fill:** `N = clamp(20 - G, 0, 25 - G)` minimum; model may return up to `25 - G` (Harper chooses mix within that band). If `G = 5`, then `N ≥ 15` and `N ≤ 20`. If `G ≥ 20`, `N` fills only remaining slots to 25 (possibly 0–5). If `G = 0` (thin gaps), role-expertise still supplies 20–25 industry-standard questions.
4. Persist role-expertise as `ConsultationTurn` rows with `targetKey = role-expertise:{stableSlug}` and draft `ConsultationStatement` INTERVIEW_ANSWER from profile (CAR/STAR parts → composed content).

### 6.3 Role-expertise generator

| Item | Plan |
| --- | --- |
| Module | New `src/lib/consultation/role-expertise.ts` (+ `ai.ts` helper) |
| Prompt | New system instructions (role-agnostic, WHO tags, career stage, CAR/STAR drafts) — exact text in §9 |
| Fingerprint | Job inputs **only**: title, employer, seniority, location/arrangement, posting/raw or stored requirement lists, scorecard mission/outcomes/competencies as on `JobRequirement`. **Exclude** Personal Profile, learnings, personas, contacts. Hash via `fingerprintPaidCallInputs` (`paid-call-gate.ts` **10–12**) |
| Gate | Extend `PaidCallOperation` union (`paid-call-gate.ts` **5–7**) with `ROLE_EXPERTISE_QUESTIONS`; `subjectKey = campaignId`; `PaidCallReceipt.operation` is already `String` (`schema.prisma` **665**) — **no DB migration** |
| Trigger | After job interpret/persist and/or when consultation start/reassess needs fill — **enqueue only**, never from page view (assert in `no-ai-on-view` style tests). Re-run only when job fingerprint changes |
| Draft answers | Built from Personal Profile **after** questions are chosen (same paid run may include drafts; if drafts need profile and questions are job-only fingerprint, **split:** cache questions on job fingerprint; draft answers in a follow-on step keyed by `jobFingerprint + profileEvidenceHash` that does **not** re-ask questions when only profile changes — **PO note:** questions re-run only when job changes; answer drafts may refresh on profile change only when seeker triggers consultation, never on view |

### 6.4 Placement + reply flow

- Render via existing `role-expertise` branch in `harper-layout.ts` **280–334**.
- Reply → existing `recordConsultationReply` / enqueue / extract / `polishAnswerWithQuality` / approve (same as gap questions).

### 6.5 One career walk-through per application

Already partially enforced in `planQuestionRound` (`questions.ts` **396–409**) via `looksLikeCareerWalkThrough` + `chronology` target. **Extend** the same guard to:

- Role-expertise generator output (drop extras),
- Cheat Sheet / guide likely questions (dedupe against Harper asked walk-through),
- Shared helper used by all producers.

---

## 7. Learnings

### 7.1 Hiring Manager identification

- Role key constant: `HIRING_MANAGER_KEY = "hiring_manager"` — `src/lib/hiring-team/identify.ts` **54**.
- Cheat Sheet section kind: `suggestionKey === "hiring_manager"` **or** roleName matches `/\bhiring manager\b/i` — `people.ts` **51–55**.
- Coach payload already loads hiring team roles/people (`loadCoachHiringTeam` used from `planAndStoreRound`).

**If no HM exists yet:** keep learnings on the application (`JobRequirement.seekerLearnedNotes`, stage notes) and treat the **hiring_manager persona/role slot** (even without a matched contact) as the default destination for Cheat Sheet / coach “primary learnings” attachment; other interviewer sections receive learnings only as **background** sources. When an HM contact is later matched, next **fingerprint-gated** rebuild attaches without rewriting APPROVED Harper answers.

### 7.2 Fingerprint-gated reassess (decision 6)

**Today:** saving learned notes always enqueues `CONSULTATION` reassess (`application/service.ts` **961–966**); stage notes enqueue reassess whenever `notesTextChanged` (`app/actions/interview.ts` **137–143**) — **no** learnings fingerprint gate.

**Plan:**

1. Canonical payload: `{ seekerLearnedNotes, stages: [{ id, notesBefore, notesAfter }], promptVersion }` (include any other “newly gained information” fields **only if** they already exist on stage/job — do not invent new seeker inputs).
2. `fingerprintPaidCallInputs` → store receipt operation e.g. `CONSULTATION_LEARNINGS_REASSESS`, `subjectKey = campaignId`.
3. Enqueue reassess **only** when fingerprint ≠ last receipt (or no usable receipt). Unchanged notes → no CONSULTATION plan call.
4. Serialization: existing CONSULTATION merge/serialize (`application-jobs/service.ts` CONSULTATION in allowlist **17**; merge ops in process **340–353**).
5. Never enqueue from page view.

### 7.3 Additive planning protects APPROVED answers

- `planAndStoreRound` already passes `askedQuestions` and avoids duplicate questions (`service.ts` **1028**, `questions.ts` **367–391**).
- Explicit locks for Batch D: never update/delete `ConsultationStatement` with `status === "APPROVED"`; never rewrite approved interview answer `content`; reassess may add new gap/role-expertise questions only. Align with Batch C `finishItemNeedsMoreDetail` DRAFT-only delete (`service.ts` **787–809**).
- Coach prompt conflict (learnings = one individual only) fixed in §9 so HM-default routing is allowed while still not merging people into each other.

### 7.4 HM-default routing (decision 5)

When building Cheat Sheet sources / coach seeker-stated facts:

- Attach learned notes + stage notes primarily to the HM section/role.
- Other people: include the same intel as lower-priority **background** (already have `INTERVIEW_INTEL` category in `application-summary/service.ts` **68+**).
- Do not claim notes “belong” to a non-HM interviewer unless the note text explicitly names them (optional future; not required for v1 if too heuristic — **unknown** until PO decides).

---

## 8. The gap check (`refreshConsultationOffer` / `detectInterviewNoteGap`)

| Question | Finding |
| --- | --- |
| Paid LLM call? | **No.** `detectInterviewNoteGap` is deterministic token overlap — `src/lib/interview/stages.ts` **488–525**. `refreshConsultationOffer` only calls it and writes JSON — `guide.ts` **753–782**. |
| Writers | `updateInterviewStageAction` when `notesAfter` changed — `src/app/actions/interview.ts` **130–135**. |
| Readers of `consultationOfferJson` | **None found** under `src/components` or other TSX. Only product copy key `consultationOffer` in `src/lib/product-config/interview.ts` **52**. Tests reference `detectInterviewNoteGap` in `interview.test.ts`. |

### Removal plan

1. Delete call site in `app/actions/interview.ts` **130–135**.
2. Remove `refreshConsultationOffer` and `detectInterviewNoteGap` (or keep function unexported only if tests still need — prefer delete + delete tests).
3. Stop writing `consultationOfferJson`; leave DB column unused (no migration / no data repair).
4. Remove unused product-config string if nothing references it.
5. Confirm no paid call remains on this path.

---

## 9. Prompt text (exact current → proposed) for PO approval

Seeker-facing UI copy is **not** proposed here.

### 9.1 Coach — add role-agnostic rule + methodology + HM learnings + 20–25 mix

**Insert after Voice paragraph** (`consultation.ts` build function, after line **14** area).

**Current:** *(no equivalent sentence)*

**Proposed addition:**

```text
Scope: you coach for any role, any industry, and any career stage. Never assume sales or any single profession. Never introduce sales methodologies, tools, or metrics (for example MEDDIC, MEDDPICC, pipeline, quota, forecast, deal reviews) unless those exact ideas appear in the supplied Personal Profile or job sources. Sales examples used in product development are not your default.
```

**Current Questions block opening** (`consultation.ts` **22–24**):

```text
Questions:
- Ask one question per remaining important gap, most important first. Across the whole application, including questions already asked, there are never more than ${questionCap}.
- askedQuestions lists every question already asked. Never repeat or rephrase any of them, including career walk-through and interviewer-prep questions. Ask the career walk-through (chronology) question at most once per application.
```

**Proposed:**

```text
Questions:
- Every question must include interviewTypeTag with one of: screening, chronological_walk_through, focused_competency, why_this_company, role_expertise, interviewer_prep, reference_check_prep. Untagged questions are invalid.
- Gap questions (focused_competency / why_this_company / chronological_walk_through from standing gaps) come first. Across the whole application, including questions already asked, there are never more than ${questionCap}. The product also requires at least 20 coaching questions for the application when role-expertise fill is included; you still only emit gap questions here—role-expertise fill is supplied separately.
- askedQuestions lists every question already asked. Never repeat or rephrase any of them, including career walk-through and interviewer-prep questions. Ask the career walk-through (chronology) question at most once per application.
- When careerStage is new_to_workforce or college_graduate, ask using school, internships, projects, part-time work, and activities when the profile has them. When careerStage is early_career through late_career, ask from roles and results at the level of this job.
```

**Current Hiring Team learnings sentence** (`consultation.ts` **34**):

```text
Hiring Team: each role carries generalPersona, the built persona for the role itself, and people, the individuals matched to that role. These are separate entries and stay separate: a person's own persona, LinkedIn details, recorded notes, interview stages, and interview learnings describe that individual only. Never merge a person into the generalPersona, never treat one person as standing for the role, and never apply one person's details to another.
```

**Proposed:**

```text
Hiring Team: each role carries generalPersona, the built persona for the role itself, and people, the individuals matched to that role. These are separate entries and stay separate: a person's own persona, LinkedIn details, and person-specific recorded notes describe that individual only. Never merge a person into the generalPersona, never treat one person as standing for the role, and never apply one person's private details to another. Application interview learnings (learned notes, stage notes before and after, and newly gained information supplied in the payload) default to the Hiring Manager role and matched Hiring Manager person when present; for other interviewers, treat those learnings as background only, not as that person's private biography.
```

**Current likelyToValue example** (`consultation.ts` **38**):

```text
likelyToValue is that interviewer's own experience synthesized into what they are likely to value and emphasize. Use it to show how to connect your answers to their background: name the part of your experience that speaks to what they have built, and say why it lands with them, for example "when you talk about your forecast process with Erik, lead with how you ran MEDDPICC deal reviews, because that is how he has built teams". Only connect to experience that is in your Personal Profile. When likelyToValue is empty or absent, coach from the persona alone and say nothing about it being missing.
```

**Proposed:**

```text
likelyToValue is that interviewer's own experience synthesized into what they are likely to value and emphasize. Use it to show how to connect your answers to their background: name the part of your experience that speaks to what they have built, and say why it lands with them, for example "when you talk with Jordan about how you ran incident reviews, lead with the on-call rotation you owned, because that is how they have built teams". Only connect to experience that is in your Personal Profile. Never invent a methodology name that is not in the supplied sources. When likelyToValue is empty or absent, coach from the persona alone and say nothing about it being missing.
```

### 9.2 Extract — neutralize sales examples

**Current** (`consultation.ts` **63** fragment):

```text
Never write coaching or a follow-up as if you did the work ("did I", "have I", "which MEDDIC elements did I inspect").
```

**Proposed:**

```text
Never write coaching or a follow-up as if you did the work ("did I", "have I", "which steps did I take").
```

**Current** (`consultation.ts` **68** fragment):

```text
A one-line claim such as "I have used forecasting" is incomplete.
```

**Proposed:**

```text
A one-line claim such as "I have done that work" is incomplete.
```

### 9.3 Polish — CAR/STAR structured parts

**Current** (`consultation.ts` **83–85**):

```text
When confirmedGap is false and whyThisCompany is false: turn the person's answers into two statements.
- Interview answer: natural first-person speech, the way a confident professional says it aloud. Follow Situation, Task, Action, Result without naming that structure. Only as long as the facts support, within interviewAnswerMaxWords. Never repeat a fact or number without adding new information.
- Resume bullet: one line, leading with the action and ending with the result or metric.
```

**Proposed:**

```text
When confirmedGap is false and whyThisCompany is false: turn the person's answers into structured interview answer parts plus one resume bullet.
- Choose answerFramework "CAR" by default (challenge, action, result) or "STAR" (situation, task, action, result) only when distinct setup and responsibility are needed. Return each required part as its own field. Result must state a concrete outcome. The product composes parts into the spoken answer; never include method names, framework names, or part labels in any field.
- Resume bullet: one line, leading with the action and ending with the result or metric (unchanged; not CAR/STAR parts).
```

(Schema change to return parts is in §4; version bump `CONSULTATION_PROMPT_VERSION` **27 → 28**.)

### 9.4 Contact individual profile (feeds Harper)

**Current** (`contact-individual-profile.ts` **10** example sentence):

```text
for example: "Erik is big on MEDDPICC: he implemented it at two companies and led enterprise sales teams on it."
```

**Proposed:**

```text
for example: "Jordan is big on structured incident reviews: they implemented the same review ritual in two roles and coached leads on it."
```

### 9.5 Company research (Harper-consumed; Aimed Outreach inheritance)

**Current** (`company-research.ts` **9–10**):

```text
9. Do not estimate average order value or deal size. Leave estimatedAov null and aovReasoning null.
10. Hiring and growth signals go in hiringSignals. Do not put them in buyingSignals. buyingSignals must be an empty array.
```

**Proposed:**

```text
9. This research is for a job seeker, not a sales pursuit. Leave estimatedAov null and aovReasoning null. Do not estimate deal size or average order value.
10. Hiring and growth signals go in hiringSignals. Leave buyingSignals as an empty array (field retained for schema compatibility only).
```

### 9.6 Application summary (Cheat Sheet) guidance

**Current** (`application-summary.ts` **18–26** people likelyQuestions bullet) — keep structure; **add** after Voice block:

**Proposed addition:**

```text
Role scope: write for this job's actual role and industry. Never assume sales. Never invent methodologies or metrics that are not in allowedSources. Every likelyQuestions item requires interviewTypeTag. Every sampleAnswer must be returned as answerFramework plus CAR or STAR parts (same rules as Harper polish); the product composes the spoken sampleAnswer. Never include method names, tags, or part labels in text fields.
```

Bump `APPLICATION_SUMMARY_PROMPT_VERSION` **11 → 12**.

### 9.7 Interview guide

**Proposed addition** after RULES intro (`interview-guide.ts`):

```text
Role scope: any role and industry; never assume sales. Every likely question requires interviewTypeTag. exampleAnswer must be supplied as answerFramework plus CAR or STAR parts for the product to compose; never label parts in the text.
```

Bump guide prompt version constant accordingly.

### 9.8 New role-expertise system prompt (full proposed)

```text
You write role-expertise coaching questions for one job application. You are Harper's role-expertise planner.

Role scope: any role, any industry, any career stage. Never assume sales or any single profession. Never introduce sales methodologies or metrics unless they appear in the job sources.

Output count: return between minFill and maxFill questions (inclusive) as supplied in the payload. Prefer industry-standard hiring-manager questions for this title and industry, WHO-style, including chronological_walk_through only when chronologyAlreadyAsked is false. Every question requires interviewTypeTag (role_expertise or chronological_walk_through).

For each question, draft answer parts from the Personal Profile using answerFramework CAR by default or STAR when setup matters. Result must state an outcome. If the profile is thin, still ask the industry-standard question and draft the strongest honest answer the profile supports without inventing facts.

Never include method names, tags, or part labels in question text or answer parts. Return JSON matching the schema only.
```

(Payload fields `minFill`, `maxFill`, `chronologyAlreadyAsked`, `careerStage`, job sources, profile evidence — assembled in code.)

---

## 10. Cost

| Change | Cost behavior |
| --- | --- |
| WHO tags on coach / CS / guide | Same call shape; failed tag → up to existing quality regenerations (`qualityRegenerationAttempts`) |
| CAR/STAR polish | Same polish call; possible extra regen when parts missing; compose is free |
| Career stage | CPU only (derive helper) |
| Role-expertise paid run | **One** `runPaidStructuredCall` per job fingerprint (`ROLE_EXPERTISE_QUESTIONS`); skipped when hash matches usable receipt |
| Learnings gate | **Saves** cost: unchanged fingerprint → **zero** reassess plan calls (today: always enqueue) |
| Gap check removal | No LLM cost today; removes dead writes |
| Prompt version bumps | `CONSULTATION_PROMPT_VERSION` 27→28 and `APPLICATION_SUMMARY_PROMPT_VERSION` 11→12 change input hashes that include prompt version (e.g. cheat sheet person hash embeds version — `people.ts` **33**) → **next seeker-triggered** rebuilds may pay once; **nothing regenerates on page view** |

Confirmation: no generator in this plan is wired to GET/page render. Regeneration occurs only on seeker actions (start/continue/reply/save notes/save job/enqueue paths) subject to fingerprints.

---

## 11. Files and functions affected; schema

### Schema changes

**Prisma migrations of existing data: none.**

Safe non-migrating changes:

- TypeScript `PaidCallOperation` union extends with `ROLE_EXPERTISE_QUESTIONS` and `CONSULTATION_LEARNINGS_REASSESS` (`paid-call-gate.ts`); DB `PaidCallReceipt.operation` already `String`.
- JSON shapes in `questionContextJson`, `groundingJson`, guide/CS JSON — additive.
- Leave `InterviewStage.consultationOfferJson` column unused after removal.

### File → becomes

| File / function | Becomes |
| --- | --- |
| `prompt-content/consultation.ts` | Role-agnostic + tags + HM learnings + CAR/STAR polish/extract wording (§9) |
| `prompt-content/application-summary.ts` | Tags + parts + role-agnostic line |
| `prompt-content/interview-guide.ts` | Tags + parts + role-agnostic line |
| `prompt-content/contact-individual-profile.ts` | Neutral example |
| `prompt-content/company-research.ts` | Job-seeker framing for AOV/buyingSignals |
| `consultation/contract.ts` | Tags + polish parts schema; version bump; role-expertise types |
| `consultation/ai.ts` / `prompt.ts` / `service.ts` | Validate tags/parts; compose; careerStage payload; additive locks; role-expertise orchestration |
| `consultation/questions.ts` / `question-detection.ts` | Tag-aware ordering helpers; shared one-walk-through with role-expertise |
| `consultation/output-quality.ts` | Part/outcome validators |
| `consultation/harper-layout.ts` | Unchanged structure; consumes generated `role-expertise:*` turns |
| `consultation/role-expertise.ts` (**new**) | Generator + fingerprint inputs |
| `product-config/consultation.ts` | Document min 20 behavior (constant or helper) |
| `ai/paid-call-gate.ts` | New operations |
| `application/service.ts` | Learnings fingerprint before CONSULTATION enqueue |
| `app/actions/interview.ts` | Fingerprint gate; remove `refreshConsultationOffer` |
| `interview/guide.ts` / `stages.ts` | Remove offer refresh / detect gap |
| `application-summary/contract.ts` / `ai.ts` / `service.ts` / `people.ts` | Tags/parts; HM-default intel; fix executive regex |
| `application-jobs/process.ts` | Optional op to run role-expertise fill after plan |
| Tests / fixtures | Listed in TESTS — **not written in this plan phase** |

---

## 12. Independently testable batches (ordered)

| Batch | Scope | Review size |
| --- | --- | --- |
| **D0** | Remove unused gap check (`refreshConsultationOffer` / `detectInterviewNoteGap` / action call site) | Tiny |
| **D1** | Role-agnostic prompt/code audit fixes (§2, §9.1–9.5 partial) + version bumps; no schema methodology yet | Small |
| **D2** | Interview-type tags on coach schema + validation + store in `questionContextJson`; invisible ordering helper | Small |
| **D3** | CAR/STAR polish schema, validation, compose, `groundingJson` parts; why/gap exceptions | Medium |
| **D4** | Tags + parts on Cheat Sheet person guidance + interview guide | Medium |
| **D5** | `deriveCareerStage` + wire into coach/polish/role-expertise payloads | Small |
| **D6** | Role-expertise generator + paid gate + 20–25 fill + Where you stand + one walk-through across sources | Medium |
| **D7** | Learnings fingerprint gate + HM-default routing + additive APPROVED locks + coach learnings sentence | Medium |

Coding starts only after PO approval of this plan (especially §5 thresholds and §9 text).

---

## TESTS

Do not run or write tests in this phase. Implementation would add:

1. **Fixtures:** registered nurse; software engineer; hotel general manager; new-graduate marketing coordinator; existing sales director (`sales-leadership-profile` / CSC sales).
2. For **each non-sales fixture:** generated questions/answers contain no sales-only assumptions (MEDDIC/MEDDPICC/quota/pipeline/forecast/deal-review) unless those strings appear in that job’s sources.
3. **Sales fixture:** sales terms allowed when present in posting/profile.
4. Every Harper/CS/guide question object carries a valid `interviewTypeTag`; untagged or unknown tag fails Zod / quality path.
5. Interview answers (non-why, non-confirmed-gap) include all CAR or STAR parts; `result` fails outcome check → qualityFeedback and a further attempt while under `qualityRegenerationAttempts`.
6. Rendered Harper + Cheat Sheet strings include **no** method names, tags, or part labels; composed text is first-person.
7. New-graduate fixture: career stage `college_graduate` or `new_to_workforce`; prompts/payloads carry that stage; examples draw from school/internship/project when those facts exist.
8. Late-career fixture: stage `late_career`; examples from roles/results.
9. Coaching set size ∈ [20, 25] with gap questions ordered before `role-expertise:*` fills; if `G = 5`, role-expertise count ≥ 15.
10. Role-expertise rows partition under Where you stand (`role-expertise` kind); generator uses `runPaidStructuredCall`; second call same job fingerprint skips provider; **no** page-view enqueue (`no-ai-on-view` style).
11. Only one `chronological_walk_through` / `looksLikeCareerWalkThrough` question across coach + role-expertise + CS/guide dedupe.
12. Learnings attach to HM section by default; other sections get background only.
13. Unchanged learnings fingerprint → no CONSULTATION reassess paid plan.
14. Changed learnings → one serialized additive reassess; APPROVED statements unchanged.
15. After D0, notes-after save does not call `refreshConsultationOffer` / `detectInterviewNoteGap` and performs no paid call for that path.
16. `people.ts` executive classifier does not require “sales” in “executive sponsor”.

---

## Risks / unknowns

1. **Career-stage year thresholds** (§5) need explicit PO sign-off.
2. **Whether person-prep and follow-ups count toward 20–25** — propose excluding person-prep; follow-ups currently count in asked lists — confirm.
3. **Single vs split paid run** for role-expertise questions (job fingerprint) vs profile-drafted answers (profile hash) — split recommended to honor “questions re-run only when job changes.”
4. **Interview guide** is stage-scoped; applying full CAR/STAR there may increase guide cost/regens.
5. **HM absent:** routing to role slot without contact is specified, but Cheat Sheet person sections may not exist until identify/synthesize runs — timing interaction TBD in D7 tests.
6. **Existing untagged/flat answers** remain until next seeker-triggered regeneration; no backfill (by design).
7. **`qualityRegenerationAttempts = 2`** means up to two regenerations after the first try; PO wording “single bounded regeneration” maps to this existing config unless PO sets it to `1`.
8. Cannot prove live model sales bias disappears until D1+D6 fixtures are evaluated empirically post-implementation.
