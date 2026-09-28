# Harper single Q&A surface — PLAN ONLY (updated with PO addendum)

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git` (`main`). Aimed Outreach was not read or touched.  
**Prompts:** `docs/prompts/harper-single-qa-surface-plan.md`; addendum prompt `docs/prompts/harper-single-qa-surface-plan-addendum.md`.  
**Mode:** PLAN ONLY — no code, configuration, schema, prompts, tests, or data changed beyond this document and the saved prompts.  
**Code basis:** Current tree (Phase 1 `PaidCallReceipt` / `runPaidStructuredCall` in `src/lib/ai/paid-call-gate.ts`, `CONSULTATION` in `SERIALIZED_APPLICATION_JOB_TYPES` at `src/lib/application-jobs/service.ts` **16–22**, consultation drain, reply-waits-for-Harper, `employerIcpFit: false`, learned-notes → cheat-sheet-only).

**Product owner decisions applied:**
1. Learnings default to the Hiring Manager section; also background for other interviewers; **no** new association field / seeker input / schema.
2. Learnings reassess only on real fingerprint change; serialized; additive (never changes approved answers); never on page view.
3. Role-expertise questions in Harper General: job-fingerprint-cached question set + Personal Profile draft answers; existing reply/polish/approve flow; PO chooses question count; do not write new prompt text here.

---

# ADDENDUM DELIVERABLE

## 1. Decision 1 — Hiring Manager default for learnings

### How the Hiring Manager is identified

| Signal | Citation | Use |
|--------|----------|-----|
| Persona `suggestionKey === "hiring_manager"` | `HIRING_MANAGER_KEY` in `src/lib/hiring-team/identify.ts` **54**; forced from reporting line via `hiringManagerFromReportingLine` **221–230**; identify merge prefers one HM **381–392** | Canonical role key for the Hiring Manager **Persona** (`Persona.suggestionKey`) |
| Role name “Hiring Manager” | `cheatSheetSectionKind` in `src/lib/application-summary/people.ts` **44–55**: `suggestionKey === "hiring_manager"` **or** `/\bhiring manager\b/i` on `roleName` → `"HIRING_MANAGER"` | Same identity used for cheat-sheet section kind |
| Matched person | `CampaignContact.chosenPersonaId` → that Persona; coach payload builds `people[]` under the role in `loadCoachHiringTeam` (`src/lib/consultation/hiring-team-context.ts` **228–272**) | Harper **interviewer section** is per contact (plan §2); HM section = contact(s) whose chosen persona is the HM role |

**Resolve order for “the HM section”:**
1. Prefer Persona with `suggestionKey === "hiring_manager"`.
2. Else Persona whose name/titles match `cheatSheetSectionKind` → `HIRING_MANAGER`.
3. Prefer a `CampaignContact` with `chosenPersonaId` pointing at that Persona for the Harper UI section `#harper-contact:{contactId}`.

### If none is identified or built yet

| State | Behavior (plan) |
|-------|-----------------|
| No HM Persona yet (identify not done / no matching role) | Do **not** invent a section or schema. Keep learnings in campaign-flat coach evidence (`seekerStatedFactsForCoach` / `learnedNotesEvidence` / `interviewNotesEvidence` in `consultation/service.ts` **782–859**) as **background for all** planning. When identify later creates `hiring_manager`, the next **gated** learnings reassess (or first reassess after HM appears if fingerprint already stored) routes default focus to that role — see Risks if HM appears with unchanged learnings fingerprint. |
| HM Persona exists, persona **not built** (`generalPersona` null) | Coach already allows this: “When generalPersona is null the role has not been built yet; use the role name…” (`CONSULTATION_COACH_SYSTEM_INSTRUCTIONS` line **28**). Learnings still default to that role id for `hiringTeamRoleId` / section focus; no synthesize enqueue from learnings alone. |
| HM Persona exists, **no** matched contact | No per-contact Harper interviewer section yet. Learnings-driven questions are planned with `hiringTeamRoleId` = HM Persona id and shown under **General** until a contact is assigned to that role; then partition moves them into the HM contact section (same turns, UI partition only — no data migration). |
| Multiple contacts on HM role | Apply default learnings to **all** contacts on that role’s Harper sections; still one campaign-level learnings fingerprint / one reassess. |

**No** `aboutContactId` / seeker “about” picker / schema (PO decision 1 overrides earlier optional-schema note).

### How learnings reach HM question planning and other sections as background

