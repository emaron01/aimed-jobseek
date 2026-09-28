# PLAN — Personas and Interviewers build reliability v2

**Repo confirmed:** `C:\Repos\aimed-jobseek` · remote `https://github.com/emaron01/aimed-jobseek.git`  
**Mode:** PLAN ONLY — no code, schema, config, prompt, test, or data changes in this turn.  
**Replaces:** earlier persona-failure plans (including v1 in `harper-persona-build-reliability-plan.md`) that predate or omit the “build only on seeker action / one waiting-for-details state” decisions.

---

## PRODUCT OWNER DECISIONS (binding)

- Roles are **identified** automatically as staged suggestions; a **full persona is built only on a seeker action**. Any build that cannot complete (not enough real information, or temporary failures after all automatic retries) leaves the role unbuilt in **ONE** state: waiting for the seeker to add details. Same rule for Harper-identified and seeker-added roles.
- `profileJson.modelNote` is internal only; keep stored; never render to seeker.
- Wire `assessHiringTeamDraft` into live synthesis.
- Fixable quality rejection → regenerate once with rejection reasons (new Phase 1 fingerprint).
- Never fabricate. Incomplete build → no built persona. Seeker uses Edit or Add form; then build runs.
- Incomplete outcome recorded against input fingerprint → unchanged Generate makes no paid call.
- Temporary failures retry in the worker **before** waiting-for-details.
- Missing config (`SYNTHESIS_UNAVAILABLE`) is operational; detect before seekers hit it; no system language to seeker.
- Edit without narrative must never count as built.
- Move Add form above Direct; relabel “Add Interviewer Title / Persona”; fields/behavior unchanged.
- Seekers never see system status labels; PO supplies wording — do not invent copy.
- No new UI sections or seeker inputs beyond the form move.

---

## 1. Build triggers

Every production call site that enqueues or runs a **general persona build** (`HIRING_TEAM_BUILD` / `queueHiringTeamBuild` / `rebuildApplicationHiringTeamRole` as the job body):

| Trigger | Entry | Seeker action? |
|---------|--------|----------------|
| Generate on role card | `buildApplicationRoleAction` (`hiring-team.ts` **278–305**) → `queueHiringTeamBuild` (`build.ts` **532–559**) | **Yes** — form submit on Personas page |
| Regenerate / Retry on role card | `rebuildApplicationRoleAction` (**209–236**) → same queue (UI chooses rebuild when `FAILED` or `staleAt` — `ApplicationWorkspace.tsx` **1231–1248**) | **Yes** |
| Generate all Direct roles | `buildAllDirectRolesAction` (**307–324**) → `queueHiringTeamBuildDirect` (**561–586**) → per-role `queueHiringTeamBuild` | **Yes** |
| Cheat sheet “build persona” | `buildCheatSheetPersonaAction` (`application-summary.ts` **25–46**) → `queueHiringTeamBuild`; UI `CheatSheetPersonBody.tsx` **60** | **Yes** — seeker action on cheat sheet |
| Outreach when persona not built | `buildOutreachPersonaThenGenerateAction` (`application-outreach.ts` **280–357**) → `queueHiringTeamBuild` with `deferredOutreach`; UI `ApplicationOutreachSections.tsx` **419** | **Yes** — seeker starts outreach generate; build is intentional prerequisite, then `process.ts` **90–116** enqueues `OUTREACH` after synthesize (only if `!rebuildResult.synthesizeSkipped`) |

**Grep of `queueHiringTeamBuild(`:** only `build.ts` (definition + Direct loop), `hiring-team.ts` actions, `application-summary.ts`, `application-outreach.ts`. No other callers.

**Not a persona build (identify only):**

| Path | Notes |
|------|--------|
| `queueHiringTeamIdentify` / `HIRING_TEAM_IDENTIFY` → `syncApplicationHiringTeam` | Auto after research/identity (`research-finish.ts` ~330–334, application service). Creates/updates **staged** roles (`NOT_STARTED`, clears unbuilt narrative). **Does not** call `synthesizeHiringTeamRole` / does not enqueue `HIRING_TEAM_BUILD`. Matches PO: identify as suggestions only. |

