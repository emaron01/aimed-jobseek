[BUILD, REPORT] Harper: one-time catch-up, approved rows turn Strong

Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Never touch any other repository.

PRODUCTION STANDARD
A one-time data update, approved by the product owner, applying the deployed rule "approving an answer that fills a row's gap turns it Strong" to approvals made before that rule shipped. All applications, all seekers. No AI calls. No schema change. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, force-push, rebase, or anything that discards work. Do NOT use C:/Repos/aimed-jobseek. Run git fetch, then create a new worktree from origin/main on a new branch named fix/approved-rows-catchup. If anything unexpected happens, STOP and report.

SURGICAL RULE
Implement only the item below as a Prisma data migration that runs on deploy. Change nothing else. Do not merge or push main.

ITEM
Set ConsultationAssessment.strength to STRONG for every requirement row that is PARTIAL or NONE and has an APPROVED interview answer for that row's question in the same session, using exactly the same rule as approveConsultationStatement (the row's target key, or the statement turn's key). Exclude acknowledge-the-gap approvals (confirmedGap / gapDecision no_evidence), resume bullets, and non-requirement cards, exactly as the live approval rule does. Update nothing else. The migration must be idempotent (running it twice changes nothing more).

TESTS
Choose the minimum relevant tests that prove the migration's rule matches approveConsultationStatement: a row with an approved answer turns STRONG; an acknowledge-the-gap approval, a resume bullet, and a non-requirement card do not; a STRONG row is unchanged. Plus the type check. No full suite. If a file fails, re-run only it once; if it fails again, STOP and report. Say what you ran.

COMMIT
Commit on fix/approved-rows-catchup and push the branch. Do not merge or push main.

REPORT
1. The migration SQL, exactly, and how it matches approveConsultationStatement, with file and line.
2. A read-only SQL preview the product owner can run on production first, listing each row that would change (campaign id, requirement text, current strength).
3. The checks run and results, and the commit hash.
