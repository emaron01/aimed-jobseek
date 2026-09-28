# Harper prep hub — PLAN ONLY (replaces Batch B)

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `origin` `https://github.com/emaron01/aimed-jobseek.git`. Aimed Outreach was not read or touched.  
**Saved prompt:** `docs/prompts/harper-prep-hub-plan.md`.  
**Mode:** PLAN ONLY — no code, configuration, schema, prompts, tests, or data changed beyond this document and the saved prompt.  
**Replaces:** Batch B of `docs/prompts/harper-single-qa-surface-plan-report.md`. **Batch A carries over** (layout, anchors, Answer/Share/Ignore/Ignored, cap 25 from config). **Batch C** (defects 8b–8e) and **Batch D** (learnings gate, HM-default learnings, role-expertise generation) stay separate; this plan leaves room for role-expertise under Where you stand and does not implement them.

**Code basis (current tree):** Batch A Harper layout (`harper-layout.ts`, `ConsultationSection` / `Standing` / `Thread`), `consultationConfig.applicationQuestionLimit` = 25, Phase 1 `runPaidStructuredCall` / `PaidCallReceipt` (`paid-call-gate.ts`), `CONSULTATION` in `SERIALIZED_APPLICATION_JOB_TYPES` (`application-jobs/service.ts` **16–22**), `drainConsultationUnprocessedInput` (`consultation/drain.ts`), reply wait via `consultationBusy` / `jobsActive`, learned-notes → cheat-sheet-only (no job-parse feed).

---

## 1. Current state

### Stage (timeline today mixes prep + outreach + Q&A)

| Surface | Path | What it does |
|---------|------|--------------|
| Interviews page | `src/app/(app)/campaigns/[id]/interviews/page.tsx` | Workspace focus `interviews` |
| Stage list UI | `InterviewStagesSection` (`src/components/InterviewStagesSection.tsx` **36–445**) | Create/update stages; embeds panel; **only place** for notes edit, thank-you/check-in, and gap offer |
| Per-stage panel | `InterviewStagePanel` (`src/components/InterviewStagePanel.tsx` **23–212**) | Assign/add interviewer; **embeds full `CheatSheetPersonBody`** (**171–185**) including likely-question answer forms; “gained information” note form (**190–**) |
| Stage detail route | `src/app/(app)/campaigns/[id]/interviews/[stageId]/page.tsx` **84–111** | Same `InterviewStagePanel` only — **no** notes/thank-you/gap forms on this page |
| Open-stage quick actions | `InterviewStageOpenActions` (**18–58**) | Focus notes; “Review open questions” → Cheat Sheet likely-questions hash via `workspaceInterviewLikelyQuestionsHref` (`workspace-links.ts` **55–65**) |
| Thank-you / check-in | `InterviewStagesSection` **288–415** | After `notesAfter`: clarify Q forms + Email/LinkedIn thank-you + check-in → `generateOutreachAssetAction` |
| Gap offer | **417–436** | `startInterviewGapConsultationAction` when `consultationOfferJson` set; written by `refreshConsultationOffer` (`guide.ts`) using `detectInterviewNoteGap` (`stages.ts` **398–435**) when `notesAfter` text changes (`interview.ts` notes-save path) |
| Notes storage | `InterviewStage.notesBefore` / `notesAfter` via `updateInterviewStageAction` → `stages.ts` | Timeline notes (what seeker learned) |
| Gained-info storage | `CampaignContact.cheatSheetNotesJson` via `addCheatSheetInterviewNote` | Shown on Stage panel + CS |
| Interview-guide clarifying | `generateInterviewGuideAction` / `InterviewStageGuide` clarify JSON | **Backend + action exist; no Stage UI** — out of this plan’s move list unless PO later wants a home |

### Cheat Sheet

