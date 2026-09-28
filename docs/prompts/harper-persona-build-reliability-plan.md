# PLAN — Personas and Interviewers build reliability (post Phase 1 + serialization)

**Repo confirmed:** `C:\Repos\aimed-jobseek` · remote `https://github.com/emaron01/aimed-jobseek.git`  
**Mode:** PLAN ONLY — no code, schema, config, prompt, test, or data changes in this turn.  
**Replaces:** earlier persona-failure plans that predate Phase 1 (`PaidCallReceipt`) and same-key job serialization.

---

## PRODUCT OWNER DECISIONS (binding)

- `profileJson.modelNote` is internal only; keep stored; never render to seeker.
- Wire `assessHiringTeamDraft` into live synthesis.
- Fixable quality rejection → regenerate once with rejection reasons (new Phase 1 fingerprint).
- Never fabricate; not enough real information → save no built persona; seeker uses Edit or Add form; then rebuild.
- Not-enough-info recorded against input fingerprint → unchanged Generate makes no paid call.
- Temporary failures retry in the worker (serialization + Phase 1 crash safety).
- Missing config (`SYNTHESIS_UNAVAILABLE`) is operational; detect before seekers hit it; no system language to seeker.
- Edit without narrative must never count as built.
- Move Add form above Direct; relabel “Add Interviewer Title / Persona”; fields/behavior unchanged.
- Seekers never see system status labels; PO supplies wording later — do not invent copy.
- No new UI sections or seeker inputs beyond the form move.

---

## 1. Existing seeker paths

### 1.1 Add Hiring Team role form

| Item | Location |
|------|----------|
| UI | Inline in `HiringTeamSection` — `src/components/ApplicationWorkspace.tsx` **1403–1426**, `testId="add-hiring-team-role"` |
| Placement today | **Below** Direct/Indirect groups and “Generate all Direct roles” (**1370–1402** then form) |
| Action | `addApplicationRoleAction` — `src/app/actions/hiring-team.ts` **103–128** |
| Lib | `addApplicationHiringTeamRole` — `src/lib/hiring-team/build.ts` **588–636** |
| Job | **None.** Creates `Persona` with `setupStatus: "NOT_STARTED"`, `approvalStatus: "NOT_STARTED"`, `profileJson.narrative: null`, `manuallyEditedFields: ["seeker"]`, synthetic `identification.roleKey: custom_${Date.now()}` |

**Seeker enters:** Name (required), Likely titles, Department, Why this role matters, Notes.

**Path to synthesize fingerprint / build:** Add does not enqueue build. Seeker must click Generate on the card → `buildApplicationRoleAction` (**278–305**) → optional `hiringTeamSynthesizeUnchanged` (**827–885**) → `queueHiringTeamBuild` (**532–559**) → `ApplicationJob` type `HIRING_TEAM_BUILD`, `targetId: persona.id` → `processApplicationJob` (`process.ts` **72–118**) → `rebuildApplicationHiringTeamRole` (**709–825**) → `draftsFor` → `synthesizeHiringTeamRole` → `draftRoleWithModel` → fingerprint via `hiringTeamSynthesizeFingerprint` (`paid-inputs.ts` **41–72**), which includes role fields, notes, `rejection`, excerpts, peers.

### 1.2 Role card Edit

| Item | Location |
|------|----------|
| Toggle | `HiringTeamRoleActions` — `src/components/HiringTeamRoleActions.tsx` |
| Form | `ApplicationWorkspace.tsx` edit form → `updateApplicationRoleAction` (**hiring-team.ts** **130–157**) |
| Lib | `updateApplicationHiringTeamRole` — `build.ts` **638–664** |
| Job | **None** on save |

**Seeker enters:** Same fields as Add (name, titles, department, why, notes).

**Bug (built without narrative):** Save sets `setupStatus: "NEEDS_REVIEW"` and `approvalStatus: "NEEDS_REVIEW"` (**660–661**) without writing `profileJson.narrative`. Then `isHiringTeamPersonaBuilt` (**336–345**) returns true solely because `setupStatus === "NEEDS_REVIEW"`.

**Path to build after edit:** Same Generate/Regenerate → `queueHiringTeamBuild` → … → fingerprint includes updated name/titles/department/why/notes (`additionalContext`). In `rebuildApplicationHiringTeamRole`, seeker-edited fields are preserved over identify match when `manuallyEditedFields` contains seeker (**793–810**).

