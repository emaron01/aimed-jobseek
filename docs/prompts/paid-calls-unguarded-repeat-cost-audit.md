# Prompt: Paid external calls — unguarded repeat / cost audit (report only)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly.

SURGICAL RULE
REPORT ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the report and stop.

CONTEXT
The product charges a flat monthly fee. Every paid external call (AI models, web search, research, enrichment, or any other metered API) that runs again with unchanged inputs is a direct loss on every user. Product rule: no paid call runs when its inputs have not changed, and nothing paid runs on a page view. A known violation: syncApplicationHiringTeam (build.ts 390-394) re-runs identification and stamps staleAt on every built role with no comparison of inputs.

REPORT ON
1. Inventory: every paid external call in the codebase. For each: the function and file, the provider and model or API, what it produces, and its approximate input size (prompt plus evidence payload) where determinable.
2. Triggers: for each call, every code path that can cause it (seeker action, page load or server render, worker job, scheduled job, retry, batch action such as "Generate all Direct roles", deploy or startup). Cite the call chain.
3. Repeat risk: for each call, whether anything prevents it from running again when its inputs are unchanged (stored input hash, version check, status check, or nothing). Classify each as: guarded, partially guarded (explain), or unguarded.
4. Duplicate risk: for each call, whether a double click, concurrent request, worker retry, or re-enqueue can run it twice for the same inputs, and whether any lock or idempotency key prevents it.
5. Page views: confirm whether any paid call can run from viewing any page. List any that can.
6. Existing mechanisms: any existing caching, fingerprinting, prompt-version, or skip logic in the codebase that already does "run only if inputs changed", where it is used, and whether it could serve as one shared mechanism for all paid calls.
7. Ranking: rank the unguarded and partially guarded calls by likely cost impact (frequency of repeat times input size), highest first.
8. Shared guard: describe, without implementing, one shared mechanism that every paid call would go through to skip when inputs are unchanged and prevent duplicates, built on existing code where possible. State what it records, where, how inputs are compared, and how a legitimate input change still runs the call. Include how staleness of built outputs (such as staleAt on personas) would be decided from the same recorded inputs instead of being stamped unconditionally.

TESTS
Do not run or write tests. List the tests the shared guard would require, each with what it asserts. Include: a repeat with unchanged inputs makes no paid call; a real input change does run it; a double click or concurrent request runs it once; a worker retry never runs a completed call again; no page view triggers a paid call; staleness is set only when recorded inputs actually changed.

REPORT
Deliver the report in sections numbered 1 through 8 matching the items above, followed by the TESTS list. End with a short list of risks or unknowns. Make no code changes.

---

