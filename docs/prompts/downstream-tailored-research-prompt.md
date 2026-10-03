Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only, per section E of docs/prompts/job-focus-research-plan-report.md, with the product owner's decisions below. Every paid call goes through the existing paid-call gate. Nothing regenerates automatically or on a page view; adding research to an input changes that step's fingerprint, so the next seeker-initiated run of that step pays once, and nothing reruns on its own. No new AI instruction wording beyond passing the research as input; if any step's instructions must change to use it, report the exact current and proposed text and STOP on that part for approval. No data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Work in C:/Repos/aimed-jobseek-company-website-anchor on fix/company-website-anchor (at 3747192), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not merge into main or push main. Change nothing else. Add no features.

PRODUCT OWNER DECISIONS
1. Every place that uses employer research reads the application's tailored research (ApplicationEmployerResearch): company highlights as context, and the job focus (the part of the company the job serves, with its in-depth detail) as the primary emphasis.
2. An application with no tailored research yet keeps using what it uses today (the shared company research through usableEmployerResearch), so nothing gets worse before its research runs.
3. Harper is the source of truth: tailored research anchored to the company website is used without seeker confirmation.

ITEMS
1. One reader: a single function that returns an application's research for downstream use, preferring its tailored research (decisions 1 and 3) and falling back to today's shared research (decision 2). Report it with file and line.
2. Use it everywhere research is used today, with file and line for each: Harper's question planning; the why-this-company answer, which today receives no research at all, so add it; role-expertise and Ask Harper answers (the company and the job's focus as context, with the seeker's proof still from the Personal Profile); the Interview Cheat Sheet company section; resume and cover letter; outreach; and Hiring Team and persona research (role profiles use the company research and job focus as input).
3. Display: the application's company section and the Cheat Sheet company section show the company highlights and, beneath them, the job focus and its detail with citations. Report where wording is needed for section titles; use plain descriptive titles in the product config and report them for approval.
4. Fingerprints: report, for each step that now receives tailored research, that its fingerprint includes it, what the first run after deploy costs on the model it uses, and confirm nothing reruns on its own or on a page view.

TESTS
Add automated tests (mocked providers, real Postgres where saving is involved) that assert: the reader returns tailored research when it exists and today's shared research when it does not; Harper's planning, the why-this-company answer, role-expertise and Ask Harper answers, the Cheat Sheet, resume, cover letter, outreach, and Hiring Team and persona research each receive the tailored research with the job focus; why-this-company now receives research; the company section and Cheat Sheet show highlights plus job focus with citations; tailored research is used without confirmation; an application without tailored research behaves as before; changed research changes each step's fingerprint and an unchanged input makes no paid call; nothing runs on a page view. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/company-website-anchor with a message naming downstream use of tailored employer research, and push that branch. Do not merge into main or push main.

REPORT
1. Each item: what changed, with file and line, including the reader, every consumer, the display and its titles, and the fingerprint findings with first-run cost per step.
2. Any instruction text change proposed (or STOP), with exact current and proposed text.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
5. The commit hash, branch, and worktree path.
6. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
