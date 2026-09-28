# PLAN ONLY — Remove employer ICP, Target Employer, and Employer fit

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly. The plan must remove the feature completely at its root (no hidden UI over live code, no dead paths left callable), with no data repair or migration of existing data.

SURGICAL RULE
PLAN ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the plan and stop. Coding starts only after the product owner approves it.

PRODUCT OWNER DECISION
AimedJobSeek does not judge employers. The seeker chooses the job, so the product has no employer ICP, no Target Employer profile, and no Employer fit. Remove all of it: the Target Employer / ICP setup, its paid interpretation calls (generateIcpInterpretation, interpretIcpDefinition, interpretIcpAction, previewStarterTargetEmployer, previewStarterTargetEmployerAction, and any other), and the Employer fit scoring and its display on the application page. What stays: the scorecard that scores the job description against the seeker's Personal Profile, and everything else in the product.

PLAN FOR
1. Inventory: every file, component, page, route, server action, function, job, prompt, schema model or column, feature flag, and test that exists for ICP, Target Employer, or Employer fit. Cite each.
2. Readers: every place outside that inventory that reads ICP, Target Employer, or Employer fit data (Harper consultation prompts and planning, the job scorecard, persona identify and synthesis, company research, outreach, cheat sheet, resume and cover letter, next step, sidebar or step colors, setup completion, onboarding or starter flows). For each, state what it reads and what it does with it, and what the plan changes so it works without it.
3. Seeker target roles vs employer ICP: the scorecard on the application page shows "Scored against Target Employer profile for VP of Sales, VP of Go-to-Market". Determine exactly where those titles come from (Personal Profile field, the Target Employer / ICP record, or elsewhere). Identify any seeker preference data (target roles, titles, seniority, location, compensation, work arrangement, employment type) that is stored on the Target Employer / ICP record but is used by the job scorecard, Harper, or anything that stays. For each, state whether removing the ICP would lose it, and plan how the kept features continue to receive it without keeping Employer fit. Do not move or rename data without stating it here for approval.
4. Setup flow: how setup currently includes Target Employer / ICP (steps, pages, required completion, sidebar or setup progress), and how setup works after removal, with no step left pointing at removed pages.
5. Application page: the exact Employer fit section and any fit override controls ("Your override: Good fit / Needs review / Poor fit / Excluded") to remove, and confirmation that the job scorecard section is unchanged.
6. Jobs and paid calls: any job type, worker path, or enqueue origin that exists only for ICP or Employer fit, and how the plan removes it so no paid call for it can run. Include identity or research paths that mark Employer fit stale (for example markIdentityDependentsStale touching ApplicationFit).
7. Schema: every model and column used only by ICP, Target Employer, or Employer fit. Give two options with consequences, and do not choose: (A) leave the schema in place unused for now, or (B) drop them in a migration. State whether (B) is safe on the existing database, which contains only test data.
8. Feature flags and gated code: any flag that exists only for these features, and how the plan removes it.
9. Every file and function affected, and what each becomes.

TESTS
Do not run or write tests. List the tests the implementation would add, update, or remove, each with what it asserts. Include: no page, action, job, or worker path can call any ICP or Employer fit paid function; setup completes with no Target Employer step; the application page shows no Employer fit section; the job scorecard still scores the job description against the Personal Profile with the same inputs it receives today; Harper and persona builds work unchanged; any seeker preference data identified in item 3 still reaches the features that use it.

REPORT
Deliver the plan in sections numbered 1 through 9 matching the items above, followed by the TESTS list. End with a short list of risks or unknowns. Make no code changes.

---

# Plan: Remove employer ICP, Target Employer, and Employer fit

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `origin https://github.com/emaron01/aimed-jobseek.git`  
**Mode:** PLAN ONLY — no code, schema, test, or data changes in this step.

**Product decision restated:** AimedJobSeek does not judge employers. Remove Target Employer / ICP setup, all ICP paid interpretation, Employer fit scoring and its application-page UI. **Keep** the job Scorecard (job posting + Personal Profile / Harper coaching). No data backfill; no silent rename of seeker preference stores without approval (see §3 — none required).

---

## 1. Inventory

### Schema (`prisma/schema.prisma`)