### 1.3 Seeker-added vs identified role

| | Identified | Seeker-added |
|--|------------|--------------|
| Created by | `syncApplicationHiringTeam` / `identifiedRoles` after `HIRING_TEAM_IDENTIFY` (queued from research-finish / identity paths, e.g. `research-finish.ts` ~330–334) | `addApplicationHiringTeamRole` |
| `roleKey` | Model/guardrail key (e.g. `hiring_manager`) | `custom_${Date.now()}` |
| Evidence | Identification evidence on `profileJson` | Synthetic claim from why/name |
| Rebuild match | Prefer `suggestionKey` / name against fresh identify list (**740–756**); fallback synthesizes from persona row | Fallback path always (custom key rarely in identify list) |
| Fingerprint peers | Other campaign personas | Same |

---

## 2. Every failure path today (identify → synthesize → quality → save)

### 2.1 Identify (`HIRING_TEAM_IDENTIFY` → `syncApplicationHiringTeam` / `identifiedRoles`)

| Trigger | Code | Classification today |
|---------|------|----------------------|
| Persona AI not configured | `identifyRolesWithModel` `ai.ts` **44–49** — returns fail message; guardrails still produce roles | Configuration |
| Provider / parse error | Caught in identify path; model note / corrections | Temporary if timeout-like; else permanent identify degrade |
| Role-cap / guardrail drops | Server-side; kept out of seeker `modelNote` (tests assert) | Not a seeker failure |

Identify job: thrown errors → `failApplicationJob` (`process.ts` **286–298**). Soft identify failures often still complete the job with partial role set (exact branch depends on `identifiedRoles` error handling — if undetermined for a specific message, say so at implement time by reading that catch).

### 2.2 Synthesize / rebuild (`HIRING_TEAM_BUILD` → `rebuildApplicationHiringTeamRole`)

| Trigger | Code | Classification today |
|---------|------|----------------------|
| No job requirement | `build.ts` **716–719** throws `TenantError` | Permanent for that campaign state |
| `!isPersonaAiConfigured()` | `synthesizeHiringTeamRole` **229–235** / `draftRoleWithModel` **118–119** → `PARTIAL` + `SYNTHESIS_UNAVAILABLE` | **Configuration** |
| Provider throws | `draftRoleWithModel` **190–203** — **caught**, returns `{ ok: false, message: SYNTHESIS_FAILED + … }` — **does not throw** | Intended temporary often, but **job still completes** (`process.ts` **269**) and persona written FAILED/PARTIAL — **no worker retry** |
| Loop exhausts 2 attempts with empty rejection | `synthesizeHiringTeamRole` **238–270** — always `rejection: []` (**241**); never calls `assessHiringTeamDraft` | Soft FAIL; comment at **211** is stale |
| Missing draft array entry | `build.ts` **787–790** throws | Temporary/permanent depending on cause |
| Successful draft | status `NEEDS_REVIEW`, narrative saved | Success |

**Quality check today:** `assessHiringTeamDraft` (`draft-quality.ts` **155–227**) is **never called** from `ai.ts` / `build.ts` (only tests). Live quality gate = absent.

**Seeker-added roles:** same synthesize path via fallback `IdentifiedHiringRole` (**742–756**). Same failure modes.

### 2.3 Save outcomes that look like “failure” to seekers

| Outcome | What is stored | Badge (`hiringTeamStatusLabel` **1057–1068**) |
|---------|----------------|-----------------------------------------------|
| `PARTIAL` (incl. unconfigured) | `narrative: null`, `modelNote: message` | **Ready** (maps PARTIAL → `status.built`) |
| `FAILED` | same | **Failed** |
| Edit without generate | `NEEDS_REVIEW`, no narrative | **Ready**, and step counts as built |

---

## 3. Quality check — wire `assessHiringTeamDraft`

### 3.1 What it rejects today (`draft-quality.ts` **155–227**)

| Reason pattern | Example |
|----------------|---------|
| Missing text | `"Overview is missing."`, `"Impact is missing."`, `"Interview stage is missing."` (Direct only) |
| List minimums | Pressures ≥1, Needs ≥2, Concerns ≥1, Talking points ≥1, How to communicate ≥1 |
| Restates job | `"{label} restates the job requirement…"`, Needs-as-list restatement |
| Talking point from persona’s job | `talkingPointWrittenFromPersonaJob` |
| Internal system state | `mentionsInternalSystemState` on any narrative field |

