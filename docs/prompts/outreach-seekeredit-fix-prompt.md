[BUILD + DEPLOY] Send Outreach: fix "could not be generated … seekerEdit: invalid_type"

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause. No fallback that hides the error, no retry loop, no default value added just to get past validation.

NO STACKING, NO CONFLICTS
Fix the existing outreach generate path in place. Remove any code the fix replaces. Report any overlapping code, including where seekerEdit / seekerEdited is defined and read across Harper, guides, and outreach.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/outreach-seekeredit. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Fix only this error. Outreach instructions, prompt versions, and the message content do not change. If the fix requires changing an AI instruction or prompt version, STOP and report before building.

CONTEXT
On the live Sift application (cmux4btmv0005p32prkebgtka), Send Outreach for Ashley Cobb (Sales Recruiter), Email, no instructions, Generate shows "The outreach message could not be generated. Retry. seekerEdit: invalid_type", both in a banner above the section and under the Generate button. It happens in the dashboard panel; check the full Send Outreach page too.

CHANGE
1. Find the root cause: which schema expects seekerEdit, what value it actually receives (missing, null, wrong type), whether it fails on the input built before the AI call or on the model's output, and which recent commit introduced it.
2. Fix it at the source so Generate works on both the dashboard panel and the full page.
3. Report whether a failed attempt made a paid call, and whether a retry repeats it.
4. When generation does fail, the seeker sees one plain message ("The message couldn't be generated. Please try again."), once, not the internal field error. The technical detail still goes to the server log.

TESTS
Choose the minimum checks that prove the change: Generate for an existing contact with no instructions succeeds against the fixed schema; a failure shows the plain message once and logs the detail. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks (and only if the SURGICAL RULE did not stop it): merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
The root cause with file and line, and the commit that introduced it; the fix; whether failed attempts made paid calls; files and lines changed; which checks ran and why; any overlap found; and the main commit deployed (required).