| Piece | Path | Notes |
|-------|------|-------|
| Page | `src/app/(app)/campaigns/[id]/summary/page.tsx` | Overview, people, company, position; print |
| Search | `CheatSheetPeopleFilter` + `applicationSummaryConfig.actions.filterPeople` = `"Find a person or ${persona}"` (`product-config/application-summary.ts` **13–14**); placeholder **14** |
| Person body | `CheatSheetPersonBody` (**36–175**) | caresAbout, positioning, keyStatements, **likelyQuestions** via `CheatSheetCoachItems`, questionsToAsk; build persona / generate section CTAs |
| Answer forms | `CheatSheetCoachItems` (**11–76**) → `answerCheatSheetCoachAction` → `answerCheatSheetCoachItem` (`application-summary/service.ts` **~980–1130**) | Creates `ConsultationTurn` pair with `targetKey = cheatSheet:{itemId}` (**1014–1034**), polish, profile fact, updates `sampleAnswer` / clears `harperQuestion` |
| Data | `getApplicationSummaryView`; person guidance in summary JSON; notes via cheat-sheet notes by contact |

### Harper (Batch A)

| Piece | Path | Behavior |
|-------|------|----------|
| Page / section | consultation route → `ConsultationSection` | Load session/turns/assessments; **no** plan enqueue on view (`no-ai-on-view.test.ts` **161–183**) |
| Layout | `buildHarperQaLayout` (`harper-layout.ts` **59–117**) | General = non–`person-prep:` questions; interviewer sections = `person-prep:{contactId}` |
| Anchors | `HARPER_STANDING_ANCHOR`, `HARPER_GENERAL_ANCHOR`, `harperContactAnchorId`, `harperQuestionAnchorId` (**8–17**) | `#harper-standing`, `#harper-general`, `#harper-contact:{id}`, `#harper-q:{turnId}` |
| Standing | `ConsultationStanding` | Ratings + gap list; Answer link to `#harper-q:…` (**205–215**); Share/Ignore when no open question (**217–256**); **not** full inline Q&A cards |
| Thread | `ConsultationThread` **488–537** | Free-floating **General** list + per-interviewer Q lists with reply/Edit/Ignore |
| Person-prep cards | `ConsultationSection` **381–407** | “Prep for this interviewer: {name}” from `listPersonPreps` / `interviewConfig.labels.personPrepOffer` (**interview.ts** **51**) — cards only; questions live in thread contact sections |
| Know About Me | `ConsultationKnowAboutMe` in `ConsultationSection` | Background blob (not a Harper turn Q) — **stays on Harper**; not Stage Q&A |
| Storage | `ConsultationSession` + `ConsultationTurn` + `ConsultationStatement` + `ConsultationAssessment` | Cap: `consultationConfig.applicationQuestionLimit` (25) in questions/service + coach prompt builder |

**Question / answer homes today**

| Kind | `targetKey` | UI today |
|------|-------------|----------|
| Gap / requirement | assessment key (req/outcome/competency/…) | Standing Answer link + **also** General thread card |
| Why this company | `why-this-company` (`contract.ts` **5**) | General (and standing if assessed) |
| Career walk-through | `chronology` | General only (not a standing requirement) |
| Interviewer prep | `person-prep:{contactId}` (`PERSON_PREP_TARGET_PREFIX` **6**; `person-prep.ts` **34–42**) | `#harper-contact:{contactId}` |
| Cheat Sheet coach reply | `cheatSheet:{itemId}` (`service.ts` **1014**) | Turn is General (not person-prep); sample answer also on CS item |
| Stage thank-you clarify | `InterviewStage.thankYouClarifyJson` | Stage only (not ConsultationTurn) |
| Stage notes | `notesBefore` / `notesAfter` | Stage |
| Gained-info notes | cheat-sheet notes by contact | Stage panel + CS |

### Outreach page

| Piece | Path |
|-------|------|
| Route | `src/app/(app)/campaigns/[id]/outreach/page.tsx` → `ApplicationWorkspace` `focus="outreach"` |
| UI | `ApplicationOutreachSection` (`ApplicationOutreachSections.tsx`) |
| Thank-you | Generator kind `INTERVIEW_THANK_YOU` (**97**, **454**, **917–940**); **always sends `skipThankYouQuestions=1`** (**877–882**) — clarify UI lives on Stage, not Outreach |
| Assets | EMAIL / LINKEDIN_* with purposes including `THANK_YOU` / `CHECK_IN`; generation in `application-assets/outreach.ts` (`generateInterviewThankYouClarifyingQuestions` when not skipped, **~860–940**) |

### Cost / jobs (relevant)

