[BUILD, REPORT] Ask Harper: accept every question an interviewer could ask

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix the root cause, for every kind of seeker. No instruction wording changes unless reported and approved first (exact current and proposed text, then STOP on that part). Every paid call stays behind the paid-call gate. No schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/ask-harper-questions. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the defect below. Do not merge or push main.

DEFECT (production)
The seeker asked Ask Harper: "Explain how pipeline is impacted by MEDDPICC?" Harper replied that this is not an interview question. Interviewers routinely ask knowledge, explain, how, why, compare, and walk-me-through questions, in every profession (for example "How do you prioritize patients during a busy shift?" or "Explain how you would design a REST API.").
1. Report exactly how Ask Harper decides a question is not an interview question (code rule or model instruction), with file and line.
2. Fix it so any question an interviewer could ask is accepted and answered, whatever its phrasing, with or without a question mark. Only requests that are clearly not interview questions (for example asking Harper to write the resume or unrelated requests) are declined. If the decision is in instruction text, propose the exact replacement and STOP on that part for approval.

TESTS
Choose the minimum relevant tests that prove explain, how, why, compare, and walk-me-through questions from sales, nursing, software, and new-graduate contexts are accepted, and a clearly non-interview request is still declined. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on fix/ask-harper-questions and push the branch. Do not merge or push main.

REPORT
1. How the decision was made before, with file and line, and the fix.
2. Any instruction change proposed (or STOP), with exact text.
3. The checks run and results, and the commit hash.
