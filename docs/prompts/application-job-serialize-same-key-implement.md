# IMPLEMENT — Serialize same-key ApplicationJobs

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Implement the approved serialization plan (docs/prompts/application-job-serialize-same-key-plan.md) with the product owner's changes below. Fix at the root in the shared job system. No temporary fixes, no data repair, no migration of existing data. The schema change is limited to the index changes specified.

SURGICAL RULE
Change only what is listed here. Do not change prompts, models, providers, Phase 1 receipts and fingerprints, research runs, or any UI other than the reply wait described below. Add no features.

PRODUCT OWNER DECISIONS (these override the plan where they differ)

DECISION 1: The database holds seeker input; jobs drain it.
- Every seeker input a job must process (Harper answers, answer edits, reassess requests, and any other consultation input) is recorded in the database BEFORE the job is enqueued. No seeker input exists only in a job payload. This includes answerConsultationAction, which today carries the answer only in the payload.
- A CONSULTATION job processes all unprocessed consultation input for that application from the database, in the order it was recorded, and skips anything already complete. It never re-extracts or re-polishes a turn that is already complete, even if its id is in the payload.
- Job payloads carry no request-specific seeker input. Keep only non-input flags that must survive reuse (for example deferredOutreach), merged onto the single PENDING job so they are never lost.
- Do not build the pendingAnswers, pendingEdits, or pendingOperations payload queues from the plan.

DECISION 2: Follow-up jobs only for types that cannot double-pay.
- Serialize (one IN_PROGRESS plus one PENDING per key; the PENDING job starts only after the running job finishes and reads the latest inputs) for these types only: CONSULTATION, HIRING_TEAM_IDENTIFY, HIRING_TEAM_BUILD, APPLICATION_SUMMARY, NEXT_STEP.
- For RESUME, COVER_LETTER, OUTREACH, CONTACT_PROFILE, and INTERVIEW_GUIDE, keep today's enqueue behavior exactly: a request while a same-key job is active returns the active job, and no follow-up job is created. These types switch to serialization later, when they get the paid-call guard.
- The per-type policy lives in one place in the shared job service (a single type-to-policy mapping), not in individual callers.
- Database enforcement for all types: at most one PENDING and at most one IN_PROGRESS per key, using the two partial unique indexes in plan section 3.

DECISION 3: Retry when a job is already waiting.
retryApplicationJob: if a PENDING job already exists for the key, return that PENDING job (the work is already coming) and show the existing queued message. Never create a second PENDING.

DECISION 4: Reply waits for Harper.
In Harper coaching and in the Cheat Sheet question-and-answer flow, after the seeker submits a reply, the reply input and submit control stay disabled until Harper finishes analyzing that reply, then re-enable. If the analysis fails, they re-enable so the seeker is never stuck. First report how each surface behaves today; if it already waits this way, leave it unchanged. Use existing loading or progress indicators; add no new wording or UI sections. This is the user experience layer only; the server-side drain in DECISION 1 remains the guarantee.

IMPLEMENT
1. Migration: drop ApplicationJob_active_org_campaign_type_target_uidx and create the PENDING and IN_PROGRESS partial unique indexes exactly as in plan section 3.
2. enqueueApplicationJob per DECISION 2's policy: serialized types create or reuse the single PENDING job (never return an IN_PROGRESS job for new work), merge non-input flags, and handle unique violations by re-finding the PENDING job. Non-serialized types keep today's behavior.
3. queueHiringTeamBuild: PENDING-only reuse per plan section 4.
4. claimNextApplicationJob: keep CONSULTATION-first ordering, FOR UPDATE SKIP LOCKED, and stale IN_PROGRESS eligibility; a PENDING job is never claimed while a same-key job is IN_PROGRESS; a stale IN_PROGRESS job is reclaimable only when no same-key PENDING exists.
5. Abandon, timeout fail, and heartbeat per plan section 5: never two IN_PROGRESS for one key; never a lost PENDING.
6. DECISION 1 record-before-enqueue for every consultation input path, and the CONSULTATION drain.
7. DECISION 3 retry behavior.
8. DECISION 4 reply wait.

TESTS
Add automated tests that assert:
- A second Harper answer submitted while the first answer's job runs is processed exactly once, after the first job finishes; answer 1 is extracted and polished exactly once across both jobs.
- An answer submitted through answerConsultationAction is in the database before its job is enqueued and is processed by the drain.
- Ten consultation inputs during a running job produce exactly one PENDING job, and every input is processed exactly once.
- A PENDING job is never claimed while a same-key job is IN_PROGRESS; different-key jobs still run in parallel.
- A resume, cover letter, outreach, contact profile, or interview guide request during a running same-key job returns the running job and creates no follow-up job.
- Non-input flags (deferredOutreach) survive PENDING reuse.
- Heartbeat requeue, abandon, and timeout never produce two IN_PROGRESS jobs for one key and never lose a PENDING job.
- Retry with an existing PENDING job returns it and creates no second PENDING.
- Hiring receipts still skip unchanged inputs under serialization.
- The reply control is disabled while Harper analyzes and re-enabled on completion and on failure, in both Harper coaching and the Cheat Sheet flow.
Index, locking, and concurrency tests must run against the real Postgres test database. Update the Phase 1 test that expected enqueue during IN_PROGRESS to return the running job, for serialized types only. Run the full existing test suite and confirm it passes with no new failures.

REPORT
1. The environment variable name the worker reads for concurrency (cite the code), and whether RESEARCH_CONCURRENCY=10 is the variable the code reads.
2. DECISION 4: how each surface behaved before the change, and what changed.
3. Every file changed, with what changed in each, and the migration SQL.
4. The type-to-policy mapping as implemented.
5. Every consultation input path and confirmation that each records to the database before enqueue.
6. Tests added and updated, and the full test suite result, including confirmation that index and locking tests ran against the real Postgres test database (not skipped).
7. Confirmation that nothing outside this scope changed.
8. Any deviation from the plan or these decisions, with the reason.