- `offerPersonPrep` → `CONSULTATION` `{ operation: "person_prep" }` (`person-prep.ts` **75–84**); worker runs `startConsultation` with interviewerPrep (`process.ts` **361–386**) after drain (**335–339**).
- Add interviewer on Stage: `addInterviewStageInterviewer` (`stages.ts` **338–395**) → `addApplicationContact` → optional `saveLinkedInPaste` (CONTACT_PROFILE) → `offerPersonPrep` → else `enqueueInterviewerCheatSheetSection`.
- Build persona from CS: `buildCheatSheetPersonaAction` → `queueHiringTeamBuild` (**25–46**).
- Phase 1 gate: hiring-team identify/synthesize receipts; consultation learnings gate is **Batch D**, not this plan.
- Serialization: `CONSULTATION` in `SERIALIZED_APPLICATION_JOB_TYPES` (**16–22**).

---

## 2. Stage — remove / move → timeline

**Keep (timeline)**

- Add stage; type, format, scheduledAt, expected decision, outcome.
- Choose / assign interviewer (existing contacts); optional “add new interviewer” **only if** still needed for scheduling — prefer Harper “Add Interview Contact” for prep-before-schedule (see §6); Stage still assigns who is on the meeting.
- Notes before / notes after (what the seeker learned) — display + edit.
- Link to open stage / guide if still a schedule artifact (guide generation is not Q&A answering on Stage; confirm at implement whether guide CTA stays as timeline tool — **default: keep guide enqueue as seeker action on stage detail, not as answer form**).
- “Add newly gained information” note → still allowed as notes-to-cheat-sheet (read path for CS), not as question answering.

**Remove from Stage**

| Element | Today | Disposition |
|---------|-------|-------------|
| Embedded `CheatSheetPersonBody` (full prep + likely Q answer forms) | `InterviewStagePanel` **171–185** | Remove from Stage; person prep lives on Harper (§5) and read-only on Cheat Sheet (§8) |
| `CheatSheetCoachItems` answer forms (via panel) | Same | Remove |
| Thank-you clarify form + thank-you Email/LinkedIn + check-in buttons | `InterviewStagesSection` **288–415** | Move to Outreach (§3) |
| Consultation gap offer CTA | **417–436** | Retarget: link/CTA to Harper `#harper-standing` / `#harper-q:…` only; **do not** start a second answer surface on Stage. Prefer enqueue-free navigation; if `startInterviewGapConsultationAction` remains, it must only focus existing Harper planning (already a CONSULTATION job — seeker-initiated from Stage notes path today; after move, trigger only from notes-save backend offer consumption on Harper or drop Stage CTA and keep offer data for Harper banner) |
| “Review open questions” → CS likely-questions | `InterviewStageOpenActions` **38–45** | Retarget to Harper `#harper-contact:{contactId}` (or selected person view) |

**Resulting Stage:** who / when / how + interview notes (+ assign interviewer + schedule). No question forms, no answer displays from Harper/CS, no outreach generators.

**Copy:** `interviewConfig.labels.sectionHelp` (**8–10**) still says cheat sheet lives on Stage — **PO must supply** replacement timeline help text.

---

## 3. Outreach — move thank-you (and check-in) from Stage

**Move with behavior unchanged (intent)**

1. Thank-you clarifying questions UI (Stage **290–336**) when `thankYouClarifyJson.questions` need answers.
2. Save answers + generate thank-you Email / LinkedIn InMail (Stage **338–392**).
3. Check-in generate (Stage **393–412**).
4. Underlying `generateOutreachAssetAction` + `outreach.ts` clarify generation / `skipThankYouQuestions` / `withThankYouAnswerSources` (**~745–940**).

**How**

- Extend Outreach generator path for `INTERVIEW_THANK_YOU` (and check-in if not already): when stage has pending clarify questions, **render the same question fields** Stage uses; remove hardcoded always-skip on Outreach (`ApplicationOutreachSections.tsx` **877–882**).
- Wire stage select (already **917–940**) + contact/persona from stage interviewer (same as Stage hidden fields).
- Keep asset list / mark-sent / existing proactive+follow-up behavior.

**Would break if skipped**

