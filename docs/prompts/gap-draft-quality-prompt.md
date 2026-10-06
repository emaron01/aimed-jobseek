[BUILD, REPORT] Harper: gap-draft quality, and each row's question shown in the row

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Fix root causes, for every kind of seeker. No instruction wording changes unless reported and approved first (exact current and proposed text, then STOP on that part). Every paid call stays behind the paid-call gate. No schema changes or data repair. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/gap-draft-quality. If anything unexpected happens, STOP and report.

SURGICAL RULE
Fix only the three items below. Do not merge or push main.

CONTEXT (production, the seeker's newest Sift application, main at 054fbc3 or later)
1. Several gap drafts answer story questions hypothetically ("Tell me about a recent enterprise SaaS market shift..." was drafted as "I would convene Sales, Product, Marketing, and Customer Success...").
2. Several gap drafts begin mid-thought ("The lack of consistency made it difficult...", "The purchase required consensus...") or omit where the story happened ("Two individuals were underperforming...").
3. In "Where you stand", the first requirement is rated Partial while its explanation says "You clearly meet the experience and leadership scope", and Partial rows do not show which question belongs to them; their questions sit separately in "Questions that need more information".

ITEMS
1. Report why the story-answer rules and the whole-answer assembly (deployed for best-practice drafts) do not hold on the gap-draft path, with file and line, and fix it so gap drafts follow them exactly as best-practice drafts do: no hypothetical answers to story questions, no mid-thought openings, and the story names where it happened.
2. Rating and explanation: report why a Partial rating carries an explanation that says the requirement is fully met, and fix it so a Partial explanation always states what is supported and what is missing, and an explanation never contradicts its rating.
3. Each row's question in the row: every Partial or None row in "Where you stand" that has a question shows that question directly in the row, beneath the explanation, with its draft and all its controls (Save Answer, Approve, Regenerate, Edit, Skip, Ignore), so the seeker answers it there. That question no longer appears in "Questions that need more information", which keeps only questions not tied to a "Where you stand" row (for example the career walk-through). An answered or approved row question stays in its row, as answered items already do.

TESTS
Choose the minimum relevant tests that prove each item (gap drafts never answer a story question hypothetically, never begin mid-thought, and name where the story happened; a Partial explanation states what is missing; a row's question renders in its row with its controls and does not also appear in "Questions that need more information"). Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/gap-draft-quality and push the branch. Do not merge or push main.

REPORT
1. Each item: root cause and fix, with file and line.
2. Any instruction change proposed (or STOP), with exact text.
3. The checks run and results, and the commit hash.
