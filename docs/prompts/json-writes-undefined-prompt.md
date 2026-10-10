[BUILD + DEPLOY] Paid results: no AI result lost to undefined values anywhere; research refresh; confirm outreach deploy

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause everywhere it can occur, not only where it has failed so far. No temporary fixes, no fallback that hides an error.

NO STACKING, NO CONFLICTS
Reuse the existing paidCallResultJson helper (src/lib/ai/paid-call-gate.ts) for every save of parsed model output; do not write a second sanitizer. Edit the polling code in place. Remove code the fix replaces. Report any overlapping code, including c710750 (installStrictOptionalNullParsing) and normalizeAbsentNulls.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch first. Do all work in new worktrees from origin/main with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
No AI instruction, prompt-version, paid-call fingerprint, or schema change. If any is needed, STOP and report without deploying.

CONTEXT
fix/outreach-generate-end-to-end found that the parsed model result passed straight to a Prisma JSON write (PaidCallReceipt.resultJson), Prisma rejected undefined values, and the paid result was lost. It added paidCallResultJson (paid-call-gate.ts line 176) and used it before the receipt write and before saveOutreachVersion. c710750 (optional-null parsing, on main) omits null optional fields at parse time, so parsed results can now carry undefined values into any later JSON write.

CHANGE
1. Confirm whether fix/outreach-generate-end-to-end is on origin/main. If not, merge the latest origin/main into it and push it to main as a fast-forward (git push origin HEAD:main) before step 2. Report the main commit either way.
2. In a new worktree from the updated origin/main on branch fix/json-writes-undefined: list every place parsed model output (or anything built from it) is written to a Prisma Json column, for example ApplicationSummary.guidanceJson, persona and hiring-team JSON, CompanyResearch fields, contact profiles, product and profile JSON, consultation grounding, and application assets. For each, file and line, and whether undefined values can reach it. Pass each one that can through paidCallResultJson (or the one shared helper) right before the write.
3. Read-only SQL for the product owner to find recent failures of this kind: jobs and research runs that failed since c710750 was deployed, with error text, and UsageEvent SUCCESS rows with no matching saved result.
4. Polling: the workspace refresher must keep refreshing while employer research (ResearchRun PENDING or RUNNING) or any other real in-progress work is running, so a finished step shows without a manual reload, and stop when nothing is running. Report what the "stuck Harper GENERATING flag" is, why it can stay set, and fix it at the source if it is a defect.

TESTS
Choose the minimum checks that prove the change: a parsed result with an omitted optional field saves for each affected write; polling continues while research is running and stops when nothing is running; the GENERATING fix if made. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks (and only if the SURGICAL RULE did not stop it): merge the latest origin/main into fix/json-writes-undefined, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
Step 1 result and main commit; the full list from step 2 with what changed; the SQL; the polling and GENERATING findings and fixes; files and lines changed; which checks ran and why; any overlap found; and the main commit deployed (required).