| Item | Approx. lines | Role |
|---|---|---|
| `IcpCriterionTier`, `TargetedSearchDecision` enums | 362–374 | ICP criteria |
| `Organization.icps` / `icpCriteria` / `applicationFits` | ~584–650 | Relations |
| `ResearchPolicy.maxTargetedSearchCriteriaPerIcp` | ~1174–1175 | ICP research policy |
| `Product.icps` | ~1314 | Product → ICPs |
| `User.applicationFitOverrides` | ~769 | Fit override relation |
| **`Icp`** model | 1352–1408 | Target Employer profile (name, definition, firmographics JSON, compensation, interpretation fields) |
| **`IcpCriterion`** model | 1411–1461 | Employer criteria |
| `Campaign.icpId` / `icp` / `applicationFit` | 2342–2411 | Optional FK since migration `20260926210000_campaign_icp_optional` |
| `ScoringRun.icpId` / `icpSnapshot` | 2151–2196 | List scoring vs ICP |
| **`ApplicationFit`** model | 2455–2485 | Employer fit result + overrides |
| `ApplicationJobType` | 546–557 | **No** ICP/fit job type |

Related migrations include (non-exhaustive): `20260320160000_*`, `20260321000000_*`, `20260320180000_*`, `20260823120000_*`, `20260823140000_*`, `20260825120000_*`, `20260923120000_*`, `20260923143000_*` (creates `ApplicationFit`), `20260923160000_*`, `20260926210000_campaign_icp_optional`.

### Pages / routes

| Path | Role |
|---|---|
| `src/app/(app)/icps/page.tsx`, `.../icps/new/page.tsx` | Org-wide Target Employer list/create |
| `src/app/(app)/setup/[productId]/icps/page.tsx` | Product ICP list |
| `src/app/(app)/setup/[productId]/icps/new/page.tsx` | Create / starter draft |
| `src/app/(app)/setup/[productId]/icps/[icpId]/page.tsx` | Edit ICP + criteria |
| `src/app/(app)/setup/[productId]/page.tsx` **302–366** | Setup panel **“2. Target Employer profile”** |
| `src/app/(app)/lists/[id]/score/page.tsx`, `src/app/(app)/scoring/[runId]/page.tsx` | List scoring against ICP (gated; see §8) |
| Campaign/job pages | Host Employer fit via `ApplicationWorkspace` |

`/icps` is **not** in the main nav (`src/lib/auth/user-menu.ts`; asserted in `workflow-audit-fixes.test.ts` **53–59**). Pages remain URL-reachable today.

### Server actions

| File | Functions (cited from inventory) |
|---|---|
| `src/app/actions.ts` | `upsertIcpAction` (~182–250), `deleteIcpAction` (~252–271) |
| `src/app/actions/interpretation.ts` | `previewStarterTargetEmployerAction` (~45–85), `approveStarterTargetEmployerAction` (~87–131), `interpretIcpAction` (~133–167), criterion/tier/evidence/targeted-search actions (~266+) |
| `src/app/actions/application.ts` | `rescoreApplicationFitAction` (~186–204), `overrideApplicationFitAction` (~206–229) |
| `src/app/actions/scoring.ts` | List scoring create path with `icpId` (~39–99) |

### Lib (ICP + Employer fit)

| Path | Key exports |
|---|---|
| `src/lib/interpretation/icp.ts` | `generateIcpInterpretation` (**576**), `interpretIcpDefinition` (**694**), persist/list/update criteria, stales fits |
| `src/lib/interpretation/schema.ts` | `icpInterpretationResultSchema` |
| `src/lib/icp/starter-draft.ts` | `previewStarterTargetEmployer`, `approveStarterTargetEmployer`, `starterTargetEmployerName` (**92–102**), `buildStarterTargetEmployerDefinition` (**43–89**) |
| `src/lib/icp/save.ts`, `stated-compensation.ts` | Form/compensation helpers |
| `src/lib/tenant/data.ts` | `listIcps` / `getIcp` / `createIcp` / `updateIcp` / `deleteIcp` |
| `src/lib/application/fit.ts` | `computeApplicationEmployerFit` (~48), `formatFitBucketLabel` (**187–199**) |
| `src/lib/application/fit-staleness.ts` | `markApplicationFitsStaleForCompany` (**10**), `markApplicationFitsStaleForIcp` (**27**) |
| `src/lib/application/research-finish.ts` | `scoreFit` (**141–221**), `markIdentityDependentsStale` (**223–237**), `finishApplicationAfterResearch` (**255+**) |
| `src/lib/application/compensation-fit.ts` | Pay outcomes inside employer fit |
| `src/lib/application/service.ts` | `rescoreApplicationFit`, `overrideApplicationFit` |
| `src/lib/application/overview.ts` | Overview `fitLabel` from `ApplicationFit` |
| `src/lib/criteria/*`, `src/lib/scoring/icp-qualification.ts`, scoring engine | Shared ICP criteria / list scoring |
| `src/lib/prompt-content/icp-interpretation.ts` | ICP interpretation system prompt |
| `src/lib/ai/structured-output-schemas.ts` / `roles.ts` | `icpInterpretation` AI role |