**Builds that start without a seeker action:** **None found** in current code. Every `HIRING_TEAM_BUILD` enqueue is behind a server action invoked from seeker UI. (Worker *reclaims* stale IN_PROGRESS jobs via claim/abandon — that continues an already seeker-started job, not a new unsolicited build.)

**Plan constraint for implementation:** keep it that way — do not add auto-build after identify; ensure Direct “Generate all” and deferred outreach/cheat-sheet paths remain seeker-initiated.

---

## 2. Existing seeker paths (Add form + Edit)

### 2.1 Add Hiring Team role form

| Item | Location |
|------|----------|
| UI | Inline in `HiringTeamSection` — `ApplicationWorkspace.tsx` **1403–1426**, `testId="add-hiring-team-role"` |
| Placement today | **Below** Direct/Indirect and “Generate all Direct” (**1370–1402**) |
| Action | `addApplicationRoleAction` — `hiring-team.ts` **103–128** |
| Lib | `addApplicationHiringTeamRole` — `build.ts` **588–636** |
| Job | **None** |

Creates `NOT_STARTED` / `narrative: null` / `manuallyEditedFields: ["seeker"]` / `roleKey: custom_${Date.now()}`.

**Seeker enters:** Name (required), Likely titles, Department, Why this role matters, Notes.

**To fingerprint/build:** Add does not build. Generate → `buildApplicationRoleAction` → `hiringTeamSynthesizeUnchanged` (**827–885**) → `queueHiringTeamBuild` → job → `rebuildApplicationHiringTeamRole` → `hiringTeamSynthesizeFingerprint` (`paid-inputs.ts` **41–72**: role fields, notes, `rejection`, excerpts, peers).

### 2.2 Role card Edit

| Item | Location |
|------|----------|
| Toggle | `HiringTeamRoleActions.tsx` |
| Action | `updateApplicationRoleAction` (**130–157**) |
| Lib | `updateApplicationHiringTeamRole` (**638–664**) |
| Job | **None** |

**Bug:** Save sets `setupStatus` + `approvalStatus` to `NEEDS_REVIEW` (**660–661**) without narrative → `isHiringTeamPersonaBuilt` (**336–345**) returns true.

**After edit:** Generate uses updated fields in fingerprint; rebuild preserves seeker fields when `manuallyEditedFields` set (**793–810**).

### 2.3 Seeker-added vs identified

| | Identified | Seeker-added |
|--|------------|--------------|
| Source | `HIRING_TEAM_IDENTIFY` / `identifiedRoles` | Add form |
| `roleKey` | Model/guardrail key | `custom_*` |
| Evidence | Identification evidence on profile | Synthetic from why/name |
| Rebuild match | Match identify list or fallback (**740–756**) | Usually fallback |
| Incomplete build | Same waiting-for-details state (PO) | Same |

---

## 3. Failure paths today (identify → synthesize → quality → save)

### 3.1 Identify (not full build)

| Trigger | Code | Class |
|---------|------|-------|
| Persona AI off | `identifyRolesWithModel` `ai.ts` **44–49** | Configuration (identify degrades; roles still from guardrails) |
| Provider/parse errors | Identify path soft/hard fail | Temporary if timeout-like when thrown to job; else degrade |

### 3.2 Synthesize / rebuild (`HIRING_TEAM_BUILD`)

| Trigger | Code | Class today |
|---------|------|-------------|
| No job requirement | `build.ts` **716–719** throw | Permanent for campaign state |
| AI not configured | `synthesizeHiringTeamRole` **229–235** → `PARTIAL` + `SYNTHESIS_UNAVAILABLE` | **Configuration** |
| Provider throw | `draftRoleWithModel` **190–203** **caught** → FAILED message; job **completes** | Often temporary intent, but **no worker retry** |
| Two-loop exhaust with `rejection: []` | `ai.ts` **238–270** | Soft FAIL; quality unused |
| Missing draft | **787–790** throw | Varies |
| Success | `NEEDS_REVIEW` + narrative | Success |

**Quality:** `assessHiringTeamDraft` (`draft-quality.ts` **155–227**) **never called** in live path.

**Seeker-added:** same synthesize path via fallback role.

### 3.3 Misleading “success” saves

