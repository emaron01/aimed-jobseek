# Fix — Consultation planning ops + single drain; report concurrency envs

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root cause. No temporary fixes, no data repair, no migrations.

SURGICAL RULE
Change only what is needed for ITEM 1 and ITEM 2 below. ITEM 3 is report only. Do not change prompts, models, providers, the job policy mapping, indexes, Phase 1 receipts, configuration, or any UI. Add no features.

CONTEXT
The serialization implementation (docs/prompts/application-job-serialize-same-key-implement-report.md) reported two deviations that need correction. The product owner also needs to know whether RESEARCH_CONCURRENCY does anything.

ITEM 1: Consultation planning operations must never be lost on PENDING reuse.
Planning operations (continue, reassess, start, retry, person_prep, and any other non-answer consultation operation) are kept as a non-input flag on the single PENDING CONSULTATION job.
- First, report exactly how the flag is stored and merged (cite the code): can it hold more than one operation, and what happens when a second, different operation is requested before the PENDING job starts?
- If a later request can overwrite or drop an earlier one, fix it so every requested operation is preserved and runs exactly once, in a defined order that you state and justify from the code (for example, answers drained first, then planning operations in request order), with duplicates of the same operation collapsed to one. If the current merge already preserves every operation, change nothing for this item and show why.

ITEM 2: One drain implementation.
The drain loop in process.ts uses processConsultationReply directly while consultation/service.ts still exports drainConsultationUnprocessedInput. Keep exactly one implementation of "process all unprocessed consultation input from the database": the worker calls it, and no second copy of the logic exists. Remove the unused duplicate. Keep the implementation mockable for tests. Behavior must not change.

ITEM 3 (REPORT ONLY, no changes): Concurrency environment variables.
- For RESEARCH_CONCURRENCY (getResearchConcurrency, src/lib/research/config.ts 18-30): list every caller with file, function, and line; state which running service (web service or background worker) executes each caller; and state what it limits. If it has no production caller, say so plainly.
- For RESEARCH_WORKER_CONCURRENCY (getResearchWorkerConcurrency, config.ts 40-49): confirm it is read only by the background worker and what it limits.
- List any other concurrency-related environment variables the code reads, with their defaults and which service reads them.

TESTS
Add or update automated tests that assert:
- Two different planning operations requested before the PENDING job starts both run, exactly once each, in the stated order (if ITEM 1 required a fix).
- The same planning operation requested twice runs once.
- The worker uses the single drain implementation, and the existing drain tests (answers processed exactly once, completed turns skipped) still pass.
Run the full existing test suite, including the real-Postgres tests, and confirm it passes with no new failures.

REPORT
1. ITEM 1: how the flag worked before, whether it could lose an operation, and the change made (or why none was needed).
2. ITEM 2: which implementation was kept, what was removed, and confirmation that behavior is unchanged.
3. ITEM 3: the concurrency variable findings.
4. Every file changed.
5. Tests added or updated and the full test suite result, confirming the real-Postgres tests ran.
6. Confirmation that nothing outside ITEM 1 and ITEM 2 changed.