**Today (unguided):**
- Flat FACT list for every coach plan: `seekerLearnedNotes` + all stages’ `notesBefore`/`notesAfter` via `seekerStatedFactsForCoach` (`service.ts` **825–859**), wired in `planAndStoreRound` (~**973–1021**).
- Per **stage interviewer** only: that stage’s notes land on `people[].interviewStages` for contacts on the stage (`hiring-team-context.ts` **210–225**, **251**). A note on a recruiter stage does **not** systematically drive the HM person’s entry unless the HM is also on that stage.

**Plan (root cause — payload + prompt, not schema):**
1. When resolving coach payload, compute `defaultLearningsRoleId` = HM Persona id (resolve rules above) or `null`.
2. Structure learnings once as campaign evidence **and** attach a coach field e.g. `learningsDefaultRoleId` / `interviewLearnings` (exact shape at implement time) so planning prefers `hiringTeamRoleId === defaultLearningsRoleId` for new learnings-driven open questions.
3. Keep the same FACT texts in the flat list so **other** interviewer prep / person rounds may use them as **background** (not as that person’s exclusive `interviewStages` notes).
4. Do **not** copy learnings into every `people[].interviewStages` (would violate “describe that individual only” for stage-scoped notes); default routing is explicit via the new field + prompt rule.

### Prompt text — approval required

Coach instructions **already** mention interview learnings but **conflict** with HM-default:

Exact current text from `CONSULTATION_COACH_SYSTEM_INSTRUCTIONS` (`src/lib/prompt-content/consultation.ts`):

- **Line 10:** `Sources: the Personal Profile, including background the person added later and what they learned in interviews, is what the person has stated. Treat all of it as true. Re-evaluate your assessment whenever it changes. …`
- **Line 28:** `Hiring Team: each role carries generalPersona, the built persona for the role itself, and people, the individuals matched to that role. These are separate entries and stay separate: a person's own persona, LinkedIn details, recorded notes, interview stages, and interview learnings describe that individual only. Never merge a person into the generalPersona, never treat one person as standing for the role, and never apply one person's details to another. …`
- **Line 41:** `interviewerPrep: when this object is present, … Ground it in that person's entry, persona, LinkedIn, notes, invitation, stages, and learnings, read alongside the role's generalPersona. …`

**Reason to change (for PO approval — do not edit until approved):** Line **28** says interview learnings “describe that individual only,” which blocks applying campaign/stage learnings by default to the Hiring Manager’s section and as background for others. Need an approved replacement that: (a) campaign `seekerLearnedNotes` and stage notes default to the Hiring Manager role/section; (b) other interviewers may use the same learnings as background only; (c) stage-scoped notes on a person’s stages remain that person’s; (d) never invent a cross-person “about” association. Line **10** may need a one-sentence clarification that interview learnings default to the Hiring Manager. **Do not write the replacement wording in this plan** — PO supplies it.

---

## 2. Decision 2 — Learnings re-plan only on real change

### Reassess trigger today (cite)

| Trigger | File | Behavior |
|---------|------|----------|
| Save learned notes | `saveApplicationJobLearnedNotes` (`src/lib/application/service.ts` **919–966**) | Always `enqueueApplicationJob` `CONSULTATION` `{ operation: "reassess" }` at **961–966** after writing `seekerLearnedNotes`. **No** content equality check against prior notes before enqueue. Also enqueues `APPLICATION_SUMMARY` + per-persona cheat-sheet sections (**938–959**). |
| Stage notes change | `updateInterviewStageAction` (`src/app/actions/interview.ts` **133–139**) when `updated.notesTextChanged` | Enqueues same `CONSULTATION` `reassess`. `notesTextChanged` is true only when trimmed before/after differ from stored (`src/lib/interview/stages.ts` **165–177**) — stage path already skips enqueue when note **text** unchanged, but still has **no** Phase 1 fingerprint / receipt for consultation. |
| Job processor | `process.ts` **347–351** | `operation === "reassess"` → `reassessConsultationStanding` |
| Reassess impl | `reassessConsultationStanding` (`consultation/service.ts` **1386–1394**) | Calls `startConsultation({ forceReassess: true })` |
| Force path | `startConsultation` **1333–1344**, **1360+** | With `forceReassess`, skips “already DONE / has briefing” early returns and re-runs assess + plan |

**Unguarded:** learned-notes save always enqueues reassess even if normalized notes equal existing; no `PaidCallReceipt` / input hash for consultation learnings; page view does not enqueue today (`ConsultationSection` only posts `startConsultationAction` on explicit CTA ~**405**), and that must stay true.