- Today Outreach **always skips** clarify → moving Stage CTAs without restoring clarify on Outreach would lose the only UI that answers thank-you questions.
- Stage-only test IDs (`thank-you-email-${stageId}` etc.) need Outreach equivalents; seeker flows that started on Stage must land on Outreach with stage preselected when possible (`?stageId=` or similar — **PO wording/URL optional**).

**Check-in:** already purpose `CHECK_IN` on Stage; Outreach should expose the same control next to thank-you for a selected stage (may already exist via generator kinds — verify at implement; if missing, add without new paid semantics).

---

## 4. Harper default view — Where you stand + inline Q&A

**Goal:** Default Harper = Where you stand as the hub; **every** non–interviewer-prep question renders **under its topic**, not in a free-floating General list.

**Mapping**

| Current General item | Placement |
|----------------------|-----------|
| Question whose `targetKey` matches a standing assessment / gap | Inline under that Where you stand requirement/gap (same `ConsultationQaItem` / turn ids — **display move only**) |
| `why-this-company` | Where you stand topic (synthetic or existing assessment row) |
| `chronology` | Where you stand topic “Career walk-through” (synthetic topic; not `isStandingRequirement` today — `assess.ts` **626–631**) |
| Future Batch D `role-expertise:*` | Where you stand (reserved namespace under General topics; generation still Batch D) |
| `cheatSheet:{itemId}` | **Not** Where you stand — under the interviewer profile that owns that coach item (§5 / §9) |
| `person-prep:{contactId}` | Interviewer profile only (already) |
| Unmatched / null `targetKey` | Where you stand **Other prep** bucket — **PO supplies** label |
| Orphan SEEKER turns (synthetic host “Your answer”, `qa-view.ts`) | Today land in General; place under **Other prep** (same turn ids; display only) |

**UI change**

- Fold `ConsultationThread` General list into `ConsultationStanding` (or a single standing+topics component): under each topic, render the existing `QuestionCard` / reply / Edit / Ignore / results (reuse `ConsultationThread` primitives). Share/Ignore for open gaps without questions stays Batch A behavior.
- Remove free-floating `#harper-general` **list of questions**. Keep `#harper-general` as optional scroll target for “top of Where you stand topics” **or** retire it and retarget links to `#harper-standing` — prefer **keep `#harper-general` as alias for standing topics root** so older links do not 404.
- `#harper-q:{questionTurnId}` unchanged on the question card wherever it is nested.
- Cap, ignore, drain, `consultationBusy` unchanged.

**No clear context (explicit)**

1. `chronology` — place under standing as synthetic topic (above).
2. `cheatSheet:*` turns — belong to person CS item, not standing (§5).
3. Orphan targetKeys — Other prep; list in implement audit query; no data migration.

---

## 5. Harper person view — search + full profile + Q&A

**Move from Cheat Sheet to Harper**

- “Find a person or Hiring Team role” (`filterPeople` / `CheatSheetPeopleFilter` pattern) onto Harper.
- Selecting a person opens **inline** full profile: same content blocks as `CheatSheetPersonBody` today (caresAbout, connections, positioning, keyStatements, likelyQuestions **display**, questionsToAsk, gained notes) — **read from existing summary guidance**; **do not** regenerate on open.
- Inline Harper Q&A for that contact: `person-prep:` questions + any `cheatSheet:{itemId}` turns whose item lives on that person’s section.
- Interviewer cards (“Prep for this interviewer: …”, `ConsultationSection` **381–407**) → link/scroll to that person view (`#harper-contact:{contactId}`).

**Batch A anchors**

| Anchor | Fate |
|--------|------|
| `#harper-standing` | Keep — default Where you stand |
| `#harper-general` | Alias to standing topics root (or redirect) |
| `#harper-contact:{contactId}` | Keep — person view root |
| `#harper-q:{questionTurnId}` | Keep — works inside standing or person view |

**Likely questions answering:** forms leave CS (`CheatSheetCoachItems` submit); on Harper person view, either (a) link Edit/Answer to existing Harper turn if `cheatSheet:` turn exists, or (b) first reply creates the same `answerCheatSheetCoachItem` path as today but **invoked only from Harper** — still one turn record, no duplicate. Prefer (a)/(b) with single action ownership on Harper.

**CS search after move:** Cheat Sheet keeps search for **read/print** (§8); Harper gets the prep/select search. Same filter helpers (`filter.ts`) reusable.

