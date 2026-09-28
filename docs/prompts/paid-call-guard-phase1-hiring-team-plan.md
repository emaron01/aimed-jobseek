# Prompt: Shared paid-call guard — Phase 1 hiring team (PLAN ONLY)

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly. The plan must fix root causes with one shared mechanism; no per-call-site patches, no data repair, no migration of existing data.

SURGICAL RULE
PLAN ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the plan and stop. Coding starts only after the product owner approves it. Phase 1 wires the shared guard ONLY to the hiring team paths listed below; all other paid calls stay exactly as they are in this phase.

CONTEXT
Your audit (docs/prompts/paid-calls-unguarded-repeat-cost-audit.md) found no shared paid-call guard. The product charges a flat monthly fee, so any paid call repeated with unchanged inputs is a loss on every user. Production runs ONE background worker with concurrency 10, so up to 10 jobs run in parallel in the same process.

PRODUCT OWNER DECISIONS
- One shared gate for paid calls, built on the existing cheatSheetPersonSectionInputHash pattern: fingerprint of canonical inputs (including prompt and schema version), durable record of the last successful result, skip the provider call when the fingerprint matches and the stored result is usable.
- Unchanged inputs mean no paid call, including when the seeker clicks Regenerate or Generate. The current result is kept. There is no seeker-facing force or bypass.
- A new fingerprint (a real input change, a prompt version change, or a quality-rejection regeneration that passes new input) runs the call.
- Phase 1 scope, wired to the gate:
  1. Hiring identify (identifyRolesWithModel): skips when its input fingerprint is unchanged, whether called from HIRING_TEAM_IDENTIFY or from a role build or rebuild.
  2. Hiring synthesize (draftRoleWithModel / draftsFor): skips when the role's input fingerprint is unchanged.
  3. staleAt: set only when a built role's recorded input fingerprint differs from its current inputs. Never stamped unconditionally.
  4. Rebuilding one role never re-runs identify when identify's inputs are unchanged, and never marks other roles stale.
  5. Duplicate protection for all application jobs: an active job for the same job type and subject can exist only once (enforced by the database, not only by a soft check), and the worker's claim must never let two workers or two concurrent slots claim the same job.
  6. Crash safety: once a paid call succeeds, its result is recorded before the job can be retried, so a retry or heartbeat requeue completes without calling the provider again.

PLAN FOR
1–13 as specified by the product owner (gate through files/schema), then TESTS, then risks.

---

# Plan: Shared paid-call guard — Phase 1 (hiring team)

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git` (`main`)  
**Status:** PLAN ONLY — no code, configuration, schema, prompts, tests, or data changed in this step.  
**Coding starts only after product-owner approval.**

**Worker concurrency (code):** `scripts/research-worker.ts` **78–107** uses `getResearchWorkerConcurrency()` (`research/config.ts` **34–40**; default **5**, env override). Product owner states production uses **10**. Claim locking must be correct for concurrent slots in one process and for multiple workers later.

**Root causes:**
1. `identifyRolesWithModel` always pays (`hiring-team/ai.ts` **44–55**); used from identify sync and every rebuild (`build.ts` **152–160**, **658–669**).
2. Unconditional `staleAt` stamp (`build.ts` **390–394**).
3. Soft-only job dedupe (`application-jobs/service.ts` **67–68**); claim without row lock (**144–165**).
4. Downstream enqueue after every build completes (`process.ts` **82–117**) even when synthesis did no new work.

**Non-goals:** wire other paid calls; seeker force/bypass; backfill existing personas/receipts; prompt/model changes; new seeker-facing copy (owner supplies later if needed).

**Schema:** New empty `PaidCallReceipt` table + partial unique index on active jobs is allowed. **No backfill** of historical rows (“no migration of existing data”).

---

## 1. The gate

### Location
`src/lib/ai/paid-call-gate.ts` (new). Hashing mirrors `cheatSheetPersonSectionInputHash` (`application-summary/people.ts` **18–41**): `createHash("sha256").update(JSON.stringify(canonical)).digest("hex")`.

### Signature

```ts
type PaidCallOperation = "HIRING_TEAM_IDENTIFY" | "HIRING_TEAM_SYNTHESIZE";