### Fingerprint inputs

Canonical object (hash with `fingerprintPaidCallInputs` from `paid-call-gate.ts` **9–12**, same approach as `cheatSheetPersonSectionInputHash` in `people.ts` **18–40**):

| Include | Source |
|---------|--------|
| Normalized `JobRequirement.seekerLearnedNotes` | Learned notes field |
| Per stage: `id`, `notesBefore`, `notesAfter` (sorted by id) | All application stages |
| `CONSULTATION_PROMPT_VERSION` | Coach identity |
| Optional: coach schema / learnings-routing marker once payload field ships | Avoid silent skip after prompt/payload change |

**Exclude:** timestamps alone; scorecardJson; profile body (profile changes use other consultation paths); page-view metadata; `aboutContactId` (none).

**Usable stored result:** last successful plan/reassess outcome for that fingerprint — skip paid coach plan call; keep open questions + approved statements. Prefer extending `PaidCallOperation` with e.g. `CONSULTATION_LEARNINGS_REASSESS` and `subjectKey = campaignId` on `PaidCallReceipt` (`schema.prisma` **662–677**; operations today are only `HIRING_TEAM_IDENTIFY` \| `HIRING_TEAM_SYNTHESIZE` at `paid-call-gate.ts` **5–7**). Gate **before** enqueue when possible (mirror `personSectionInputsUnchanged` / `enqueue.ts`), and again inside the worker before `forceReassess` paid call.

### Gated, serialized, additive

| Property | Plan |
|----------|------|
| **Gated** | Compute fingerprint on learned-notes save and on stage notes save; enqueue `CONSULTATION` `reassess` **only** if fingerprint ≠ last receipt (or no usable receipt). Learned-notes path must compare normalized notes / fingerprint **before** enqueue (today it does not). |
| **Serialized** | Existing: `CONSULTATION` in `SERIALIZED_APPLICATION_JOB_TYPES` (`application-jobs/service.ts` **16–22**); merge ops collapse duplicate `reassess` on same key. Keep campaign-wide one active CONSULTATION. |
| **Additive** | Reassess may append open CONSULTANT turns and upsert assessments; **must not** delete or rewrite `ConsultationStatement` with status APPROVED; **must not** change seeker-confirmed / approved answer bodies; **must not** re-ask keys in `askedQuestionsFromTurns` / ignored. Explicit code locks in reassess/plan path — today APPROVED does **not** gate “asked” (`service.ts` ~**1239–1278**); batch D adds the invariant. Seeker changes approved answers only via Edit. |
| **Never page view** | No enqueue from `ConsultationSection` load, Stage load, or summary load. |

---

## 3. Decision 3 — Role-expertise questions (General)

### 3a. Existing “Likely questions” (+ sample answers) and similar Harper generation

