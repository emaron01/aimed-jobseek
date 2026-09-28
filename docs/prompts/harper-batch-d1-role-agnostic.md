SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.

PRODUCTION STANDARD
Production-grade code only. No temporary fixes, no data repair, no migrations, no schema changes. Never silence type or lint errors.

GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main (or git pull without rebase). If a merge conflict or anything unexpected happens, STOP and report; do not discard changes.

SURGICAL RULE
STEP 0 is verification and docs only. STEP 1 is Batch D1 only: the role-agnostic prompt and code fixes below, per sections 2 and 9 of docs/prompts/harper-batch-d-methodology-plan-report.md, with the product owner's approved wording (which overrides the plan's proposed wording). Do not add methodology tags, answer parts, career stage, role-expertise, or learnings changes (later batches). Add no features.

STEP 0: VERIFY D0 AND BACK UP THE PLAN DOCS
1. Confirm branch checkpoint/harper-prep-hub is at 4e4e509 (or report what it is) and that git status shows no unexpected modified files.
2. Confirm the committed D0 changes (04318d0) are complete: refreshConsultationOffer, detectInterviewNoteGap, the consultationOfferJson write, and the consultationOffer config string are all gone, and harper-batch-d0.test.ts exists.
3. Run the full test suite (including real-Postgres tests), the exact production build, the full type check, and lint on this committed state. Report each result. If anything fails, STOP and report.
4. Commit the untracked Batch D plan docs (docs/prompts/harper-batch-d-methodology-plan.md and docs/prompts/harper-batch-d-methodology-plan-report.md, and any other untracked docs/prompts files from approved work) with a docs-only commit, and push the branch.

STEP 1: BATCH D1 (use this wording exactly)
1. Harper coach prompt (src/lib/prompt-content/consultation.ts): add this line after the Voice paragraph:
Scope: you coach for any role, in any industry, at any career stage. Never introduce methods, tools, frameworks, or metrics from any profession unless they appear in the supplied Personal Profile or job sources.
2. Harper coach prompt, likelyToValue example: replace the example sentence (the one about the forecast process with Erik and MEDDPICC deal reviews) with exactly:
for example "when you talk with Jordan about how you trained new team members, lead with the onboarding checklist you built, because that is how they have built their teams"
Keep the rest of that paragraph exactly as it is.
3. Harper extract prompt (same file):
- Replace "which MEDDIC elements did I inspect" with "which steps did I take".
- Replace "I have used forecasting" with "I have done that work".
4. Contact individual profile prompt (src/lib/prompt-content/contact-individual-profile.ts): replace the example "Erik is big on MEDDPICC: he implemented it at two companies and led enterprise sales teams on it." with exactly:
"Jordan is big on hands-on training: they built the onboarding program at two employers and coached every new lead through it."
5. Company research prompt (src/lib/prompt-content/company-research.ts): replace rules 9 and 10 with exactly:
9. This research is for a job seeker, not a sales pursuit. Leave estimatedAov and aovReasoning null.
10. Hiring and growth signals go in hiringSignals. Leave buyingSignals as an empty array (kept only for compatibility).
6. Cheat Sheet guidance prompt (src/lib/prompt-content/application-summary.ts) and interview guide prompt (src/lib/prompt-content/interview-guide.ts): add this line near the top of each:
Role scope: write for this job's actual role and industry. Never introduce methods, tools, frameworks, or metrics that are not in the supplied sources.
7. src/lib/application-summary/people.ts: the executive classifier no longer requires the word "sales" (match "executive sponsor" and C-level titles).
8. Prompt versions: bump each changed prompt's version constant per the repository's convention. Report what each bump triggers; nothing may regenerate automatically or on a page view.
Do not change any other wording.

TESTS
Add or update automated tests that assert:
- Each prompt contains the exact new text and no longer contains MEDDIC, MEDDPICC, "forecast process", "used forecasting", or the Erik example.
- No Harper, cheat-sheet, interview-guide, contact-profile, or company-research prompt contains a sales-only term (MEDDIC, MEDDPICC, quota, pipeline review, deal review) as an instruction or example.
- The executive classifier matches "Executive Sponsor" without "sales".
- Nothing regenerates on a page view.
Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed and why.

COMMIT
After everything passes, commit on branch checkpoint/harper-prep-hub with a message naming Harper Batch D1, and push that branch. Do not merge into main or push main.

REPORT
1. STEP 0 results, including the docs commit.
2. Every prompt change, with before and after text, file and line.
3. The classifier change.
4. Prompt version bumps and what each triggers.
5. Every file changed.
6. Tests added or changed, with reasons for any changed existing test; the test suite, build, type check, and lint results.
7. The commit hashes and branch pushed.
8. Confirmation that no git command discarded work, and nothing outside D1 changed.