async function runPaidStructuredCall<T>(input: {
  organizationId: string;
  operation: PaidCallOperation;
  subjectKey: string;
  inputFingerprint: string;
  isResultUsable: (stored: T) => boolean;
  parseStored: (json: unknown) => T;
  callProvider: () => Promise<T>;
}): Promise<{ data: T; skipped: boolean }>
```

### Record — table `PaidCallReceipt`

| Column | Role |
|---|---|
| `organizationId` | tenant |
| `operation` | identify \| synthesize |
| `subjectKey` | identify: `campaignId`; synthesize: `personaId` |
| `inputHash` | fingerprint |
| `resultJson` | last successful provider payload |
| timestamps | created/updated |

`@@unique([organizationId, operation, subjectKey])`.

### Algorithm
1. Load receipt.  
2. If `inputHash` matches and `isResultUsable` → return `{ skipped: true }` (**no** provider).  
3. Else `callProvider()`.  
4. **Upsert receipt immediately** after success (before domain fan-out / before `completeApplicationJob`).  
5. Return `{ skipped: false }`.

### Wrapping without changing `generateStructured`
Unwired callers keep calling `get*AiProvider().generateStructured(...)` directly. Phase 1 only changes `identifyRolesWithModel` and `draftRoleWithModel` (`hiring-team/ai.ts`) so their `callProvider` closures contain the existing `generateStructured` call. Adapters (`openai-responses.ts`, `openai-compatible.ts`) stay untouched.

### Usable stored result
| Op | Usable when |
|---|---|
| Identify | `hiringTeamIdentificationSchema` parses `resultJson`; `identifiedRoles` re-applies guardrails in-process (`build.ts` **161–166**) |
| Synthesize | Draft/narrative parses; target persona still built / has narrative (`isHiringTeamPersonaBuilt`, `build.ts` **270–283**). If not built, re-run |

No force flag.

---

## 2. Identify fingerprint

### Included (exactly what the model receives)
Assembled in `hiringTeamEvidenceExcerpts` (`hiring-team/evidence.ts` **83–105`) → passed to `identifyRolesWithModel` (`ai.ts` **30–32**, **47–49**) → serialized in `buildHiringTeamIdentificationMessages` (`prompt.ts` **11–16**):

| Input | Assembly |
|---|---|
| Job evidence text | `jobRequirementEvidenceText` (**35–63**): title, employer, location, work arrangement, employment type, seniority, reporting line, responsibilities, requirements, preferred, scorecard mission/outcomes/competencies |
| Research evidence text (optional) | `companyResearchEvidenceText` (**66–77**) when `includeResearch` and research present: summary, what they sell, business model, hiring signals, risk signals |
| `promptVersion` | `HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION` (`contract.ts`, currently `"2"`; embedded in system message `prompt.ts` **8**) |
| `schemaName` | `"hiring_team_identification"` (`structured-output-schemas.ts` **99–102**) |

Canonical hash payload:

```json
{
  "promptVersion": "<HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION>",
  "schemaName": "hiring_team_identification",
  "evidence": [{ "sourceId", "displayName", "text" }]
}
```

**Subject key:** `campaignId`.

### Deliberately excluded (must not re-run identify)
| Input | Why / where it lives |
|---|---|
| Contact attachment / campaign contacts | Not in evidence excerpts; contacts are separate (`CampaignContact`) |
| Seeker role edits (name, titles, department, why, notes) | `updateApplicationHiringTeamRole` (`build.ts` **572–597**) writes Persona fields only; not passed into `identifyRolesWithModel` |
| `existing` roles list for guardrails | Passed to `identifiedRoles` / `applyHiringTeamIdentificationGuardrails` (`build.ts` **342–346**, **161–166**) after the model returns — deterministic, free |
| Involvement move | `moveApplicationHiringTeamRoleInvolvement` (**600–618**) updates `profileJson` only |
| Individual profile / LinkedIn paste | Contact-profile jobs, not identify evidence |
| Cheat sheet / outreach / consultation | Downstream of build, not identify inputs |

---

## 3. Synthesize fingerprint

