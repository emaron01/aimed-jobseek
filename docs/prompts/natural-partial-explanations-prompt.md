[BUILD + DEPLOY] Harper: natural Partial explanations, then ship gap-draft quality

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix root causes. No instruction wording changes. Every paid call stays behind the paid-call gate. No schema changes or data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Work in the fix/gap-draft-quality worktree, on top of its latest commit. If anything unexpected happens, STOP and report.

SURGICAL RULE
Change only the two items below, then deploy the branch. Change nothing else.

ITEMS
1. Remove the templated explanation rewrite (explanationAlignedToStrength in src/lib/consultation/assess.ts and its use), so code never writes "Supported: ... Missing: ..." text. Instead, when a stored explanation contradicts its target's final strength (for example it says the requirement is fully met while the strength is Partial), re-run the planning writing step once for only that explanation, using the existing qualityFeedback field-rewrite mechanism, behind the paid-call gate. If the rewrite still contradicts, keep the rewritten text and log it. Report the contradiction check and the retry, with file and line.
2. Older applications: confirm, with a test using stored data in the older shape from before these changes (an application with existing gap questions, drafts, and approved answers, like the seeker's CSC application cmuna46te0019r52o11wi0zm0), that rows with questions, drafts, and approvals render correctly in the new layout, with nothing lost or duplicated.

TESTS
Choose the minimum relevant tests that prove both items (no templated explanation text anywhere; a contradicting explanation triggers one field rewrite; an older-shape application renders correctly). Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
1. Both items, with file and line.
2. The checks run and results, and main before and after.
