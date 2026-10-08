[BUILD + DEPLOY] Interview prep guide: "cares about" lines written about the interviewer by name

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Sentence structure only, not content. The instruction sentence below is approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate. No schema changes. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Find the existing instruction text for the person section's "what they care about" items (src/lib/prompt-content/application-summary.ts, mode "person") and any code that rewrites or prefixes those lines. Add the sentence there; do not add a second instruction or a code rewrite. Report any existing sentence that conflicts with it, quoted with file and line.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/cares-about-voice. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the item below. Change nothing else.

ITEM
Add exactly this sentence to the person-section instruction, where the "what they care about" items are described:
Write each "what they care about" item about this interviewer, using their first name (or their role when no name is known), and call the seeker "you", for example: "Ashley cares about whether your experience can transfer into Sift's fraud and digital-trust market without overstating direct fraud-platform experience."
"How your experience connects" lines are unchanged. Bump the person-section prompt version, and report what that triggers.

TESTS
Choose the minimum relevant tests that prove the sentence is in place and the version is bumped. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
The change, with file and line, any conflicting sentence found, the version bump and what it triggers, the checks run and results, and main before and after.