# Report: Paid external calls — unguarded repeat / cost audit

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git` (`main`)  
**Status:** REPORT ONLY — no code, configuration, schema, prompts, tests, or data changed beyond saving this document.

**Shared AI plumbing:** All model calls go through `AiProvider.generateStructured` (`src/lib/ai/types.ts` **79**), implemented by `openai-responses` (`POST …/v1/responses`, research role may attach `tools: [{ type: "web_search" }]` — `openai-responses.ts` **276–285**) or `openai-compatible` (chat completions — `openai-compatible.ts` **27+**). Model names and URLs are env-driven (`src/lib/ai/config.ts` **96–199**); production model strings are **not** hard-coded. Exact token counts per call are **not** determinable from static code; “input size” below describes payload composition and any hard caps found.

**Not paid enrichment APIs (excluded from inventory as metered AI/search):** first-party `safeFetchHttp` website fetch; deterministic scoring (`score-contact.ts` path with `aiSkipped`); Stripe checkout. **Included as metered non-AI:** Resend / SMTP transactional send; Microsoft Graph `sendMail`.

**Dead / unwired:** `generateScoringAssessment` (`scoring/ai-assessment.ts` **26–37**) — no production caller found (only tests). Live scoring does not call it.

---

## 1. Inventory

| # | Function | File (lines) | Provider / API | Produces | Approx. input size (from code) |
|---|---|---|---|---|---|
| 1 | `AiCompanyResearchProvider.research` → `generateStructured` (`companyResearch`) | `research/provider.ts` **183–204** (multi-stage loop) | Research AI (`RESEARCH_AI_*`); `openai-responses` adds OpenAI `web_search` | Company research fields + sources | Website excerpts + seeker notes + prior stage evidence; up to `maxSearchQueriesPerCompany` stages (default **3** — `usage/defaults.ts` **29**) |
| 2 | `discoverSourcesViaWebSearch` | `research/web-search-retriever.ts` **76** | Research AI + `web_search` (`productSourceDiscovery`) | Discovered source URLs | Query + product/persona context; capped by persona policy (`maxSearchQueriesPerPersona` default **2**) |
| 3 | `synthesizeProductSetup` | `product-research/synthesize.ts` **175** | Product AI | Product profile draft | Approved/acquired evidence bundle; stores `PRODUCT_SYNTHESIS_PROMPT_VERSION` |
| 4 | `synthesizePersonaFromEvidence` | `persona-research/synthesize.ts` **361** | Persona AI | Persona draft | Persona evidence + peers; `PERSONA_SYNTHESIS_PROMPT_VERSION` (`contract.ts` **164** = `"13"`) |
| 5 | `runProgressivePersonaWebSearch` (via #2 + URL fetch) | `persona-research/progressive-search.ts` | Research AI web_search + HTTP | Persona sources | Per-query discovery; URL re-fetch skipped by `contentHash` / freshness |
| 6 | `generateIcpInterpretation` | `interpretation/icp.ts` **592** | Interpretation AI | ICP criteria interpretation | ICP definition text; stores prompt version |
| 7 | `interpretPersonaDefinition` | `interpretation/persona.ts` **277** | Interpretation AI | Persona interpretation | Persona definition text |
| 8 | `interpretJobPosting` | `job-requirement/parse.ts` **33** | Interpretation AI (`jobRequirement`) | Parsed job requirement / scorecard | Full posting `rawText` (no truncation found in parse path) |
| 9 | Title-suggestion AI inside `generateTitleSuggestionsForRun` | `scoring/title-suggestions.ts` **189** | Scoring AI | Title suggestions for unmatched groups | Unmatched title groups for a scoring run |
| 10 | `researchContactRole` | `contact-research/service.ts` **290** | Contact-research AI (**no** `web_search` tools — role is `structured_only`) | Contact role research | Contact title + persona criteria; freshness via trigger |
| 11 | `selectRelevantCompanyFacts` | `email-generation/semantic-fact-selector.ts` **361** | Email-facts AI | Motion-specific company facts | Research/product/persona fingerprints |
| 12 | `generateEmailDraft` | `email-generation/service.ts` **327**, **370** | Email AI | Email draft (may retry) | Facts + offer + contact context |
| 13 | `validateGeneratedEmailClaims` | `email-generation/claim-validation.ts` **136** | Email AI | Claim validation | Draft + evidence |
| 14 | `classifyProspectReply` | `email-generation/reply.ts` **31** | Email AI | Reply classification | Prospect reply text |
| 15 | `validateOfferSemantically` / `validateCampaignOffer` | `campaign/offer-validation.ts` **220**, **324–330** | Email AI | Offer conflicts | Offer + claims/terminology/evidence; hash computed **304–309** but not used to skip |
| 16 | `identifyRolesWithModel` | `hiring-team/ai.ts` **44** | Persona AI (`hiringTeamIdentification`) | Identified roles | Job evidence text + optional research fields (`hiring-team/evidence.ts` **35–78**) — no char cap in assembler |
| 17 | `draftRoleWithModel` / synthesis in `draftsFor` | `hiring-team/ai.ts` **92** | Persona AI (`personaSynthesis`) | Role narrative draft | Same excerpts + role identity + peers |
| 18 | `extractInterviewerFacts` | `contact-profile/extract.ts` **87** | Persona AI | Extracted interviewer facts | Pasted LinkedIn/bio text |
| 19 | `generateIndividualProfileWithModel` | `contact-profile/ai.ts` **31** | Persona AI | Individual contact profile | Extracted facts + role context |
| 20 | `planConsultationWithModel` | `consultation/ai.ts` **77** | Consultation AI | Harper plan / questions | Seeker + product + job context |
| 21 | `extractWithModel` | `consultation/ai.ts` **132** | Consultation-reply AI | Structured extract from answer | Question + answer (+ quality retries in service) |
| 22 | `polishAnswerWithModel` | `consultation/ai.ts` **191** | Consultation-reply AI | Polished talk track | Extract + context |
| 23 | `writeApplicationNextStep` | `application/next-step.ts` **88** | Consultation-reply AI | Next-step card text | Application state snapshot |
| 24 | `generateApplicationSummaryShell` | `application-summary/ai.ts` **42** | Consultation AI | Cheat-sheet shell (overview/stories) | Aggregated sources for shell |
| 25 | `generateCheatSheetPersonSectionGuidance` | `application-summary/ai.ts` **82** | Consultation AI | Per-person cheat-sheet section | Person payload + person-scoped sources |
| 26 | `writePresentationPlanWithModel` | `application-assets/plan-ai.ts` **55–66** | Consultation AI | Resume/cover presentation plan | Consultation + job + stories |
| 27 | `generateResumeWithModel` / `generateCoverLetterWithModel` | `application-assets/ai.ts` **93**, **118** | Asset AI | Resume / cover letter JSON | Plan + consultation + claims |
| 28 | Outreach: `selectOutreachFacts` + `generateOutreachWithModel` | `application-assets/ai.ts` **148**, **209–232** | Email-facts + Email AI | Outreach email / LinkedIn / InMail | Persona + contact + facts |
| 29 | `validateAssetClaimsWithModel` | `application-assets/ai.ts` **266** | Asset AI (temp 0) | Asset claim validation | Asset + evidence |
| 30 | Interview clarifying / thank-you / guide generators | `interview/ai.ts` **51**, **79**, **105** | Asset AI | Clarifying Qs, thank-you Qs, interview guide | Stage + interviewers + consultation/stories fingerprint (`guide.ts` **273–293**) |
| 31 | Resend send | `transactional-email/providers/resend.ts` | `api.resend.com/emails` | Outbound transactional email | Template body |
| 32 | SMTP send | transactional SMTP provider | SMTP | Same | Template body |
| 33 | Microsoft Graph send | `mailbox/microsoft-graph.ts` (~sendMail) | Graph `/me/sendMail` | Mailbox send | Draft body |

**Known violation (context):** `syncApplicationHiringTeam` calls `identifiedRoles` → `#16`, then stamps `staleAt` on every built role with **no input compare** (`hiring-team/build.ts` **336–347**, **390–394**). Additionally, **every role rebuild** (`rebuildApplicationHiringTeamRole` **658–669**) calls `identifiedRoles` again before synthesis — so each `HIRING_TEAM_BUILD` pays for identify **plus** synthesize.

