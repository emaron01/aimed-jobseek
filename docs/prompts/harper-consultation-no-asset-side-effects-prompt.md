Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no Harper prompt changes. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Uncommitted B4 work on checkpoint/harper-prep-hub must not be touched. Work on fix/harper-standing-structure. If anything unexpected happens, STOP and report.
SURGICAL RULE
Correct only ITEM 4 of the Harper standing structure work (commit c41d2b3 on fix/harper-standing-structure). Change nothing else. Add no features.
PRODUCT OWNER DECISIONS
1. Nothing in the Harper consultation starts resume or cover letter generation. Resumes and cover letters are generated only when the seeker chooses to, from the Resume and cover letter page. This includes automatic completion (the auto-DONE path in service.ts about lines 1486-1491 that calls queueAssetsWhenConsultationEnds), completeConsultation, skipConsultation, and any other consultation path that calls queueAssetsWhenConsultationEnds, queueAssetsForCampaign, or enqueueAssetsAfterConsultation.
2. Harper is an ongoing prep hub, not a session that ends. A consultation that reaches DONE (automatically or otherwise) must still accept replies, edits, follow-ups, new gap questions from a learnings reassess, and role-expertise questions, exactly as while IN_PROGRESS.
INVESTIGATE, THEN FIX (report each with file and line)
1. Every call site that enqueues resume, cover letter, or other asset generation from any consultation state change, and remove each such call so assets are never started by the consultation. Keep the Resume and cover letter page's own generate actions unchanged.
2. Every place that refuses or ignores seeker input, questions, or reassessment when the consultation is DONE or SKIPPED (for example processConsultationReply, recordConsultationReply, edit, drain, planAndStoreRound, reassess, role-expertise fill, and UI gates). Fix so DONE never blocks any of them. Report what SKIPPED does today.
3. The pre-start "Skip consultation" control: report what it does (state change, whether it enqueues assets, whether the seeker can start Harper later). Remove any asset enqueue from it. Do not remove the control itself; report it for the product owner's decision.
4. Report what the sidebar step color and next-step logic use DONE for, and confirm they still behave correctly.
TESTS
Add automated tests that assert:
- Automatic completion, completeConsultation, and skipConsultation enqueue no resume, cover letter, or other asset job.
- After a consultation reaches DONE, a reply is processed normally, an edit works, a learnings reassess adds questions, and role-expertise questions can be answered.
- The Resume and cover letter page's generate actions still work.
- The sidebar step color and next step behave as before.
Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.
COMMIT
After everything passes, commit on fix/harper-standing-structure with a message naming the consultation asset side effect and DONE fixes, and push that branch. Do not merge into main or push main.
REPORT
1. Every asset enqueue call site found and removed.
2. Every DONE or SKIPPED gate found and how it was fixed, and what SKIPPED does.
3. The pre-start Skip consultation findings.
4. Sidebar and next-step findings.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
7. The commit hash and branch pushed.
8. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside ITEM 4 changed.
