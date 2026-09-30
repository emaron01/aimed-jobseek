Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. Fix at the root; no temporary fixes, no data repair, no migrations, no schema changes, no Harper prompt changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. Do not touch uncommitted B4 work on checkpoint/harper-prep-hub. Work on fix/harper-standing-structure (in its worktree if one exists). If anything unexpected happens, STOP and report.

SURGICAL RULE
Finish ITEM 4 of the Harper standing structure work (the correction prompt about consultation asset side effects and DONE never blocking Harper, saved in docs/prompts/) on fix/harper-standing-structure, and bring the branch up to date with main. Change nothing outside that correction. Add no features.

STEP 1: REPORT THE BRANCH STATE
1. List every commit on fix/harper-standing-structure since it branched from main (hash, message, files), including c41d2b3 and c3134d6.
2. Run git status: list every uncommitted or untracked file.
3. State which parts of the ITEM 4 correction are done and which remain: (1) no consultation state change enqueues resume, cover letter, or other asset generation (auto-DONE, completeConsultation, skipConsultation, and any other path); (2) DONE never blocks replies, edits, follow-ups, learnings reassess, or role-expertise questions; (3) the pre-start "Skip consultation" control enqueues no assets and is reported for the product owner; (4) sidebar and next step findings.
4. Report the test failure seen during the interrupted run: which test, the exact failure, and its cause. State plainly whether it is a real defect in this work or a load-dependent flake.

STEP 2: MERGE MAIN
Merge origin/main (now c502c82, which includes the role-expertise suggested answers fix in qa-view.ts and service.ts) into fix/harper-standing-structure with git merge, not rebase or reset.
- If there are conflicts, resolve them so both changes are kept: the standing structure's reply attachment and single Where you stand list, and main's display of suggested-answer drafts stored on the consultant question turn (including the questionTurnId added to supersedeTurnIds). Report every conflict and exactly how it was resolved.
- If a conflict cannot be resolved while keeping both behaviors, STOP and report it; do not guess.

STEP 3: FINISH ITEM 4
Complete every remaining part of the ITEM 4 correction and fix the test failure at its root if it is a real defect.

TESTS
All tests in the ITEM 4 correction prompt, plus: after the merge, a role-expertise question with a suggested answer stored on its question turn shows that answer (Interview answer, Draft, Edit and Approve) inside the single Where you stand entry, exactly once; and a reply to a question with an open follow-up still attaches to the question answered. Run the worker boundary test (--conditions=react-server). Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors. If a test fails only under full-suite load and passes alone, report it by name as a flake with its failure; do not change it to pass. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on fix/harper-standing-structure with a message naming the ITEM 4 completion and main merge, and push that branch. Do not merge into main or push main.

REPORT
1. STEP 1 findings, including the test failure and whether it was a flake.
2. The merge, every conflict, and how each was resolved.
3. The ITEM 4 findings and changes (asset enqueue call sites removed, DONE and SKIPPED gates fixed, what SKIPPED does, pre-start Skip consultation findings, sidebar and next step findings), with file and line.
4. Every file changed.
5. Tests added or changed, with reasons for any changed existing test; flakes by name; the worker boundary test result; the test suite, build, type check, and lint results.
6. The commit hash and branch pushed.
7. Confirmation that the uncommitted B4 work was not touched, no git command discarded work, and nothing outside ITEM 4 and the merge changed.