| Outcome | Stored | Badge |
|---------|--------|-------|
| `PARTIAL` (incl. unconfigured) | no narrative, `modelNote` | **Ready** (**1067**) |
| `FAILED` | no narrative | **Failed** |
| Edit without generate | `NEEDS_REVIEW`, no narrative | **Ready** + step built |

---

## 4. Quality check

### 4.1 What `assessHiringTeamDraft` rejects (`draft-quality.ts` **155–227**)

- Missing Overview / Impact / Interview stage (Direct)
- List minimums: Pressures ≥1, Needs ≥2, Concerns ≥1, Talking points ≥1, Communication ≥1
- Restates job requirement (fields / Needs-as-list)
- Talking point written from persona’s own job
- Internal system-state language (`mentionsInternalSystemState`)

### 4.2 Tell fixable vs not-enough-info without guessing

Every assess reason is format/structure/content-shape. There is **no** “insufficient evidence” code from the assessor.

**Deterministic rule:**

1. First assess failure → **fixable** → one regenerate with `rejection: reasons` (fingerprint F1 ≠ F0 via `paid-inputs.ts` **69**).
2. Second assess failure (any reason) → **not enough real information** / build cannot complete → waiting-for-details (section 5). No third paid call.

Temporary provider errors during either attempt → section 6 (retry job); do **not** jump to waiting-for-details until retries exhausted.

### 4.3 Phase 1 interaction

- F0: `rejection: []`. F1: rejection strings in fingerprint → new paid call allowed.
- Receipts: `HIRING_TEAM_SYNTHESIZE` + `personaId` (`ai.ts` **141–145**).
- If regenerate also fails assess → section 5 sentinel on **F0** (base inputs), not F1.

---

## 5. Waiting for details (single incomplete state)

Applies to: not enough real information **and** temporary failures **after** all automatic retries — **one** unbuilt state.

### 5.1 Record against fingerprint (no schema migration)

Use `PaidCallReceipt` (`paid-call-gate.ts`).

On “build could not complete” for base fingerprint F0 (`rejection: []`):

- Upsert: `operation: "HIRING_TEAM_SYNTHESIZE"`, `subjectKey: personaId`, `inputHash: F0`, `resultJson: { __hiringTeamSynthesizeOutcome: "AWAITING_SEEKER_DETAILS", reasons?: string[] }` (constant name fixed at implement).

Before paid call / before queue:

- If receipt matches F0 and sentinel present → **no paid call**, no new job (or job no-ops without provider).
- Extend beyond today’s `hiringTeamSynthesizeUnchanged` (**844–846** only skips when already built).

### 5.2 Leave role unbuilt

- `narrative: null` (do not keep rejected draft as built narrative)
- `setupStatus: "NOT_STARTED"` (not NEEDS_REVIEW / APPROVED / Failed-as-terminal seeker drama)
- `profileJson.awaitingSeekerInput: true` (internal; drives single status)
- `modelNote` may hold diagnostics; **not rendered**

### 5.3 Direct seeker

- No new UI. Card stays; Edit + Add form (moved to top). Status = waiting-for-details (PO wording later).
- Same for Harper-identified and seeker-added roles.

### 5.4 After details added

Edit/Add fields change F0 → sentinel no longer matches → Generate (or cheat sheet / outreach build actions) pays and builds.

---

## 6. Temporary failures

### 6.1 Current (`service.ts` / `types.ts` / `ai.ts`)

| | Fact |
|--|------|
| maxAttempts | `hiringTeamConfig.maxBuildAttempts` = **3** (`hiring-team.ts` **8**) |
| Auto-retry | `failApplicationJob` **483–535** only if `isTimeoutMessage` (`/timed out\|timeout/i` **types.ts** **58–59**) |
| Backoff | **None** |
| Heartbeat | 15 min stale; claim reclaim |
| Serialization | `HIRING_TEAM_BUILD` in `SERIALIZED_APPLICATION_JOB_TYPES` (`service.ts` **15–20**) |
| Synthesis errors | Caught in `draftRoleWithModel` → persona PARTIAL/FAILED → **`completeApplicationJob`** — **no retry** |

Phase 1: matching receipt after pay → retry skips provider (no double-pay). Crash before receipt may pay again (existing window).

### 6.2 Planned change

