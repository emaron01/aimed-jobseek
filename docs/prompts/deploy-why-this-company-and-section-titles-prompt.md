Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. The only AI instruction change allowed is the approved text below. Deploy only work whose full test suite, worker boundary test, production build, type check, and lint pass, run against exactly the commit being deployed, in its worktree. This deploy includes one migration; confirm it is safe before pushing. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, rebase, or any command that discards or moves uncommitted work. Do not touch the uncommitted edits in C:/Repos/aimed-jobseek-ui-batch-1 or the untracked files in C:/Repos/aimed-jobseek. Work in C:/Repos/aimed-jobseek-company-website-anchor on fix/company-website-anchor (at a39476f), committing on top of it. If anything unexpected happens, STOP and report.

SURGICAL RULE
Apply only the two approved changes below, then deploy. Change nothing else. Add no features.

ITEM 1: Approved why-this-company instruction
In src/lib/prompt-content/consultation.ts, replace the why-this-company instruction (currently: "When whyThisCompany is true: the answer is motivation for wanting this company, not a work story. Write one first-person interview answer to "Why do you want to work here?" using only that motivation. resumeBullet is always null. Do not invent a work story or a resume bullet.") with exactly:
When whyThisCompany is true: the answer is motivation for wanting this company, not a work story. Write one first-person interview answer to "Why do you want to work here?" using that motivation. When companyResearch is supplied, connect the person's motivation to the part of the company this job serves, using the company highlights as context. Company facts may come only from companyResearch; never invent them. Facts about the person come only from their answer and Personal Profile. resumeBullet is always null. Do not invent a work story or a resume bullet.
Change no other wording. Bump the prompt version per convention and report exactly what the bump triggers. Nothing may rerun on its own or on a page view.

ITEM 2: Approved section titles
In src/lib/product-config/vocabulary.ts, set the tailored research section titles to exactly "Company highlights", "Where this job fits", and "In depth".

TESTS
Add or update automated tests that assert the exact why-this-company instruction text, that the why-this-company polish receives companyResearch, and the exact three section titles on the application company section and the Cheat Sheet company section. Run npm test (default parallelism, including real-Postgres tests), then the worker boundary test (--conditions=react-server) separately, npx tsc --noEmit, the exact production build, and lint, in the worktree after the final edit, with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only if every check above passes with zero errors)
1. Commit on fix/company-website-anchor with a message naming the approved why-this-company instruction and the research section titles, and push the branch.
2. Run git fetch. Report origin/main's commit. If fix/company-website-anchor does not contain origin/main, merge origin/main into it (merge, not rebase); if there is any conflict, STOP and report; then rerun every check above at the merged tip and STOP on any failure.
3. Confirm the only non-merge commits in origin/main..fix/company-website-anchor are 4612bb7 (required company website and anchored research), 3747192 (tailored research per application, approved brief, source filtering, search cap), a39476f (downstream use of tailored research), and this commit. Otherwise STOP and report.
4. Confirm the only migration in the range is prisma/migrations/20261003140000_application_employer_research (the additive ApplicationEmployerResearch table, with no changes to existing tables or data). Report its SQL. Confirm the Render pre-deploy step (scripts/render-pre-deploy.mjs) applies it with prisma migrate deploy and that it is safe on the existing production database.
5. Fast-forward origin/main to the tip of fix/company-website-anchor by pushing it to main (fast-forward only; never force). If a fast-forward is not possible, STOP and report.
If any check fails, do not deploy: report the failure and leave the branch pushed.

REPORT
1. ITEM 1: the instruction before and after, and the version bump with what it triggers.
2. ITEM 2: the titles, with file and line.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; each check's command, exit code, and result, run after the final edit (and after any merge).
5. The commits and the migration in the range, with the migration SQL and safety confirmation.
6. main before and after (commit hashes), and confirmation the push was a fast-forward (or that nothing was deployed, and why).
7. Confirmation that no other worktree's uncommitted or untracked work was touched, no git command discarded work, and nothing outside these items changed.
8. What the product owner should check in Render: the build succeeded, the pre-deploy migration succeeded, both services are running, a new application requires a company website, and after research runs, the company section shows Company highlights, Where this job fits, and In depth with citations.
