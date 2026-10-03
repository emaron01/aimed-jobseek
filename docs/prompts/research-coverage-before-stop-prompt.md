Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations or schema changes unless reported and approved first. The approved research brief stays exactly as it is; if any instruction text must change to meet the rules below, report the exact current and proposed text and STOP on that part for approval. Every paid call goes through the existing paid-call gate. Nothing runs on a page view or reruns on its own. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from origin/main (b71cf0b) named fix/research-coverage. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the items below. Do not merge into main or push main. Change nothing else. Add no features.

DEFECT (production, CSC application cmuna46te0019r52o11wi0zm0)
Tailored research read one page (https://www.cscglobal.com/cscglobal/home/) and stopped, with no web search. The early stop (anchorHostEvidenceEnough in src/lib/research/source-policy.ts) accepted the homepage because it was cited for companySummary, whatTheySell, jobFocus, and jobFocusDetail. As a result, "In depth" mostly restates the job posting rather than researching CSC's Domain and Brand Security business, and leadership, recent news, ownership or financial health, and competitors are empty. The Employer risk section listed the posting's inconsistent workforce figures and the job's demands as risks.

ITEMS
1. Coverage before stopping. Change the early-stop rule so research stops only when the brief is covered:
   a. The job focus detail is supported by a page about that part of the company (for example the anchor host's pages for that business, product, or service), not only the homepage, and not only by the posting text.
   b. The company highlights cover leadership, recent news (past 18 months), ownership or financial health, and main competitors, each supported by a cited source on the anchor host or an approved news host, or recorded as not found after searching.
   c. Up to 3 searches total, stopping as soon as a and b are met. When the cap is reached, keep what was found and leave unfound fields empty, as the brief says.
   Report the new rule with file and line, and how "a page about that part of the company" is decided.
2. Fetch the job focus pages: when the anchor host has pages for the part of the company the job serves, fetch and use them (within the existing fetch limits). Report how they are found (for example from the homepage links or a site-restricted search).
3. Employer risk: only real employer risks for a job seeker (for example layoffs, restructuring, financial trouble, lawsuits, regulatory problems, leadership turnover). Inconsistencies in the posting and the job's own requirements are not employer risks. Report how this is enforced (validation, output shaping, or, if instructions must change, the STOP above).
4. Report the expected cost per run on terra and on luna at the stored rates, with typical searches and tokens.

TESTS
Add automated tests (mocked providers, real Postgres where saving is involved) that assert: a run whose only source is the homepage does not stop early and performs at least one search; a run stops before the cap once the job focus has a page about that business and leadership, news, ownership or financial health, and competitors are each supported or searched; searches never exceed 3; job focus pages on the anchor host are fetched and used; the posting text alone does not satisfy job focus detail; Employer risk excludes posting inconsistencies and the job's requirements; source filtering is unchanged; a matching fingerprint makes no paid call; nothing runs on a page view. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/research-coverage with a message naming research coverage before stopping, job focus pages, and employer risk, and push that branch. Do not merge into main or push main.

REPORT
1. Each item: what changed, with file and line, including the new stop rule, how job focus pages are found, and how employer risk is enforced.
2. Any instruction change proposed (or STOP), with exact current and proposed text.
3. The expected cost per run on terra and on luna.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
6. The commit hash, branch, and worktree path.
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
