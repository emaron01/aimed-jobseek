[BUILD, REPORT] Harper: consistent ratings, whole drafts, stable experience years (all seekers)

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix root causes, for every kind of seeker (any profession and career stage, including new graduates), not only the reported sales-leader case. The two instruction additions below are approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate. No schema changes or data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/harper-consistency. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Do not merge or push main.

CONTEXT (production, the seeker's Sift application)
Two requirements combining MEDDPICC and Command of the Message were rated None while their explanations said the seeker directly supports them (MEDDPICC implementation, 95% forecast accuracy). One draft still begins mid-thought ("As Director, North America Sales, I led the sales strategy and execution for the transition."). The experience-years figure for the same requirement varies between runs (8, then 18, then 15 years) for a seeker with more than 20 years.

ITEMS
1. Consistent ratings: add exactly this text to the planning decision instructions:
When a requirement has several parts, rate it PARTIAL if the person's information supports any part; rate it NONE only when nothing supports any part.
Add exactly this text to the planning writing instructions:
Write each explanation consistent with that target's strength.
2. Whole drafts: find every remaining path by which a stored draft can begin mid-thought, referring to something it never introduced (for example "the transition"), with file and line, and fix the root cause so every stored draft reads as a complete answer on its own.
3. Stable experience years: make the years-of-experience figure for a requirement deterministic and complete for any profession: computed in code from every stated role where the required experience was used, not from the writing model's role choice, so the same profile and requirement always give the same figure. Report the rule, with file and line.
Bump the affected prompt versions.

TESTS
Choose the minimum relevant tests that prove each item, using at least one non-sales profile and one new-graduate profile (school, internships, projects) as well as the reported case: a multi-part requirement with partial support is PARTIAL and its explanation agrees; no stored draft begins mid-thought; the years figure is identical across runs and counts every qualifying role. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/harper-consistency and push the branch. Do not merge or push main.

REPORT
1. Each item: what changed, with file and line, the remaining mid-thought paths, and the years rule.
2. The version bumps and what they trigger.
3. The checks run and results, and the commit hash.
