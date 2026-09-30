Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root with shared mechanisms; no per-page patches, no temporary fixes, no data repair, no migrations, no schema changes, no prompt changes. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Work on fix/resume-page-and-draft-order (currently 2a1dc40), committing on top of it. If anything unexpected happens, STOP and report.
SURGICAL RULE
Fix only the three items below. Change nothing else. Add no features. Inline editing must never make a paid call or start a regeneration.
ITEM 1: Every application page learns when background work finishes
2a1dc40 mounted WorkspaceJobRefresh only on the assets focus. In production, the Send Outreach page also stayed on "Generating this Hiring Team role…" after the HIRING_TEAM_BUILD job (cmunjvaec001nly2o3juq3x93) and the following OUTREACH job (cmunjw0wf0005sz2qfyclltq1) both succeeded; the result appeared only after a manual refresh.
- Report every application page or focus (overview, company, job requirements, Harper, resume and cover letter, personas and interviewers, send outreach, interview stages, cheat sheet, and any other) and whether each currently mounts a job-completion refresher (WorkspaceJobRefresh, ApplicationWorkspaceLive, or other).
- Fix at the root: mount one job-completion refresher once at the application workspace level so every page of an application refreshes itself when any of its background work completes or fails, and remove the per-page duplicates so no page runs two. It must make no paid call and enqueue no job, and it must stop polling when no job is running.
- Keep the existing behavior: a spinner only while a job is PENDING or IN_PROGRESS, failure UI when a job fails, and gated skip messages.
ITEM 2: The earlier-experience heading is editable inline
The resume's "Earlier Sales Leadership Experience" heading comes from the presentation plan (PresentationPlan.earlierExperienceHeading), so no resume instruction can change it.
- Make that heading editable inline on the Resume and cover letter page, the same way other resume text is edited inline. Saving updates the stored heading and the displayed resume immediately.
- It makes no paid call and does not start or queue any regeneration. Report whether editing it changes the fingerprint used by a later seeker-initiated regeneration, and confirm that nothing regenerates automatically because of it.
ITEM 3: Inline editing works on every version, not only the original
DEFECT: inline edits are only possible on the original resume version; after a regeneration, the seeker cannot edit the version they are viewing.
- Report how inline editing is bound today (to which version, and why later versions are not editable), with file and line.
- Fix at the root so inline editing works on the version being viewed (including the newest version, which is shown first). Saving an inline edit updates that version's text and makes no paid call and no regeneration. Report whether an edit updates the viewed version in place or saves a new version, and keep whichever the existing inline-edit design uses for the original, applied consistently to every version.
- Apply the same to the cover letter if it has the same limitation.
TESTS
Add automated tests that assert:
- Every application page is covered by exactly one job-completion refresher mounted at the workspace level; after a job for any page completes or fails, that page updates without a manual refresh (at minimum Send Outreach persona build then outreach, Resume and cover letter, Personas, Harper, Cheat Sheet, company research); polling stops when no job is running; no page runs two refreshers.
- The refresher and status checks make no paid call and enqueue no job.
- The earlier-experience heading can be edited inline, saves, displays immediately, and makes no paid call and no regeneration.
- Inline editing works on the newest resume version (and the cover letter, if applicable), saves without a paid call or regeneration, and behaves the same as editing the original.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If a test fails only under full-suite load and passes alone, report it by name as a flake; do not change it to pass. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/resume-page-and-draft-order with a message naming the workspace-wide refresher, inline heading, and inline editing on every version, and push that branch. Do not merge into main or push main.
REPORT
1. ITEM 1: the page table (before), the fix, with file and line, and confirmation no page runs two refreshers.
2. ITEM 2: the inline heading, with file and line, and the fingerprint effect.
3. ITEM 3: the cause, the fix, whether edits update in place or save a new version, and the cover letter finding.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
6. The commit hash and branch pushed.
7. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside these three items changed.
