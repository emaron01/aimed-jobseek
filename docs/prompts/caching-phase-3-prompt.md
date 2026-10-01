Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Use the existing paid-call gate (runPaidStructuredCall in src/lib/ai/paid-call-gate.ts) exactly as other operations do: receipts, advisory lock, spend guard, and crash safety. No temporary fixes, no data repair, no migrations or schema changes unless reported and approved first, no prompt text changes. Writing stays on the writing model. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from main named fix/caching-phase-3. If main does not include 40319dd (roles text and Contacts), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
ITEM 1 changes code. ITEMS 2 and 3 are report only. Change nothing else. Add no features. Seeker-visible behavior stays the same except that an identical repeat request makes no second paid call.

ITEM 1: Harper answer processing behind the paid-call gate
Today Harper's extract and polish calls (extractWithModel, polishAnswerWithModel in src/lib/consultation/ai.ts, on getConsultationReplyAiProvider), statement regeneration, the declined follow-up path, and any Cheat Sheet answer polish do not go through runPaidStructuredCall.
1. List every such call site, with file and line.
2. Route each through runPaidStructuredCall with its own named operation (for example CONSULTATION_EXTRACT, CONSULTATION_POLISH, CONSULTATION_STATEMENT_REGENERATE), keyed to the question being answered (campaign plus question turn or targetKey), with a fingerprint built from everything that determines the output: the model, the prompt version, and the full message payload (the seeker's replies in order, the library prior answer if any, quality feedback, career stage, and so on).
3. Quality regenerations: each attempt carries different feedback, so its fingerprint differs and it still calls the model. A crash, retry, or double submit that repeats an identical request must not call the model again; it returns the stored result through the gate as other operations do.
4. Keep the usage step and attempt metadata (from 9d2eef8) on every call.
5. Report anything that does not fit the gate cleanly and why.

ITEM 2: Approve and the continue job (report only)
Approving a Harper answer (approveConsultationQaResultAction and the Cheat Sheet approve paths) enqueues a CONSULTATION job with operation "continue". Report, with file and line, exactly what that job does, whether it makes a paid planning-model call, under what conditions it does and does not, whether it is gated today, and how often it can run in normal use (for example once per approval). Propose options if it can pay for unchanged inputs, with cost. Make no changes.

ITEM 3: Any other paid call outside the gate (report only)
List every remaining paid AI call anywhere in the product that does not go through runPaidStructuredCall, with file and line, its model, and what triggers it. Make no changes.

TESTS
Add automated tests that assert:
- Each newly gated operation calls the provider once for a new request and records a receipt.
- An identical repeated request (same question, same replies, same prompt version and model) makes no second provider call and returns the stored result.
- A changed reply, a new library prior answer, or a quality regeneration with new feedback calls the provider.
- Usage events still record step and attempt.
- Seeker-visible outcomes (draft, follow-up, needs-more-detail) are unchanged.
- Rendering makes no paid call and enqueues no job.
Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/caching-phase-3 with a message naming Harper answer processing behind the paid-call gate, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: every call site, the operations and fingerprints, how regenerations and repeats behave, and anything that did not fit, with file and line.
2. ITEM 2: what the continue job does on approve, whether and when it pays, and options with cost.
3. ITEM 3: every remaining ungated paid call.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside ITEM 1 changed.
