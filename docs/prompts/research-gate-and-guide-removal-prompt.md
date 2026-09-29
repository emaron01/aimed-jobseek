Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and git remote before making any change. Never read from or touch the Aimed Outreach repository or any other repository.
PRODUCTION STANDARD
Production-grade code only. Reuse the Phase 1 paid-call gate. No temporary fixes, no data repair, no migrations, no Prisma schema changes. Never silence type or lint errors.
GIT SAFETY
Never use git reset --hard, git checkout -- (on files), git clean, git stash drop, force-push, or any command that discards work. To update the branch from main, use git fetch and git merge origin/main. If anything unexpected happens, STOP and report.
SURGICAL RULE
Implement only the two parts below, per docs/prompts/research-and-interview-guide-report.md. Do not change research prompts or outputs, the thank-you and check-in flow, Stage, Harper, or the Cheat Sheet. Nothing may run on a page view. Add no features.
PART 1: COMPANY RESEARCH
1. Fingerprint gate on the application research paid call (AiCompanyResearchProvider.research via researchCompany): fingerprint = the exact inputs the research sends (company identity fields, website or domain, seekerSuppliedNotes, research prompt and schema version, depth policy), operation COMPANY_RESEARCH, subjectKey organizationId:companyId. The receipt is recorded only after research completes with usable results.
2. Force and retry: forceRefresh (retryApplicationResearch) means "ignore the freshness window", not "ignore identical inputs". With forceRefresh, research runs when the existing research is failed, partial without usable fields, or missing, or when the fingerprint changed. When usable research exists and the fingerprint is unchanged, make no provider call and keep the current research.
3. Seeker message: when Retry is skipped for that reason, show exactly: No Changes To Company Research. Show it where the current retry message is shown. Keep the existing message when research runs.
4. Company-scoped concurrency: two research runs for the same organization and company (for example two applications at the same company) must never both call the provider. The second waits for or reuses the first's result. Use the gate's in-flight protection or a company-scoped lock; report which.
5. Keep the freshness window as it is, as an additional rule alongside the fingerprint.
PART 2: REMOVE THE UNUSED INTERVIEW GUIDE
1. Remove only the guide-only code listed in Part 2 section 2 of the report: requestInterviewGuide, getInterviewGuideView, parseGuideContent, validateInterviewGuideContent, missingGuideMaterial, the guide source builders and buildPromptInput, generateInterviewGuideWithModel, generateInterviewClarifyingQuestions and buildInterviewClarifyingMessages, INTERVIEW_GUIDE_SYSTEM_INSTRUCTIONS and INTERVIEW_CLARIFY_SYSTEM_INSTRUCTIONS, INTERVIEW_GUIDE_PROMPT_VERSION, interviewGuideContentSchema and guide claim helpers, the interviewGuide and interviewClarifyingQuestions structured-output entries, generateInterviewGuideAction, and guide-only progress copy.
2. Keep every thank-you and check-in symbol in the shared files (generateInterviewThankYouClarifyingQuestions, buildInterviewThankYouClarifyingMessages, the thank-you clarify prompts and schema, thank-you-paid-inputs, and anything else the thank-you flow uses). Keep the usage operation string "INTERVIEW_GUIDE" that the thank-you clarify call records (outreach.ts about line 907) unchanged.
3. Replace the worker's INTERVIEW_GUIDE case with a terminal handler that marks any existing INTERVIEW_GUIDE job COMPLETED with no output and no paid call, so old jobs never hang or throw.
4. Leave the INTERVIEW_GUIDE enum value, the InterviewStageGuide model, and all database columns in place. No migration.
5. Update tests that asserted guide wiring to match the removal; keep all thank-you tests passing unchanged.
TESTS
Add automated tests that assert:
- Part 1: fresh research plus saving a re-persisted posting, naming the same employer, or a second application at the same company makes no provider call; Retry with unchanged inputs and usable research makes no provider call and shows the exact message; Retry after a failed or unusable run, or with changed notes, makes one provider call; two concurrent first-time researches for the same company make at most one provider call; confirm and reject identity start no research; no page view enqueues research.
- Part 2: no page, component, or action references guide generation, view, or parse; an existing INTERVIEW_GUIDE job reaches COMPLETED with no paid call; thank-you clarifying questions, generation, and check-in still work and are still gated; Stage, person prep, and Cheat Sheet enqueues still work; the enum and InterviewStageGuide model are unchanged.
Run the worker boundary test (--conditions=react-server) and confirm processApplicationJob still loads cleanly. Run the full existing test suite, including real-Postgres tests, plus the exact production build, the full type check, and lint. All must pass with zero errors and no new failures. Never change an existing test only to make it pass; report any test changed or removed and why.
COMMIT
After everything passes, update checkpoint/harper-prep-hub from main (merge, not reset), commit with a message naming the company research gate and interview guide removal, and push that branch. Do not merge into main or push main.
REPORT
1. Part 1: the fingerprint inputs, the force rule, where the message renders, and the concurrency mechanism.
2. Part 2: everything removed, everything kept in shared files, and the terminal handler.
3. Every file changed.
4. Tests added, changed, or removed, with reasons; the worker boundary test result; the test suite, build, type check, and lint results.
5. The commit hash and branch pushed.
6. Confirmation that no git command discarded work and nothing outside these two parts changed.