---

## 6. Add Interview Contact

**Label:** seeker-facing **“Add Interview Contact”** (PO decision 7). Today Stage uses “Add interviewer” / Outreach “Add Contact” — new Harper control with PO string.

**Reuse existing paths (seeker action only)**

1. Contact create: `addApplicationContact` (`contacts.ts` **74+**) — same fields as Stage add-interviewer form.
2. Optional LinkedIn paste: `saveLinkedInPaste` → CONTACT_PROFILE job (existing).
3. Persona: chosen/matched persona; build via existing `queueHiringTeamBuild` / `buildCheatSheetPersonaAction` path when seeker builds.
4. Prep: `offerPersonPrep` → CONSULTATION `person_prep` (existing paid coach plan for that contact) — **same cost as assigning interviewer on Stage today** (`stages.ts` **380–386**).
5. Cheat sheet section enqueue: same as Stage when no paste (`enqueueInterviewerCheatSheetSection` **387–394**) — existing seeker-driven path after add.

**Before scheduling:** contact appears on Harper person list / cards once `CampaignContact` exists; Stage “Choose interviewer” already lists campaign contacts (`InterviewStagePanel` **81–106**) — when later scheduled onto a stage, they show on the timeline with no second create.

**No new paid call types.** No page-view identify/build.

---

## 7. Hiring Manager chain (display-only)

### How HM is identified (code)

- Persona `suggestionKey === "hiring_manager"` (`HIRING_MANAGER_KEY`, `identify.ts` **54**, forced from reporting line **221–230**).
- Cheat sheet kind: `cheatSheetSectionKind` treats `hiring_manager` / “hiring manager” name as `HIRING_MANAGER` (`people.ts` — cited in prior plan report).
- Matched people: `CampaignContact.chosenPersonaId` → that Persona.

### Roles senior to HM — **not implemented**

There is **no** senior-to-HM / boss graph in schema or identify output. Available signals only:

- `involvement`: `"DIRECT" | "INDIRECT"` (`identify.ts` **9**, **18–26**) — not “boss of HM”.
- Role family `executive_sponsor` (`identify.ts` **144–147**) — possible proxy, not defined as HM’s manager.
- Job `reportingLine` is used as **HM likelyTitles** (`hiringManagerFromReportingLine` **221–230**), not as a separate boss role.

**Plan rule (root cause, no schema):**

1. **HM profiles:** every contact matched to HM Persona; if Persona exists with no contact, show role-level person view when product already has role-only CS sections — else HM chain mirrors only when a contact section exists.
2. **Boss profiles:** include contacts whose chosen Persona has `suggestionKey === "executive_sponsor"` **or** (PO-approved) other keys PO lists at implement. **Do not invent** Personas.
3. If **no** HM identified: do not fabricate chain; questions stay on their home contexts only.
4. If HM exists but **no** senior roles/contacts: mirror only onto HM profile(s).

**Display-only mechanics**

- Build a view model: `chainVisibleQuestions = all answered (and open, if desired) Harper Q&A items for the application` filtered for display on HM+boss person views.
- Render **copies of the same `ConsultationQaItem` / statement content** with Edit links to `#harper-q:{questionTurnId}` only — **no** new turns, **no** regenerate, **no** second reply form on the mirror.
- Person-prep questions for other interviewers still primary on that interviewer; **also** appear on HM chain per PO decision 4 (“every question asked and answered”).

**PO must confirm** the senior-role identification rule (executive_sponsor-only vs broader). Until then, implement gate: HM only if senior rule unresolved.

---

## 8. Cheat Sheet — read-only interview prep doc

**Content (keep, read-only)**

- Company / overview / position sections (`summary/page.tsx` **203–236**, **261+**).
- Per-interviewer sections via `CheatSheetPersonBody` **without** answer forms.
- Search + print (`CheatSheetPeopleFilter`, `CheatSheetPrintButton`, print CSS **158–162**).

**Changes**

