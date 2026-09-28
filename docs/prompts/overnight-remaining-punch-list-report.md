# Overnight remaining punch list — REPORT + PLAN (Parts A–G)

**Repo:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git` (`main`)  
**Mode:** REPORT AND PLAN ONLY — no code, configuration, schema, prompts, tests, or data were changed beyond saving this document and the prompt at `docs/prompts/overnight-remaining-punch-list.md`.  
**Includes today’s work:** Phase 1 `PaidCallReceipt` / `runPaidStructuredCall` (`src/lib/ai/paid-call-gate.ts`), same-key serialization (`SERIALIZED_APPLICATION_JOB_TYPES` in `src/lib/application-jobs/service.ts` **16–22**), `employerIcpFit: false` (`src/lib/product-config/features.ts` **60**), persona build reliability.  
**Cross-check:** Findings below were reconciled with explore passes [Scorecard + interview flows](c78e26f5-0fe9-4935-ac54-b3d043ec019d), [Ignore + merge + sidebar + cost](fad40bd9-a02a-429c-abe4-e4aacc6bf9ee), and [Paid-call Phases 2-3 plan](562c3398-1894-469c-9562-02a0f4efa9f2).

**Product rules applied throughout:** no paid call when inputs unchanged (including Regenerate/Generate); nothing paid on page view; seekers see end results only — **PO supplies wording** where noted.

---

# PART A — Job scorecard (verify only)

## A1. Triggers that generate / regenerate the scorecard

In this codebase the seeker-facing **Scorecard** is the Who-method `scorecardJson` on `JobRequirement` (mission / outcomes / competencies), rendered in `ApplicationWorkspace.tsx` **660–673** from `requirement.scorecardJson` via `readScorecard` (**108+**, **391**).

It is **produced only** by `interpretJobPosting` (`src/lib/job-requirement/parse.ts` **13–82**), which calls Interpretation AI (`structuredOutputRequest("jobRequirement")`) with messages from `buildJobRequirementMessages(posting, seekerLearnedNotes)` (**36**). Inputs to the paid call are **posting `rawText` + optional `seekerLearnedNotes`**. The Personal Profile is **not** passed into `interpretJobPosting`.

| Trigger | Call chain | Pays? |
|---------|------------|-------|
| Create campaign with posting | `src/app/actions.ts` **526–531** → `interpretJobPosting` → persist including `scorecardJson` | Yes |
| Save / edit posting | `saveApplicationJobPostingAction` → `saveApplicationJobPosting` (`service.ts` **892–920**) → `interpretJobPosting` → `persistInterpretedJobRequirement` (**841–873**, `scorecardJson` **869**) | Yes |
| Regenerate control | `regenerateApplicationJobRequirementAction` → `regenerateApplicationJobRequirement` (`service.ts` **923–946**) → `interpretJobPosting(requirement.rawText, …, seekerLearnedNotes)` | Yes |
| Save “What I've learned” | `saveApplicationJobLearnedNotesAction` → `saveApplicationJobLearnedNotes` (`service.ts` **949–989**) → update notes → `interpretJobPosting` → persist; also enqueues `CONSULTATION` `reassess` (**983–988**) | Yes (parse) + consultation job |
| Interview stage notes change | `updateInterviewStageAction` (`src/app/actions/interview.ts` **134–145**) when `notesTextChanged` → **`regenerateApplicationJobRequirement`** then `CONSULTATION` reassess | Yes (parse again) |

UI entry points for job edit / regenerate / learned notes: `ApplicationJobRequirementActions.tsx` **89–150** (`testId` `save-job-posting`, `regenerate-job-requirement`, `save-job-learned-notes`).

**Not a scorecard trigger:**
- Harper **answer** a question — does **not** update `product.profileJson` (asserted `consultation.test.ts` **2498–2532**) and does **not** call job parse.
- Harper **confirm** FACT proposal — updates `product.profileJson` (`confirmConsultationProposal` ~**3336–3345**) but still **does not** re-parse the job / scorecard.
- Manual Personal Profile save — no job parse.
- Employer fit (`scoreFit` in `persistInterpretedJobRequirement` **879–884**) is separate; early-returns while `employerIcpFit` is off (`research-finish.ts` ~**148**).

Copy at `vocabulary.ts` **247–248** (`scorecardNote`) claims the scorecard is “based on your {product} and the job posting” and may change as Harper knows more — **implementation does not re-parse when the profile changes**.

## A2. Regenerates when neither profile nor posting changed?

- **Regenerate with unchanged posting + notes:** Yes — always pays (`regenerateApplicationJobRequirement` **923–946**); no fingerprint / `PaidCallReceipt`.
- **Harper answers:** Do **not** update Personal Profile and do **not** regenerate scorecard → **0** scorecard paid calls per coaching session from answers.
- **Harper confirm proposal:** May update profile; still **0** scorecard regens.
- **Interview `notesAfter` / `notesBefore` change:** Regenerates scorecard via job re-parse even though posting/profile (and even parse inputs) may be unchanged (`interview.ts` **134–138**) — stage notes are **not** passed into `interpretJobPosting` — see Part B.
- **Save learned notes:** Posting/profile unchanged; notes change drives a new parse (by design today).

## A3. Regenerate when nothing changed

`regenerateApplicationJobRequirement` always runs `interpretJobPosting` on current `rawText` + `seekerLearnedNotes` and overwrites `scorecardJson`. Seeker sees the form’s success path (`applicationWorkspaceCopy.jobRegenerated` / action fail message) — **no** “unchanged skip” path today. **PO wording needed** for skip UX when gated.

## A4. Plan (Phase 1 gate)

1. Wrap `interpretJobPosting` provider call with `runPaidStructuredCall` (`paid-call-gate.ts`).
2. **Fingerprint inputs (include):** `JOB_REQUIREMENT_PROMPT_VERSION` (`types.ts` **1**), structured-output schema identity for `jobRequirement`, normalized `rawText`, normalized `seekerLearnedNotes` (or empty).
3. **Deliberately exclude:** Personal Profile / Harper stories (not model inputs today); campaign ids (use as `subjectKey` only, e.g. `campaignId`); timestamps.
4. **Usable stored result:** prior successful parse payload that validates with `jobRequirementAiResultSchema` / `normalizeParsedJobRequirement`.
5. **Regenerate / Save posting:** same gate — unchanged fingerprint → skip paid call, keep current `scorecardJson`; **PO wording** on skip.
6. **Product decision (required):** If scorecard must refresh when **profile** changes, that is a **new input** to parse (or a separate scorer) — does not exist today. Do not fingerprint profile without a call path that uses it.
7. Remove or redirect the interview-notes → `regenerateApplicationJobRequirement` path (Part B) so interview learning does not re-pay job parse.

### A — Tests (implementation phase)

1. Unchanged posting+notes regenerate → no `generateStructured`, scorecard JSON unchanged.  
2. Posting text change → paid parse runs, scorecard updates.  
3. Learned notes change → paid parse runs.  
4. Harper answer / profile story write → zero `JOB_REQUIREMENT_PARSE` usage events.  
5. Interview notes change → does **not** call job parse (after Part B fix).  
6. Skip path returns seeker message slot (PO text) without system language.

### A — Risks / unknowns

- Whether PO intends profile-driven scorecard refresh (copy at `vocabulary.ts` **247–248** vs code that never passes profile into `interpretJobPosting`).  
- Product rule wording “profile or posting” vs actual fingerprints (`rawText` + `seekerLearnedNotes` only) — **PO must confirm** before gating.  
- Exact token cost of re-parse cannot be determined from static code.

---

# PART B — Interview rounds (verify only)

## B1. Flow when seeker adds / updates interview or adds a second interview

### Create stage (when / type / format)
`createInterviewStageAction` → `createInterviewStage` (`stages.ts` **77–127**): DB create + may set `applicationProgress` to `INTERVIEWING`. **No** ApplicationJob / paid call.

### Add interviewer (who)
`addInterviewInterviewerAction` → `addInterviewStageInterviewer` (`stages.ts` **338–395**):
- `addApplicationContact`  
- optional `saveLinkedInPaste` → enqueues `CONTACT_PROFILE` (`contact-profile/service.ts` **78–84**; cheat sheet deferred until profile finishes)  
- `offerPersonPrep` → enqueues `CONSULTATION` `person_prep` (`person-prep.ts` **75–84**)  
- if no LinkedIn paste: `enqueueInterviewerCheatSheetSection` → `APPLICATION_SUMMARY` person section (`enqueue.ts` **48–63**, **35–45**)

`assignExistingInterviewerAction` → `assignExistingInterviewStageInterviewer` (**284–335**): person prep + cheat-sheet enqueue similarly.

### Update stage (including notes / outcome)
`updateInterviewStage` (`stages.ts` **129–212**): DB update; if notes text changed → `enqueueInterviewerCheatSheetSection` per interviewer (**199–210**).

**Plus** `updateInterviewStageAction` (`interview.ts` **128–145**):
- if `notesAfter` present and notes changed → `refreshConsultationOffer`  
- if `notesTextChanged` → **`regenerateApplicationJobRequirement`** (full job parse / scorecard) **and** `CONSULTATION` `reassess`

### Second interview
Same create + add interviewer paths; prior-stage `notesAfter` already feed **interview guide** sources (`guide.ts` **264–276**, **674–678**) and person-section hash inputs when notes change — not a separate automatic resume/cover/research/persona rebuild.

### Explicit interview guide
`generateInterviewGuideAction` (`interview.ts` **243–276`) → `INTERVIEW_GUIDE` job (paid Asset AI in `guide.ts`).

