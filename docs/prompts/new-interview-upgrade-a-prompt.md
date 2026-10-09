[BUILD + DEPLOY] New interview: full Type list, pick an existing person, Interview Notes becomes notes only

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Follow docs/prompts/new-interview-upgrade-report.md (branch report/new-interview-upgrade). Production-grade code; no temporary fixes.

NO STACKING, NO CONFLICTS
Extend the existing NewInterviewForm / buildNewInterviewAction / buildNewInterviewPrep path. Reuse createInterviewStage and queueInterviewPrepGuide; do not add a second scheduling path. Remove the two retired Notes controls, their schedule fields, and tests that only cover them. Keep note add, edit, and view, createInterviewStage, contact create, and Harper's separate add-contact action. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named feat/new-interview-upgrade-a. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only the items below. No schema change, no AI instruction or prompt-version change, no new paid call. Existing contacts, stages, and notes are not changed or deleted. Optional email, LinkedIn URL, and pasted profile are NOT part of this prompt.

CHANGE
1. Who. The form starts with a choice: someone already on this application (a list of this application's contacts) or a new person (the current title, role, and optional name fields). Picking an existing person never creates a contact: skip addApplicationContact, pass the selected contact to createInterviewStage (when scheduling) and to queueInterviewPrepGuide. An unchanged guide is not regenerated (existing fingerprint gate).
2. Type. Type sits with date and format: Recruiter screen, Hiring manager, Panel or competency, Executive, Other. It is pre-filled the way the code picks it today (recruiter or talent acquisition in the title or role means Recruiter screen, otherwise Other) and can be changed. Date, format, and type together schedule the interview (one InterviewStage row). If date or format is left blank, no interview is scheduled: a new person is added and their guide queued as today, and an existing person gets no new stage. Show one short hint under those fields: "Add a date and format to schedule this interview. You can schedule it later by picking this person."
3. Interview Notes becomes notes only. Remove "Add someone you're meeting" and the per-person "Add Follow-up Interview", with their schedule fields. In their place, one line: "Have a new interview? Use I have a new interview! on the Application Dashboard," linking to the dashboard. Adding, editing, and viewing notes stays exactly as today.

TESTS
Choose the minimum checks that prove the change: picking an existing person creates no contact and creates one stage with the chosen type when date and format are set; no date creates no stage; a new person still creates one contact and queues one guide; an unchanged guide is not regenerated; the two Notes controls are gone and notes can still be added and edited. Plus type check, lint, and build. No full suite. If a test file fails, re-run it once; if it fails again, stop and report. A local database outage is not a code failure.

DEPLOY
On passing checks: merge the latest origin/main into the branch, then push to main as a fast-forward (git push origin HEAD:main). If it is not a fast-forward, stop and report. Confirm the deploy happened and report the main commit.

REPORT
Files and lines changed; what was removed; how a picked person avoids contact creation; which checks ran and why; any overlap found; and the main commit deployed (required).
