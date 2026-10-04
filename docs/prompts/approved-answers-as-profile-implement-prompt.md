Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only, per batches 1 to 3 of docs/prompts/approved-answers-as-profile-plan-report.md on branch plan/approved-answers-as-profile, with the decisions below. No schema changes, no data repair. Every paid call stays behind the paid-call gate. Nothing runs on a page view or reruns on its own. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git restore, git clean, git stash, git stash drop, force-push, or any command that discards or moves uncommitted work. Do NOT use C:/Repos/aimed-jobseek. Do not touch any other branch or worktree. Run git fetch, then create a new worktree and a new branch from origin/main named feat/approved-answers-as-profile. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only batches 1 to 3 below. Do not build batch 4 (automatic gap drafts). Do not merge into main or push main. Change nothing else.

DECISIONS
1. Batch 1 (selector): select the seeker's approved answers from other applications as evidence, at most one per current target, newest approvedAt wins when two match the same target by sameRequirementMeaning; exclude this application's own statements, empty content, STAR fields, why-this-company answers, and other campaigns' whyThisCompany. Each item carries an approved:<statementId> id, the question, the content, approvedAt, and the source application.
2. Batch 2 (planning): pass the selection to the terra decision beside personalProfileItems, and allow the approved:<statementId> ids in supportingFactIds. Add to the decision instructions exactly:
approvedAnswers are answers the person already approved in other applications. Treat them as stated by the person, like the Personal Profile. Rate a target they fully cover STRONG and do not ask about it. For a PARTIAL target, ask only for the missing piece. Never use another company's why-this-company answer as evidence.
Add to the writing instructions exactly:
You may cite approvedAnswers ids in supportingFactIds. Facts about the person may come only from the Personal Profile and approvedAnswers.
Bump CONSULTATION_PLAN_DECISION_PROMPT_VERSION and CONSULTATION_PLAN_WRITING_PROMPT_VERSION.
3. Batch 3 (drafting): best-practice answers, Ask Harper, and gap polish receive the selected list instead of one match. Replace the sentence that tells the model to replace anything about the previous company with this company's information (in the role-expertise answers instructions and the consultation polish instructions) with exactly:
Combine as many approved answers and profile facts as the question needs. Keep every employer, number, title, and outcome exactly as stated; a result achieved at one company stays at that company. Use this company and role only to frame why the experience matters here.
Bump the affected prompt versions. Everything else in those instructions, including the sample-answer rule for questions the person's history does not cover, stays unchanged.

TESTS
Choose the minimum relevant tests that prove each batch works and guard its risks (a covered target is not re-asked; unknown ids are dropped; why-this-company answers are excluded; approving in one application enqueues nothing elsewhere; an OpenText result stays at OpenText in a draft). Run only those, plus the type check and lint. Do not run the full suite. If a file fails, re-run only it once; if it passes alone, note it as flaky and continue; if it fails again, STOP and report. Say what you ran and why.

COMMIT
Commit on feat/approved-answers-as-profile and push the branch. Do not merge or push main.

REPORT
1. What each batch changed, with file and line, and the exact instruction text as applied.
2. The version bumps and what they trigger.
3. The checks you ran, why, and each result.
4. The commit hash and branch.