### UI components

| Component | Role |
|---|---|
| `IcpDetailsForm.tsx`, `IcpCriteriaReview.tsx`, `IcpBriefingDocument.tsx` | ICP setup |
| `ApplicationWorkspace.tsx` **713–797** | Employer fit `<details data-testid="employer-fit">` |
| `ApplicationFitOverride.tsx` | Override select Good fit / Needs review / Poor fit / Excluded |
| `ApplicationOverview.tsx` | Overview fit fact |
| `QualificationBuckets.tsx`, `ScoreReportClient.tsx`, `ScoreListForm.tsx` | List ICP scoring UI |
| Copy: `vocab.icp` (**vocabulary.ts** **69–74**), `applicationWorkspaceCopy.employerFit*` / `fitHelp` (**261–294**, **280–281**) | Labels |
| Harper: `review_fit` → Employer fit (`harper-actions.ts` / `harper-suggestions.ts`) | Suggestion |

### Feature flags

No dedicated “employer fit” / “ICP” flag. `listBulkScoring: false` in `src/lib/product-config/features.ts` (**13**, **43**) gates list scoring UI that consumes ICP.

### Tests (representative)

`icp-interpretation.test.ts`, `icp/save.test.ts`, `stated-compensation.test.ts`, application fit tests, `icp-qualification.test.ts`, criteria tests, `workflow-audit-fixes.test.ts` (nav/rail hide ICP), `product-campaign-readiness.test.ts`, `home-setup-*` tests, scoring/smoke fixtures that create `Icp` rows, `product-config.test.ts` (vocab).

---

## 2. Readers outside the ICP setup inventory

For each: what is read today → plan after removal.

| Consumer | Reads today | Plan |
|---|---|---|
| **Job Scorecard UI** (`ApplicationWorkspace.tsx` **658–670**) | `jobRequirement.scorecardJson`; note from Personal Profile + Harper (`scorecardNote` **248–249**) | **Unchanged.** Does not read `Icp` / `ApplicationFit`. |
| **Harper consultation** (`consultation/service.ts`, `assess.ts`) | Job required/preferred/scorecard + `profile.direction.*` via `profileEvidenceItems` | **Unchanged.** No ICP/fit reads. |
| **Application Hiring Team synthesize** (`hiring-team/ai.ts` **181**) | Already `icpContext: null` | **Unchanged.** |
| **Product-level persona synthesize** (`persona-research/synthesize.ts` **326–368**) | Latest non-archived `Icp` → `personaGenerationSnapshot` → `icpContext` | Stop loading ICP; always pass `icp: null` / `icpContext: null` (same as hiring-team). Prompt already accepts null (`persona-research/prompt.ts` **17**, **35**). |
| **Company research** | Uses `campaign.icpId` only to call `finishApplicationAfterResearch` → `scoreFit` (`runs-service.ts` ~616–661). App research does **not** pass ICP `researchGuidance` as evidence targets in production. | Remove `scoreFit` / fit upsert / fit-stale side effects from research finish. Keep company research for the application. |
| **Employer fit pipeline** | Full ICP criteria + compensation → `ApplicationFit` | **Delete** scoring + UI + actions. |
| **Application overview** | `ApplicationFit` bucket/override → `fitLabel` | Remove fit fact from overview. |
| **Outreach (application)** | Profile + job + persona; no ICP | **Unchanged.** |
| **List/email generation** (`email-generation/context.ts`) | `campaign.icp` via `icpForGeneration` | Remove ICP fields from email context (name/definition empty/null). List product remains otherwise. |
| **Cheat sheet / resume / cover / next step** | Profile + job; no ICP/fit | **Unchanged.** |
| **Sidebar / step progress** (`step-progress.ts`, `application-steps.ts`) | Copy may mention “employer fit”; progress does not require fit | Remove copy references; no step key for fit. |
| **Setup / home** | ICP panel on product page; home line counts ICPs (`home-setup-line.ts` **41–46**); rail already omits `/icps` | Remove panel + counts; see §4. |
| **List scoring** | `ScoringRun` + ICP criteria | Remove callable scoring-against-ICP paths (or leave unreachable only if schema option A — prefer delete actions/pages so not callable). |
| **Staleness** | `markApplicationFitsStaleForCompany` (`company-research-service.ts` ~845), `markIdentityDependentsStale` (`research-finish.ts` **223–237**), ICP edit → `markApplicationFitsStaleForIcp` | Remove call sites with fit feature. |

