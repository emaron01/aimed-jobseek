[BUILD + DEPLOY] Dashboard cleanup: one section open, Close buttons, resume bullets, question counts, lighter refresh

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Production-grade code using the app's existing button, panel, collapsible, and step-progress patterns. No temporary fixes.

NO STACKING, NO CONFLICTS
Reuse the existing dashboard panel pattern (DASHBOARD_IN_PLACE_STEP_KEYS, the open query, ApplicationStepCards, DashboardOpenSection), step-progress.ts for counts and states, and the existing workspace refresher and trackers. Do not add a second open-state mechanism, counting path, or poller. Remove code this change replaces, including "Open full page", the unused old Interview Notes labels in product config, and the extra pollers, and tests that only cover them. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named ui/dashboard-cleanup. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only the items below. No AI instruction, prompt version, paid call, job, schema, or data change. The full step pages keep working as today.

CHANGE
1. One section open at a time on the Application Dashboard. Clicking a numbered step card (or "Your next step") closes whatever section is open and opens the one clicked, in one click. Clicking the open card's own button still closes it. The open query holds one step at a time; old links with several open steps open only the first.
2. Close buttons (top and bottom of every open panel): light red background, readable dark red text, labeled "Close {section name}" (for example "Close Job requirements"). Clicking still collapses the panel exactly as today.
3. Remove "Open full page" from every dashboard panel. The full pages and their other links stay.
4. Resume bullet points: make the bullet-point section collapsible. When the resume is approved it starts collapsed; otherwise it starts open. The seeker can open or close it either way.
5. Remove the old Interview Notes labels left in product config that are no longer rendered (from 7cf5690), if nothing else uses them.
6. Unanswered guide questions. First report where the Harper card's current count ("5 questions need your answer" on the Sift application, cmux4btmv0005p32prkebgtka, with no open Harper questions) comes from. Then:
   - The Harper Questionnaire card counts only Harper's own questions.
   - The Interview Preparation Guides card (step 9) shows the yellow "Your turn" state with "N questions to answer" while any guide question is unanswered, instead of Done.
   - On the Harper page, under General questions, add "Remaining Interviewer Profile Questions": one line per person with their count, linking to that person's guide at the first unanswered question. Link only; do not copy the questions onto Harper.
   - Counting rule for both: unanswered and skipped count; approved and ignored do not.
7. Lighter refresh. Replace the separate pollers (sidebar tracker, compact tracker, workspace refresher) with one shared status check that runs every 3–5 seconds only while work is running (an application job PENDING or IN_PROGRESS, research queued or researching, or the posting parsing), reads only job and research status, and refreshes the page once when something finishes. It never enqueues a job or makes a paid call.

TESTS
Choose the minimum checks that prove the change: a second step card closes the first and opens the second; Close shows "Close {section name}"; no panel shows "Open full page"; resume bullets start collapsed when approved; the Harper count excludes guide questions and step 9 shows "Your turn · N questions to answer" while guide questions are unanswered; the Remaining Interviewer Profile Questions links go to the right person's guide; one poller runs only while work is running, at 3–5 seconds, and stops when idle. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
Where the old Harper count came from; how each item was done; the poller that remains, its interval, and what it reads; files and lines changed; what was removed; which checks ran and why; any overlap found; and the main commit deployed (required).