---

## 2. Triggers

### Worker: `ApplicationJob` (`application-jobs/process.ts` **67–267**)

| Job type | Paid calls | Enqueue origins |
|---|---|---|
| `HIRING_TEAM_IDENTIFY` | #16 | `queueHiringTeamIdentify` / `research-finish.ts` **324–329**; `service.ts` attach paths **232–235**, **277–280**; confirm/reject identity **541–544**, **571–574**; orphaned `ensureHiringTeamAfterResearch` **716–719** (no page caller) |
| `HIRING_TEAM_BUILD` | #16 then #17; then may enqueue cheat-sheet / outreach | `queueHiringTeamBuild` (`build.ts` **443+**); `queueHiringTeamBuildDirect` (**495–518**, “Generate all Direct roles”); actions `hiring-team.ts` **220**, **280**, **288–299**; deferred outreach path |
| `CONTACT_PROFILE` | #18, #19 | Contact profile enqueue from contact/interviewer flows |
| `CONSULTATION` | #20–#22 (by operation) | `app/actions/consultation.ts` (multiple); `application/service.ts` **986**; interview person-prep; summary standing paths |
| `RESUME` / `COVER_LETTER` | #26, #27, #29 | Asset plan/generate actions → jobs |
| `OUTREACH` | #28 (+ claim validation as wired) | Outreach actions / deferred after build |
| `INTERVIEW_GUIDE` | #30 | Interview actions |
| `APPLICATION_SUMMARY` | #24 and/or #25 | Summary enqueue / after persona build (`process.ts` **82–90**) |
| `NEXT_STEP` | #23 | `queueApplicationNextStepIfNeeded` after other jobs (`process.ts` **274–278**); mark-applied |