- Remove `ApplicationActionForm` reply from `CheatSheetCoachItems` (or pass `canEdit={false}` for answering and show answers + **Edit** link).
- **Edit** = text link to Harper `#harper-q:{questionTurnId}` when a turn exists; if only `sampleAnswer` from generation with no turn yet, Edit may link to Harper person likely-questions context to answer once (creates turn via existing service — still seeker action on Harper, not CS).
- Remove or relocate “Build persona” / “Generate section” — those are generation CTAs, not answering; **keep as seeker actions** on CS or Harper person view (existing paid paths), not page-view auto.
- Confirm guidance/answers still sourced from stored summary JSON + Harper-approved statements already copied into `sampleAnswer` by `answerCheatSheetCoachItem` — **display only, no regen on view**.

---

## 9. Answers already given

| Source | Still visible where | Duplicate risk |
|--------|---------------------|----------------|
| Harper gap / why-company / chronology turns + statements | Under standing topics (same turn ids) | None if UI reparents only |
| `person-prep:` turns | Harper person view + HM chain display | Chain is display-only |
| `cheatSheet:` turns + CS `sampleAnswer` | Person profile on Harper + read-only CS | Same records; CS stops creating parallel answer UX |
| Stage thank-you clarify answers in `thankYouClarifyJson` | Outreach thank-you flow | Unchanged storage |
| Stage notes | Stage timeline | Unchanged |
| Gained-information notes | CS + Harper person notes | Unchanged |
| Person-prep confirmed answers list on cards | Still from `personPrepAnswersJson`; also in turns | Display only |

**No data migration.** No new answer rows for HM chain. Audit implement test: every CONSULTANT primary question turn still has a visible card somewhere; none only on Stage after Stage strip.

---

## 10. Cost and jobs