### 3.2 Classification rule (deterministic — no guessing)

**All `assessHiringTeamDraft` failures are treated as fixable on the first paid draft.**  
Evidence for that: every reason is about format, structure, or content shape the model can revise when told; the function does not emit an “insufficient evidence” code.

**After exactly one automatic regeneration that still fails `assessHiringTeamDraft` for any reason → classify as not enough real information** (available inputs could not support a valid non-fabricated draft). Do not save a built persona.

Optional strengtheners (still deterministic, not model-guessing): if excerpts/notes/why are all empty and first assess fails only on “missing” fields, implementation may short-circuit to not-enough-info **without** a second paid call — only if product owner approves that shortcut; default plan is always one regenerate then not-enough-info.

### 3.3 Single automatic regeneration + Phase 1

1. `draftRoleWithModel` with `rejection: []` → fingerprint F0 (`paid-inputs.ts` **69**).
2. Parse → `fieldsFromPersonaDraft` → `assessHiringTeamDraft({ fields, jobLines, involvement, roleName, likelyTitles })`.
3. If `ok`: save narrative (current success path).
4. If not `ok`: call `draftRoleWithModel` once with `rejection: reasons` → fingerprint F1 ≠ F0 → **new paid call** (Phase 1 allows; receipts keyed by `HIRING_TEAM_SYNTHESIZE` + `personaId`).
5. Assess again.
6. If ok: save. If not: **not enough real information** path (section 4). Do **not** a third paid call.

`isResultUsable` remains “draft is object”; quality is applied after gate return so a skipped receipt of a prior good draft still runs assess (if assess fails on reused draft, regenerate with rejection — new fingerprint).

If regenerate provider throws temporary error: section 5 (throw out to job retry); do not treat as not-enough-info.

---

## 4. Not enough real information

### 4.1 Record against input fingerprint (no schema change)

Use existing `PaidCallReceipt` (`paid-call-gate.ts`, unique `(organizationId, operation, subjectKey)`).

After classifying not-enough-info for base inputs (fingerprint **F0** with `rejection: []`):

- Upsert receipt: `operation: "HIRING_TEAM_SYNTHESIZE"`, `subjectKey: personaId`, `inputHash: F0`, `resultJson: { __hiringTeamSynthesizeOutcome: "INSUFFICIENT_INFORMATION", reasons: string[] }` (exact key name chosen at implement time; single constant).

On later synthesize with same F0:

- Before `callProvider`, if receipt hash matches and outcome sentinel present → **skip paid call**, return not-built / awaiting-input (extend `runPaidStructuredCall` or check in `synthesizeHiringTeamRole` via `findPaidCallReceipt`).

Also extend the DB-only pre-queue check used by Generate (`hiringTeamSynthesizeUnchanged` **827–885**) so unbuilt + matching insufficient receipt returns a skip without queueing a job (today it only skips when `isHiringTeamPersonaBuilt` is true — **844–846**). Message must not expose system language; PO will supply seeker wording — until then use a neutral existing queue/skip pattern without pasting `SYNTHESIS_*` strings.

### 4.2 Leave role unbuilt

- `profileJson.narrative: null` (do not keep a rejected draft as narrative).
- `setupStatus: "NOT_STARTED"` (or keep NOT_STARTED; do not use NEEDS_REVIEW/APPROVED).
- Store internal marker on `profileJson` e.g. `awaitingSeekerInput: true` + optional internal reasons (not rendered).
- `modelNote` may store diagnostic text internally; **not rendered** (section 10).

### 4.3 Direct seeker to Edit or Add form

- No new UI sections. Role remains on the card; Edit already exists; Add form moves to top (section 9).
- Status label maps to new “needs seeker’s input” state (section 7) — **wording from PO later**.
- Actions available: Edit, Generate (no-op paid if fingerprint unchanged), Remove, etc.

### 4.4 Build after details added

Edit or richer notes/why/titles → F0 changes → insufficient receipt no longer matches → Generate queues `HIRING_TEAM_BUILD` → paid synthesize runs.

---

## 5. Temporary failures under serialization

### 5.1 Current behavior (cited)

