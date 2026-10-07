[BUILD, REPORT] Resume bullets: one employer per bullet, human style, summary leads with results, date order, Edit on bullets

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
For every kind of seeker. The seeker's word is the evidence, and a seeker's edit always wins. The instruction texts in items 2 and 3 are approved exactly as written; no other instruction wording may change. Every paid call stays behind the paid-call gate and never runs on page view; saving an edit makes no paid call. No schema changes: store edits in existing JSON beside the seeker's job corrections; if that is not possible, STOP and report before changing anything. Copy lives in the product config. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/bullet-style-edit. If origin/main does not include fix/edit-approved, STOP and report. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the five items below. Do not merge or push main.

CONTEXT (production, Sift application cmux4btmv0005p32prkebgtka)
One approved answer named results at two employers ("I have closed up to $6.8MM (AT&T - at Microfocus as a sales rep). My largest deal Sprint as a seller at Gryphon Networks..."). Harper wrote one bullet under Gryphon Networks combining both: "Closed up to $6.8 million with AT&T and previously secured Sprint's $12 million...". Bullets also read as generated: long lists of departments ("Channel Sales, Solutions Engineering, Business Development, Customer Success, Marketing, and Product") and filler endings ("while preserving seller judgment"). The resume summary had no numbers. Checkpoint Technologies (2014–2015) was listed below Gryphon Networks (2010–2014). The seeker edited bullets in the downloaded file because the picker has no edit, and those edits are lost on the next regenerate.

ITEMS
1. One employer per evidence segment: before the candidate call, when one evidence item names results at more than one Personal Profile employer, split it by sentence into separate evidence segments, one per employer (sentences naming no employer stay with the segment before them), each keeping the original evidence id and question text. Report the rule, with file and line.
2. Bullet style: add exactly this text to the bullet candidate instruction, after the sentence that begins "Do not write the employer's name in a bullet":
Each bullet describes results from one employer only. Lead with the result. Do not list departments or teams; name at most two when they matter. Do not end a bullet with a general phrase about how the work was done.
3. Summary leads with results: add exactly this sentence to the resume writer instruction where it describes the summary:
Write the summary in two or three sentences that name the seeker's strongest stated results, with their numbers, before describing skills or methods.
4. Reverse date order: roles on the resume and in the picker are ordered most recent first, by end date (Present first), then start date. Roles without dates keep their profile order after dated roles.
5. Edit on bullets: each bullet in the picker has Edit and Save in the same row as its job selector. Save stores the seeker's text for that bullet, keyed the same way as job corrections, so it survives every later refresh and is never replaced by a new draft. The edited text is used exactly on the resume when picked, counts as the seeker's own evidence for the citation check, and is included as seeker evidence in later candidate runs. Saving makes no paid call and keeps the seeker on that bullet.
Bump the bullet candidate and resume prompt versions, and report what each bump triggers.

TESTS
Choose the minimum relevant tests that prove each item, using sales, nursing, and new-graduate fixtures: evidence naming two employers becomes two segments and no bullet combines them; both instruction texts are in place; roles sort most recent first; an edited bullet survives a refresh, is used exactly on the resume, passes the citation check, and saving makes no paid call. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report (a local database outage is not a code failure; report it and continue). Say what you ran.

COMMIT
Commit on fix/bullet-style-edit and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line, the splitting rule, and where edits are stored.
2. The version bumps and what they trigger.
3. The checks run and results, and the commit hash.
