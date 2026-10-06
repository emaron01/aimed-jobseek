[BUILD, REPORT] Harper: use approved answers on similar jobs, and always draft
Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.
PRODUCTION STANDARD
Fix root causes. Harper always gives the strongest answer the seeker's information supports. Every paid call stays behind the paid-call gate. No AI instruction changes unless reported and approved first (exact current and proposed text, then STOP on that part). No schema changes or data repair. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-similar-jobs. If fix/why-company-scope is not yet on main, do not touch it. If anything unexpected happens, STOP and report.
SURGICAL RULE
Fix only the three items below. Do not merge or push main.
CONTEXT (production)
The seeker's newest application (Sift, Director/Sr. Director, Sales) is a similar job to the CSC application (cmuna46te0019r52o11wi0zm0), which has many approved answers (coaching an underperforming rep, deal reviews and forecast confidence, aligning executive, security, technical, and financial stakeholders, cross-functional alignment, the career walk-through, and more). On Sift, Harper re-asked these as gap questions, no gap question has a draft, and no best-practice question has a draft.
ITEMS
1. Re-asking: report, with file and line and read-only SQL for production, exactly which approved answers the selector passed to Sift's planning (if any) and why each CSC approved answer was or was not matched to Sift's targets. Fix the matching at the root so an approved answer that covers a target's substance is passed even when the wording differs between jobs.
2. Gap drafts from the library: after planning stores gap questions, draft every gap question the seeker's approved answers and profile can support, in one batched call through the existing answers step (no new instructions), stored as Drafts with Edit and Approve. Questions with no supporting evidence get no draft. Report the cost per application.
3. Best-practice drafts: report why Sift's best-practice questions have no drafts after a1704c5 (which UsageEvent steps ran, and which check rejected what), and fix the root cause.
TESTS
Choose the minimum relevant tests that prove all three (an approved answer with different wording covers a matching target; gap questions with supporting evidence get drafts in one call; best-practice drafts are stored). Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.
COMMIT
Commit on fix/harper-similar-jobs and push the branch. Do not merge or push main.
REPORT
1. Each item: findings with file and line, the read-only SQL, and the fix.
2. Any instruction change proposed (or STOP), with exact text.
3. The cost per application for item 2.
4. The checks you ran and results, and the commit hash.
