[BUILD + DEPLOY] Outreach: applied sentence, before/after for any figure, then deploy
Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.
PRODUCTION STANDARD
Finish the reviewed work on fix/outreach-applied-and-figures (bfccc3f) and deploy. No temporary fixes.
NO STACKING, NO CONFLICTS
Edit the existing builder and instruction lines in place. Remove code this change replaces. Report any overlapping code or instruction text.
GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Work in the existing fix/outreach-applied-and-figures worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.
SURGICAL RULE
Change only the items below. Prompt versions stay at "7" (already bumped on this branch).
CHANGE
1. Owner-approved instruction text. Add exactly this sentence to email rule 6, LinkedIn connection note rule 5, and InMail rule 5 in src/lib/prompt-content/outreach.ts: "When mentionApplied is true and the recipient is a recruiter or hiring manager, say that the seeker applied, and cite application:status."
2. Undo the change that attaches application:status whenever it exists (prompt.ts lines 708–715 and 745–747). Attach it only when mentionApplied is true, as before. When the seeker has not applied, no application:status is sent; mentionApplied stays false so the existing "never mention applying" rule still applies.
3. Before and after figures: the excerpt rule in selectOutreachSeekerMaterial (prompt.ts lines 293–308, and the cap handling at 123–149) currently pairs the situation and result only when each has a percentage the other lacks. Make it apply to any figure: percentages, dollar amounts (including MM/K), counts, ratios such as "3 of 4", and plain numbers. Same caps.
4. Confirm whether "STORY_SITUATION_MARKER" in the selected proof text comes from test fixture data or from production code. If production code adds it to anything sent to the model, remove it at the source.
TESTS
Choose the minimum checks that prove the change: the three instruction rules contain the new sentence; application:status is sent only when mentionApplied is true, and an application not marked Applied sends no status; a story with a dollar baseline and result (and one with "3 of 4") keeps both figures; no marker text reaches the built input. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.
DEPLOY
On passing checks: merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.
REPORT
The final instruction lines; how application:status is now attached; the figure rule as built; the STORY_SITUATION_MARKER finding; files and lines changed; which checks ran and why; any overlap found; and the main commit deployed (required).
