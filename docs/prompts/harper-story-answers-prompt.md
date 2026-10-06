[BUILD, REPORT] Harper: story answers, per-question library matching, whole answers

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix root causes. The instruction addition below is approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate. No schema changes or data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-story-answers. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Do not merge or push main.

CONTEXT (production, the seeker's Sift application)
Story questions get descriptions of general habits instead of stories ("Describe a situation in which an experienced seller was underperforming" was answered with "I review pipeline... establish specific actions..."), although the seeker's approved CSC answers contain a real story (at OpenText, exiting two underperformers and recruiting two representatives who became top performers). One story draft still says "I would". Some drafts begin mid-thought ("I led North American sales for the Series A company during that transition.") because the opening part was dropped. Most gap questions have no draft although approved answers cover them.

ITEMS
1. Story answers: add exactly this text to the answer-drafting instructions used by best-practice answers, Ask Harper, and gap drafts, directly after the existing story-question sentence:
A story answer names where it happened (the employer, school, or project, and the role), what you did, and what changed. Never describe a general habit in place of a story.
Point-of-view questions keep their current handling.
2. Per-question library matching: match the seeker's approved answers to each best-practice and gap question by that question's own wording and substance (not only to the job's requirement targets), so a fitting approved story reaches the question it answers, and gap questions it supports get drafts. Report the matching rule, with file and line.
3. Whole answers: find why a draft can begin mid-thought (for example a dropped challenge or situation part when the answer is assembled), with file and line, and fix it so every stored draft reads as a complete answer.
Bump the affected prompt versions.

TESTS
Choose the minimum relevant tests that prove each item (the exact text is in place; the OpenText underperformer story reaches the underperforming-seller question; a gap question covered by an approved answer gets a draft; an assembled draft never begins mid-thought). Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/harper-story-answers and push the branch. Do not merge or push main.

REPORT
1. Each item: what changed, with file and line, the matching rule, and the mid-thought root cause.
2. The version bumps and what they trigger.
3. The checks run and results, and the commit hash.
