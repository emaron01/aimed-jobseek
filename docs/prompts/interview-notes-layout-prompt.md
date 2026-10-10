[BUILD + DEPLOY] Interview Notes: cleaner layout, outcome saves with the note, guide button moved

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Production-grade code using the app's existing button, box, and form patterns. No temporary fixes.

NO STACKING, NO CONFLICTS
Edit the existing Interview Notes components (InterviewStagesSection, StageInterviewerSection, and related) in place. Reuse the existing light orange "I have a new interview!" button style and the existing Update Interview Prep Guide action (queueInterviewPrepGuide); do not create a second version of either. Remove the separate "Save outcome" button and its action and tests if nothing else uses them. Report any overlapping code.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named ui/interview-notes-layout. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. Do not run a bare git push.

SURGICAL RULE
Change only the items below. No AI instruction, prompt version, paid call, job, or schema change. What "Save and Add Note to Interview Preparation Guides" does stays exactly as today. Existing notes, outcomes, and stages are not changed or deleted. This works the same on the full Interview Notes page and the dashboard panel.

CHANGE
1. The "I have a new interview!" button in the Interview Notes sentence uses the same light orange style as the main dashboard button.
2. Move "Update Interview Prep Guide" off Interview Notes. Put it on that person's Interview Preparation Guide (the person guide) and on that person's card in Interviewer Profiles, using the same existing action. "View Interview Prep Guide" stays on Interview Notes.
3. Saved notes for each interview sit inside one light yellow box, ordered oldest first, so the most recent note is directly above the new-note box.
4. Outcome saves with the note. Remove the "Save outcome" button and the separate "Saved outcome" display. Each interview reads top to bottom: Type, Date and time, Format; the saved notes (yellow box); then the Outcome dropdown (current value preselected, including "No outcome yet"); then the new-note box; then "Save and Add Note to Interview Preparation Guides", which saves the note and the outcome together. Saving only an outcome change with an empty note box