---

## 3. Seeker target roles vs employer ICP

### Where “Scored against Target Employer profile for VP of Sales, VP of Go-to-Market” comes from

That string is **not** the job Scorecard note.

1. Copy template: `applicationWorkspaceCopy.fitHelp` = `"Scored against {name}. …"` (`vocabulary.ts` **280–281**).
2. Render: `fitHelp.replace("{name}", icp.name)` (`ApplicationWorkspace.tsx` **724–726**) inside the **Employer fit** section (**713–797**).
3. `{name}` is **`Icp.name`**. Starter naming: `starterTargetEmployerName` (`starter-draft.ts` **92–102**) builds `` `${vocab.icp.Singular} for ${titles.slice(0, 2).join(", ")}` `` from **`profile.direction.targetTitles`** (Personal Profile) at draft time — or the seeker later edits `Icp.name`.

**Job Scorecard** (unchanged section) uses `scorecardNote`: “based on your {product} and the job posting…” (`vocabulary.ts` **248–249**; UI **666–670**). Outcome/competency **section titles** are vocabulary (`outcomesTitle` / `competenciesTitle` **277–278**); item text is `jobRequirement.scorecardJson`.

### Seeker preference data: where it lives vs ICP

| Preference | Canonical store (stays) | Also on `Icp`? | Used by kept features? | If ICP removed |
|---|---|---|---|---|
| Target titles / functions / career goals / seniority | `product.profileJson.direction` (`candidate-profile.ts`) | Copied into starter **definition string** and into **name** only (`starter-draft.ts` **43–89**, **92–102**) — not separate ICP columns | Harper, summary sources, starter (removed) | **No loss** — keep reading Personal Profile |
| Work arrangement / location / relocation | `profile.identity.*` | Copied into starter definition text only | Harper / profile readers | **No loss** |
| Compensation / employment types | Profile compensation helpers (`stated-compensation.ts` seeds ICP) | **`Icp` compensation columns** used by **employer fit** (`research-finish.ts` `employerCompensationFromIcp` → `computeApplicationEmployerFit`) | Fit only among application features | **No loss for kept features** — they do not read ICP pay for scorecard/Harper |
| Persona `targetTitles` | Hiring-team role likely titles | Unrelated to seeker ICP | Hiring team | Unchanged |

**Data move proposal for approval:** **None.** Do not migrate ICP rows into Personal Profile. Profile already holds seeker preferences. ICP definition/name/compensation were employer-fit / starter denormalizations.

---

## 4. Setup flow

**Today**

- Product setup page panel **“2. {Target Employer profile}”** (`setup/[productId]/page.tsx` **302–366**) with draft-from-profile / write-from-scratch links to `/setup/.../icps/...`.
- Dedicated ICP routes under `/setup/.../icps` and `/icps`.
- Home setup rail: **already omits** Target Employers (`HOME_SETUP_STEP_KEYS` products/voice/email — `home-setup-rail.ts` **13–17**, **116–150**; tests assert hide).
- Campaign readiness: **does not require** ICP (`product-campaign-readiness.test.ts` “does not require a Target Employer profile”).
- Setup-complete line still **counts** ICPs (`home-setup-line.ts` **41–46**).

**After removal**

- Delete ICP routes and the product-page panel 2 (renumber remaining panels if needed so no gap pointing at removed URLs).
- Remove ICP counts from setup-complete copy.
- Keep Personal Profile as the setup core; no step links to `/icps` or `/setup/.../icps`.
- New application form already has no `icpId` (`workflow-audit-fixes.test.ts` **73–75**); leave `campaign.icpId` null (or unused under schema option A).

