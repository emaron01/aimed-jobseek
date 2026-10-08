[BUILD + DEPLOY] Interview Preparation Guides: rename, guide sections, primary cards

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Layout, labels, and order only. No paid calls, no instruction changes, no schema changes; nothing regenerates. Use existing design tokens and the existing white card with the thicker, darker outer border used on the Harper page; no new colors. Copy lives in the product config. Printing each section keeps working. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Reuse the existing section components (At a glance, General Questions, Interview Notes, person sections, Position, Company) and move them; do not duplicate their content builders. Remove the Interview stages section, with its code and tests that only cover it. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/prep-guides-layout. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Change nothing else.

ITEMS
1. Rename: every seeker-facing "Interview cheat sheet" / "Cheat Sheet" label (page title, sidebar, dashboard card, buttons such as "Regenerate cheat sheet", and links) becomes "Interview Preparation Guides" (for buttons, for example "Regenerate Interview Preparation Guides"). Rename the "Company" section to "Full Company Profile" everywhere it appears.
2. Each person's guide shows, in this order, each collapsible as today: At a glance; Interview Notes (all of this application's interview notes, newest first, with person and interview, read-only); What they care about; How to position yourself; Key statements; Likely questions; Questions to ask them; Full Company Profile. Print this section prints the whole guide in that order.
3. Page layout, as primary cards (white, thicker darker outer border), in this order:
   a. "Interview Personas": each person's guide as its own collapsed section inside this card, as today.
   b. "General Study Questions": the current General Questions content.
   c. "Consolidated Interview Notes": the current Interview Notes content.
   d. "Position": the current Position content.
   e. "Full Company Profile": the current Company content.
   At a glance is no longer shown on its own; it appears inside each person's guide.
4. Remove the "Interview stages" section from the page.

TESTS
Choose the minimum relevant tests that prove the new labels, the guide section order, the five primary cards in order, and that Interview stages is gone. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

DEPLOY (only if your checks pass)
Commit, push the branch, merge origin/main into it if it moved (STOP on any conflict), then fast-forward origin/main to it. Never force.

REPORT
What changed for each item, with file and line, code and tests removed, any overlapping code, the checks run and results, and main before and after.
