Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no try/catch around the hook, no disabling the component, no data repair, no migrations, no schema changes, no prompt changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Create a new branch from main (which now includes 68c8cc5) named hotfix/cheat-sheet-harper-providers. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the crash below. Change nothing else. Add no features. The product owner has approved deploying this fix to main in the same task once every check passes, because production is broken.

DEFECT (production, after deploying 68c8cc5)
The Interview Cheat Sheet page fails to render (the seeker sees a 404 or error page). Render logs:
Error: useHarperDraft must be used within HarperDraftProvider
    at <unknown> (.next/server/chunks/ssr/src_0zl7ce9._.js:1:26875)
    at J (.next/server/chunks/ssr/src_0zl7ce9._.js:1:15561) { digest: '3390951108' }
68c8cc5 made the Cheat Sheet render Harper's QuestionList and QuestionCard (ConsultationThread.tsx), which require HarperDraftProvider. The Harper page provides it (ConsultationSection wraps its content in HarperDraftProvider and HarperFilterProvider); the Cheat Sheet page does not.

FIX
1. List every React context hook used by QuestionList, QuestionCard, and everything they render (for example useHarperDraft, useHarperFilter, and any other), with file and line, and which provider each needs.
2. Wrap the Cheat Sheet's question areas (summary/page.tsx and anywhere CheatSheetCoachItems, AdditionalInterviewPrepQa, or CheatSheetPersonBody render QuestionList) in exactly the providers those hooks need, the same way the Harper page does, so drafts and filters behave identically. Do not change the components' behavior.
3. Check every other page or component that renders QuestionList, QuestionCard, CheatSheetCoachItems, or AdditionalInterviewPrepQa (including HarperPersonView) for the same missing-provider problem, and fix any found.

TESTS
Add automated tests that actually render (not source-text assertions) the Interview Cheat Sheet page's person section and coach items with Harper questions present, and the Additional Interview Prep Q&A, and assert they render without throwing and show Save Answer; and a test that fails if QuestionList is rendered anywhere without its required providers. Run the worker boundary test (--conditions=react-server). Run npm test (default parallelism, including real-Postgres tests), plus the exact production build, the full type check, and lint. All must pass with zero errors. Never change an existing test only to make it pass; report any test changed and why.

DEPLOY (only after every check above passes)
1. Commit on hotfix/cheat-sheet-harper-providers with a message naming the Cheat Sheet provider crash fix, and push that branch.
2. Run git fetch, confirm the branch contains main and the range contains only this commit plus docs-only commits; otherwise STOP and report.
3. Merge into main as a fast-forward and push main. If a fast-forward is not possible, STOP and report.

REPORT
1. Every context hook and its provider, with file and line.
2. Where the providers were added, and any other place fixed.
3. Every file changed.
4. Tests added or changed, with reasons for any changed existing test; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash, main before and after, and confirmation the merge was a fast-forward.
6. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside this fix changed.
7. What the product owner should check in Render: the build succeeded, both services are running, and the Interview Cheat Sheet loads and its questions can be answered.
