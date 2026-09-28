# Report: Serialize same-key ApplicationJobs

**Repo:** `C:/Repos/aimed-jobseek` → `https://github.com/emaron01/aimed-jobseek.git`  
**Suite:** 243 files, **1761 passed**, 0 failed. Serialize DB tests ran under `hasTestDatabase()` (not skipped).

---

## 1. Worker concurrency env var

The ApplicationJob / research worker reads **`RESEARCH_WORKER_CONCURRENCY`** via `getResearchWorkerConcurrency()` in `src/lib/research/config.ts` **40–49** (default **5** at **34**). Used in `scripts/research-worker.ts` **79, 92**.

**`RESEARCH_CONCURRENCY=10` is not the variable the worker reads.** That name is a separate web/research concurrency helper (`getResearchConcurrency` earlier in the same config file). Setting `RESEARCH_CONCURRENCY=10` does not change worker ApplicationJob concurrency.

---

## 2. DECISION 4 — reply wait

| Surface | Before | Change |
|---|---|---|
| **Harper coaching** (`ConsultationThread` / `ConsultationSection`) | Reply forms **hidden** while `consultationBusy` (CONSULTATION job PENDING/IN_PROGRESS) via `showReply = … && !jobsActive`. Submit briefly uses `ApplicationActionForm` pending during the enqueue action. On job failure / completion, forms return; on `generationStatus === FAILED`, thread replaced by retry. | **Unchanged** — already waits for analysis via hide-while-busy. |
| **Cheat Sheet Q&A** (`CheatSheetCoachItems`) | Sync `answerCheatSheetCoachAction` disabled **submit** via form `pending` for the full polish; **textarea was never disabled**. Re-enabled on failure in `finally`. | **`disableFieldsWhilePending`** on the form so textarea + submit stay disabled for the whole analysis; re-enable on completion/failure via existing pending clear. No new copy or sections. |

---

## 3. Files changed + migration SQL

| File | Change |
|---|---|
| `prisma/migrations/20260927200000_application_job_serialize_pending_in_progress/migration.sql` | Drop combined active uidx; add PENDING + IN_PROGRESS partial uniques |
| `src/lib/application-jobs/service.ts` | Policy map, serialize enqueue, claim skip, abandon/fail/retry, payload merge |
| `src/lib/application-jobs/process.ts` | CONSULTATION drain via `listIncomplete…` + `processConsultationReply`; planning ops after drain |
| `src/lib/hiring-team/build.ts` | `queueHiringTeamBuild` → enqueue only (PENDING reuse via service) |
| `src/lib/consultation/service.ts` | `analysisIsComplete` export; complete-turn skip; `recordConsultationAnswerEdit`; list/drain helpers |
| `src/app/actions/consultation.ts` | Record-before-enqueue for answer, reply, edit; no seeker text in payload |
| `src/components/ApplicationActionForm.tsx` | Optional `disableFieldsWhilePending` |
| `src/components/CheatSheetCoachItems.tsx` | Enable field disable while pending |
| `src/lib/application-jobs/serialize-same-key.test.ts` | New tests |
| `src/lib/ai/paid-call-guard.phase1.test.ts` | Serialized follow-up while IN_PROGRESS |
| `src/lib/application/harper-workspace.test.ts` | Claim SQL + policy export assert |
| `docs/prompts/application-job-serialize-same-key-implement.md` | Saved implement prompt |

**Migration SQL:**

```sql
DROP INDEX IF EXISTS "ApplicationJob_active_org_campaign_type_target_uidx";

CREATE UNIQUE INDEX "ApplicationJob_pending_org_campaign_type_target_uidx"
ON "ApplicationJob" ("organizationId", "campaignId", "type", (COALESCE("targetId", '')))
WHERE status = 'PENDING';

CREATE UNIQUE INDEX "ApplicationJob_in_progress_org_campaign_type_target_uidx"
ON "ApplicationJob" ("organizationId", "campaignId", "type", (COALESCE("targetId", '')))
WHERE status = 'IN_PROGRESS';
```

---

## 4. Type-to-policy mapping

`SERIALIZED_APPLICATION_JOB_TYPES` / `applicationJobAllowsFollowUpWhileRunning` in `src/lib/application-jobs/service.ts`:

| Serialized (follow-up PENDING while IN_PROGRESS) | Non-serialized (return active job; no follow-up) |
|---|---|
| CONSULTATION | RESUME |
| HIRING_TEAM_IDENTIFY | COVER_LETTER |
| HIRING_TEAM_BUILD | OUTREACH |
| APPLICATION_SUMMARY | CONTACT_PROFILE |
| NEXT_STEP | INTERVIEW_GUIDE |

DB indexes enforce ≤1 PENDING and ≤1 IN_PROGRESS for **all** types.

---

## 5. Consultation input paths (record before enqueue)

| Path | Records before enqueue? |
|---|---|
| `answerConsultationAction` | **Yes** — `recordConsultationReply` then enqueue `{ operation: "process_reply" }` |
| `replyConsultationAction` | **Yes** — `recordConsultationReply` then enqueue (no turnId/answer in payload) |
| `editConsultationAnswerAction` | **Yes** — `recordConsultationAnswerEdit` (body + analysis PENDING) then enqueue |
| `approveConsultationQaResultAction` / `useConsultationResultAction` | Approvals/confirmations in DB then `continue` |
| `saveWhatYouShouldKnowAboutMeAction` | Background saved then `reassess` |
| `updateInterviewStageAction` | Stage notes saved then `reassess` |
| `saveApplicationJobLearnedNotes` | Notes saved then `reassess` |
| `addCheatSheetInterviewNote` | Notes saved then `reassess` |
| `start` / `retry` / `person_prep` | No seeker answer text; work-kind flags only |

Worker always drains incomplete SEEKER turns from DB before planning ops; skips turns that are already complete.

---

## 6. Tests + suite

**Added:** `src/lib/application-jobs/serialize-same-key.test.ts` — policy source tests, reply-wait source tests, real-Postgres tests for claim blocking, ten-enqueue→one PENDING, non-serialized types, deferredOutreach merge, retry, abandon/timeout, drain once, record-before-enqueue integration.

**Updated:** Phase 1 concurrent enqueue (serialized follow-up); harper-workspace claim contract.

**Full suite:** `npx vitest run` → **243 files, 1761 passed**. Index/locking tests executed against real Postgres (`aimedjobseek_test` / `hasTestDatabase()` true — not skipped).

---

## 7. Scope confirmation

No prompt/model/provider/Phase 1 receipt/fingerprint/research-run changes. UI limited to Cheat Sheet field disable-while-pending (+ shared form option). No data backfill.

---

## 8. Deviations

1. CONSULTATION drain loop lives in `process.ts` calling imported `processConsultationReply` (so tests can mock the export); `drainConsultationUnprocessedInput` remains on the service for reuse.
2. Planning `operation` kept as a non-input payload flag (not seeker text); drain-only ops do not overwrite a queued planning op on PENDING merge.
3. Harper reply UI left as hide-while-busy (already met DECISION 4); only Cheat Sheet gained textarea disable.
4. Local `dotenv -e .env.local -- prisma migrate deploy` targeted the test DB URL in this environment; migration was applied successfully to the test database used by vitest.

---

*End of implementation report.*