Proven in `interview.test.ts` **546–586**: adding interviewer + cheat-sheet note enqueues `APPLICATION_SUMMARY` for contacts and may enqueue consultation reassess; **0** `INTERVIEW_GUIDE` jobs unless seeker generates.

## B2. Place to record what was learned; feeds later cheat sheets?

| Surface | Exists? | Feeds cheat sheet **generation sources**? | Also feeds |
|---------|---------|---------------------------------------------|------------|
| Stage `notesBefore` / `notesAfter` | Yes (`updateInterviewStage`) | **Partial — gap.** Included in person/shell **`sourceFingerprint` / stale hash** (`application-summary/service.ts` ~**377–383**) and in **interview guide** sources (`guide.ts` **264–276**). **Not** appended as SummarySource text for shell/person AI (`appendSource` paths omit stage notes). Note change **does** enqueue cheat-sheet rebuild. | Harper coach context; consultation offer heuristic |
| Cheat sheet interview note | Yes — `addCheatSheetInterviewNote` | **Yes** — `intel:{noteId}` sources; also enqueues `APPLICATION_SUMMARY` + often `CONSULTATION` reassess | — |
| Job “What I've learned” (`seekerLearnedNotes`) | Yes | **Yes** — `job:learned-notes` in summary sources (~**437–441**) | **Also drives job parse / scorecard** (`saveApplicationJobLearnedNotes`) and Harper evidence — **not** cheat-sheet-only |

