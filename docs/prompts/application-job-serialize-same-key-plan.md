# PLAN ONLY — Serialize same-key ApplicationJobs

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before doing anything. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
All findings must be based on the actual code as it exists now. Cite file paths, function names, and line numbers for every claim. No guesses; if something cannot be determined from the code, say so explicitly. The plan must fix the root cause in the shared job system, not per job type; no data repair, no migration of existing data.

SURGICAL RULE
PLAN ONLY. Do not change any code, configuration, schema, prompts, tests, or data. Write the plan and stop. Coding starts only after the product owner approves it.

CONTEXT
Phase 1 created the partial unique index ApplicationJob_active_org_campaign_type_target_uidx covering PENDING and IN_PROGRESS. When a new request arrives while a same-key job is IN_PROGRESS, enqueue returns the running job, which may have already read its inputs, so the new input may never be processed (for example, a second Harper answer submitted while the first answer's CONSULTATION job runs).

PRODUCT OWNER DECISION: SERIALIZE SAME-KEY JOBS
- Key = organizationId, campaignId, type, targetId (as today).
- Per key: at most ONE job IN_PROGRESS and at most ONE job PENDING, both enforced by the database.
- A request that arrives while a same-key job is IN_PROGRESS creates (or reuses) the single PENDING job for that key. It is never merged into the running job.
- A PENDING job is never claimed while a same-key job is IN_PROGRESS. It starts only after the running job finishes (completed or failed).
- When the PENDING job runs, it reads the latest inputs at that moment, so it covers every request that arrived while the previous job ran.
- A job must process only input not already processed by an earlier job; it must never repeat paid work already done.
- Jobs with different keys continue to run in parallel (concurrency 10).

PLAN FOR
1. Input reading per job type: for every job type (CONSULTATION, RESUME, COVER_LETTER, NEXT_STEP, HIRING_TEAM_IDENTIFY, HIRING_TEAM_BUILD, CONTACT_PROFILE, OUTREACH, INTERVIEW_GUIDE, APPLICATION_SUMMARY, and any other), state exactly when the job reads its inputs, and whether a later job for the same key would process only new input or repeat work already done (and pay again). Cite the code. For CONSULTATION specifically: how answers are marked processed, and whether a follow-up job would re-extract or re-polish an answer already handled.
2. Harper case: answer 1 submitted, CONSULTATION job starts, answer 2 submitted while it runs. Under this plan, trace exactly how answer 2 gets processed, and confirm answer 1 is not processed again.
3. Database enforcement: replace the current index with two partial unique indexes on the same key, one WHERE status = 'PENDING' and one WHERE status = 'IN_PROGRESS'. Give the exact migration SQL and why it is safe on the existing database (test data only). Explain how a PENDING to IN_PROGRESS claim behaves when a same-key job is already IN_PROGRESS.
4. Enqueue: how enqueueApplicationJob creates or reuses the single PENDING job per key, including when a same-key job is IN_PROGRESS, and how it handles unique violations under concurrency.
5. Claim: how the claim (FOR UPDATE SKIP LOCKED, CONSULTATION-first ordering, stale IN_PROGRESS eligibility) skips a PENDING job whose key has an IN_PROGRESS job, without blocking unrelated jobs. Also how heartbeat requeue of a stale IN_PROGRESS job interacts with an existing PENDING job for the same key (no two running, no lost input).
6. Payload: if a PENDING job's payload carries request-specific data (for example, a specific answer id or deferredOutreach), how reuse of the single PENDING job preserves every request's data so nothing is lost.
7. Paid-call guard: confirm the Phase 1 receipts and fingerprints still work under serialization (hiring identify and synthesize).
8. Render deploy: how migrations are applied on Render (cite package.json and any render.yaml or deploy script), whether this migration runs automatically on the next deploy, and the exact read-only SQL the product owner can run on the Render database beforehand to find rows that would violate the new indexes.
9. Tests: whether the Phase 1 concurrent enqueue and claim tests run against the real Postgres test database or mocks (cite the setup), and how the new tests will exercise the real indexes and locking.
10. Every file and function affected, and what each becomes.

TESTS
Do not run or write tests. List the tests the implementation would add, each with what it asserts. Include: a second Harper answer submitted while the first answer's job runs is processed exactly once, after the first job finishes; answer 1 is never processed twice; ten requests during a running job produce exactly one PENDING job; a PENDING job never starts while a same-key job is IN_PROGRESS; different-key jobs still run in parallel; request-specific payload data is never lost when the PENDING job is reused; heartbeat requeue never results in two running jobs for one key; hiring receipts still skip unchanged inputs. Tests of indexes and locking must run against the real Postgres test database.

REPORT
Deliver the plan in sections numbered 1 through 10 matching the items above, followed by the TESTS list. End with a short list of risks or unknowns. Make no code changes.

---

# Plan: Serialize same-key ApplicationJobs

**Repo confirmed:** `C:/Repos/aimed-jobseek` → `origin https://github.com/emaron01/aimed-jobseek.git`  
**Mode:** PLAN ONLY — no code, schema, test, or data changes in this step.

**Key today:** `(organizationId, campaignId, type, targetId)` with null target coalesced to `''` in the unique index (`prisma/migrations/20260927180000_paid_call_receipt_and_active_job_uidx/migration.sql` **27–29**). Soft lookup: `findActiveJob` (`src/lib/application-jobs/service.ts` **41–57**).

**Concurrency note:** Worker default is **5**, not 10 (`RESEARCH_WORKER_CONCURRENCY_DEFAULT` in `src/lib/research/config.ts` **34**, `getResearchWorkerConcurrency` **40–49**; used in `scripts/research-worker.ts` **79, 92**). Different keys already run in parallel up to that limit; this plan does not change that knob.

---

## 1. Input reading per job type

All types enter via `processApplicationJob` (`src/lib/application-jobs/process.ts` **40–314**). The job row and `payload` are read at process start (**44–55**). Domain inputs are read **inside** the called service when that case runs — not frozen at enqueue/claim except fields already on the job row/payload.

| Type | Process case | When inputs are read | Later same-key job: new-only vs re-pay |
|---|---|---|---|
| `CONSULTATION` | **150–161** → `processConsultationJob` **316–412** | Per `payload.operation`. `process_reply` → `processConsultationReply` (`consultation/service.ts` **2362+**): loads session/turns at call time (**2374–2385**), selects seeker turn (**2386–2397**). | **Incremental for answers** if incomplete turns are drained (see below). `analysisIsComplete` (**2183–2187**) treats status neither `FAILED` nor `PENDING` as done (e.g. `READY` at **1551**). A follow-up job that only runs `process_reply` with a **READY** `turnId` would re-extract/re-polish that turn (**2386–2387** finds by id with no completeness check). Today’s `process_reply` path processes **one** turn then returns (`process.ts` **371–380**). |
| `RESUME` / `COVER_LETTER` | **162–213** | `writePresentationPlan` / `acceptPresentationPlan` / `generateApplicationAsset` load campaign state when called. | **Full regenerate** — no paid-call receipt on this path. A successor PENDING after a completed generate **pays again**. |
| `NEXT_STEP` | **264–269** | `writeStoredApplicationNextStep` reads current campaign/consultation/plans/assets when run. | **Full rewrite** of stored next-step (AI). Successor job re-pays. |
| `HIRING_TEAM_IDENTIFY` | **68–73** | `syncApplicationHiringTeam` loads application/personas/evidence when run. | Identify goes through `runPaidStructuredCall` (`hiring-team/ai.ts`). Unchanged fingerprint → **no provider call**. |
| `HIRING_TEAM_BUILD` | **74–121** | `rebuildApplicationHiringTeamRole` loads role/evidence/peers when run. | Synthesize gated the same way; `synthesizeSkipped` skips cheat-sheet/OUTREACH (**82–119**). |
| `CONTACT_PROFILE` | **122–149** | `buildContactIndividualProfile` (`contact-profile/service.ts` **167+**) reads membership + LinkedIn text, then `extractInterviewerFacts` (**194–204**). | **Always re-extracts** (no gate). Successor job re-pays. |
| `OUTREACH` | **214–238** | `generateOutreachAsset` reads DB + payload when run. | **Full regenerate**. Successor re-pays. |
| `INTERVIEW_GUIDE` | **239–255** | `requestInterviewGuide` loads stage/context; may use payload answers. | **Full generate** (unless that service has its own skip — not a Phase 1 receipt). |
| `APPLICATION_SUMMARY` | **256–263** | `generateApplicationSummary` (`application-summary/service.ts` **643+**) loads summary data; section path hashes inputs (**694–707**). | **Section:** skip if `inputHash` matches and section does not need generation (**701–707**). Full/non-matching path regenerates (pays). |

### CONSULTATION — how answers are marked processed

1. `replyConsultationAction` (`src/app/actions/consultation.ts` **430–448**) calls `recordConsultationReply` **before** enqueue. New seeker turn gets `analysisJson: { status: "PENDING", ... }` (`consultation/service.ts` **2325–2328**).
2. `processAnswerGeneration` path sets analysis to `READY` on success (e.g. **1551**).
3. `analysisIsComplete` (**2183–2187**): complete when status is not `FAILED` and not `PENDING`.
4. Without `turnId`, incomplete-turn selection skips complete turns (**2388–2396**).

**Would a follow-up job re-extract answer 1?** Not if it selects by incompleteness (no `turnId` / wrong `turnId`). **Yes** if payload still carries answer 1’s `turnId` after answer 1 is already `READY`. **Gap today:** `processConsultationJob` for `process_reply` processes only one turn (**371–380**), so if answers 2…N are only in DB as `PENDING` and the reused PENDING payload’s `turnId` is the last one, earlier incomplete turns are **not** processed unless we add a drain loop (planned in §2 / §6 / §10).

**`answerConsultationAction`** (**215–220**) puts `{ operation: "answer", targetKey, answer }` in payload only — **no** `recordConsultationReply` first. Overwriting a reused PENDING payload can lose that answer unless payload merge or DB record-before-enqueue is planned (§6).

---

## 2. Harper case (answer 1 running, answer 2 submitted)

**Today (broken):** Both use `type: "CONSULTATION"`, `targetId: null` (`consultation.ts` **437–448**). Phase 1 index allows one active row total. Enqueue finds the `IN_PROGRESS` job via `findActiveJob` (**75–76** in `service.ts`) and **returns it without updating payload**. Answer 2 is already in DB (`recordConsultationReply`), but **no successor job** runs → answer 2 stays `analysisJson.status: "PENDING"`.

**Under this plan:**

1. Answer 1 recorded → enqueue creates PENDING → claim → `IN_PROGRESS` → `processConsultationReply` with `turnId` of answer 1 → extract/polish → `READY`.
2. While job 1 is `IN_PROGRESS`, answer 2 recorded → enqueue finds **no PENDING**, sees `IN_PROGRESS`, **creates** (or reuses) the single PENDING for that key with answer 2’s payload. Does **not** attach to the running job.
3. Claim skips that PENDING while same-key `IN_PROGRESS` exists (§5).
4. Job 1 completes (`completeApplicationJob` **219–228**) → status `COMPLETED` → frees the IN_PROGRESS unique slot.
5. Claim takes the PENDING → `process_reply`. With the **drain loop** (required): process payload `turnId` if incomplete, then while any incomplete SEEKER turn remains, process next (select via `!analysisIsComplete`). Answer 1 is `READY` → skipped. Answer 2 processed once → `READY`.
6. Confirmation answer 1 not processed twice: drain never selects `READY` turns; must not re-invoke generation for a `turnId` that is already complete (guard at start of each iteration).

---

## 3. Database enforcement

**Replace** `ApplicationJob_active_org_campaign_type_target_uidx` with two partial uniques:

```sql
-- Drop Phase 1 combined active unique index
DROP INDEX IF EXISTS "ApplicationJob_active_org_campaign_type_target_uidx";

-- At most one PENDING per key
CREATE UNIQUE INDEX "ApplicationJob_pending_org_campaign_type_target_uidx"
ON "ApplicationJob" ("organizationId", "campaignId", "type", (COALESCE("targetId", '')))
WHERE status = 'PENDING';

-- At most one IN_PROGRESS per key
CREATE UNIQUE INDEX "ApplicationJob_in_progress_org_campaign_type_target_uidx"
ON "ApplicationJob" ("organizationId", "campaignId", "type", (COALESCE("targetId", '')))
WHERE status = 'IN_PROGRESS';
```

**Safety on existing DB:** Code cannot prove Render row counts. Product owner states test data only. Pre-deploy read-only check (§8) must return **zero** groups with `COUNT(*) > 1` for `PENDING` and for `IN_PROGRESS` separately. If any violator exists, migration `CREATE UNIQUE INDEX` fails — stop and clean before deploy. No backfill/data repair in this plan beyond refusing to migrate over duplicates.

**PENDING → IN_PROGRESS when same-key already IN_PROGRESS:** The IN_PROGRESS unique index would reject the update. Claim SQL must therefore **never select** a PENDING row whose key already has a (non-abandoned) IN_PROGRESS row (§5). That is enforcement in both DB and claim logic.

---

## 4. Enqueue

Change `enqueueApplicationJob` (`service.ts` **59–97**) and replace the meaning of `findActiveJob`:

1. Look up **PENDING** for the key. If found → **reuse** it: merge payload (§6), return that job’s view. Do **not** return an `IN_PROGRESS` job as a substitute for new work.
2. Else **create** a new `PENDING` row (even if same-key `IN_PROGRESS` exists).
3. On unique violation (`P2002`, **14–18**, **91–96**): re-find PENDING for the key; if found, merge payload into it and return; else rethrow.

Remove “any of PENDING|IN_PROGRESS blocks create” (**75–76** today).

**`queueHiringTeamBuild`** (`hiring-team/build.ts` **544–567**) today merges `deferredOutreach` into whichever active job exists (including `IN_PROGRESS`). Change to: if PENDING exists, merge into PENDING; if only IN_PROGRESS, call `enqueueApplicationJob` so a PENDING successor is created/merged — **never** write new request data onto the running job.

**`retryApplicationJob`** (**99–125**): setting `FAILED` → `PENDING` can collide with an existing PENDING for the same key. Plan: if a PENDING already exists, refuse retry or merge payload into that PENDING and leave the FAILED row as FAILED (prefer keep FAILED + existing PENDING). Exact UX message TBD in implementation; must not violate the PENDING unique index.

---

## 5. Claim, abandon, fail/retry, heartbeat

### Claim (`claimNextApplicationJob` **145–199**)

Keep: transaction, CONSULTATION-first, `FOR UPDATE SKIP LOCKED`, stale `IN_PROGRESS` eligibility (`workerHeartbeatAt` null or `< staleBefore`, **12**, **146**), then set `IN_PROGRESS` + heartbeat (**190–197**).

Add eligibility constraints (both CONSULTATION and general queries):

- A `PENDING` row is selectable only if **no** row exists with same `(organizationId, campaignId, type, COALESCE(targetId,''))` and `status = 'IN_PROGRESS'`.
- A stale `IN_PROGRESS` row is selectable only if **no** same-key `PENDING` exists. If PENDING exists, do not reclaim the stale runner (§5 heartbeat); abandon/fail path handles it.

Unrelated keys remain claimable (`SKIP LOCKED` + other rows in the scan).

### Abandon (`abandonStaleApplicationJobs` **202–217**)

Today: all stale `IN_PROGRESS` → `PENDING`. That **violates** the new PENDING unique if a successor PENDING already exists.

Plan:

- For each stale `IN_PROGRESS`: if same-key PENDING exists → set that stale job to `FAILED` (message: heartbeat stale; successor pending) — do **not** set `PENDING`.
- Else → requeue to `PENDING` as today.

### Fail timeout retry (`failApplicationJob` **231–258**)

Timeout path sets status back to `PENDING` (**244–250**). If same-key PENDING already exists → mark this job `FAILED` instead of requeue (successor PENDING will run with latest DB inputs). Else requeue as today.

### Heartbeat requeue vs PENDING

- Stale reclaim via claim (no PENDING): continues the same row as `IN_PROGRESS` — still one IN_PROGRESS; PENDING unique unused. No two runners.
- Stale + PENDING exists: fail the stale job; PENDING waits until no IN_PROGRESS; then runs once with latest inputs. No lost successor; no two runners.

---

## 6. Payload on PENDING reuse

Payload type: `ApplicationJobPayload` (`types.ts` **14–51**).

| Field / case | Preserve strategy |
|---|---|
| `deferredOutreach` | On PENDING reuse, set/replace `deferredOutreach` from the new request (same intent as `queueHiringTeamBuild` **555–565**, but **only** on PENDING). |
| CONSULTATION `process_reply` (`turnId`, `questionTurnId`, `answer`, `targetKey`) | Overwriting keeps only the last turn in payload. **Required:** drain incomplete SEEKER turns in `processConsultationJob` for `process_reply` so DB-recorded answers are not lost. |
| CONSULTATION `answer` / `reply` (answer only in payload) | On PENDING reuse, append to a new payload list e.g. `pendingAnswers: Array<{ targetKey, answer }>` **or** record to DB before enqueue (mirror `replyConsultationAction`). Prefer append-list merge in shared enqueue helper for operation-specific fields + drain/process all entries when job runs. |
| CONSULTATION `edit_answer` | Merge into `pendingEdits: Array<{ turnId, answer }>` on reuse; processor applies each once. |
| `operation` conflicts on same key (e.g. `process_reply` vs `reassess`) | Same key `CONSULTATION`+null shares one PENDING. Plan: keep a `pendingOperations` queue (array of payload snapshots) on the PENDING row; when the job runs, execute each snapshot in order (or coalesce only when safe). **Minimum for Harper:** drain incomplete replies covers `process_reply` storms; other ops must be queued in payload so `reassess`/`continue` are not dropped when overwritten by a later `process_reply`. |
| RESUME/COVER_LETTER `adjustmentNote`, `regenerationInstruction`, `hiddenRoleIds` | Last-write-wins on PENDING reuse is acceptable only if every click is a full regenerate from latest form; prefer storing latest payload fields explicitly on merge. |
| INTERVIEW_GUIDE `answers`, `skipQuestions`, … | Merge latest answers by question id; do not drop unanswered keys from earlier request if still needed. |
| APPLICATION_SUMMARY | `sectionKey` is also `targetId` — different sections are different keys; same section reuse: last payload `userId`/`sectionKey` sufficient (hash skip inside generator). |

Shared helper (e.g. `mergeApplicationJobPayload(existing, incoming): ApplicationJobPayload`) used by enqueue reuse and by `queueHiringTeamBuild`.

---

## 7. Paid-call guard (Phase 1)

Serialization does not change fingerprints or `PaidCallReceipt`.

- Identify/synthesize still call `runPaidStructuredCall` from `hiring-team/ai.ts` only.
- Job 1 runs identify/synthesize → receipt upserted after success.
- Successor PENDING for same key runs later with latest evidence; if fingerprint unchanged → skip provider; if changed → call once and upsert.
- Crash/heartbeat retry of the **same** job after receipt already recorded still skips (existing Phase 1 behavior).
- No change to other paid call sites.

---

## 8. Render deploy

| Fact | Citation |
|---|---|
| Pre-deploy script | `package.json` **13**: `"render:pre-deploy": "node scripts/render-pre-deploy.mjs"` |
| Migrations on Render | `scripts/render-pre-deploy.mjs` **213**: `npx prisma migrate deploy` |
| Ownership | `docs/refactor-map.md` **25**: web owns migrations; worker does not migrate (`scripts/research-worker.ts` **5–6, 80**) |
| No `render.yaml` in repo | `docs/refactor-map.md` **25** |

**Automatic on next deploy:** Yes, if the web service’s Render pre-deploy command remains `npm run render:pre-deploy` (or equivalent that runs that script). The new migration folder will apply then. Worker deploy does not run migrations.

**Read-only pre-check SQL** (product owner on Render DB before deploy):

```sql
-- Would violate PENDING unique
SELECT "organizationId", "campaignId", "type", COALESCE("targetId", '') AS target_key, COUNT(*) AS n
FROM "ApplicationJob"
WHERE status = 'PENDING'
GROUP BY 1, 2, 3, 4
HAVING COUNT(*) > 1;

-- Would violate IN_PROGRESS unique
SELECT "organizationId", "campaignId", "type", COALESCE("targetId", '') AS target_key, COUNT(*) AS n
FROM "ApplicationJob"
WHERE status = 'IN_PROGRESS'
GROUP BY 1, 2, 3, 4
HAVING COUNT(*) > 1;

-- Current Phase 1 index already forbids PENDING+IN_PROGRESS together; still useful inventory:
SELECT "organizationId", "campaignId", "type", COALESCE("targetId", '') AS target_key,
       status, COUNT(*) AS n
FROM "ApplicationJob"
WHERE status IN ('PENDING', 'IN_PROGRESS')
GROUP BY 1, 2, 3, 4, 5
ORDER BY n DESC;
```

Expect empty result sets for the two `HAVING COUNT(*) > 1` queries before migrating.

---

## 9. Tests (setup only — do not write/run in this PLAN step)

Phase 1 concurrent enqueue/claim (`src/lib/ai/paid-call-guard.phase1.test.ts` **267–295**) lives under:

```ts
describe.skipIf(!hasTestDatabase())("paid-call gate Phase 1 with database", () => {
```

(**135**). Uses real `prisma`, `enqueueApplicationJob`, `claimNextApplicationJob` — **not mocks** for DB. `hasTestDatabase()` (`src/test/database.ts` **20–22**) is true when `DATABASE_URL` is set; Vitest sets that from `TEST_DATABASE_URL` via `configureVitestDatabase()` (`database.ts` **145–164**, wired from `vitest.setup.ts`).

**New tests** must use the same `describe.skipIf(!hasTestDatabase())` pattern (or equivalent) so indexes and `FOR UPDATE SKIP LOCKED` hit real Postgres. Update Phase 1 “concurrent enqueues share one active job” assertion: while nothing is `IN_PROGRESS`, concurrent enqueues still share **one PENDING**; after marking one `IN_PROGRESS`, a new enqueue must create a **second** row that is `PENDING` (not return the running id).

---

## 10. Files and functions affected

| File | Function / area | Becomes |
|---|---|---|
| New migration under `prisma/migrations/…` | SQL | Drop combined uidx; add PENDING uidx + IN_PROGRESS uidx (§3) |
| `src/lib/application-jobs/service.ts` | `findActiveJob` | Split into `findPendingJob` / `findInProgressJob` (or parameterized by status) |
| same | `enqueueApplicationJob` | Create/reuse PENDING only; merge payload; P2002 → pending | 
| same | `claimNextApplicationJob` | Skip PENDING blocked by IN_PROGRESS; skip stale IN_PROGRESS when PENDING exists |
| same | `abandonStaleApplicationJobs` | Fail stale when PENDING exists; else requeue |
| same | `failApplicationJob` | Timeout retry must not create second PENDING |
| same | `retryApplicationJob` | No second PENDING collision |
| same | **new** `mergeApplicationJobPayload` | Shared merge rules (§6) |
| `src/lib/application-jobs/types.ts` | `ApplicationJobPayload` | Add queue fields if needed (`pendingOperations` / `pendingAnswers` / `pendingEdits`) |
| `src/lib/application-jobs/process.ts` | `processConsultationJob` | Drain incomplete `process_reply` turns; process queued payload ops/edits/answers |
| `src/lib/hiring-team/build.ts` | `queueHiringTeamBuild` | Merge deferredOutreach onto PENDING only; enqueue PENDING while IN_PROGRESS |
| `src/lib/consultation/service.ts` | optional small helper | e.g. list incomplete seeker turns / skip generation if turn already complete — only if needed by drain |
| Tests | new + Phase 1 adjust | Real Postgres (§9, TESTS list below) |

**Out of scope / unchanged:** prompts, models, UI layout, provider adapters, Phase 1 receipt schema, ResearchRun claiming, worker concurrency default.

---

## TESTS (to add at implementation — not run now)

All DB/locking tests: `describe.skipIf(!hasTestDatabase())` against real test Postgres.

1. **Harper double answer:** seed session; enqueue `process_reply` turn A; claim and set/simulate `IN_PROGRESS` without completing A; record+enqueue turn B; assert exactly one PENDING + one IN_PROGRESS; complete A’s processing (`READY`); claim PENDING; assert B becomes `READY` exactly once; assert A’s extract/polish provider (or processAnswerGeneration) was not invoked again for A.
2. **Answer 1 never twice:** same as (1); spy/count generation for turn A == 1 across both jobs.
3. **Ten requests → one PENDING:** with IN_PROGRESS held, ten enqueues same key → `COUNT(PENDING)=1`, `COUNT(IN_PROGRESS)=1`.
4. **PENDING not claimed while IN_PROGRESS:** insert both; `claimNextApplicationJob` returns null for that key (or claims a different key’s job); never returns the blocked PENDING id.
5. **Different keys parallel:** two campaigns or two `targetId`s; both PENDING claimable into two distinct IN_PROGRESS jobs.
6. **Payload not lost:** enqueue `deferredOutreach` (or `process_reply` turnIds / `pendingOperations`) onto PENDING while IN_PROGRESS; assert merged payload retains deferredOutreach / queued ops after multiple reuses.
7. **Heartbeat / abandon:** stale IN_PROGRESS + PENDING → abandon/fail leaves one PENDING, zero or one failed stale; never two IN_PROGRESS; claim never runs two for one key.
8. **Hiring receipts:** after serialize path, unchanged identify/synthesize fingerprint still skips provider (reuse Phase 1 assertions).
9. **Index enforcement:** concurrent creates of second PENDING same key → one PENDING (P2002 path); concurrent claim of same PENDING → one winner.
10. **Phase 1 test update:** concurrent enqueue with no IN_PROGRESS still one PENDING; enqueue during IN_PROGRESS yields PENDING sibling, not the running id.

---

## Risks / unknowns

1. **CONSULTATION operation collisions on null targetId:** `start`, `retry`, `reassess`, `continue`, `process_reply`, `edit_answer`, `answer` share one key. Payload queue design is required; incomplete design could drop a `reassess` under a reply storm.
2. **`answerConsultationAction` payload-only answers** can still be lost without merge or record-before-enqueue — confirm which UI path is live in production.
3. **Types without incremental/paid guards** (RESUME, COVER_LETTER, OUTREACH, CONTACT_PROFILE, NEXT_STEP) will **re-pay** when a successor PENDING runs after a completed job — serialization fixes lost input, not duplicate generate. Product owner asked for no repeat paid work; for these types that means either accept intentional regenerate-on-second-request, or a later phase of receipts.
4. **Render duplicate rows:** cannot verify from code; migration fails if pre-check SQL is non-empty.
5. **Worker concurrency is 5 by default**, not 10 — confirm Render env if 10 is expected.
6. **Stale IN_PROGRESS failed when PENDING exists** discards in-flight partial work; acceptable only because PENDING re-reads DB — verify CONSULTATION turns left `PENDING` (not half-written) on worker crash mid-`processAnswerGeneration`.
7. **`retryApplicationJob` UX** when PENDING already exists needs a product-facing choice (blocked vs merged).

---

*End of plan. No code changes made.*

