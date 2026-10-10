[BUILD + DEPLOY] Outreach: approved wording, then deploy the input trim

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Apply the owner-approved instruction wording on top of the reviewed trim (feat/outreach-input-trim, 5cfcf7d), then deploy. No other changes.

NO STACKING, NO CONFLICTS
Replace the listed lines in src/lib/prompt-content/outreach.ts in place. Do not add new rules beside the old ones. Report any other instruction line that still limits proof or voice to one kind of seeker source.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Work in the existing feat/outreach-input-trim worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only these instruction lines. Prompt versions stay at "6" (already bumped on this branch). No other code change.

CHANGE
1. src/lib/prompt-content/outreach.ts line 15: replace with exactly "Use at most one strong proof point, from any seeker fact in citableSources. Do not invent metrics or titles."
2. Line 32: replace with exactly "One proof point only, from any seeker fact in citableSources. Cite it from citableSources. A short paraphrase is better than pasting a long quote when space is tight."
3. Line 48: replace with exactly "One proof point only, from any seeker fact in citableSources."
4. Lines 18 and 19, and the matching LinkedIn note and InMail voice rules (lines 35 and 51): replace with exactly "Match the seeker's voice from the supplied voice sample and the seeker facts in citableSources."

TESTS
Choose the minimum checks that prove the change: the live outreach instructions contain the new lines and none of the replaced wording; outreach-input-trim.test.ts still passes. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into feat/outreach-input-trim, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
The final instruction lines as shipped; any other line found from the NO STACKING check; which checks ran and why; and the main commit deployed (required).
