[BUILD + DEPLOY] Harper spec, Batch C: never discard a draft, then ship

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
One change on top of the approved Batch C (8163871), then deploy. No instruction wording changes, no schema changes. Every paid call stays behind the paid-call gate. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Work in the fix/harper-spec-batch-c worktree, on top of 8163871. If anything unexpected happens, STOP and report.

SURGICAL RULE
Change only the item below, then deploy. Change nothing else.

ITEM
In storyDraftContent (src/lib/consultation/role-expertise.ts) and wherever a story draft is otherwise left empty: never discard a draft that has usable text. Remove the rejection of a draft that names another workplace, school, or project with "at ..." (stories name customers that way, for example "a $1.3MM opportunity at Bank of America"). When a story names none of the profile's stored employers, schools, or projects, or opens hypothetically with "I would", send it back once through the existing quality loop asking it to name where it happened and tell it as what happened; if the rewrite still falls short, store the best attempt as the draft for the seeker to edit. A question is left without a draft only when no attempt produced usable text.

TESTS
Choose the minimum relevant tests that prove: a story naming a profile employer and a customer with "at" is stored as written; a story naming no profile place or opening with "I would" is retried once and, if still short, stored as the best attempt rather than left empty. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
The change, with file and line, the checks run and results, and main before and after.