**Product-rule gap:** “Learned in earlier rounds → job details used **only** by cheat sheets” is incomplete: (1) `seekerLearnedNotes` re-runs job parse; (2) stage `notesAfter` are the natural after-round field but are **not** in cheat-sheet prompt sources.

## B3. Re-runs that the product rule forbids

Rule: resume, cover letter, company research, personas, scorecard must **not** re-run because of a new round.

| Today | Verdict |
|-------|---------|
| Scorecard / job parse on interview note change (`interview.ts` **135–138**) | **Violates** — must not |
| Consultation `reassess` on note change | Extra paid consultation — not listed in “must not,” but coupled to the parse path |
| Resume / cover / company research / hiring identify-synthesize | **No** automatic enqueue from create stage / add interviewer found |
| Cheat sheet person section | **Allowed** (and intended) |
| `CONTACT_PROFILE` when LinkedIn pasted | Interviewer research — allowed as part of “cheat sheet for new interviewer,” not listed in forbid list |
| `INTERVIEW_GUIDE` | Only on explicit generate |

## B4. Plan

1. **Remove** `regenerateApplicationJobRequirement` (and decide with PO whether consultation `reassess` stays) from `updateInterviewStageAction` notes path. Keep `enqueueInterviewerCheatSheetSection` from `stages.ts` **199–210**.  
2. Stop treating `seekerLearnedNotes` save as an automatic job-parse trigger **or** split “notes for Harper/cheat sheet” from “notes that change the posting parse” (PO decision — feature may be missing for cheat-sheet-only job details).  
3. If stage `notesAfter` must appear in later cheat-sheet **prompt** text, that content path **does not exist today** — report as missing feature (do not invent UX); guide already consumes them.  
4. Keep cheat-sheet interview notes as the existing seeker path that already feeds summary sources.

### B — Tests