### Research worker (`scripts/research-worker.ts`)

- Claims `ApplicationJob` → above.
- Claims `ResearchRun` → `researchCompany` → #1 (freshness skip inside `company-research-service.ts` **901–908**).

### Synchronous seeker actions (no job, or job + sync AI)

| Path | Calls |
|---|---|
| Attach / re-parse job posting | #8 (`interpretJobPosting`) then research and/or identify enqueue |
| ICP / persona interpretation actions | #6, #7 |
| Product / persona setup synthesize | #3–#5 |
| Email generate / regenerate / reply classify | #11–#14 |
| Campaign offer save/validate | #15 |
| Scoring run | #9 (for unmatched titles only); contact scoring AI **not** live |
| Contact research during email prep | #10 (`email-generation/context.ts` callers) |
| Transactional / mailbox send | #31–#33 |

### Page load / server render

**No production page was found that calls `generateStructured`, `enqueueApplicationJob`, or `queueApplicationResearch`.** Application workspace load: `ensureIdentityVerification` + `mergeExistingHiringTeamRoles` only (`ApplicationWorkspace.tsx` **313–314**) — both DB/local, no AI. Guarded by `no-ai-on-view.test.ts` **11–21**, **44–48**.

### Deploy / startup

Worker loop processes pending jobs; deploy alone does not call AI. Pending `HIRING_TEAM_IDENTIFY` / research runs after deploy **will** spend when the worker claims them.

### Retry / batch

- Timeout retries: `failApplicationJob` requeues `PENDING` when timeout and `attempt < maxAttempts` (`application-jobs/service.ts` **206–217**); default `maxAttempts` **3** (`hiringTeamConfig` / job create **77**).
- Heartbeat stale: `abandonStaleApplicationJobs` / claim path requeues `IN_PROGRESS` after **15 minutes** without heartbeat (`service.ts` **11**, **130–184**).
- Batch: `buildAllDirectRolesAction` → `queueHiringTeamBuildDirect` — one build job per Direct role that is unbuilt or stale (`build.ts` **508–517**).

---

## 3. Repeat risk (unchanged inputs)

| Call | Classification | Guard |
|---|---|---|
| #1 Company research | **Partially guarded** | `isResearchFresh` time/`expiresAt` window (`freshness.ts` **55–78**; default **90** days `defaults.ts` **31**) — **not** content-hash of company identity; re-run if expired even if website unchanged |
| #2 / #5 Persona web search | **Partially guarded** | Sufficiency + max queries; URL `contentHash` / `freshnessExpiresAt` skip re-fetch; discovery AI still runs when search loop decides to query |
| #3 Product synthesis | **Partially guarded** | Evidence `contentHash` reuse on acquire; re-synthesize on explicit workflow / new material — no universal “skip if same evidence + prompt version” at call site determined for all entry points |
| #4 Persona (setup) synthesis | **Partially guarded** | Similar evidence freshness; seeker-triggered resynthesize re-pays |
| #6–#7 Interpretation | **Unguarded** | Re-runs on each interpretation action; prompt version stored after, not used to skip |
| #8 Job parse | **Unguarded** | Every attach/re-parse pays; no hash of `rawText` |
| #9 Title suggestions | **Partially guarded** | Only unmatched title groups; re-run of scoring run can re-pay for same unmatched set |
| #10 Contact research | **Partially guarded** | `shouldResearchContactRole` / freshness days; org can disable (`contactResearchEnabled` default **false**) |
| #11 Fact selection | **Guarded** (process-local) | Fingerprints + in-memory cache (`fact-selection-cache.ts` **19–57**); **lost on process restart**; not durable across workers |
| #12–#14 Email draft / claims / reply | **Unguarded** | Explicit generate/regenerate always calls; claim validation follows draft |
| #15 Offer validation | **Unguarded** | Hash computed and stored (**304–309**) but **AI always runs** when offer text non-empty (**321–330**) |
| #16 Hiring identify | **Unguarded** | No input hash; every identify job + every rebuild’s `identifiedRoles` pays |
| #17 Hiring synthesize | **Partially guarded** | Seeker/batch must queue build; `queueHiringTeamBuildDirect` skips built roles **without** `staleAt` (**510**); but **staleAt is set without input change** so batch rebuild can re-pay falsely |
| #18–#19 Contact profile | **Unguarded** | Job re-run regenerates; no stored input hash on profile found |
| #20–#22 Consultation | **Partially guarded** | Standing regen gated by prompt version / `shouldEnqueueConsultationStandingRegen` (`standing.ts` **131–137**, **150+**); ordinary answers always pay extract/polish; quality retries can multiply extract |
| #23 Next step | **Guarded** at enqueue | Skip if `nextStepStateKey === state.key` and text exists (`next-step.ts` **229–233**) |
| #24 Summary shell | **Unguarded** | Full shell generation path always calls AI (`service.ts` **777–780**); `sourceHash` used for UI stale, not skip |
| #25 Person section | **Guarded** | `cheatSheetPersonSectionInputHash` vs stored `inputHash` (`people.ts` **18–41**; `service.ts` **694–706**) |
| #26–#29 Assets / outreach / claim validate | **Unguarded** | User/job driven regenerate always pays |
| #30 Interview guide | **Partially guarded** | `sourceHash` marks UI stale (`guide.ts` **746–748**); regenerate still runs full AI when job runs — no skip-if-hash-equal before paid call |
| #31–#33 Email send | N/A (intentional send) | Not “regenerate with same inputs” in the AI sense |

