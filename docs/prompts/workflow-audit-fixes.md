Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Do not remove or change any other existing functionality, button, section, or page. Where something is hidden, its code and data stay.

TASK: Fix the defects found in the workflow audit and apply the product owner's decisions. Work on main. Commit and push when all checks pass. The Interview Cheat Sheet is handled in a separate task; do not change it here.

PART 1: Target Employers are dropped
1. Creating an application needs only a Personal Profile and a pasted posting. Make Campaign.icpId optional via a migration that is safe on existing data. Today creation is blocked with "Needs a Target Employer profile with criteria" even when one exists.
2. Hide Target Employers from navigation, the setup rail, and the new-application form. Existing Target Employer data stays.
3. Employer fit is not computed or shown for applications without a Target Employer. The scorecard on Job requirements stays.

PART 2: Company research always runs
1. When the parsed posting names an employer, research runs automatically. The existing identity check (confirm when the match is ambiguous) stays as it is.
2. Existing applications with a named employer and no research get research queued.

PART 3: Harper
1. Harper starts on the seeker's click, and Skip stays. No change to either.
2. continueConsultationPlanning is an empty stub. Implement it so that after the seeker uses a result, Harper continues to her next question as designed.
3. Remove the code that rewrites Harper's text to force the "you" voice (it produces errors such as "you currently leads" and "you wants"). Harper's voice comes from her prompt only.
4. Interview learnings reach Harper automatically: saving stage notes or "What I've learned" regenerates the job requirements and queues Harper's reassessment, with no extra click.

PART 4: Resume and cover letter created when Harper is done
1. When the Harper session ends (plan complete, Done, or Skip), the resume plan and cover letter plan are created and accepted automatically, and the resume and cover letter are generated from them and from the seeker's approved statements.
2. The seeker approves only the finished resume and cover letter.
3. Keep every existing control: Adjust plan, Regenerate, What should change, versions, and Download DOCX. They remain available but are not required steps.

PART 5: Voice everywhere
The seeker's voice samples (and their own words from Harper answers) shape the resume, cover letter, Harper's talk tracks, and outreach, not only emails.

PART 6: Leftovers
1. Remove the email length and Hiring Team role limiter fields from the new-application form.
2. Remove the product-level "Hiring Team roles" count from the Personal Profile.
3. Interview stage progress must not depend on INTERVIEW_GUIDE jobs; base it on the application's interview stages.

TESTS
- An application can be created with only a Personal Profile and a posting.
- Target Employers do not appear in navigation, the setup rail, or the new-application form; existing data remains.
- Research runs automatically when an employer is named; existing applications without research get it queued.
- Using a Harper result leads to her next question.
- No code rewrites Harper's text after the model call.
- Saving stage notes or What I've learned regenerates the job requirements and queues Harper's reassessment.
- Ending the Harper session creates the plans and generates the resume and cover letter; existing controls still work.
- Voice samples reach resume, cover letter, Harper talk tracks, and outreach generation.
- The new-application form has no email length or role limiter; the profile shows no Hiring Team role count.
- Interview stage progress follows the application's stages.

REPORT
What changed for each part, confirmation that no other functionality was removed, migrations, files changed, and a full-suite result.