1. Create stage → no `JOB_REQUIREMENT_PARSE` / `RESUME` / `COVER_LETTER` / `HIRING_TEAM_*` / research jobs.  
2. Add interviewer → `APPLICATION_SUMMARY` (and `CONTACT_PROFILE` if paste); no job parse.  
3. Change `notesAfter` → cheat-sheet enqueue; **no** `interpretJobPosting`.  
4. Explicit Generate guide still enqueues `INTERVIEW_GUIDE` only.  
5. After any content-path change: prior-round `notesAfter` appear in person/shell **prompt** sources (today: fingerprint only — assert gap until feature exists).

### B — Risks / unknowns

- Whether consultation `reassess` on interview notes is desired for Harper gap detection (`detectInterviewNoteGap` in `stages.ts` **398+**) without re-parsing the job.  
- Whether any other action path still calls `regenerateApplicationJobRequirement` for interviews (only `interview.ts` **135** found).  
- PO must decide: cheat-sheet-only job details vs `seekerLearnedNotes` continuing to drive parse; stage notes in summary prompts is a **missing feature**.

---

# PART C — Paid-call guard Phases 2 & 3 (plan)

**Baseline:** Phase 1 done for hiring **identify** + **synthesize** (`paid-call-gate.ts`, `hiring-team/paid-inputs.ts`, `ai.ts`). Inventory from `docs/prompts/paid-calls-unguarded-repeat-cost-audit.md`. Serialization map: `service.ts` **16–22** (`CONSULTATION`, `HIRING_TEAM_IDENTIFY`, `HIRING_TEAM_BUILD`, `APPLICATION_SUMMARY`, `NEXT_STEP`).

## Exclusions (unreachable / already done)

| Call / area | Why excluded |
|-------------|--------------|
| Hiring identify #16, synthesize #17 | Phase 1 done |
| Employer ICP fit / list bulk scoring / ICP interpretation paths that only serve employer fit | `employerIcpFit: false` (`features.ts` **60**) |
| Legacy email sequence drafts / send UI | `legacyEmailSequence: false` (**58**) |
| Product-level Hiring Team setup AI | `productLevelHiringTeam: false` (**59**) |
| List import / bulk validation / bulk scoring | flags false (**46–48**) |
| Contact research when product path gated off | Often unused with lists off; still note if any application path remains |
| Intentional sends (Resend / SMTP / Graph) | Never gate “send” as unchanged regenerate |

## Remaining live calls — gate design (summary table)

For each: fingerprint = prompt/schema version + material evidence the prompt already uses; `subjectKey` = natural id; usable = last successful structured result that still validates / status READY.

| Call | Fingerprint include | Exclude | Usable stored | Skip UX | Serialize? |
|------|---------------------|---------|---------------|---------|------------|
| **#8 Job parse** | prompt version, rawText, learned notes | profile (unless PO expands model) | normalized parse | PO wording | Sync today; optional `JOB_REQUIREMENT` job later — **not** required for gate |
| **#1 Company research** | company identity + notes + research prompt/stage inputs; keep TTL as *additional* rule | “force refresh” flag if any | completed research row | PO wording | ResearchRun already claimed; don’t force into ApplicationJob serialize |
| **#24 Summary shell** | shell sources + `APPLICATION_SUMMARY_PROMPT_VERSION` | person-only sources | shell `sourceHash` match + READY | PO wording | Already `APPLICATION_SUMMARY` serialized |
| **#25 Person section** | **Already hashed** (`personSectionInputsUnchanged`) | — | existing | silent skip OK today | Already serialized |
| **#26–#27 Resume/cover (+ plan #26)** | plan/asset prompt versions + consultation/job evidence fingerprints used by prompts | cosmetic UI state | last READY asset for type | PO wording on Regenerate | Consider adding `RESUME`/`COVER_LETTER` to serialize map if double-click races remain |
| **#28 Outreach** | facts + persona + contact + email prompt version | send timestamp | last draft for key | PO wording | `OUTREACH` not serialized today — **yes, candidate** after gate |
| **#29 Claim validation** | draft hash + evidence hash | — | last validation for draft | usually invisible | Tie to parent asset job |
| **#20–#22 Consultation** | See special cases | — | — | — | Already serialized |
| **#23 Next step** | Already state-key guarded | — | — | — | Already serialized |
| **#30 Interview guide** | existing `sourceHash` inputs (`guide.ts` **273–293**) | answers only when seeker supplies new | stored guide when hash equal | PO wording | Consider serialize `INTERVIEW_GUIDE` |
| **#18–#19 Contact profile** | paste/text + prompt version + persona context | — | completed profile | PO wording | `CONTACT_PROFILE` — consider serialize |
| **#11 Fact selection** | existing fingerprints; make **durable** receipt | in-memory-only | cached facts | n/a | n/a |
| **#15 Offer validation** | existing `campaignOfferValidationHash` | — | stored hash match | PO wording if UI | sync |
| Setup #3–#7, #9 | prompt + definition text | — | last draft | setup UX | lower priority |

