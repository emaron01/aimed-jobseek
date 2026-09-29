Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the four items below, per Parts D to G of docs/prompts/overnight-remaining-punch-list-report.md, re-verified against the current code (main at 4ed6d56). Change nothing else. Nothing may run on a page view. Add no features.

ITEM 1: Remove the legacy merge from page loads (Part E)
mergeExistingHiringTeamRoles runs on the application workspace and campaign page loads and changes the database.
- Report every page-load call site and what it changes today, with file and line.
- Remove it from every page load. Keep it where hiring team identification sync runs (or move the still-needed behavior there), so the merge still happens whenever roles are identified or re-identified.
- Add tests: rendering the workspace and campaign pages performs no hiring-team merge and no database write from it; identification sync still merges as before.

ITEM 2: Full application name in the sidebar (Part F)
The application name is cut off by CSS truncation in ApplicationSidebarTracker.tsx (about line 241, w-56 column).
- Show the name wrapped to at most 2 lines, with the full name available on hover (title attribute), without widening the sidebar or breaking its layout at desktop and mobile widths.
- Add a test that the full name is present in the rendered output (text or title) and the 2-line limit is applied.

ITEM 3: Cost reporting accuracy (Part G)
- Report how usage events record provider and model, and how cost is resolved from AiModelRate (resolveRate or equivalent), with file and line.
- Fix the read path so events recorded with provider "openai-responses" match their correct model rates instead of falling back to a wildcard or zero. Do not change what is sent to any provider, what is billed, or how events are written, except item 3c.
- 3c. The thank-you clarifying questions call currently records usage under the operation "INTERVIEW_GUIDE" (outreach.ts about line 907), a leftover from the removed interview guide. Record new events under a correctly named operation for the thank-you clarify call (report the name, and add it to any operation catalog or type it must be in). Keep existing events readable exactly as they are.
- Add tests: an openai-responses event resolves to the correct model rate; a thank-you clarify call records the new operation; existing INTERVIEW_GUIDE events still resolve.

ITEM 4: Ignore end-to-end test (Part D)
- Add a real-Postgres test through the database and worker path: the seeker ignores a Harper question; subsequent planning, a continue round, and a learnings reassess never ask it again or a near-duplicate of it; clicking Ignored reopens it (per Batch A) and it can be answered.
- Report the "skipped versus ignored" gap noted in the overnight report (askedAndSkipped or skipped handling): what it is, with file and line, and whether it can cause a skipped or ignored question to be re-asked. If it can, fix it at the root and test it. If a fix would change the product's Skip behavior ("Skip = later"), STOP on that part and report for approval.

TESTS
Add the tests listed in each item. Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming the final small items, and push that branch. Do not merge into main or push main.

REPORT
1. ITEM 1: page-load call sites removed, and where the merge now runs.
2. ITEM 2: the change and how the layout is preserved.
3. ITEM 3: the rate resolution fix, the new operation name, and confirmation nothing billed or sent changed.
4. ITEM 4: the test, and the skipped versus ignored finding and any fix or stop.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that no git command discarded work and nothing outside these four items changed.