---

## 5. Application page

**Remove entirely**

- Employer fit block: `ApplicationWorkspace.tsx` **713–797** (`data-testid="employer-fit"`, `id="employer-fit"`).
- Help line using `fitHelp` + `icp.name` (**724–726**).
- Criteria list, rescore form (**786–794**).
- `ApplicationFitOverride` (**780–785**, component file) — labels Good fit / Needs review / Poor fit / Excluded via `formatFitBucketLabel` (`fit.ts` **187–199**).
- Overview fit fact (`overview.ts` / `ApplicationOverview`).
- Harper suggestion `review_fit` targeting employer fit.

**Leave unchanged**

- Job requirement fields + Scorecard block **658–670** (mission, outcomes, competencies, `scorecard-note`).
- Employer identity / research UI that is not fit scoring (confirm employer, research progress) — except strip fit-only failure copy that exists only to explain unscored fit (`research-finish.ts` messages about “fit was not scored” should be rewritten or dropped when fit is gone).

---

## 6. Jobs and paid calls

| Path | Today | Plan |
|---|---|---|
| `ApplicationJobType` | No ICP/fit type | Nothing to remove from enum |
| ICP interpretation | Synchronous paid calls via `generateIcpInterpretation` / `interpretIcpDefinition` from actions | Delete actions + lib entrypoints so nothing callable remains |
| Starter preview/approve | `previewStarterTargetEmployer` / actions | Delete |
| `scoreFit` after research | `finishApplicationAfterResearch` → `scoreFit` when `icpId` set | Remove fit branch; research finish still completes employer research + enqueue hiring identify as today |
| `rescoreApplicationFitAction` / `overrideApplicationFitAction` | Manual paid/compute paths | Delete |
| `markIdentityDependentsStale` | Sets `ApplicationFit.stale` (**223–237**) | Remove or no-op after fit removal |
| `markApplicationFitsStaleForCompany` / `ForIcp` | Research/ICP edit | Remove call sites |
| List scoring `createScoringRun` with ICP | Paid qualification vs ICP | Remove/disable callable path (pages + actions) |

No separate worker job type is dedicated to ICP; paid work runs in web/actions and research-finish. Root removal = delete those functions and all importers.

---

## 7. Schema options (do not choose)

Used **primarily/only** by ICP / Target Employer / Employer fit / list-ICP scoring:

- Models: `Icp`, `IcpCriterion`, `ApplicationFit`
- Columns/FKs: `Campaign.icpId`, `ScoringRun.icpId` + `icpSnapshot`, org/product/user relations, `ResearchPolicy.maxTargetedSearchCriteriaPerIcp`
- Enums: `IcpCriterionTier`, `TargetedSearchDecision` (if unused elsewhere after removal)

**Option A — Leave schema unused**  
Consequences: no migration; dead tables/columns remain; Prisma client still has models (risk of accidental reuse unless app code deletes all accessors); simpler deploy; PO said no data repair — rows can sit untouched.

**Option B — Drop in a migration**  
Consequences: removes models/FKs; must drop `ApplicationFit`, criteria, ICPs, null/drop `Campaign.icpId`, adjust or drop list `ScoringRun` ICP requirements.  
**Safety on existing DB (test data only per PO):** Code cannot prove production row counts. On a test-only DB, DROP is operationally safe if no live product dependency remains after code removal. Pre-check recommended: counts on `Icp`, `ApplicationFit`, `Campaign` with non-null `icpId`. If any production-like data appeared later, dropping would destroy it — PO must confirm before choosing B.

This plan does **not** pick A or B.

---

## 8. Feature flags and gated code

| Flag / gate | Role | Plan |
|---|---|---|
| `listBulkScoring: false` (`features.ts` **43**) | Hides list bulk scoring UI that scores contacts against ICP | After ICP/list-score removal, remove or leave flag if lists still need a future non-ICP scoring flag — **prefer remove ICP scoring code**; flag can stay false or be deleted if unused |
| Nav/rail code that **hides** `/icps` | Soft-hide, pages still live | Replace with **hard delete** of routes — no “hidden but live” UI |

No flag exists solely for Employer fit on applications (always on when `campaign.icp` present).

---

## 9. Files and functions affected (what each becomes)