### Special cases

1. **Consultation quality retries:** Gate on **final accepted** extract/plan fingerprint; retries with same answer+question stay one receipt after success; quality-fail regenerate with rejection reasons = **new** fingerprint (same pattern as hiring quality regen). Do not skip intentional follow-up questions.  
2. **Intentional sends:** never gated.  
3. **Cheat-sheet shell vs person:** person guarded; shell must get equivalent `runPaidStructuredCall` / hash skip.  
4. **Interview guide `sourceHash`:** wire **skip paid call** when hash equals stored (today UI-stale only).  
5. **Company research freshness:** keep TTL; add content fingerprint so forced requeue within TTL with unchanged inputs skips.  
6. **Job parse:** Part A.

## Rollout batches (highest cost impact first; independently testable)

| Batch | Scope | Risk |
|-------|--------|------|
| **2a** | Job parse gate (Part A) + stop interview-notes re-parse (Part B) | Medium — seeker Regenerate UX |
| **2b** | Summary shell skip + interview guide hash skip | Low–medium — stale UI vs skip |
| **2c** | Resume / cover / plan / claim validation | Medium — large payloads; regenerate semantics |
| **2d** | Outreach + durable fact-selection receipt; serialize `OUTREACH` | Medium — concurrent compose |
| **2e** | Company research content fingerprint (+ TTL) | High blast radius; multi-stage |
| **3a** | Contact profile extract/synthesize gate; serialize `CONTACT_PROFILE` | Medium |
| **3b** | Offer validation hash skip; next-step regression | Low |
| **3c** | Setup/interpretation leftovers if still reachable | Low frequency |

### C — Tests (per batch)

Unchanged → no provider; changed → runs; double enqueue → one paid; worker retry after receipt → skip; no page-view enqueue; serialization follow-up still one PENDING while IN_PROGRESS where applicable.

### C — Risks / unknowns

- Audit ranking still lists hiring as top cost; **code now guards** identify/synthesize — validate with usage logs.  
- Production model names vs rate seeds (Part G).  
- Whether `force` regenerate should exist anywhere (product rule says no pay if unchanged — even on Regenerate).

---

# PART D — Ignore verification (report)

## D1. Single helper for `analysisJson.ignored`?

**Yes for reads.** The only production read of `analysisJson.ignored` is:

```129:135:src/lib/consultation/qa-view.ts
export function isIgnoredSeekerTurn(
  turn: Pick<QaTurn, "speaker" | "analysisJson">,
): boolean {
  if (turn.speaker !== "SEEKER") return false;
  if (!turn.analysisJson || typeof turn.analysisJson !== "object") return false;
  return (turn.analysisJson as { ignored?: unknown }).ignored === true;
}
```

**Callers of the helper:**
- `questions.ts` **92**, **104** (`askedQuestionsFromTurns`)  
- `qa-view.ts` **315**, **359**

**Derived field (not a raw read):** `AskedConsultationQuestion.ignored` from `askedQuestionsFromTurns`; consumed e.g. `tracker.ts` **308–309** (`!question.ignored`).

**Write:**
- `ignoreConsultationQuestion` (`service.ts` **2841–2868**) sets `analysisJson: { status: "READY", replyToTurnId, ignored: true }` on a skipped SEEKER turn.

No other `analysisJson.ignored` writes/reads found under `src/`.

## D2. What tests assert

`consultation.test.ts` **1979+** `"marks ignored questions for Harper and blocks close rephrasing"`:
- `askedQuestionsFromTurns` marks `ignored: true`  
- `questionDuplicatesAsked` true for exact and close rephrase against that asked list  
- `planQuestionRound` with ignored asked + model rephrase → **`questions` empty** (**2060**)

Prompt instruction asserted (**1640–1642**): model told never to re-ask ignored / close rephrasing.

**Not asserted:** end-to-end live `planConsultationWithModel` refusing an ignored rephrase without `planQuestionRound` filtering; DB ignore → next worker plan job.

