[BUILD, REPORT] Interview prep guides: questions chosen by who the interviewer is

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
For every kind of seeker. The instruction text below is approved exactly as written; no other instruction wording may change. The existing sampleAnswer, harperQuestion, interviewTypeTag, and answer-framework rules stay exactly as they are. Every paid call stays behind the paid-call gate and runs only on Create or Update Interview Prep Guide. No schema changes. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Replace the existing sentences, do not add beside them. Change the existing merge (mergePersonLikelyQuestions) instead of adding a second one. Remove code and tests that only cover the replaced behavior. Report any overlapping code or instruction text.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/guide-questions-by-person. If origin/main does not include feat/interview-flow-1, STOP and report. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the two items below. Do not merge or push main.

ITEMS
1. Instruction: in the person-section likelyQuestions instruction (src/lib/prompt-content/application-summary.ts, the sentences beginning "You are given Harper's General questions for this application." through "Do not include questions outside their area."), replace those sentences with exactly:
You are given Harper's General questions for this application. Choose the 4 to 12 questions this interviewer is most likely to ask, most likely first, based on who they are: their title and function, and their relationship to the job being interviewed for, inferred from their title and the job's title (for example the hiring manager or a more senior leader, a peer, someone this role would lead, a cross-functional partner, or a recruiter). A recruiter or talent-acquisition interviewer covers the standard screen (why this company, why you are leaving or looking, motivation, compensation expectations, timing, and logistics) along with high-level qualifying questions about the job's core requirements, such as scope, team size, and approach. Use one of Harper's General questions (by id) only when this interviewer would genuinely ask it; otherwise write the question from this interviewer's perspective. Do not include questions outside their area.
Keep the rest of the likelyQuestions instruction unchanged. Bump the person-section prompt version, and report what that triggers.
2. Update replaces, but keeps the seeker's: when a guide is updated, its likely questions become the new set, except that any likely question the seeker has edited, answered, or approved is kept. Unedited, unapproved questions from the previous run are dropped instead of accumulating.

TESTS
Choose the minimum relevant tests that prove the instruction text is exact, an update drops unedited prior questions and keeps edited or approved ones, and a recruiter fixture's prompt includes the screen and qualifying guidance. Use sales, nursing, and new-graduate fixtures where relevant. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on fix/guide-questions-by-person and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, and code and tests removed.
2. The version bump and what it triggers.
3. Any overlapping code or instruction text.
4. The checks run and results, and the commit hash.