1. Classify retryable provider errors; **rethrow** so `failApplicationJob` retries.
2. Expand retryable matcher to rate-limit / network phrases actually emitted by persona provider (cite at implement time).
3. Do **not** write waiting-for-details or FAILED seeker state until attempts exhausted.
4. While retrying: keep `SYNTHESIZING` / job PENDING (Generating / Starting… progress only).
5. After maxAttempts exhausted without success → **same** waiting-for-details + fingerprint record as section 5 (not a separate Failed seeker state).
6. Successful receipt + retry → Phase 1 skip → no double-pay.

---

## 7. Configuration

- `isPersonaAiConfigured()` — `config.ts` **418–425**
- `listAiRoleStatuses()` persona role — `roles.ts` **99–108**, **206–231** (`PERSONA_AI_*`)

**Plan:** Precheck before `queueHiringTeamBuild` / build actions when unconfigured — do not enqueue jobs that only write PARTIAL + system `modelNote`. Ops can use `listAiRoleStatuses` where already consumed. Never show `SYNTHESIS_UNAVAILABLE` (`ai.ts` **32–33**) to seeker. Do not map PARTIAL-unconfigured to Ready.

---

## 8. Status labels

Config strings today: `hiringTeamConfig.status` (`hiring-team.ts` **15–22**).

| Label today | Set by | Seeker can do |
|-------------|--------|---------------|
| Identified | Unbuilt default (`hiringTeamStatusLabel` **1068**) | Edit, Generate, Move, Add person, Remove |
| Starting… | Job PENDING via `jobStatusLabel` (`service.ts` **50**) — **not** role-card badge | Wait (`WorkspaceProgress`) |
| Generating | `SYNTHESIZING` after queue (**542**); job IN_PROGRESS | Wait |
| Ready | `NEEDS_REVIEW` or **`PARTIAL`** (**1066–1067**) | Approve, Regenerate, Edit… |
| Failed | `setupStatus === "FAILED"` (**1064**) | Retry |
| Stale | `staleAt` (**1062**); `staleAtPatchForBuiltRole` **266–303** | Regenerate |
| Approved | See below | — |

**Single new state:** waiting-for-details (`awaitingSeekerInput`) — replaces seeker-visible Failed/PARTIAL-as-Ready for incomplete builds. PO wording later. Precedence: after Stale/Approved checks as appropriate; before bare Identified.

**Hide:** raw `WorkspaceProgress` / `JobErrorDetail` system errors for `HIRING_TEAM_*` (`ApplicationWorkspaceLive.tsx` **155–163**).

### What “Approved” means (Aimed JobSeek application hiring team)

- **Set by:** seeker clicking **Approve** on the role card → `approveApplicationRoleAction` (`hiring-team.ts` **189–206**) → `approveApplicationHiringTeamRole` (`build.ts` **688–701**): sets `approvalStatus: "APPROVED"`, `setupStatus: "APPROVED"`, `approvedAt`.
- **UI:** button at `ApplicationWorkspace.tsx` **1319–1326**; badge precedence **1063**.
- **Used in product flows (not a dead leftover):**
  - `isHiringTeamPersonaBuilt` treats APPROVED as built (**340–344**) — same bug class if narrative missing.
  - `merge-existing.ts` `personaBuilt` (**13–23**) prefers APPROVED/NEEDS_REVIEW when merging duplicates.
  - `generation/context.ts` **347–352** includes full `profileJson` in generation sources when setupStatus is NEEDS_REVIEW or APPROVED (or narrative exists).
- **Distinct from** product-level persona setup approve (`persona-research/approve.ts`, `PersonaForm.tsx`) under `productLevelHiringTeam` gate — different surface.
- **Conclusion:** Application hiring-team Approved is an **active seeker acceptance** of a built draft, not an unused leftover. Plan keeps the Approve action; after reliability work it should only apply when a real narrative exists (align with built definition). Do not remove without PO decision.

---

## 9. Step color

- Direct-only counts: `tracker.ts` **155–161**.
- Green: `hiringTeamAllBuilt` — `step-progress.ts` **111–115**.
- Waiting-for-details / unbuilt → not built → step not green (correct once edit bug fixed).
- **Fix edit bug:** `isHiringTeamPersonaBuilt` requires `profileJson.narrative` object; `updateApplicationHiringTeamRole` must not set NEEDS_REVIEW/APPROVED without narrative. Align `merge-existing` `personaBuilt` and `generation/context.ts` built check the same way.

