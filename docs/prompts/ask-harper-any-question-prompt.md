Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations or schema changes. Any AI instruction text change must be reported with the exact current and proposed text and STOPPED on for product owner approval before it is made. The paid-call gate, the library, and the fact-preservation rules stay as they are. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from origin/main named fix/ask-harper-any-question. If origin/main does not include the Ask Harper deploy (fix/ask-harper tip), STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the defect below. Do not merge into main or push main. Change nothing else. Add no features.

DEFECT (production)
In Ask Harper, the seeker asked: "What are the key attributes of top performing sales rep on your team?" Harper returned an error telling the seeker it could not answer and to try again, instead of a draft. Product rule: Harper always gives the strongest answer the seeker's information supports and never fails to answer a real question; she never shows a can't-answer error for a real question.

INVESTIGATE (file and line)
1. Reproduce with that question. Report exactly which step rejected the answer and why (for example the D3 CAR or STAR parts validation, the lenient result check requiring an outcome, the tag or classification, a schema parse, the quality regeneration limit, or something else), and what the seeker saw and why.
2. Report how Ask Harper classifies a question today (interviewTypeTag and any answer format choice) and whether opinion, approach, philosophy, or knowledge questions (for example "What do you look for in...", "How do you think about...", "What's your philosophy on...") can pass the current checks.

FIX at the root
1. Ask Harper answers every real interview question. Opinion, approach, philosophy, and knowledge questions are answered as the seeker's point of view, supported by an example from the Personal Profile or approved answers when one exists, without requiring a story result or outcome. Story questions keep the existing structure and checks. Facts are kept exactly as stated and nothing is invented, as today.
2. If the quality checks still fail after the bounded regenerations, show the best available draft (built only from the seeker's information, never invented) with Edit and Approve, rather than an error, consistent with Harper's best-answer rule. A can't-answer message is shown only when the input is not a question at all (empty or meaningless), and report its exact text.
3. If this requires any AI instruction text change, STOP before making it and report the exact current text and the proposed text for approval. Code changes (classification, which checks apply to which question kind, the best-available fallback) do not need approval.

TESTS
Add automated tests that assert: the reported question produces a draft with Edit and Approve, not an error; representative opinion, approach, and knowledge questions produce point-of-view drafts without requiring an outcome; a story question still gets the existing structure and checks; when checks fail after the regenerations, the best available draft is shown instead of an error, built only from the seeker's information; an empty or meaningless input shows the not-a-question message and makes no paid call; an identical question still makes no second paid call; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/ask-harper-any-question with a message naming Ask Harper answering every real question, and push that branch. Do not merge into main or push main.

REPORT
1. The reproduction: which step rejected the answer and why, and what the seeker saw.
2. How questions are classified, and the fix, with file and line.
3. Any instruction text change proposed (or STOP), with exact current and proposed text.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside this defect changed.