**Delete (root — no dead callable paths)**  
ICP pages under `app/(app)/icps/**` and `setup/.../icps/**`; `IcpDetailsForm` / `IcpCriteriaReview` / `IcpBriefingDocument`; `ApplicationFitOverride`; ICP actions in `actions.ts` / `interpretation.ts` (ICP-related); fit actions in `application.ts`; ICP interpretation lib + prompt-content; `icp/starter-draft`, `icp/save` (if only ICP); fit compute/staleness modules once unused; list score pages/actions that require ICP.

**Strip / rewrite**  
`ApplicationWorkspace.tsx` — remove fit block; keep scorecard.  
`research-finish.ts` — remove `scoreFit` / fit upsert / fit-oriented skip reasons; keep research + hiring identify enqueue.  
`company-research-service.ts` — remove fit-stale call.  
`persona-research/synthesize.ts` — stop `prisma.icp.findFirst`; `icpContext: null`.  
`generation/compensation.ts` `personaGenerationSnapshot` — icp always null or drop icp param.  
`email-generation/context.ts` — stop loading ICP.  
`overview.ts` / Harper `review_fit` — remove.  
Setup product page — remove panel 2; fix numbering/copy.  
`home-setup-line.ts` — stop counting ICPs.  
`tenant/data.ts` — remove ICP CRUD used only by deleted UI (or entire ICP API).  
Vocabulary — remove or stop referencing `vocab.icp` / fit copy once unused (avoid orphan nav labels).

**Unchanged behavior**  
Job Scorecard UI; Harper planning inputs from profile + job; application hiring-team identify/synthesize (already null ICP); application resume/cover/outreach/cheat sheet/next step; company research for employer facts (minus fit).

**Schema**  
Per §7 option A or B after PO choice.

**Tests**  
Remove ICP/fit-specific suites; update fixtures that create `Icp` only for fit; add contract tests in TESTS below.

---

## TESTS (implementation later — not written/run now)

1. **No paid ICP/fit entrypoints:** source/contract test that `generateIcpInterpretation`, `interpretIcpDefinition`, `previewStarterTargetEmployer`, `interpretIcpAction`, `previewStarterTargetEmployerAction`, `scoreFit`, `rescoreApplicationFitAction`, `overrideApplicationFitAction` are absent from `src/` (or not exported/imported by any page/action/worker).
2. **Routes gone:** smoke/discover routes do not include `/icps` or `/setup/:id/icps`.
3. **Setup:** product setup page has no Target Employer panel; setup-complete copy has no ICP count; rail still has no `/icps`.
4. **Application page:** no `data-testid="employer-fit"`; no fit override form; **Scorecard** block and `scorecard-note` still present with Personal Profile + posting wording.
5. **Scorecard inputs unchanged:** Harper/assess still build targets from job scorecard + `profile.direction` (existing consultation tests remain green).
6. **Hiring team:** synthesize still called with `icpContext: null`; identify/synthesize tests unchanged in behavior.
7. **Product persona synthesize:** does not query `Icp`; works with null context.
8. **Research finish:** completing research does not upsert `ApplicationFit` / call `scoreFit`.
9. **Preference continuity:** fixture with `direction.targetTitles` still surfaces in Harper profile evidence after ICP removal (no dependency on `Icp.name`).
10. **Remove/update:** delete `icp-interpretation.test.ts` and fit-only tests; rewrite workflow-audit tests that only asserted “hide ICP” to assert “ICP routes/actions gone”; drop fixtures’ unnecessary `icp.create` where only used for fit.

---

## Risks / unknowns

1. **List scoring / email ICP context** — removing Target Employer also removes list-ICP qualification; confirm lists product expectation (flag already off).
2. **Product-level persona synthesis quality** — today may include ICP name/definition; becoming always-null is intentional and matches application hiring team.
3. **Schema option A vs B** — needs explicit PO choice; B needs pre-check SQL on the deploy DB.
4. **Shared `criteria/*` modules** — may still be imported by list scoring; ensure no orphan paid path remains after list-ICP removal.
5. **Copy confusion** — users may have thought Scorecard subtitle was Employer fit; implementation must keep Scorecard and only remove fit block.
6. **`Campaign.icpId` optional already** — new apps often null; legacy campaigns with ICP become irrelevant once fit UI/scoring is gone.
7. **Cannot verify from code** that Render DB is “test data only” — stated by PO for option B safety.

---

*End of plan. No code changes made.*
