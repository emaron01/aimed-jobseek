Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only, per sections C and D of docs/prompts/employer-research-plan-report.md and section F of docs/prompts/job-focus-research-plan-report.md, with the product owner's decisions below overriding the plans. Copy lives in the product config. Use existing components and AppButton; no new colors. No migrations or schema changes unless reported and approved first (the posting URL and seeker-supplied website columns already exist); no data repair; no AI instruction text changes (the research brief rewrite is the next batch). Every paid call goes through the existing paid-call gate. Nothing on page render makes a paid call or enqueues a job. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Create a new worktree and a new branch from origin/main named fix/company-website-anchor. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not change the research instructions, tailor research to the job, filter research pages, or change downstream uses (later batches). Do not merge into main or push main. Change nothing else. Add no features.

PRODUCT OWNER DECISIONS
1. The company's website is required for every application.
2. Job boards are never the employer's website: linkedin.com, indeed.com, glassdoor.com, ziprecruiter.com, greenhouse.io, lever.co, myworkdayjobs.com and workday.com, icims.com, smartrecruiters.com, ashbyhq.com, bamboohr.com, jobvite.com, and taleo.net (including their subdomains).
3. Harper is the source of truth: research anchored to the company's website needs no confirmation from the seeker.

ITEMS
1. Required company website on new applications: add a required "Company website" field wherever an application is created (and where its company is set or changed). When the posting URL's host is not a job board, prefill the field with that host's site (for example https://www.cscglobal.com from https://www.cscglobal.com/careers/senior-director-of-sales). Reject a job-board host with a clear message. Normalize and validate the URL. Store it where the plan says the seeker-supplied website lives; if the shared company record has no website, set it from this value (never overwrite an existing different website; report how a conflict is handled). Report every create and edit path covered, with file and line.
2. Existing applications without a website: on the application's company section, show a clear required prompt to add the company website, with the field. Research does not run for that application until a website is provided. No automatic changes to existing data.
3. Optional paste box: on the company section, an optional box to paste anything about the company (an About page, an article, notes), saved through the existing seeker notes input that research already receives. Report where it is stored.
4. Research uses the website: pass the company website (anchor host) into the research call and into its paid-call fingerprint. Research never searches by company name alone: if no website is known, it does not run. Report the exact inputs now sent.
5. Remove the confirmation step for anchored research: research produced with a provided company website is usable downstream without the seeker confirming it. Remove the Confirm and Reject controls for anchored research. Research rows made before this change without a website stay gated exactly as today until a run with a website replaces them; do not release them. Report every gate changed, with file and line.

TESTS
Add automated tests that actually render the pages and drive actions against real Postgres, and assert: creating an application requires a company website; a non-job-board posting URL prefills it; a job-board host is rejected with a clear message for every listed board and its subdomains; the shared company website is set when empty and never overwritten with a different value; an existing application without a website shows the required prompt and its research does not run; the paste box saves to the seeker notes research receives; research sends the anchor host and includes it in the fingerprint, and never runs by name alone; anchored research is usable downstream with no confirmation and no Confirm or Reject controls; older unanchored rows stay gated; rendering makes no paid call and enqueues no job. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, all in the new worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/company-website-anchor with a message naming the required company website, research anchored to it, and no confirmation step, and push that branch. Do not merge into main or push main.

REPORT
1. Each item: what changed, with file and line, including every create and edit path covered, the conflict rule, where the paste is stored, the exact research inputs, and every gate changed.
2. Every file changed.
3. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit.
4. The commit hash, branch, and worktree path.
5. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