| Mechanism | Code | Fact |
|-----------|------|------|
| maxAttempts | `hiringTeamConfig.maxBuildAttempts` = **3** (`hiring-team.ts` **8**); `enqueueApplicationJob` sets job.maxAttempts | |
| Auto-retry | `failApplicationJob` `service.ts` **483–535**: only if `isTimeoutMessage(message)` (`types.ts` **58–59**: `/timed out\|timeout/i`) and `attempt < maxAttempts` → requeue PENDING | |
| Backoff | **None** | Immediate requeue |
| Heartbeat | Claim + process update; stale **15 min** (`HEARTBEAT_STALE_MS` `service.ts` **12**) | |
| Serialization | `HIRING_TEAM_BUILD` / `IDENTIFY` in `SERIALIZED_APPLICATION_JOB_TYPES` (`service.ts` **15–20**); one PENDING successor; claim skips same-key while IN_PROGRESS | |
| Synthesis errors | Caught in `draftRoleWithModel` **190–203** → persona FAILED/PARTIAL → **`completeApplicationJob`** | **No retry** |

Phase 1: if a paid call completed and wrote a receipt, a retry with same fingerprint skips provider (`runPaidStructuredCall` **32–40**) — safe against double-pay on crash-after-receipt. If crash before receipt write, retry may pay again (existing Phase 1 crash window).

### 5.2 Planned change

1. Classify provider errors as temporary (timeout, rate limit, 5xx, network) vs permanent.
2. **Temporary:** rethrow from `draftRoleWithModel` / `synthesizeHiringTeamRole` so `processApplicationJob` catch → `failApplicationJob` retries (expand `isTimeoutMessage` or shared `isRetryableProviderMessage` to include rate-limit phrases used by the provider wrapper — cite actual provider error strings at implement time from `getPersonaAiProvider()` error paths).
3. Do **not** write FAILED/PARTIAL persona on temporary errors; leave `SYNTHESIZING` or revert to prior setupStatus so badge is not “Failed” while retry pending.
4. Permanent provider failure after maxAttempts: unbuilt + internal diagnostic; no system language on card; not a fabricated persona.
5. Temporary retry + same fingerprint after successful receipt → Phase 1 skip → no double-pay.

---

## 6. Configuration (`SYNTHESIS_UNAVAILABLE`)

**Detection today**

- `isPersonaAiConfigured()` — `config.ts` **418–425** (fail closed via `getPersonaAiConfig()`).
- Catalog: `listAiRoleStatuses()` — `roles.ts` **206–231**, role `"persona"` requiredEnv `PERSONA_AI_*` (**99–108**).
- Used on scoring pages for unconfigured roles; **not** gated on hiring-team Generate before queue.

**Planned**

1. **Ops / before seeker impact:** Use existing `listAiRoleStatuses()` (persona role) in whatever ops/admin or deploy health path already consumes AI role status; if none exists for persona-only, report gap — do not invent a new seeker UI. At minimum, fail closed in worker **before** paid call (already true) and **before enqueue** in `queueHiringTeamBuild` / build actions when `!isPersonaAiConfigured()` so jobs are not created that only write PARTIAL + system `modelNote`.
2. Seeker never sees `SYNTHESIS_UNAVAILABLE` string (`ai.ts` **32–33**) — remove from rendered surfaces with modelNote; map to non-system status if needed (PO wording).
3. Do not save a “Ready” PARTIAL persona for missing config (today PARTIAL → Ready badge **1067**).

---

## 7. Status labels (system strings today — PO will replace wording)

Config: `hiringTeamConfig.status` — `hiring-team.ts` **15–22**.

| Label string today | Set when | Seeker can do | Notes |
|--------------------|----------|---------------|-------|
| Identified | Default / identify unbuilt (`NOT_STARTED`, etc.) — **1068** | Edit, Generate, Move, Add person, Remove | |
| Starting… | `jobStatusLabel` PENDING — `service.ts` **50**; **not** used by role-card `hiringTeamStatusLabel` | Wait | Progress via `WorkspaceProgress` `progressText` |
| Generating | `setupStatus === "SYNTHESIZING"` after `queueHiringTeamBuild` **542**; also job IN_PROGRESS label | Wait | |
| Ready | `NEEDS_REVIEW` or **`PARTIAL`** — **1066–1067** | Approve, Regenerate, Edit, … | PARTIAL incorrectly looks Ready |
| Failed | `setupStatus === "FAILED"` — **1064** | Retry → `rebuildApplicationRoleAction` | |
| Stale | `staleAt` set — **1062**; from `staleAtPatchForBuiltRole` **266–303** when receipt hash ≠ fingerprint | Regenerate | |
| Approved | `approvalStatus === "APPROVED"` — **1063**; set by `approveApplicationHiringTeamRole` **688–701** (`setupStatus`+`approvalStatus` APPROVED, `approvedAt`) | Means seeker accepted the draft | |

