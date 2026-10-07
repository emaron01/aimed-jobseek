[BUILD + DEPLOY] Resume bullets: use the whole library, keep every result, no lost retries

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Per docs/prompts/bullet-loss-report.md (branch report/bullet-loss), for every kind of seeker. The seeker's library of approved answers is the primary evidence; Personal Profile achievements (from the original resume) are secondary; nothing is forced, everything competes on strength and relevance. The two instruction sentences below are approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate and never runs on page view. No schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/bullet-library. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the six items below. Change nothing else.

ITEMS
1. Whole library: send the seeker's approved interview answers and approved resume bullets from all of their applications, not only this one, still excluding why-this-company answers and evidence specific to another employer's application (for example an answer written about CSC as the target company). Include each answer's question text.
2. Library first: in the model input, list approved answers and resume bullets before Personal Profile achievements. Add exactly this sentence to the bullet candidate instruction, after the sentence that begins "Lead with the seeker's strongest accomplishments":
When an approved answer and a Personal Profile achievement state the same result, write the bullet from the approved answer.
3. Every result covered: after the candidate call, find evidence items that no returned bullet cites. If any have a stated result (a number, named customer, scope, or award), make one follow-up call behind the paid-call gate for only those items, with exactly this added sentence:
Write bullets only for these items, which the earlier list did not cover.
Merge its bullets into the stored list. No more than one follow-up per run.
4. Merge, do not replace: when the employer-name retry runs, keep the first response's bullets that passed and replace only the ones that failed.
5. Strip employer names everywhere: remove a mid-sentence or possessive profile employer name from any bullet (library or achievement), instead of dropping library bullets.
6. Employer matching: a stated name matches the one Personal Profile employer that contains it (for example "Micro Focus" matches "Micro Focus (acquired by OpenText)"); if it matches more than one, it decides nothing. Truly unnamed evidence still goes to General background.
Bump the bullet candidate prompt version, and report what that triggers.

TESTS
Choose the minimum relevant tests that prove each item, using sales, nursing, and new-graduate fixtures: an approved answer from another application becomes a candidate, and a why-this-company or other-employer answer does not; library evidence is listed first and preferred over a matching achievement; an uncited result triggers exactly one follow-up and is merged; the retry keeps passing bullets; a mid-sentence employer name is stripped from a library bullet; "Micro Focus" matches its profile employer. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed for each item, with file and line, the version bump and what it triggers, the checks run and results, and main before and after.
