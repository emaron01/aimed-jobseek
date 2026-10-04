Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause. Harper always gives the strongest answer the seeker's information supports; a best-practice question is never left without a draft when any attempt produced usable text. Every paid call stays behind the paid-call gate. No AI instruction changes unless reported and approved first (exact current and proposed text, then STOP on that part). No schema changes or data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/best-practice-drafts. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the two defects below. Do not merge or push main.

DEFECT 1 (production, application cmusnhmeu000vr52o68tvs6oy, main at 82f64f0)
After the seeker saved a reply, best-practice recovery ran: one role_expertise_questions call, then role_expertise_answers attempts 1, 2, and 3 (gpt-5.6-luna). The 17 questions were stored and shown, but none has a suggested draft. Expected after 44da3c3: per-question kind handling (point of view versus story) and, after the retries, the closest actual attempt stored as the draft.
1. Reproduce with these real questions (for example "What attracts you to CSC's Senior Director of Sales role...", "Describe a time when you inherited an unhealthy pipeline...", "Which leading and lagging indicators would you use...") and the current answers instructions (version 6, including the approved-answers list). Report exactly which check rejected each attempt and why, with file and line.
2. Report why the closest-attempt fallback stored no draft.
3. Fix both at the root, so a usable attempt is always stored as the draft.

DEFECT 2
Every best-practice and gap question card shows "Save Answer" twice. Report why and fix it so it appears once.

TESTS
Choose the minimum relevant tests that prove both fixes (including drafts stored for the reported question kinds). Run only those, plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/best-practice-drafts and push the branch. Do not merge or push main.

REPORT
1. Each rejection reason with file and line, why the fallback stored nothing, and the fix.
2. Any instruction change proposed (or STOP), with exact text.
3. The doubled button cause and fix.
4. The checks you ran and results, and the commit hash.