**Workspace job failure UI:** `WorkspaceProgress` (`ApplicationWorkspaceLive.tsx` **155–163**) shows `JobErrorDetail` with `failed.error` — can expose system/provider text for `HIRING_TEAM_*` jobs. Plan: stop surfacing raw job errors for these types (hide or map to non-system state); PO wording later.

**New state (item 4):** “needs the seeker’s input” — when `profileJson.awaitingSeekerInput` (or equivalent) after not-enough-info. Insert in `hiringTeamStatusLabel` precedence (suggest after Failed/Stale checks, before Identified). **Do not propose wording** — add a config key placeholder for PO copy.

Remove seeker-visible use of current system strings once PO supplies replacements (implementation swaps `hiringTeamConfig.status.*` values only).

---

## 8. Step color (Personas and Interviewers)

**Rule today:** Direct roles only — `tracker.ts` **155–161**. Done when `hiringTeamAllBuilt` — `step-progress.ts` **111–115**: `roleCount > 0 && builtCount === roleCount`. Built = `isHiringTeamPersonaBuilt`.

**Waiting on seeker input:** `awaitingSeekerInput` / unbuilt → `isHiringTeamPersonaBuilt` false → step not green (correct once edit bug fixed).

**Edit with no narrative (bug):** `updateApplicationHiringTeamRole` sets `NEEDS_REVIEW` → `isHiringTeamPersonaBuilt` true → step can go green with empty narrative.

**Fix:** Change `isHiringTeamPersonaBuilt` to require a real `profileJson.narrative` object (and optionally APPROVED only if narrative exists). Stop treating bare `NEEDS_REVIEW`/`APPROVED` as built without narrative. Align `updateApplicationHiringTeamRole` to **not** set `NEEDS_REVIEW` unless a narrative already exists (keep `NOT_STARTED` or prior status; always set `manuallyEditedFields`).

---

## 9. Form move

**File:** `src/components/ApplicationWorkspace.tsx` inside `HiringTeamSection` return (**1352+**).

**Change:** Move the `ApplicationActionForm` block currently at **1403–1426** to sit **above** the Direct/Indirect `HiringTeamDisclosureGroup` block (**1370–1392**), after progress widgets / assumption intro (~**1359–1369**).

**Relabel:** `submitLabel={`Add ${vocab.persona.singular}`}` → `submitLabel="Add Interviewer Title / Persona"` (exact PO string).

**Unchanged:** fields, `required` on name, action `addApplicationRoleAction`, `testId="add-hiring-team-role"`, validation in `addApplicationHiringTeamRole`.

---

## 10. `modelNote`

**Remove seeker render:** `ApplicationWorkspace.tsx` **1310–1311**:

```tsx
{narrative?.modelNote ? (
  <p className="text-sm text-warning">{narrative.modelNote}</p>
) : null}
```

Keep extraction in `readNarrative` (**1004**) optional (unused) or leave for internal tooling — must not render.

**Writers (keep):** `build.ts` identify notes **185–191** / **436**; rebuild `modelNote: draft.message` **818**.

**Other seeker-facing reads:** Grep shows **only** this ApplicationWorkspace render. No other production UI reads `modelNote`.

---

## 11. Files / functions affected; schema

| File / function | Becomes |
|-----------------|--------|
| `draft-quality.ts` `assessHiringTeamDraft` | Called from live synthesize |
| `ai.ts` `synthesizeHiringTeamRole` / `draftRoleWithModel` | Assess → one rejection regenerate; temporary errors rethrow; insufficient outcome; stop always-`rejection: []` |
| `paid-call-gate.ts` / synthesize entry | Recognize insufficient sentinel; skip paid call |
| `paid-inputs.ts` | Unchanged shape (`rejection` already in fingerprint) |
| `build.ts` `isHiringTeamPersonaBuilt` | Narrative required |
| `build.ts` `updateApplicationHiringTeamRole` | Do not mark built without narrative |
| `build.ts` `hiringTeamSynthesizeUnchanged` (+ sibling helper) | Skip queue on insufficient receipt |
| `build.ts` `queueHiringTeamBuild` / drafts save path | Config precheck; awaiting-input marker; no fabricated save |
| `build.ts` `personaFields` / profilePayload | Clear awaiting marker on success |
| `actions/hiring-team.ts` build/rebuild | Surface skip without system strings |
| `application-jobs/types.ts` `isTimeoutMessage` (or sibling) | Broader retryable detection |
| `application-jobs/process.ts` / `failApplicationJob` | Temporary synthesize failures retry |
| `ApplicationWorkspace.tsx` | Form move/label; remove modelNote UI; status mapping for awaiting-input; hide system labels/errors per PO |
| `hiring-team.ts` (product-config) | Status keys for awaiting-input; submit label constant if desired |
| `ApplicationWorkspaceLive.tsx` `WorkspaceProgress` | Do not show raw HIRING_TEAM job errors to seeker |
| Tests (implementation phase) | See TESTS below |