---

## 4. Duplicate risk

**Shared job enqueue soft-dedupe:** `enqueueApplicationJob` returns existing row if same `organizationId + campaignId + type + targetId` is already `PENDING` or `IN_PROGRESS` (`application-jobs/service.ts` **33–48**, **67–68**). **Not a DB unique constraint** (`schema.prisma` `ApplicationJob` **2100–2128** — indexes only). Concurrent double-submit can race `findFirst` → two creates → two paid runs.

**Claim:** `claimNextApplicationJob` uses a transaction find+update (**144–165**) but **no** `FOR UPDATE SKIP LOCKED`; two workers could theoretically claim the same job under concurrency (cannot prove frequency from code alone).

**Heartbeat / timeout retry:** If the worker dies **after** the paid call succeeds but **before** `completeApplicationJob` (**273**), stale heartbeat requeues the job (**169–183**) and the paid work runs again. Timeout failures also requeue (**206–217**).

| Call | Double-click / concurrent | Worker retry |
|---|---|---|
| Job-backed AI (#16–#30 via jobs) | Soft-dedupe only; race possible | Yes — timeout + heartbeat; no “already completed for this input hash” |
| Sync actions (#8, #12, #15, etc.) | No lock; double click = double pay | N/A |
| #11 Fact cache | Same process: cache hit; multi-instance: miss | N/A |
| #1 Research runs | Separate ResearchRun claim path — duplicate enqueue behavior not fully audited here; freshness skip reduces but does not eliminate double runs if two runs start while stale |

---

## 5. Page views

**Finding:** Under current `src/` production paths, **no paid AI/search call runs from viewing a page**.

Evidence:
- Workspace: `ensureIdentityVerification` (`service.ts` **449–507**) — local verify + DB update; **no** `queueHiringTeamIdentify` / AI.
- `mergeExistingHiringTeamRoles` — DB merge only; no `staleAt` / AI.
- `no-ai-on-view.test.ts` asserts workspace/overview omit research/hiring-team ensure and `enqueueApplicationJob`.
- Grep of `page.tsx` files: no `generateStructured` / `enqueueApplicationJob` / `researchCompany`.

**List that can run on view alone:** *(none found)*.

**Caveat:** Client components that auto-submit actions on mount were not exhaustively proven absent for every route; any such pattern would be a violation. The application workspace and hiring-team page path do not.

---

## 6. Existing mechanisms (“run only if inputs changed”)

| Mechanism | Location | Behavior | Shared-candidate? |
|---|---|---|---|
| `cheatSheetPersonSectionInputHash` | `application-summary/people.ts` **18–41**; skip `service.ts` **701–706** | SHA-256 of prompt version + person + sources; durable on section | **Best template** for durable input fingerprint |
| `nextStepStateKey` | `next-step.ts` **229–233** | Skip enqueue/AI when state key + text unchanged | Good for discrete state machines |
| `isResearchFresh` / `expiresAt` | `research/freshness.ts`; queue + `researchCompany` | Time-based reuse (default 90d), not content fingerprint | Useful for research TTL, not content equality |
| Product/persona `contentHash` + `freshnessExpiresAt` | `product-research/acquire.ts`; progressive search | Skip re-fetch of same URL body | Good for HTTP evidence; not for model calls |
| Fact-selection fingerprints + Map cache | `fact-selection-cache.ts`; `semantic-fact-selector.ts` **269–284** | Skip EMAIL_FACTS AI in-process | Pattern good; storage must be durable/shared |
| Interview `sourceHash` | `guide.ts` **273–293**, **746–748** | UI stale only | Extend to **skip paid regenerate** when equal |
| Summary `sourceHash` | `application-summary/service.ts` **392**, **858** | UI / shell staleness | Same gap as interview for shell skip |
| `campaignOfferValidationHash` | `offer-validation.ts` **146–161**, **304–309** | Stored; **not** used to skip AI | Wire skip = quick win |
| `promptVersion` fields | Many persist paths; standing regen `standing.ts` **131–137** | Version mismatch can force regen | Include in shared fingerprint |
| Hiring `staleAt` | `build.ts` **390–394** | **Anti-pattern:** stamps without compare | Must be driven by input fingerprint |

**Conclusion:** There is **no** single shared paid-call guard today. The cheat-sheet person-section hash is the closest complete pattern to generalize.

---

## 7. Ranking (unguarded / partially guarded by likely cost impact)

Rank = (how often it can re-fire without material seeker input change) × (payload / stages). Exact dollars unknown without usage logs.

1. **#16 Hiring identify** — Unconditional on every identify job; also re-paid inside **every** role rebuild (`rebuildApplicationHiringTeamRole` **658–669**). Medium–large job+research evidence. False `staleAt` then drives batch rebuilds.
2. **#1 Company research (+ web_search stages)** — Largest single operation (multi-stage + web_search). Time-freshness helps; content-unchanged re-research after TTL or forced requeue still expensive.
3. **#17 Hiring synthesize × N Direct roles** — “Generate all Direct” / rebuild-after-false-stale; each build also pays #16 again.
4. **#24 Summary shell + cascading #25** — Shell unguarded; person sections guarded. Rebuild/identify churn can enqueue summary work (`process.ts` **82–90**).
5. **#26–#29 Resume / cover / outreach / claim validation** — Large consultation+evidence payloads; any regenerate or job retry re-pays fully.
6. **#20–#22 Consultation plan/extract/polish** — Frequent per answer; quality retries multiply; standing regen on prompt bump is intentional.
7. **#8 Job parse** — Full posting text; re-attach / re-interpret without rawText change re-pays.
8. **#30 Interview guide** — Large context; hash exists but does not skip paid call.
9. **#12–#15 Email draft / claims / offer validation** — Offer hash unused; drafts always pay on button.
10. **#3–#5 / #6–#7 Product & persona setup / interpretation** — Setup-time; lower frequency per user but large when repeated.
11. **#9 Title suggestions** — Smaller; scoring-run scoped.
12. **#10 Contact research** — Often disabled by default; structured-only.
13. **#11 Fact selection** — Already mostly guarded in-process; multi-worker gap remains.
14. **#23 Next step** — Already guarded at enqueue (lowest AI repeat risk among job types).

---

## 8. Shared guard (design only — not implemented)

**One gate:** every production `generateStructured` (and research web_search stages) goes through a helper, e.g. `runPaidStructuredCall`, that:

1. **Canonicalizes inputs** for the operation: subject ids (`organizationId`, `campaignId`, `personaId`, `contactId`, `stageId`, …) + **prompt/schema version** + **material evidence** (the same fields the prompt builder already uses — e.g. hiring identify = `hiringTeamEvidenceExcerpts` texts + includeResearch flag + identification prompt version).
2. **Fingerprints** with SHA-256 of stable JSON (same approach as `cheatSheetPersonSectionInputHash` / `campaignOfferValidationHash`).
3. **Looks up** last successful fingerprint for that `(organizationId, operation, subjectKey)` — store on the output row where one exists (`Persona.profileJson` / new columns `lastPaidInputHash`, `ApplicationSummary` person `inputHash`, interview guide `sourceHash`, campaign offer hash, research row, etc.) or a small `PaidCallReceipt` table if no natural home.
4. **Skip** when fingerprint equals last success **and** output is still usable (status READY / built / COMPLETED). Return cached output; record a usage event of kind “skipped_unchanged” (telemetry only, no provider call).
5. **Run** when fingerprint differs, missing, or seeker explicitly forces regenerate (passes `force: true` that still records the new fingerprint).
6. **Deduplicate in-flight:** strengthen `enqueueApplicationJob` with a unique partial index on active jobs **or** transactional advisory lock keyed by the fingerprint before create; sync actions take the same lock. Completing a job stores the fingerprint used.
7. **Retries:** before re-executing a requeued job, recompute fingerprint; if a receipt already exists for this job’s input fingerprint with success, complete without calling the provider (fixes heartbeat double-pay).

**Staleness from the same record:**  
For hiring personas, on identify sync: compute identify-input fingerprint `F_new`. Compare to `F_built` stored when synthesis last succeeded for that persona (or campaign-level identify fingerprint at last build). Set `staleAt` **only if** `F_new !== F_built`. Do **not** stamp on every sync (`build.ts` **390–394** today). UI “Stale” then means “recorded persona inputs changed,” matching product truth. Rebuild/identify skip when `F_new === F_last_identify_success`.

**Legitimate change still runs:** edit job posting fields used in evidence, new/updated company research included in excerpts, prompt version bump included in fingerprint, or explicit regenerate → fingerprint changes → call runs → new receipt + clear or set stale appropriately.

---

## TESTS (for the shared guard — not written/run here)

1. **Unchanged inputs → no provider call:** second identify/build/research/shell/offer-validate with identical canonical inputs does not invoke `generateStructured` / web_search.
2. **Real input change → call runs:** mutate job requirement evidence text (or research field in excerpts); next identify runs and may set `staleAt` on built personas.
3. **Double click / concurrent enqueue → one active job / one paid call:** parallel `enqueueApplicationJob` for same type/target yields one row and one provider invocation.
4. **Worker retry after success → no second paid call:** simulate heartbeat requeue after receipt written; process completes without `generateStructured`.
5. **Timeout mid-flight without receipt → retry may call once more** (document expected); after receipt, no further calls.
6. **No page view paid call:** workspace/hiring-team/overview render paths still contain no enqueue/AI (extend `no-ai-on-view.test.ts`).
7. **`staleAt` only when fingerprint changes:** identify sync with unchanged excerpts leaves `staleAt` null on built roles; changed excerpts sets `staleAt`.
8. **Build does not re-identify when identify fingerprint unchanged:** `rebuildApplicationHiringTeamRole` skips `identifyRolesWithModel` when receipt matches.
9. **Cheat-sheet person section:** unchanged hash still skips (regression); shell gains equivalent skip.
10. **Offer validation:** same `campaignOfferValidationHash` skips semantic AI; changed offer runs it.
11. **Fact selection:** durable/shared cache (or receipt) hits across worker processes for same fingerprints.
12. **Force regenerate:** explicit user regenerate bypasses skip once and writes new receipt.

---

## Risks / unknowns

1. **Production model names and $ rates** are env-only; ranking uses structural frequency × payload, not invoices.
2. **Whether claim race / double-enqueue has occurred in production** cannot be determined from code alone — needs `ApplicationJob` / `UsageEvent` analysis.
3. **Research freshness is time-based**, so “unchanged website” after 90 days still re-pays by design today; product may want content-hash instead or in addition.
4. **`ensureHiringTeamAfterResearch` remains exported** with no production page caller found; if anything outside `src/` calls it, it can still enqueue identify.
5. **Consultation quality retries** intentionally re-call extract; a shared guard must treat retry-with-same-inputs-as-failure differently from skip-on-success.
6. **Non-AI sends (#31–#33)** are metered but out of scope for input-fingerprint skip (sending twice is a product action).
7. Exact character/token size of job+research evidence varies per posting; code does not cap hiring evidence length.

---

*End of report. No product code changes.*
