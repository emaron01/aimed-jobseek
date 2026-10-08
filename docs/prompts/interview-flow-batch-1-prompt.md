[BUILD, REPORT] Interview flow batch 1: read-only Hiring Team page, no persona nudges, outreach builds the role on click

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Per docs/prompts/interview-flow-report.md (branch report/interview-flow) and the product owner's decisions: personas run in the background; roles are built only when something the seeker clicks needs them (Create Interview Prep Guide already does this; Send Outreach will too). No relationship field. Every paid call stays behind the paid-call gate and runs only on a seeker click, never on page view; a role already built is reused, never paid twice. No instruction wording changes. No schema changes. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Reuse the existing role build (rebuildApplicationHiringTeamRole and isHiringTeamPersonaBuilt) exactly as the prep guide uses it; do not add a second build path. Remove the persona Approve control and its code, and tests that only cover it. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/interview-flow-1. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not merge or push main.

ITEMS
1. Read-only Hiring Team page: the Personas and Interviewers page shows each role with its name, two or three lines on its responsibilities (from existing stored role data; no model call), whether it has been researched, and who is mapped to it. Remove Approve. Hide the per-role Generate controls. Editing a role's name, titles, and notes stays available.
2. No persona nudges: the dashboard step "Personas and Interviewers" no longer counts unbuilt roles or shows "Your turn" for them; it is Done when roles have been identified, with its button opening the Hiring Team page.
3. Outreach builds the role on click: when the seeker generates an outreach message for a role that is not built, the same click builds the role first (one paid call), then writes the message, with the existing spinner. A built role is reused.
4. Read-only addition to the report (no change): quote verbatim the current instruction text that produces a person guide's "Likely questions", and the code that reuses existing Harper questions as likely questions (for example likely-questions-from-general), with file and line, and explain in plain sentences how a guide's likely questions are chosen today.

TESTS
Choose the minimum relevant tests that prove: the page shows no Approve or Generate and makes no model call; the dashboard step no longer counts unbuilt roles; generating outreach for an unbuilt role builds it once and then writes, and for a built role makes no build call. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on feat/interview-flow-1 and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, and code and tests removed.
2. Paid calls per outreach click, before and after.
3. Item 4: the verbatim likely-questions instruction, the reuse code, and how likely questions are chosen today.
4. The checks run and results, and the commit hash.