**Schema changes: none required.**  
`PaidCallReceipt.resultJson` already stores arbitrary JSON for sentinels. `profileJson` already stores narrative/modelNote; add `awaitingSeekerInput` there. `PersonaSetupStatus` already has NOT_STARTED/SYNTHESIZING/NEEDS_REVIEW/PARTIAL/FAILED. Avoid new enum values → no migration, no data rewrite. Safe because existing rows without the marker behave as today once `isHiringTeamPersonaBuilt` requires narrative (edit bug fix may turn falsely-green steps red until Generate — correct per PO).

---

## TESTS (list only — do not write or run in plan phase)

1. **modelNote never rendered** — ApplicationWorkspace source/UI assert no `narrative?.modelNote` warning paragraph; internal profileJson may still contain modelNote.
2. **Fixable quality rejection regenerates once** — first assess fails → second `draftRoleWithModel` called with rejection reasons; fingerprint includes rejection; at most two provider calls.
3. **Not enough real information** — after regenerate still failing assess: `narrative` null, not built, awaiting-input marker set; `PaidCallReceipt` for F0 has insufficient sentinel; second Generate/rebuild with same inputs → `skipped` / no `callProvider`.
4. **Edit then builds** — update role fields → fingerprint changes → synthesize pays and can save narrative when assess passes.
5. **Add form then builds** — add role → Generate → synthesize uses seeker fields; success path saves narrative.
6. **Temporary failure retries without double-pay** — provider timeout thrown → job requeued; if receipt already written, retry skips provider; persona not left FAILED from the temporary error.
7. **Missing configuration detected before seeker build** — `!isPersonaAiConfigured()` → no `HIRING_TEAM_BUILD` enqueue (or equivalent precheck); seeker UI does not show `SYNTHESIS_UNAVAILABLE` text.
8. **Edited role without narrative never counts as built** — after `updateApplicationHiringTeamRole`, `isHiringTeamPersonaBuilt` false; `hiringTeamAllBuilt` false if that Direct role is the only one.
9. **No system status label shown** — role card does not render raw Failed/Ready/etc. system strings once PO copy wired; until copy exists, test that known system error strings (`SYNTHESIS_UNAVAILABLE`, provider stacks) are absent from rendered role card / WorkspaceProgress for hiring-team.
10. **Form at top** — “Add Interviewer Title / Persona” appears above Direct section; same fields/action/testId; behavior of `addApplicationHiringTeamRole` unchanged.
11. **Phase 1 unchanged success skip** — built persona + matching receipt → `No Changes To {role name} Persona`; staleAt compare still marks stale when fingerprint drifts.

---

## Risks / unknowns

1. **Provider error string taxonomy** for rate limits vs permanent failures is not fully enumerated here — must be read from the persona AI provider wrapper at implement time before expanding retry matching.
2. **Identify-path soft failures** vs thrown failures: exact messages that complete the job with empty/partial roles need a careful pass through `identifiedRoles` error branches when implementing.
3. **Generate all Direct** (`queueHiringTeamBuildDirect`) does not call `hiringTeamSynthesizeUnchanged` today — insufficient-info skip must be applied there too or it will enqueue no-op jobs.
4. **Falsely built NEEDS_REVIEW rows** already in DB will show unbuilt after `isHiringTeamPersonaBuilt` fix (no data migration; correct product behavior).
5. **PO status wording** not yet supplied — implementation should use config keys only; avoid inventing seeker copy.
6. **Shortcut** of skipping the paid regenerate when evidence is empty is optional and needs explicit PO approval (section 3.2).
7. **`WorkspaceProgress` / `JobErrorDetail`** currently can show system errors for hiring-team jobs — in scope to suppress for this goal; confirm no other seeker surface dumps `ApplicationJob.error` for these types.