---

## 10. Form move

**File:** `ApplicationWorkspace.tsx` `HiringTeamSection`.

Move form **1403–1426** to above Direct group (**1370+**), after intro/progress (~**1359–1369**).

`submitLabel="Add Interviewer Title / Persona"`. Fields, validation, `addApplicationRoleAction`, `testId="add-hiring-team-role"` unchanged.

---

## 11. modelNote

Remove seeker render **1310–1311** in `ApplicationWorkspace.tsx`. Keep writers (`build.ts` identify/rebuild). Grep: **only** that seeker-facing read.

---

## 12. Files / functions; schema

| Area | Becomes |
|------|---------|
| `ai.ts` synthesize/draft | Assess + one rejection regenerate; rethrow retryable; awaiting-details outcome |
| `draft-quality.ts` | Called from live path |
| `paid-call-gate` / synthesize | Sentinel skip for F0 |
| `build.ts` built checks, update, queue, unchanged-skip, Direct queue | Narrative-required built; awaiting marker; config precheck; incomplete → one state |
| `merge-existing.ts` `personaBuilt` | Match narrative-required built |
| `generation/context.ts` built check | Match narrative-required built |
| `hiring-team.ts` actions + outreach/summary queue callers | Skip/precheck without system strings; remain seeker-only triggers |
| Job retry helpers | Temporary before awaiting-details |
| `ApplicationWorkspace(+Live)` | Form move; no modelNote UI; status mapping; hide system job errors |
| `hiring-team` product-config | Status key for awaiting-details (PO copy later) |

**Schema: none.** Use `PaidCallReceipt.resultJson` + `profileJson.awaitingSeekerInput`. Existing `PersonaSetupStatus` values suffice. Safe: no data migration; falsely NEEDS_REVIEW-without-narrative rows correctly stop counting as built.

---

## TESTS (list only — do not write or run now)

1. **modelNote** never rendered on role card.
2. **Fixable assess** → exactly one regenerate with rejection in fingerprint; ≤2 provider calls on success path.
3. **Cannot complete** → no narrative saved; awaiting-details marker; F0 receipt sentinel; unchanged Generate → no paid call.
4. **Edit then build** → fingerprint changes → paid synthesize can succeed.
5. **Add form then build** → seeker-added role synthesizes from entered fields.
6. **Temporary** → retry via job; succeed without double-pay when receipt exists; awaiting-details only after retries exhausted.
7. **Missing config** → no enqueue / no seeker system string.
8. **Edit without narrative** → `isHiringTeamPersonaBuilt` false; step not green for that Direct-only case.
9. **No build without seeker action** — source/assert: every `queueHiringTeamBuild` caller is a server action from seeker UI; identify does not enqueue BUILD; no new auto-build after identify.
10. **No system status/error strings** on role card / hiring-team WorkspaceProgress (incl. `SYNTHESIS_UNAVAILABLE`).
11. **Form** above Direct, label “Add Interviewer Title / Persona”, same fields/behavior.
12. **Phase 1** built + matching receipt → `No Changes To {role name} Persona`; staleAt still when fingerprint drifts.
13. **Approve** still sets APPROVED only when narrative exists (or button only when built — implement consistently).

---

## Risks / unknowns

1. Exact provider rate-limit / network error strings for retry matching — read wrapper at implement time.
2. Identify soft-fail message branches — confirm none enqueue BUILD (already none by grep).
3. `queueHiringTeamBuildDirect` must honor awaiting-details / insufficient skip (today no `hiringTeamSynthesizeUnchanged`).
4. Existing false-built NEEDS_REVIEW rows will un-green until Generate — intended.
5. PO status wording not supplied — config keys only.
6. Approve button visibility when waiting-for-details — should not approve empty roles; confirm with PO if Approve stays only when narrative present.
7. Deferred outreach after failed build: today job completes and may still try cheat-sheet enqueue when `!synthesizeSkipped`; incomplete builds must set synthesizeSkipped / skip deferred outreach and cheat-sheet side effects when no narrative saved (`process.ts` **80–116**).