| Step | Paid / job? |
|------|-------------|
| View Harper / Stage / CS / Outreach | **No** (keep `no-ai-on-view` invariants; section must not call `planAndStoreRound` / standing regen enqueue) |
| Reply / Edit / Ignore on inline Harper | Existing CONSULTATION `process_reply` + drain-first (`drain.ts`, `process.ts` **335–339`); UI `consultationBusy` / `jobsActive` in **every** inline context (standing + person) |
| Add Interview Contact | Existing contact + optional CONTACT_PROFILE + `offerPersonPrep` CONSULTATION + optional SUMMARY section — seeker only |
| Move UI Stage→Outreach / CS→Harper | **No** regen |
| HM chain render | **No** job |
| Thank-you on Outreach | Existing OUTREACH / clarify generation on generate click only |

Serialization (`SERIALIZED_APPLICATION_JOB_TYPES` **16–22**) and reply-wait apply unchanged to all Harper reply entry points.

---

## 11. Files / functions affected — schema

**Schema: none.** All storage already exists (`ConsultationTurn`, stage thank-you JSON, summary guidance, contacts). Safe because display reparenting and link retargeting need no new tables; HM chain is a view over existing turns.

**Primary touch list (implement)**

| File / function | Becomes |
|-----------------|--------|
| `InterviewStagesSection.tsx` | Timeline + notes; strip thank-you/check-in/gap-answer UI |
| `InterviewStagePanel.tsx` | Drop `CheatSheetPersonBody`; keep interviewer assign + gained notes |
| `InterviewStageOpenActions.tsx` | Retarget review link to Harper contact anchor |
| `ApplicationOutreachSections.tsx` | Host thank-you clarify + generate; stop always-skip |
| `application-assets/outreach.ts` | Unchanged semantics; called from Outreach |
| `ConsultationSection.tsx` | Search + default standing inline + person view switch; Add Interview Contact |
| `ConsultationStanding.tsx` | Inline Q&A under topics |
| `ConsultationThread.tsx` | Person sections + shared `QuestionCard`; General list removed or emptied |
| `harper-layout.ts` | Partition helpers for standing-topic vs person vs chain display sets |
| `qa-view.ts` / `standing.ts` | Possibly helpers to attach questions to topics (no storage change) |
| `CheatSheetPersonBody.tsx` / `CheatSheetCoachItems.tsx` | Read-only + Edit links |
| `summary/page.tsx` | Read-only answering; keep search/print |
| `workspace-links.ts` | Harper person/question hrefs; retarget likely-questions helper |
| `product-config/interview.ts` (+ consultation/summary as needed) | Timeline help; “Add Interview Contact” — **PO copy** |
| `actions/interview.ts` / `contacts.ts` / `person-prep.ts` | Wire Add Interview Contact; Stage add may thin |
| Tests listed in TESTS | New assertions |

Batch C/D files untouched except leaving `role-expertise` room in standing topics.

---

## 12. Size and split (shippable batches)

| Batch | Scope | Independently testable | Est. size |
|-------|--------|----------------------|-----------|
| **B1 — Stage timeline + Outreach thank-you** | Strip Stage Q&A/CS embed/outreach; move thank-you+clarify+check-in to Outreach; retarget open-questions link | Stage has no answer forms; thank-you clarify works on Outreach | Medium |
| **B2 — Harper inline standing Q&A** | Nest General questions under Where you stand topics; remove free-floating General list; keep anchors | Default Harper shows inline Q&A under topics; chronology/why-company under standing | Medium–large |
| **B3 — Harper person view + search + Add Interview Contact** | Move CS search/person body into Harper; cards link; Add Interview Contact uses existing paths; CS answer forms off | Select person → full profile + Q&A; add contact pre-schedule | Large |
| **B4 — Cheat Sheet read-only Edit links** | CS display/print/search; Edit → `#harper-q:…`; no answer forms | CS read-only; Edit lands on Harper question | Small–medium |
| **B5 — Hiring Manager chain** | Display-only mirror of all Q&A on HM (+ senior) profiles; one edit point | Chain shows same answers; Edit only to original `#harper-q` | Medium (own batch) |

**Order:** B1 → B2 → B3 → B4 → B5. B5 after B3 so person views exist. Batch A already done. C and D remain parallel/after as before.

---

## TESTS (implementation would add — do not run/write now)

1. Stage renders timeline fields and notes only; no `CheatSheetCoachItems` / thank-you clarify / check-in / gap reply forms.
2. Outreach: thank-you clarify questions appear when pending; answering + generate Email/LinkedIn behaves as Stage did; check-in still works.
3. Harper default: Where you stand lists topics with inline question cards (open + answered); no free-floating General question list.
4. `chronology` and `why-this-company` appear under Where you stand topics.
5. Selecting a person via “Find a person or Hiring Team role” opens full inline profile (caresAbout / positioning / keyStatements / likelyQuestions display / Q&A).
6. Interviewer prep cards link to `#harper-contact:{contactId}`.
7. Add Interview Contact creates contact + offers person_prep (existing jobs); contact selectable on Stage when scheduling.
8. No free-floating questions remain outside standing topic or person profile (incl. `cheatSheet:` under person).
9. HM chain profiles show answered questions as display-only; Edit goes to single `#harper-q:{id}`; no extra ConsultationTurn rows created by viewing chain.
10. Cheat Sheet: answers visible; no reply submit; Edit → Harper question anchor.
11. Previously given Harper / `cheatSheet:` / Stage notes / thank-you clarify answers still visible; no orphan-only-on-Stage answers; no duplicated new records from move.
12. Page view of Harper/Stage/CS/Outreach enqueues no CONSULTATION/SUMMARY/OUTREACH job and no `runPaidStructuredCall`.
13. Inline reply in standing and person contexts: UI waits on `consultationBusy`; worker drain runs before plan ops.

---

## Risks / unknowns

1. **Senior-to-HM identification** — not in code; needs PO rule before B5 (see §7).
2. **Outreach always skips thank-you clarify today** — must fix when moving Stage UI or behavior regresses.
3. **`#harper-general` consumers** — retarget vs alias; grep links at implement.
4. **Stage “Add interviewer” vs Harper “Add Interview Contact”** — overlap; avoid two divergent create paths.
5. **Interview guide clarifying** — action/storage exist (`InterviewStageGuide`) but **no Stage UI today**; this plan does not invent a home. Confirm leave dormant vs later Outreach/Harper placement.
6. **PO copy** needed for: Stage sectionHelp, Add Interview Contact, Any “Other prep” standing bucket (incl. orphan SEEKER hosts), optional Outreach deep-link.
7. **Batch D role-expertise** — reserved under standing; do not block B2 on generation.
8. **Person view without built persona / empty guidance** — show existing unbuilt CTA (seeker action), never auto-build on view.

---

**Stop.** Coding starts only after product owner approval of this plan.