## D3. Server-side vs model

**Both:**
1. **Server:** `askedQuestionsFromTurns` includes ignored questions; `questionDuplicatesAsked` / `questionNearDuplicate` (`questions.ts` **51–67**) filter model output in `planQuestionRound` / service planning (**1102**, **2560–2561**). Ignored questions **are** in the duplicate set (same as answered).  
2. **Model:** system instructions in `prompt-content/consultation.ts` **19** (tested).

Re-ask prevention is **not** left solely to the model.

## D4. Gap + plan

| Gap | Plan |
|-----|------|
| `askedAndSkipped` (`service.ts` ~**1239–1278**) keys off SEEKER `skipped`, not `isIgnoredSeekerTurn` | Prefer `isIgnoredSeekerTurn` (or require both) so ignore cannot miss `skippedKeys` if write shape drifts |
| Near-dup heuristic may miss loose paraphrases | Keep server filter as source of truth; optional tighten for `ignored: true` — **PO decision** |
| Question cap counts ignored entries in `askedQuestions.length` | **PO decision:** whether Ignore frees a slot |
| No integration test: ignore action → next plan job | Add worker-level / DB fixture test |
| Tracker uses derived `ignored` | Keep; do not bypass helper |

### D — Tests

1. `ignoreConsultationQuestion` write → `isIgnoredSeekerTurn` true.  
2. Next `planQuestionRound` drops near-duplicate of ignored.  
3. Prompt still contains ignore instruction (regression).  
4. No raw `.ignored` reads outside `isIgnoredSeekerTurn` (source grep test).

### D — Risks / unknowns

- Semantic near-miss rephrases that fail `questionNearDuplicate` but feel the same to seekers.

---

# PART E — `mergeExistingHiringTeamRoles` on page load (plan)

## E1. What it does today

`mergeExistingHiringTeamRoles` (`merge-existing.ts` **135+**): loads campaign personas; clusters via `rolesDescribeSamePerson`; picks survivor (`compareSurvivors` prefers built narrative, seeker edits, attachments); **reassigns** contacts/assets/drafts/in-play; **archives** duplicates; may merge titles/why/name onto survivor. **DB writes only** — no AI / no paid call.

**Callers:**
- `ApplicationWorkspace` **317** — every application workspace render  
- `campaigns/[id]/page.tsx` **148–151** — campaign detail page load  
- `syncApplicationHiringTeam` (`build.ts` **419**) — identify sync path (seeker/job driven)

## E2. Still needed after Phase 1 / serialization?

- Phase 1 / serialization **do not** replace duplicate-role repair.  
- Removing from **page load** does not break identify/build **if** merge still runs on `syncApplicationHiringTeam` (and optionally explicit repair).  
- **Would break** if duplicates can appear without going through sync and UI assumes one row per role — page load merge was a safety net for legacy duplicates.

## E3. Plan to remove from page load

1. Delete calls from `ApplicationWorkspace.tsx` **317** and `campaigns/[id]/page.tsx` **148–151**.  
2. Keep call inside `syncApplicationHiringTeam` (`build.ts` **419**).  
3. If orphans still appear in production data, add a **one-time ops script** or admin action — **not** page view (no data migration in-app required by this plan; no schema change).  
4. Extend `no-ai-on-view` / workspace tests to assert **no** `mergeExistingHiringTeamRoles` on render (data mutation on view).

### E — Tests

1. Workspace/campaign page source does not call merge.  
2. `syncApplicationHiringTeam` still merges duplicates (existing hiring-team postgres test).  
3. Page render creates no persona archive/update (instrumented unit/integration).

### E — Risks / unknowns

- Volume of residual duplicate personas in production DBs unknown from code.  
- Campaign detail page still loads ApplicationWorkspace which currently double-calls merge — removing both sites matters.

---

# PART F — Truncated application name in the sidebar (plan)

## F1. Where and why

Application name in the nav tracker:

```241:243:src/components/ApplicationSidebarTracker.tsx
      <p className="truncate text-sm font-semibold text-on-nav" title={tracker.campaignName}>
        {tracker.campaignName}
      </p>
```

**Cause:** Tailwind `truncate` (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) inside the fixed-width app sidebar (`Sidebar.tsx` ~**34**, `w-56` / 224px) with tracker `px-3`. **Not** a character-limit slice. Full name is already on native `title={tracker.campaignName}`. Source: `tracker.ts` ~**226** `campaignName: campaign.name`.

