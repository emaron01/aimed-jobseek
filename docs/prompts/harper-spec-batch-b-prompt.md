[BUILD, REPORT] Harper spec, Batch B: fair ratings, and approving moves the score

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Per Batch B of docs/prompts/harper-spec-audit-report.md (branch report/harper-spec-audit), for every kind of seeker. The instruction replacement below is approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate. No schema changes or data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-spec-batch-b. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the four items below. Do not merge or push main.

ITEMS
1. Rating rule: in the planning decision instructions, replace the sentence "When a requirement has several parts, rate it PARTIAL if the person's information supports any part; rate it NONE only when nothing supports any part." with exactly:
Rate a requirement STRONG when the person's information supports every part of it, PARTIAL when it supports some parts (and name the missing part), and NONE when it supports no part. Never lower a rating because a story has not been written yet, a date is missing, or the wording differs.
2. Remove the code that changes ratings by word overlap or date math: strengthForMultipartSupport and its use in verifyModelAssessments; the downgrade to PARTIAL when experience months fall short or a role date is missing; and the part of preserveAssessmentStrength that keeps an older lower rating. Experience-years figures may still be computed and shown as information, but never change a rating. Report what the years line now uses, with file and line.
3. Remove rewriteContradictingExplanations and its planning call (the one-time explanation rewrite). Keep the existing writing instruction that explanations are consistent with the strength.
4. Approving moves the score: when the seeker approves the interview answer for a requirement row's question, set that row's strength to STRONG, unless the approved answer is an acknowledge-the-gap track (confirmedGap), which keeps its current strength. No model call on approval. Apply to approvals from any card that belongs to that row.
Bump the planning decision prompt version, and report what that triggers.

TESTS
Choose the minimum relevant tests that prove each item, including: a requirement with every part supported is STRONG and one with a named missing part is PARTIAL, for a sales, a nursing, a software, and a new-graduate profile; no rating changes from word overlap or missing dates; no explanation rewrite call is made; approving a row's answer sets it STRONG, and approving an acknowledge-the-gap track does not. Update or remove existing tests that required the removed behavior, and report which. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/harper-spec-batch-b and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, and what the years line now uses.
2. The tests updated or removed, and why.
3. The version bump and what it triggers.
4. The checks run and results, and the commit hash.