| Generator | What it produces | Inputs | Per interviewer? | Role-level general set? | Cost |
|-----------|------------------|--------|------------------|-------------------------|------|
| `generateCheatSheetPersonSectionGuidance` (`application-summary/ai.ts` **71–109**) | Person section including `likelyQuestions[]` with `prompt` + `sampleAnswer` / `harperQuestion` (`contract.ts` **140**; prompt `application-summary.ts` **26**) | One person + `sourcesForPersonSection` — PERSONA, LinkedIn, INTERVIEW_INTEL, INTERVIEWER_*, PERSON_PREP; **not** a job-only fingerprint (`service.ts` **701–726**, hash `cheatSheetPersonSectionInputHash`) | **Yes — one paid CONSULTATION_AI structured call per person section** when hash miss | **No.** Prompt: “questions **this person** is likely to ask” (`prompt-content/application-summary.ts` **26`). Cannot correctly produce “what a hiring manager for this **role title** would ask any strong candidate” without changing semantics and still being tied to one contact’s sources. | One person-section generation each time person sources/hash change; uses consultation AI provider |
| Harper `planQuestionRound` / coach | Gap / chronology / why-this-company / interviewerPrep questions | Job targets + Personal Profile + hiring team + learnings | Gap questions are application-general; prep is per contact | **No role-expertise set.** Questions close **requirement gaps**, not “role craft knowledge” | Paid coach plan on start/continue/reassess |
| Interview guide `likelyQuestions` | Guide JSON per interviewer | Interview guide generation | Per interviewer | No | Separate interview guide path |

**Verdict:** Reuse the **schema idea** (question + drafted answer) and **reply/polish plumbing**, but **do not** call `generateCheatSheetPersonSectionGuidance` / person `likelyQuestions` to produce the General role-expertise set — wrong scope and wrong fingerprint (includes persona/LinkedIn/intel).

### 3b. Role-expertise question set — new generation required

**New** job-scoped generation (name TBD at implement, e.g. `generateRoleExpertiseQuestions`):

| Aspect | Plan |
|--------|------|
| **Fingerprint** | Job inputs **only**: e.g. title, reporting line, location/work arrangement, raw posting (or normalized), required/preferred/responsibilities lists, scorecard mission/outcomes as stored on `JobRequirement` after parse — **exclude** Personal Profile, learnings, personas, contacts. Hash via `fingerprintPaidCallInputs`; store on `PaidCallReceipt` with new operation e.g. `ROLE_EXPERTISE_QUESTIONS`, `subjectKey = campaignId`. |
| **Storage** | Persist as Harper `ConsultationTurn` CONSULTANT rows (and draft results) under **General**, with a dedicated `targetKey` prefix e.g. `role-expertise:{index}` (or stable slug). Session already holds all Harper Q&A (`ConsultationTurn.targetKey` in `schema.prisma` **2606**). Optionally also keep receipt `resultJson` as cache of the question list. **No** new seeker-facing store; **no** writing into per-person `guidanceJson.likelyQuestions`. |
| **When it runs** | After successful job parse / posting save (`interpretJobPosting` / `persistInterpretedJobRequirement` path in `application/service.ts` **903–916**) **or** explicit seeker action that already rebuilds job interpretation — **never** on Harper/Stage/summary page view. If receipt hash matches, skip provider. |
| **Count** | **PO chooses** — not set in this plan. |
| **Avoid duplicating per-interviewer likely questions** | Separate `targetKey` namespace; never enqueue person-section generation for this; cheat-sheet person `likelyQuestions` remain per-interviewer display; General role-expertise questions are role-craft, not “what Erik will ask.” Dedup text against already-asked Harper questions / person likely prompts only if identical normalized string (optional safety). |

**New prompt text is required** for the question-set model call — **do not write it here**; submit for PO approval at implement. Reuse consultation AI provider configuration where appropriate.

### 3c. Harper-drafted answer from Personal Profile

| Aspect | Plan |
|--------|------|
| **Produce how** | Prefer **same paid run** as the question set when the run also receives Personal Profile evidence and returns `{ prompt, draftAnswer }[]` — one receipt, job fingerprint for **questions**, with answers filled from profile in that call. **Alternative if quality suffers:** second fingerprint that includes profile hash for **draft answers only**, questions remain job-only cached. Prefer single run first to meet “one paid run per application” for the question set; PO cost rule: question set re-runs only when **job** changes. |
| **If profile changes later** | **Do not** re-run the job-fingerprint question set. Optionally refresh **unanswered / unapproved** draft answers only when profile fingerprint changes (separate cheaper path or continue/reassess additive) — never overwrite APPROVED results. If that optional refresh is deferred, drafts stay until seeker replies/Edit. |
| **Fingerprint for answers** | Questions: job-only. Draft bodies: may include profile hash if separate; if same run, stored drafts are part of receipt but **re-run gate for questions remains job-only**. |

### 3d. Reply, polish, approve, cheat sheet

| Step | Plan |
|------|------|
| Reply | Same as other Harper questions: `recordConsultationReply` then enqueue `CONSULTATION` `process_reply` (`actions/consultation.ts`); drain incomplete SEEKER turns first (`drain.ts`; `process.ts` **335–339**); UI waits while `consultationBusy`. |
| Polish / approve | Existing extract → polish → statement approve/regenerate / Edit link (batch A control polish). |
| Fill gaps | Seeker reply supplies what profile lacked; Harper curates into polished interview answer like any gap question. |
| Cheat sheet | Approved / polished material already flows into summary sources on existing enqueue rules; display under General-relevant cheat-sheet surfaces or shared guidance — **do not** add a second answer form on Stage/CS (batch B). Link from CS to `#harper-q:{turnId}` / `#harper-general`. Person-section `likelyQuestions` remain separate. |

---

## 4. Batches A–D (full), §7 (updated), §8 (updated)

### Batch list A through D

| Batch | Exactly what it contains | Testable alone |
|-------|--------------------------|----------------|
| **A** | Harper layout: Where you stand **once** at top (display-only ratings; **remove** standing gap reply forms). Partition General vs interviewer sections (Stage date order). Anchors (`#harper-standing`, `#harper-general`, `#harper-contact:…`, `#harper-q:…`). Control polish: Expand evidence / Show your replies as text links; **Edit** link hides textarea until click. General section **renders** role-expertise questions when present (display + reply UI only — generation may ship in D). Fix defect **8a** by construction. | Render order; why-company answerable once; Edit hides box; role-expertise rows appear under General when turns exist |
| **B** | Stage + Cheat Sheet: remove answer forms (`CheatSheetCoachItems` submit); links to Harper anchors; Add Persona → existing build queue + navigate to `#harper-contact:…`; retarget “review open questions” to Harper. No `APPLICATION_SUMMARY` / resume / cover / identify enqueue from UI-only navigation. Thank-you clarify stays Stage outreach unless PO says otherwise. | No Q&A forms on Stage/CS; navigation; no SUMMARY from link render |
| **C** | Defect gates **8b / 8d / 8e** + tighten **8c** raw/meta result (`questions.ts`, `assess.ts`, `results.ts` / polish quality). Code gates, not seeker filters. | Unit tests: mission/pitch never planned; orphan STAR dropped; second walk-through dropped; raw clarification not final result |
| **D** | (1) Learnings fingerprint gate + enqueue-before-check on learned notes + stage notes; `PaidCallReceipt` (or equivalent) for learnings reassess; additive locks so APPROVED answers never change; HM-default learnings payload routing + **PO-approved** coach prompt edit. (2) Role-expertise **generation**: job-only fingerprint, one cached paid run, store General `role-expertise:*` turns + profile draft answers; wire into existing reply/polish/approve; cheat-sheet via existing approved-source path; never on page view. | Unchanged learnings → no reassess/plan paid call; changed → one serialized additive CONSULTATION; role-expertise once per job fingerprint; reply curated; no page-view enqueue |

**Dependencies:** **A** before **B** (anchors). **D** can follow **A** (General must exist to show role-expertise). **C** independent of A/B. Prompt edits in **D** wait on PO approval of exact text.

### Section 7 — Learnings into Harper (updated with decisions 1 and 2)

### Does Harper read learnings today?

**Yes** — two channels:

| Channel | Association | Citation |
|---------|-------------|----------|
| Flat coach evidence | **Campaign-general:** `seekerLearnedNotes` + every stage’s `notesBefore`/`notesAfter` as FACT / `source: "interview_learning"` (stage id only, no “about” contact) | `learnedNotesEvidence` / `interviewNotesEvidence` / `seekerStatedFactsForCoach` (`consultation/service.ts` **782–859**, wired in `planAndStoreRound` ~**973–1021**) |
| Hiring-team person payload | **Per interviewer on that stage:** stages fan out by `stage.interviewers[].contactId` onto `people[].interviewStages` (includes that stage’s notes) plus `recordedNotes` / prep learnings | `hiring-team-context.ts` **210–225**, **243–255**; coach prompt **28**, **41** |

| Other | File | Behavior |
|-------|------|----------|
| Coach prompt | `prompt-content/consultation.ts` **10**, **28**, **41** | Mentions interview learnings; line **28** currently “individual only” |
| `detectInterviewNoteGap` | `interview/stages.ts` **398–435** | **Not** on Harper plan path — Stage offer only |
| Triggers | `saveApplicationJobLearnedNotes` → `CONSULTATION` `reassess` (**961–966**); stage notes → `reassess` (`interview.ts` **133–139**) | **Unguarded** for learned notes content; no Phase 1 fingerprint under consultation |

Learnings **do not** feed job parse / scorecard (learned-notes-cheat-sheet-only); they still feed cheat-sheet sources.

### Decision 1 (PO) — default to Hiring Manager

- Identify HM via `suggestionKey === "hiring_manager"` / `cheatSheetSectionKind` → `HIRING_MANAGER`; section = matched contact when present (Addendum §1).
- Learnings apply to HM Harper planning by default; other interviewers get learnings as **background** only.
- **No** new association field, seeker input, or schema. Cross-interviewer “about VP” picker is **out of scope**.

### Decision 2 (PO) — fingerprint-gated additive reassess

- Fingerprint: normalized learned notes + per-stage notes + consultation prompt version (Addendum §2).
- Enqueue/run only when fingerprint changes; serialize via existing CONSULTATION same-key rules; additive (never change approved answers); never on page view.
- Prompt change for HM-default: show current lines **10 / 28 / 41** for approval (Addendum §1); do not ship prompt edit without PO text.

### Section 8 — Five defects (still occur? planned fix)

### 8a. Requirement ratings / “Why you want to work at this company” twice

**Can still occur today: yes.** Thread + standing both answerable (`questions.ts` **290–294**; `ConsultationStanding.tsx` **102–161**; order locked `qa-view.test.ts` **580–586**).

**Planned fix:** Batch **A** — standing display-only at top; why-company only in General. **Still fixable under this addendum; unchanged.**

### 8b. Company mission → Harper question

**Mostly prevented; residual risk today.** `isCompanyMissionOrTagline` / `openGaps` (`assess.ts` **607–637**); narrow `looksLikeCompanyPitch` **600–605**; prompt line **22**.

**Planned fix:** Batch **C** — exclude pitches at `evidenceTargets` / `pushUniqueTarget` in code. **Still can occur until C; planned fix unchanged.**

### 8c. Seeker reply echoed as Harper result

**Mitigated; can still occur.** `isRawSeekerResult` / `polishAnswerWithQuality` (`service.ts` **624–651**; `results.ts` **55+**).

**Planned fix:** Batch **C** — tighten raw/meta detection; prefer `replyType: "feedback"`. Role-expertise replies use the **same** polish path (batch D wires them in). **Still can occur until C; planned fix unchanged.**

### 8d. Orphan STAR template question

**Can still occur** if the model returns a context-free STAR and it passes `validModelQuestion` (`questions.ts` **157–165**). One extract-failure path is tested away (`consultation.test.ts` **3004–3010**).

**Planned fix:** Batch **C** — server reject orphan STAR / unlinked templates in `planQuestionRound`. **Still can occur until C; planned fix unchanged.**

### 8e. Near-duplicate walk-throughs (different employers)

**Can still occur: yes** — `questionNearDuplicate` token/Jaccard rules (`questions.ts` **51–61**; `sameRequirementMeaning` in `assess.ts` **205–226**) miss Merion vs Aerotek walk-throughs; chronology forced once by key only (**374–376**).

**Planned fix:** Batch **C** — intent-class dedupe for career walk-through. **Still can occur until C; planned fix unchanged.**

---

## 5. Affected files, cost confirmation, batch split (for these decisions)

### Affected files / functions (addendum deltas)

| Area | Files / functions | Change |
|------|-------------------|--------|
| HM resolve + learnings payload | `hiring-team-context.ts`, `seekerStatedFactsForCoach` / `planAndStoreRound` in `consultation/service.ts`, possibly `prompt.ts` payload types | `defaultLearningsRoleId`; HM-default routing; background for others |
| Coach prompt | `prompt-content/consultation.ts` | **PO-approved** edit to lines **10 / 28** (and if needed **41**) only after approval |
| Learnings gate | `saveApplicationJobLearnedNotes` (`application/service.ts` **919–966**), `updateInterviewStageAction` / notes path, `reassessConsultationStanding` / `startConsultation`, `paid-call-gate.ts` (`PaidCallOperation` extend), worker `process.ts` | Fingerprint before enqueue + before paid plan; additive APPROVED locks |
| Role-expertise | New generator module under `consultation/` or `application/`; job parse / posting save enqueue point; `PaidCallReceipt`; turn creation with `role-expertise:*`; `qa-view` General partition | One job-fingerprint cached run; drafts from profile; never page view |
| Reply path | Existing `recordConsultationReply`, drain, polish — no parallel CS answer path | Role-expertise uses same flow |
| UI | `ConsultationSection` / Thread General subset (batch A) | Show role-expertise under General |
| Schema | **None** for learnings association. `PaidCallReceipt.operation` is already free-form `String` — new operation names need **no** migration if only string values added. Consultation turns use existing model. | No data backfill |

**Removed from earlier plan:** optional `aboutContactId` schema / seeker about-person UX.

### Cost confirmation

| Step | New paid call? |
|------|----------------|
| UI consolidation (A/B), defect gates (C) | **No** |
| Learnings fingerprint unchanged | **No** plan/reassess paid call (gate **reduces** today’s unguarded cost) |
| Learnings fingerprint changed | **One** serialized `CONSULTATION` reassess/plan |
| Role-expertise question set | **One** paid run per application **per job fingerprint**; skip when hash matches; **not** on page view |
| Role-expertise draft answers | Prefer included in that same run; profile-only refresh of unapproved drafts is optional and must not re-bill the question set when job unchanged |
| Seeker reply to role-expertise | Same reply/polish cost as any Harper question |
| Must not enqueue from these decisions alone | Resume, cover, identify, synthesize, unguarded full summary regen beyond existing learning→CS rules |

Serialization / reply wait / drain unchanged: campaign-wide `CONSULTATION`; `recordConsultationReply` before enqueue; never sync paid reply on click.

### Batch split (summary)

Same as §4 table: **A** layout/controls (+ display role-expertise), **B** Stage/CS links, **C** defects 8b–8e, **D** learnings gate + HM default + role-expertise generation. **A→B**; **D** after **A**; **C** independent; prompt text in **D** blocked on PO approval.

---

## TESTS (implementation would add — do not run or write now)

1. Learnings apply to the Hiring Manager section by default: coach/plan payload marks HM role; new learnings-driven open questions use HM `hiringTeamRoleId` / appear under HM Harper section when a HM contact exists (under General tagged to HM role when contact missing).
2. Unchanged learnings (same fingerprint) trigger **no** `CONSULTATION` reassess enqueue and **no** planning provider call.
3. Real learning change → exactly **one** serialized `CONSULTATION` reassess/plan; open questions may change; **APPROVED** statements / approved answers **unchanged**.
4. Role-expertise questions appear in Harper **General** with a Harper-drafted answer from Personal Profile.
5. Role-expertise generation runs **once** per application for a given job fingerprint; does **not** re-run when learnings/profile/persona change unless **job** inputs change (questions); optional draft refresh never overwrites approved answers.
6. Seeker reply to a role-expertise question goes through `recordConsultationReply` → enqueue → drain → polish/approve like other Harper questions and reaches cheat-sheet display via existing approved-source path (no Stage/CS answer form).
7. **No** page view (Harper, Stage, summary, Job Requirements) enqueues learnings reassess or role-expertise generation.
8. (Regressions from original plan) Harper-only answer UI; no employer fit on Harper when flag off; Stage/CS links not forms; standing once; Edit link; 8a–8e unit expectations as in batches A/C.

---

## Risks / unknowns

- **HM appears after learnings saved with unchanged fingerprint:** may need a one-time “HM resolved” re-key or include HM persona id in fingerprint so routing updates without a fake notes change — product call at implement.
- **Coach prompt line 28** must be rewritten with PO wording before HM-default is reliable; payload alone may be insufficient.
- **Single-run vs two-run** for role-expertise questions vs profile drafts: prefer one run; if draft quality is poor, split answer fingerprint without violating “questions re-run only when job changes.”
- **`reassess` today is not APPROVED-safe** — additive locks are new work in batch D, not current behavior.
- **Thank-you clarify** on Stage remains outreach Q&A unless PO reclassifies.
- **Question count** for role-expertise is intentionally unset (PO).
- **New prompt text** for role-expertise generation is required and not drafted here.

---

# ORIGINAL PLAN BODY (still in force; §7–§11 superseded where addendum conflicts)

## 1. Data — same records or separate stores?

### Harper (consultation) — primary Q&A store

| Model / field | Role | Read path |
|---------------|------|-----------|
| `ConsultationSession` | Session status, briefing, prompt version | `ConsultationSection.tsx` loads session; `buildConsultationQaView` |
| `ConsultationTurn` (CONSULTANT / SEEKER) | Questions and seeker replies (`body`, `targetKey`, `analysisJson`, `skipped`, `seekerAuthored`) | `ConsultationThread.tsx` via `buildConsultationQaView` (`src/lib/consultation/qa-view.ts`) |
| `ConsultationAssessment` | Requirement ratings (STRONG / PARTIAL / NONE) + explanation | `ConsultationStanding` via assessments / `buildStandingGaps` (`standing.ts`) |
| `ConsultationStatement` | Polished results (resume bullet / talking point), approve/regenerate | Thread `ResultActions`; standing gap results |
| `ConsultationProposal` | Pending profile facts/stories | Confirm/dismiss actions |
| `ProfileStory` | Linked STAR from replies | Consultation service write-back |
| `Campaign.whyThisCompany` | Motivation answer for why-this-company target | Written by consultation extract/polish (`service.ts` ~**713–731**) |
| `CampaignContact.personPrep*` | Interviewer-prep opening + `personPrepAnswersJson` | Listed on Harper (`ConsultationSection.tsx` **341–367**); filled via `person_prep` CONSULTATION op (`process.ts` **361–386**) + `personPrepFocus` (`person-prep.ts` **87+**) |

Harper answers are **not** copied from Stage or Cheat Sheet for normal gap questions; they are authored through `recordConsultationReply` → `processConsultationReply` / drain.

### Stage — organizing + embedded answering today

| Surface | Storage | Same as Harper? |
|---------|---------|-----------------|
| Schedule, format, outcome, interviewer assignment | `InterviewStage`, `InterviewStageInterviewer`, `Contact`, `CampaignContact.chosenPersonaId` | N/A (org data) |
| `notesBefore` / `notesAfter` | `InterviewStage` | Not Q&A; learnings (see §7 / Addendum §1–2) |
| Embedded cheat-sheet person body | Renders `ApplicationSummary.guidanceJson` person section | **Display of cheat-sheet store**; answers via coach path below |
| `CheatSheetCoachItems` answer form (inside Stage via `InterviewStagePanel` → `CheatSheetPersonBody` **143–147**) | Writes **new** `ConsultationTurn` pair with `targetKey = cheatSheet:{itemId}` plus polish + profile fact (`answerCheatSheetCoachItem`, `application-summary/service.ts` **959–1036+**) | **Parallel write path** into consultation turns + profile — not the same `targetKey` as gap questions |
| Thank-you clarify Q&A | `InterviewStage.thankYouClarifyJson` | **Separate store**; feeds thank-you outreach, not Harper assessments |
| Consultation offer CTA | `InterviewStage.consultationOfferJson`; starts Harper with `focusTargetKey` | Not answering on Stage; kicks Harper plan |
| “Review open questions” | Link to summary `#contact:{id}-likely-questions` | Navigates to Cheat Sheet answering UI |

### Cheat Sheet — display + answering today

| Surface | Storage | Same as Harper? |
|---------|---------|-----------------|
| Shell + person sections | `ApplicationSummary.guidanceJson` | **Derived display**, not the consultation turn list |
| `harperQuestion` + reply form | Same as Stage embed: `answerCheatSheetCoachItem` | **Separate answering path** that creates `cheatSheet:…` turns |
| Sample answers / caresAbout / etc. | Guidance JSON | Read-only once coach gaps filled |
| Gained-information notes | `CampaignContact.cheatSheetNotesJson` | Not Harper Q&A |

### Consolidation verdict

Interactive Q&A is **not** three independent answer stores. Canonical interactive answers already land in **one** `ConsultationSession`. Consolidation removes Stage/summary **answer forms**; keep Harper as the only write UI. **Schema for UI consolidation: none.** Cross-person “about” association: **rejected by PO** (no field).

---

## 2. Harper page structure

### Today (`ConsultationSection.tsx`)

Approximate order (**420–520**): KnowAboutMe → progress → person-prep offers → **ConsultationThread** → pause/done → **Where you stand** (`consultation-standing-panel`, **464+**). Test: Thread before standing (`qa-view.test.ts` **580–586**).

### Target order

1. **Where you stand (once):** summary + requirement ratings; **remove** gap reply forms from standing.
2. **General questions:** gap / chronology / why-this-company / **role-expertise** — not `person-prep:…`.
3. **One section per interviewer**, Stage date order; open questions first; anchors for CS links.

---

## 3. Employer fit on Harper’s page

With `employerIcpFit: false`, Harper does not render employer-fit scoring; `review_fit` not suggested (`harper-actions.ts` **51–53**). Keep gate; do not reintroduce.

---

## 4. Stage

Remove embedded cheat-sheet answer forms; keep organizing fields; Add Persona → existing build + navigate to Harper `#harper-contact:…`; retarget “review open questions” to Harper. Thank-you clarify: leave as Stage outreach unless PO decides otherwise.

---

## 5. Cheat Sheet

Answer/edit controls become **links** to Harper anchors; no `answerCheatSheetCoachItem` from seeker UI; do not enqueue `APPLICATION_SUMMARY` solely for UI move. Role-expertise approved answers reach CS via existing sources, not person `likelyQuestions` generation.

---

## 6. Harper controls

Expand evidence / Show your replies → text links. Add another reply → **"Edit"** text link; textarea only after click.

---

## 7–11

See **Addendum deliverable §§1–5** above for the authoritative §7 (learnings), §8 (defects), cost, files, and batches A–D. Earlier draft notes about `aboutContactId` are **void**.
