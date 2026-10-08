[BUILD, REPORT] Interview flow: "I have a new interview!" on the dashboard, Prep by Title, name upgrade

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Per docs/prompts/interview-flow-report.md (branch report/interview-flow), with the product owner's decisions: no relationship field (the guide infers relationship from titles); roles are built only when a click needs them. For every kind of seeker. Every paid call stays behind the paid-call gate and runs only on "Build my prep guide"; nothing runs on page view; same inputs never pay twice. No schema changes: the contact name becomes optional in code (the columns are already optional); if anything else needs a schema change, STOP and report before changing it. No instruction wording changes. Use existing components, design tokens, and the existing live spinner. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Reuse the existing paths: addApplicationContact, the interview stage creation used by Interview Notes, matchHiringTeamRoleFromTitle, assignApplicationContactToPersona, the existing role creation (database write, no model call), and queueInterviewPrepGuide. The dashboard form and Interview Notes' "Add someone you're meeting" call the same server code; do not add a parallel path. Remove anything this replaces and tests that only cover it. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/new-interview-flow. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not merge or push main.

ITEMS
1. Button: on the Application Dashboard, directly below the application summary card, a large green button labeled exactly "I have a new interview!".
2. Inline form: clicking it rolls down a form in place (no new page, no URL hash), starting with exactly "Congratulations on making it to the next stage!" Fields: their title (required; as the seeker types, show matching roles from this application's Hiring Team via the existing matcher), their name (optional), and date and time and format (optional). Buttons: "Build my prep guide" and "Cancel".
3. Build: "Build my prep guide" saves the contact (name optional), maps it to the matched role, creates the Interview Notes entry when date and time and format are all given (using the existing default interview type; report which), and queues the person guide through queueInterviewPrepGuide (which builds the role first if needed). If no role matches, show the existing roles in a dropdown plus "Create a new role from this title"; choosing that creates the role from the title (no model call) and continues.
4. While it runs, the form area shows the existing spinner with "Harper is preparing your guide…". When done, it shows "Your prep guide for {name, or title when no name} is ready" with a "View guide" button that opens that guide on Interview Preparation Guides.
5. Prep by Title: on Interview Preparation Guides, a new primary card titled exactly "Prep by Title", placed after "Interview Personas", lists guides for contacts with a title and no name, each built and shown like a person guide.
6. Name upgrade: adding a name to a title-only contact later (from the guide or Interview Notes) moves its guide into Interview Personas under that name, keeps the same guide and any approved or edited answers, and makes no paid call when the name is the only change.
7. Safety: the open form keeps everything typed through the dashboard's live refresh; opening, submitting, and finishing never move the page; clicking "Build my prep guide" twice creates one contact, one interview, and one guide; the form stacks to one column on narrow screens.

TESTS
Choose the minimum relevant tests that prove each item: a title-only contact is saved and gets a guide in Prep by Title; a named contact gets a person guide; no match offers the role dropdown and creating a role makes no model call; the interview entry is created only when date, time, and format are given; a double click creates one of each; the form keeps typed input across a refresh; adding a name later makes no paid call and moves the guide. Use sales, nursing, and new-graduate fixtures where relevant. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on feat/new-interview-flow and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, and code and tests removed.
2. The default interview type used, and how the title-only guide is stored and upgraded.
3. Paid calls per "Build my prep guide" click, and when none is made.
4. Any overlapping code, the checks run and results, and the commit hash.