### Included (one role)
What `draftRoleWithModel` puts into `buildPersonaSynthesisMessages` (`ai.ts` **92–120**), called from `synthesizeHiringTeamRole` → `draftsFor` (`build.ts` **199–217`) / rebuild (**701–718**):

| Field | Source |
|---|---|
| `promptVersion` | `PERSONA_SYNTHESIS_PROMPT_VERSION` (`"13"`) |
| `schemaName` | `"persona_setup_synthesis"` |
| `roleName`, `likelyTitles`, `department`, `whyThisRoleMatters`, `involvement` | Identified / stored role identity |
| `notes` / `additionalContext` | `notesFor` → `persona.additionalContext` on rebuild (**712**); `draftsFor` optional `notesFor` (**211**) |
| `rejection` | Quality-rejection strings (`ai.ts` **78**, **83–89**); empty in current retry loop (**166**) — when non-empty, fingerprint changes |
| `excerpts` | Same job/research evidence texts as identify (`productEvidence`) |
| `peers` | Other roles’ `id`, `name`, `painPoints`, `messagingNotes` (**213–235**, **713–718**) |

**Subject key:** `personaId`.

### Seeker edit to that role
`updateApplicationHiringTeamRole` (**572–597**) updates `name`, `targetTitles`, `department`, `whyThisPersonaMatters`, `additionalContext`, sets `manuallyEditedFields: ["seeker"]`. Those fields are in the synthesize fingerprint → next Generate/Regenerate **runs** the call. Sibling roles’ fingerprints unchanged unless peer fields they consume changed (peer painPoints/messagingNotes after a successful sibling rebuild).

Contact attach does not call synthesize and does not alter another role’s fingerprint inputs listed above.

---

## 4. staleAt — today, replacement, readers

### Writers today
| Site | Behavior |
|---|---|
| `syncApplicationHiringTeam` **390–394** | Sets `staleAt: new Date()` + `staleReason` for every **built** existing role — **unconditional** |
| `queueHiringTeamBuild` **451–453** | Clears `staleAt` / `staleReason` when queuing |
| `rebuildApplicationHiringTeamRole` **744–745** | Clears when draft has narrative; else keeps prior |

No other Persona `staleAt` writers found in `src/`.

### Replacement for **390–394**
For each existing **built** role during identify sync:

1. Compute current synthesize fingerprint (§3) from current excerpts + that role’s identity/notes/peers/versions.  
2. Load `PaidCallReceipt` for `(HIRING_TEAM_SYNTHESIZE, personaId)`.  
3. Set `staleAt`/`staleReason` **only if** receipt exists **and** `receipt.inputHash !== currentFingerprint`.  
4. If no receipt: **do not** set `staleAt`.  
5. If equal: leave clear (optionally clear a previously false stale when equality proven).

Keep clear-on-queue and clear-on-successful-narrative.

### Readers after the change

| Reader | Code | After change |
|---|---|---|
| Status chip | `hiringTeamStatusLabel` (`ApplicationWorkspace.tsx` **1056–1061**, **1129**) → `"Stale"` when `staleAt` set (`hiring-team.ts` **21**) | Chip only when fingerprint-true stale |
| Generate vs Regenerate button | **1232–1241**: `staleAt` or `FAILED` → `rebuildApplicationRoleAction` + label `Regenerate` / `Retry`; else `buildApplicationRoleAction` + `Generate {persona}` | Same wiring; fewer false Regenerate labels |
| Batch “Generate all Direct” | `queueHiringTeamBuildDirect` **508–517**: skips built roles with `!staleAt` | Only truly stale (or unbuilt) Direct roles queue |
| Step tracker color / done | `step-progress.ts` hiring-team uses built counts (**132–135**, **214–215**), **not** `staleAt` | Unchanged |
| Cheat sheet | Uses `isHiringTeamPersonaBuilt`, not `staleAt` (`application-summary/service.ts` **348**) | Unchanged |
| Outreach deferred build | Queues build via `queueHiringTeamBuild` (clears stale); no direct `staleAt` read in assets lib | Unchanged |
| Fit / asset `staleReason` | Separate ApplicationFit / asset fields — **not** Persona `staleAt` | Out of scope |

---

## 5. Rebuild path

`rebuildApplicationHiringTeamRole` (`build.ts` **638–757**):

1. Calls `identifiedRoles` (**658–669**) → `identifyRolesWithModel`. Gate skips provider when identify fingerprint unchanged; returns stored roles; guardrails re-run.  
2. Calls `draftsFor` for **one** role only (**701–719**). Synthesize gate skips when that persona’s fingerprint unchanged; keeps existing narrative (no overwrite with empty).  
3. Updates **only** `persona.id` (**727–755**). Does **not** call `syncApplicationHiringTeam`, so siblings are never stamped here.  
4. Confirm in tests: sibling `staleAt` and `updatedAt` unchanged across rebuild.

---

## 6. Downstream enqueue

Today after every `HIRING_TEAM_BUILD` (`process.ts` **74–118**):

1. Always `enqueueCheatSheetSectionsForPersona` (**82–90**) — may no-op per person if cheat-sheet input hash unchanged (`enqueue.ts` **17–24**), but still walks contacts and can enqueue when sections look dirty.  
2. Conditionally enqueues `OUTREACH` if `payload.deferredOutreach` (**91–117**).

**Plan:** `rebuildApplicationHiringTeamRole` (and/or synthesize gate) returns `{ identifySkipped, synthesizeSkipped }` (or equivalent). In `process.ts` `HIRING_TEAM_BUILD` case:

- If **synthesize skipped** → **do not** call `enqueueCheatSheetSectionsForPersona` and **do not** enqueue deferred `OUTREACH`.  
- If synthesize ran → keep today’s enqueue behavior.

Rationale: product rule — skipped synthesis means no new persona content; no paid downstream cascade.

Identify-only skip with synthesize run: still enqueue summary/outreach as today (new narrative).

---

## 7. Duplicate protection

### Constraint (safe on test-only DB)
Partial unique index (raw SQL migration):

```sql
CREATE UNIQUE INDEX "ApplicationJob_active_org_campaign_type_target_uidx"
ON "ApplicationJob" ("organizationId", "campaignId", "type", (COALESCE("targetId", '')))
WHERE status IN ('PENDING', 'IN_PROGRESS');
```

Product owner states the existing database contains **only test data** — creating the index is safe (no production duplicate actives to resolve). If any duplicate active rows exist in a given env, migration must fail loudly and be cleaned manually before deploy (no automated data repair in this plan).

### `enqueueApplicationJob` (`service.ts` **51–81**)
Keep `findActiveJob` (**33–48**, **67–68**) as fast path. On unique violation, re-read active job and return `toApplicationJobView` (same as today’s return-existing).

### Claim (`service.ts` **130–167**)
Replace find+update with Postgres `FOR UPDATE SKIP LOCKED` selecting the next claimable row (preserve CONSULTATION-first ordering **145–148** and heartbeat-stale `IN_PROGRESS` eligibility **131–142**), then set `IN_PROGRESS` in the same transaction.

Safe for concurrency 10 in one worker and for multiple worker processes later: each claim locks a distinct row; others skip locked rows.

---

## 8. Crash safety

Order for gated paid calls:

1. Provider success (or skip).  
2. **Upsert `PaidCallReceipt`** (`inputHash` + `resultJson`).  
3. Domain writes (persona update, stale compares).  
4. `completeApplicationJob` (`process.ts` **273** / `service.ts` **186–195**).

**Heartbeat requeue** (`abandonStaleApplicationJobs` **169–183**; claim of stale IN_PROGRESS **130–142**): job runs again → gate finds matching usable receipt → `skipped: true` → domain writes if needed → complete. No provider.

**Timeout retry** (`failApplicationJob` **206–217**): same — receipt short-circuits provider.

Window after provider before receipt write: at most one extra pay if crash in that gap; minimize by writing receipt immediately after parse.

---

## 9. Seeker experience (current wording only)

### Current UI (`ApplicationWorkspace.tsx` + `hiring-team.ts`)
- Status chip: Identified / Starting… / Generating / Ready / Failed / Stale / Approved (`hiring-team.ts` **15–22**; label fn **1056–1067**).  
- Primary action label:  
  - not failed, not stale → **`Generate {persona}`** (`actions.build` = `Generate` + vocab — **25**, polish `Generate` / `Regenerate` in `polish.ts` **9–10**)  
  - stale → **`Regenerate`** (**27**, **1239–1240**)  
  - failed → **`Retry`** (**28**, **1237–1238**)  
- Action return message: **`Generating this {persona}…`** (`queuedBuild` **41**; actions **220–222**, **280–282**).  
- Batch: button **`Generate all Direct roles`** (**26**, **1395–1396**); message **`Generating all direct roles…`** (**42**).  
- Progress: `WorkspaceProgress` for `HIRING_TEAM_IDENTIFY` / `HIRING_TEAM_BUILD` (**1361–1362**).  
- While job runs, role can show **Generating** when `setupStatus === "SYNTHESIZING"` (**1064**; set in `queueHiringTeamBuild` **453**).

### When gate skips (inputs unchanged) — behavior, not new copy
- Action still queues job (or returns existing active job) and still returns **`Generating this {persona}…`** unless product owner later changes copy.  
- Worker runs build → synthesize/identify skip → persona narrative unchanged → `setupStatus` restored to built/ready path as today after rebuild write → job completes quickly.  
- No new seeker-facing string in this plan; owner may supply later (e.g. “Already up to date”).  
- Chip stays **Ready** (not Stale) when fingerprints match.  
- Downstream summary/outreach not enqueued (§6).

---

## 10. Page views and identify enqueue origins

### Workspace load (`ApplicationWorkspace.tsx` **313–314**)
1. `ensureIdentityVerification` (`service.ts` **449–507**) — local `verifyEmployerIdentity` + possible DB update / `markIdentityDependentsStale` (ApplicationFit only, `research-finish.ts` **223–237**). **Does not** call `queueHiringTeamIdentify` or `enqueueApplicationJob`.  
2. `mergeExistingHiringTeamRoles` — DB merge only; **no** AI, **no** job enqueue, **no** `staleAt`.

**Conclusion:** page view cannot enqueue `HIRING_TEAM_IDENTIFY` or any other paid job via this chain. Confirmed by `no-ai-on-view.test.ts` **11–21**, **44–48**. **No page-view fix required in this plan.**

### Every identify enqueue origin

| Site | Function | Trigger |
|---|---|---|
| `service.ts` **232–235** | `attachParsedPosting` | Seeker attaches posting; employer undisclosed / no company name path |
| `service.ts` **277–280** | `attachParsedPosting` | Seeker attaches posting; research not started (non–run-research path) |
| `service.ts` **541–544** | `confirmApplicationEmployerIdentity` | Seeker confirms employer (`confirmApplicationEmployerIdentityAction` → workspace UI **248**) |
| `service.ts` **571–574** | `rejectApplicationEmployerIdentity` | Seeker rejects employer (**255**) |
| `research-finish.ts` **324–329** | `finishApplicationAfterResearch` | System: research worker finishes identified employer research |
| `service.ts` **716–719** | `ensureHiringTeamAfterResearch` | **No production page/action caller found** (only definition + tests/docs). Dead for page view. If something external called it: research ready and latest persona `updatedAt` &lt; research `updatedAt` |

Research-with-company path from `attachParsedPosting` (**263–275**) queues research only; identify comes later via `finishApplicationAfterResearch`.

---

## 11. Leftover calls (report only — no Phase 1 changes)

Default feature flags (`features.ts` **40–55**): `listBulkScoring: false`, `legacyEmailSequence: false`, `productLevelHiringTeam: false`.

| Audit # | Reachable today? | Call chain |
|---|---|---|
| **#6 ICP interpretation** | **Yes (setup ICP)** | `setup/[productId]/icps/**` → `IcpDetailsForm` → `interpretIcpAction` (`interpretation.ts` **133–146**) → `interpretIcpDefinition` → `generateIcpInterpretation` (`icp.ts` **732** / **592**). Also starter preview path via `previewStarterTargetEmployerAction` → `previewStarterTargetEmployer` (`starter-draft.ts` **241**). **Not** gated by `assertGatedAction`. PO dropped ICP product-wise; code path still live. |
| **#7 Persona interpretation** | **Gated off by default** | `interpretPersonaAction` / `saveAndInterpretPersonaAction` (`interpretation.ts` **181**, **235**) → `assertGatedAction("productLevelHiringTeam")` → `interpretPersonaDefinition`. Pages under `setup/.../personas/manage` use `requireGatedPage("productLevelHiringTeam")` → **404** when flag false. Reachable only if flag enabled. |
| **#9 Title suggestions** | **Gated off by default** | Scoring actions → `runScoringForRun` (`engine.ts` **286–288**) → `generateTitleSuggestionsForRun`. List scoring UI behind `listBulkScoring: false`. Unreachable under default flags; live if scoring enabled. |
| **#14 Reply classification** | **Gated off by default** | `draftReplyAction` (`email.ts` **718–725**) → `assertGatedAction("legacyEmailSequence")` → `classifyProspectReply`. Campaign email workspace pages require same gate. Unreachable under default flags. |
| **#15 Offer validation** | **Partially reachable** | (a) `createCampaignAction` (`actions.ts` **512–523**) → `validateCampaignOffer` on every new campaign from `NewCampaignForm` / `campaigns/new` — **AI skipped when offer text empty** (`offer-validation.ts` **310–312**). (b) `updateCampaignOfferAction` (`campaign-offer.ts` **48**) from `CampaignOfferForm` on `campaigns/[id]/page.tsx` — that page calls `requireGatedPage("legacyEmailSequence")` (**115**) → **404** when flag false. |

---

## 12. Existing rows (no repair / no backfill)

| State | Behavior after deploy |
|---|---|
| Built persona, no synthesize receipt | Sync does **not** set `staleAt`. First Generate/Regenerate **runs once**, writes receipt; later unchanged clicks skip. |
| Campaign, no identify receipt | Next identify job **runs once**, writes receipt; rebuilds with same evidence skip identify. |
| Active jobs | Soft dedupe + new unique index; claim uses SKIP LOCKED. |
| Already-`staleAt` rows from old bug | Not migrated. Cleared when seeker queues build (**453**) or when a future sync proves fingerprint equality (optional clear in §4 step 5). No bulk repair script. |

---

## 13. Files / functions / schema

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `PaidCallReceipt` model |
| New migration SQL | Create `PaidCallReceipt`; partial unique index on active `ApplicationJob` |
| `src/lib/ai/paid-call-gate.ts` | Gate + hash helper |
| `src/lib/hiring-team/paid-inputs.ts` (or in `ai.ts`) | `hiringTeamIdentifyFingerprint`, `hiringTeamSynthesizeFingerprint` |
| `src/lib/hiring-team/ai.ts` | `identifyRolesWithModel`, `draftRoleWithModel` call gate |
| `src/lib/hiring-team/build.ts` | Replace **390–394** stale logic; rebuild return skip flags; keep sync/rebuild structure |
| `src/lib/application-jobs/process.ts` | Honor synthesize-skip → no summary/outreach enqueue |
| `src/lib/application-jobs/service.ts` | Unique-violation handling; SKIP LOCKED claim |
| Tests | Gate, hiring-team, jobs, no-ai-on-view regression |

**Schema safety:** empty receipt table; partial unique index on test-only DB per owner; no alteration of Persona columns required if receipt holds hashes (Persona `staleAt` semantics change in writers only).

---

## TESTS (list only — not written/run here)

1. Identify job with unchanged evidence → no provider call; receipt reused.  
2. Rebuild with unchanged identify inputs → no identify provider call.  
3. Build path that calls `identifiedRoles` with unchanged inputs → no identify provider call.  
4. Generate / Regenerate / Generate all Direct with unchanged synthesize inputs → no synthesize provider call; narrative kept.  
5. Job evidence or research excerpt change → identify and/or synthesize run; `staleAt` set only on built roles whose synthesize fingerprint moved.  
6. Attach contact → no sibling `staleAt`; no identify provider call.  
7. Edit one role’s notes/name → that role’s next Generate runs; other roles not marked stale by that edit alone.  
8. Skipped synthesis → `process.ts` enqueues neither `APPLICATION_SUMMARY` nor deferred `OUTREACH`.  
9. Ran synthesis → cheat-sheet enqueue behavior unchanged (still subject to person-section hash).  
10. Two concurrent enqueues same type/target → one active job.  
11. Two concurrent claims → two distinct job ids; never double-process one id.  
12. Heartbeat requeue / timeout retry after recorded success → no provider call.  
13. Page view workspace → no `enqueueApplicationJob` / identify (existing `no-ai-on-view` still passes).  
14. Pre-receipt built role → sync does not set `staleAt`; first Generate pays once then skips.  
15. Phase 1 wire-only: gate imports only from hiring-team AI paths (source contract).

---

## Risks / unknowns

1. Peer fields in synthesize fingerprint can cascade re-runs after “Generate all Direct” when earlier roles’ narratives change peers for later roles — correct for model inputs; may surprise cost-wise.  
2. Seeker still sees **“Generating this {persona}…”** on skip until owner supplies new copy.  
3. Partial unique index fails if any env has duplicate active jobs (owner said test-only DB).  
4. `ensureHiringTeamAfterResearch` remains dead code for page view but exported.  
5. ICP interpretation (#6) remains a live paid path outside Phase 1.  
6. Crash between provider return and receipt write can still double-pay once.

---

*End of plan. No product code changes. Awaiting product-owner approval before coding.*
