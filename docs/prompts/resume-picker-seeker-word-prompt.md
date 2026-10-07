[BUILD, REPORT] Resume picker: seeker's word is evidence, drop invented claims, picks in their own field

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
Changes on top of the approved resume picker (05839648). The seeker's word is the evidence: anything the seeker stated (Personal Profile facts, any reply the seeker wrote to Harper, approved statements, and approved stories) is evidence and is never questioned. The citation check exists only to stop the writing model from adding claims the seeker never made. The one schema change in item 3 is approved: a nullable JSON column, added in a safe, backward-compatible migration. No other schema change, no instruction wording changes. Copy lives in the product config. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Work in the feat/resume-picker worktree, on top of 05839648. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the three items below. Do not merge or push main.

ITEMS
1. Seeker's word counts: the citation check accepts any reply the seeker wrote to Harper as a source, alongside Personal Profile facts, approved statements, and approved stories.
2. Drop, don't block: when the check still fails after its retry, do not block the save. Remove only the bullets or sentences whose claims match nothing the seeker stated, save the rest as the new resume version, and log what was removed for diagnosis. The seeker never sees violation text or any wording that questions their claims. Only if nothing usable remains, keep the current version and show exactly:
Harper couldn't write a new version this time. Your current resume is unchanged. Please regenerate.
3. Picks in their own field: add a nullable JSON column for the seeker's resume statement picks (for example Campaign.resumeStatementPicksJson), move reading and writing of picks there, and stop storing them in workspaceSeenJson (remove the copy-back code). Carry over any picks already stored under workspaceSeenJson.resumeStatementPickIds once, in the migration or on first read, without losing them. Absent means Harper's recommendation; a saved array, even empty, is the seeker's choice.

TESTS
Choose the minimum relevant tests that prove: a claim found only in a seeker's reply is accepted; an invented claim is removed and the rest is saved; removals are logged; the fallback message appears only when nothing usable remains; picks survive any workspaceSeenJson update; existing picks carry over. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on feat/resume-picker and push the branch. Do not merge or push main.

REPORT
1. Each item, with file and line.
2. The migration, exactly, and why it is safe.
3. The checks run and results, and the commit hash.