Compact tracker (**314–317**) truncates **step title** (`current.number. current.title`), not the campaign name.

## F2. Plan

1. Prefer **wrap** over ellipsis in the sidebar header: replace `truncate` with `break-words` / `whitespace-normal` and allow 2–3 lines (`line-clamp-2` or `line-clamp-3`) so the full name is visible without horizontal overflow.  
2. Keep `title={tracker.campaignName}` for hover accessibility.  
3. Verify desktop sidebar width and mobile overlay (`variant` paths) so wrapped name does not push tracker steps off-screen — constrain with `min-w-0` (parent already pattern elsewhere **313**).  
4. Do **not** change campaign name storage or truncation elsewhere without PO ask.

### F — Tests

1. Source asserts campaign name node is not `truncate` (or uses `line-clamp` allowing full text in fixture).  
2. Optional Playwright/layout check at mobile width — if the repo has sidebar visual tests; otherwise source-level only.

### F — Risks / unknowns

- Very long names may lengthen the tracker block; line-clamp still truncates after N lines — PO may prefer wrap-all vs clamp.

---

# PART G — Usage cost accuracy (report)

## G1. How usage records provider/model and how cost is computed

- Structured calls: `recordAiStructuredUsage` (`usage/ai-call.ts` **27–52**) → `recordUsageEvent` with `provider` + `model` from the adapter.  
- OpenAI Responses adapter logs `provider: config.provider` (`openai-responses.ts` **398**, **412–414**) — i.e. the **role env provider string** (`openai-responses`), not necessarily `"openai"`.  
- Cost: `estimateEventCostUsd` (`platform/cost.ts` **102–135**) → `resolveRate(event.provider, event.model, event.occurredAt, rates)` (`model-rates.ts` **230–265**).

## G2. `openai-responses` vs rate rows

`resolveRate` matching order:
1. Exact `provider` (case-insensitive) + `model`  
2. Same provider + model `*` or `default`  
3. Any provider’s `*` / `default`  
4. Else `null` → **cost $0** (`estimateEventCostUsd` **112–113**)

**Seed rates** (`SEED_AI_MODEL_RATES`, `model-rates.ts` **19–84**) use provider **`"openai"`**, models like `gpt-5`, `gpt-4o`, and `"openai"` + `"*"`.

There is **no** seed row with provider `openai-responses`. Therefore events logged with `provider: "openai-responses"`:
- miss exact match against seed `openai` + model  
- miss provider-wildcard for `openai-responses`  
- typically hit **`anyDefault`** → seed `"openai"` + `"*"` (**75–84**: input **$2/1M**, output **$10/1M**, web **$0.01**) — **overstating** cost vs specific luna/terra rows (e.g. luna **$0.20 / $1.20**) when those would have matched under provider `openai`  
- or **$0** if no any-default row exists in the DB  

They do **not** match specific `openai`+model seed rows. Same pattern for `openai-compatible`.

## G3. Plan (reporting only; no billing / provider behavior change)

1. When recording usage, also store a **billingProvider** (or normalize at write): map `openai-responses` / `openai-compatible` → `openai` for rate lookup **or**  
2. Prefer **read-path normalization** in `resolveRate` / `estimateEventCostUsd`: treat `openai-responses` and `openai-compatible` as `openai` for matching only.  
3. Seed or upsert `openai-responses` + `*` mirroring `openai` + `*` if dual providers must stay distinct in events.  
4. Add platform cost test: event `{ provider: "openai-responses", model: "<seeded model>" }` resolves same rate as `{ provider: "openai", model: same }`.  
5. **Do not** change Stripe/subscription billing or adapter request behavior.

### G — Tests

1. `resolveRate("openai-responses", "gpt-5", …)` equals `resolveRate("openai", "gpt-5", …)` after fix.  
2. Seed ensure still idempotent.  
3. `computeCostReport` fixture with responses provider not silently $0 unless truly unrated.

### G — Risks / unknowns

- Historical events already stored with `openai-responses` — read-path fix repairs reports without rewriting rows.  
- Whether any non-OpenAI host is mislabeled `openai-responses` cannot be determined from seeds alone.

---

# Cross-cutting confirmation

- **No code was changed** for this task.  
- Coding for each part waits on **separate PO approval**.  
- Seeker-facing skip/regenerate strings: **PO to supply** wherever noted (A3, A4, C tables, etc.).
