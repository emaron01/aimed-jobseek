[BUILD, REPORT] Harper: Regenerate polishes the seeker's own answer; key points from that answer and editable

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
For every kind of seeker. The seeker's words are the evidence and a seeker's edit always wins. Reuse the existing polish path used for seeker replies (extract and polish); no new instruction wording unless reported and approved first (exact proposed text, then STOP on that part). Every paid call stays behind the paid-call gate and runs only on the seeker's Regenerate click. No schema changes unless reported and approved first. Copy lives in the product config. Never silence type or lint errors.

NO STACKING, NO CONFLICTS
Route Regenerate on a seeker-written or seeker-edited draft through the existing reply polish path; do not add a second polish path. Remove code that this replaces and tests that only cover it. Report any overlapping code or instruction text.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/regenerate-seeker-answer. Do all work in that worktree with terminal commands only; never switch the editor's workspace or check anything out in another worktree. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the items below. Do not merge or push main.

DEFECT (production, Sift application cmux4btmv0005p32prkebgtka)
On the Harper page, best-practice question "Tell me about a situation where Product, Marketing, or Customer Success had a different view of an important enterprise customer's needs...", the seeker typed their own answer into the draft (an OpenText story about a VRA migration-tool performance issue, $2.9MM in pipeline, a hot fix and a permanent fix in 45 days), saved it, and clicked Regenerate. Result: the seeker's text was unchanged (spelling and grammar not cleaned up), the key points shown below it describe a different story (Login VSI transitioning from SMB to enterprise, $5MM+ eliminated and $20MM+ added), the key points cannot be edited, and the page said "Polished statement regenerated."

ITEMS
1. Report exactly what Regenerate does today when the draft text was written or edited by the seeker: which inputs it sends, why the seeker's text is unchanged, and where the key points come from, with file and line.
2. When the draft is seeker-written or seeker-edited, Regenerate polishes the seeker's own text through the existing reply polish path: correct spelling and grammar, tighten toward the length target, keep every fact, number, name, and employer exactly as the seeker stated, and add no new facts. Key points, when the question calls for them, are written only from that answer. The polished result replaces the draft (still a Draft, for the seeker to approve).
3. When the draft was written by Harper and never edited, Regenerate behaves as today.
4. Key points are editable together with the answer through the existing Edit.
5. The status message says what actually happened; it never says the statement was polished when it was not.

TESTS
Choose the minimum relevant tests that prove: Regenerate on a seeker-edited draft sends the seeker's text to the polish path and returns a polished version that keeps the seeker's facts; key points come only from that answer; key points can be edited and saved; a Harper-written draft regenerates as before. Use sales, nursing, and new-graduate fixtures. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on fix/regenerate-seeker-answer and push the branch. Do not merge or push main.

REPORT
1. Item 1 findings, with file and line.
2. Each change, with file and line, and code and tests removed.
3. Any instruction text involved, quoted, and any proposed change (or STOP).
4. The checks run and results, and the commit hash.
