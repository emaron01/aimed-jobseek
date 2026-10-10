[BUILD, REPORT] Outreach: applied status and before/after figures reach the message

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Find the root cause in the code on the latest origin/main (the outreach input trim, 2141036) and fix it there. No temporary fixes.

NO STACKING, NO CONFLICTS
Change buildOutreachAssetMessages and its selection helpers (src/lib/application-assets/prompt.ts) in place. No second builder, flag, or fallback. Remove code and tests that only cover replaced behavior. Report any overlapping code or instruction text.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/outreach-applied-and-figures. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only the items below. Every seeker source stays equally valid; selection stays by relevance only. Any change to instruction text must be given as exact proposed text in the report and not applied, except item 3. Do not deploy.

CONTEXT
After the trim, a first email to Ashley Cobb (Sales Recruiter) on the Sift application (cmux4btmv0005p32prkebgtka), where Application Status is "Applied", did not mention that the seeker applied. Its proof point said "reducing forecast deviation to between 5%-10% quarterly", while the seeker's own answer says deviation was 20% before and improved to 5–10%. The before figure was lost.

CHANGE
1. Applied status: trace whether application:status and the "whether they applied" control were sent for this email, and why the message did not mention it. Fix the input so the applied status is always sent when the seeker has applied, for every outreach type. If the instruction text needs a line telling the model to say the seeker applied when writing to a recruiter or hiring manager, give that exact proposed text in the report.
2. Before and after figures: find which seeker source supplied the proof point and why the 20% baseline was dropped (single story field chosen, character cap, or something else). Fix the excerpting so a fact that states a change keeps both the starting and ending figures (for example, a story excerpt that includes the situation's baseline with the result), within the existing caps.
3. Email rules 10 and 11 in src/lib/prompt-content/outreach.ts both contain "Match the seeker's voice from the supplied voice sample and the seeker facts in citableSources." Keep it once (rule 10) and remove the duplicate from rule 11, leaving the rest of rule 11 unchanged.
4. Bump the outreach prompt versions from "6" to "7" and report the fingerprint changes.

TESTS
Choose the minimum checks that prove the change: the built input for the Sift / Ashley Cobb email includes the applied status; the selected proof fact keeps both the 20% baseline and the 5–10% result; the duplicate voice sentence appears once; the input stays under the existing caps. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

REPORT
The root cause for items 1 and 2 with file and line; the fixes; any proposed instruction text (not applied); the new input size for the Sift / Ashley Cobb email; versions and fingerprints changed; files and lines changed; which checks ran and why; any overlap found; and the branch and commit. Do not merge or deploy; this deploys after owner review.
