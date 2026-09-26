SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

REPORT ONLY. Do not change any code, configuration, schema, or data.

TASK: Audit whether the codebase implements the product owner's workflow below, step by step, and report every place the code differs from it.

THE WORKFLOW (the product owner's definition; this is the source of truth)
Setup:
- Voice
- Resume, LinkedIn, any background
These become the Personal Profile and communication voice.

Each job:
1. The seeker pastes the job posting they want to apply to.
2. Company research is conducted.
3. Personas are created based on who could be interviewing the seeker.
4. Harper analyzes the job requirements against the Personal Profile and gives a scorecard and employer fit.
5. Harper runs a coaching session: shares identified (potential) gaps, asks questions, and provides coaching on what will go in the resume and talking points for gaps, plus where the seeker shines and how to position themselves.
6. Resume and cover letter are suggested, approved, and generated.
7. The seeker applies outside the product (job board or company website) with the resume and cover letter.
8. The seeker finds contacts (or they were identified and captured) and uses outreach to connect and increase the chance of an interview.

Interviews:
9. The seeker gets an interview and fills out the interviewer and the stage (when, who, and how).
10. The seeker creates a cheat sheet for coaching: company background, job requirements, where they shine, what to say, and what to ask as follow-ups.
11. The seeker sends a thank-you.
12. The seeker updates the stage.
13. When they get the next interview, they go back to step 9.

The seeker only provides: voice, job postings, Personal Profile materials, and answers to Harper's questions, additional feeback on their background - follow-up info about job learned from each interview for re-interepation by harper (we get better with infomation learned on interviews). Everything else must trigger and be produced by the product.

REPORT, for each step:
1. What triggers it (seeker action, automatic after which step, or background job) and the exact code path (files and functions).
2. What it produces and where it is stored.
3. Whether its output correctly feeds the next steps that depend on it (for example: personas feed the cheat sheet and interview stages; Harper's answers feed the resume, cover letter, and cheat sheet; the Personal Profile feeds everything). Name any link that is missing or broken.
4. Whether it works today, verified by running it locally with the web app and worker, not only by reading code.

ALSO REPORT
- Anything in the code that contradicts the workflow (for example, a step that requires a manual action the workflow says is automatic, or generation that is skipped until clicked when the workflow expects it to exist).
- Duplicate or competing implementations of the same thing (for example, interview guides versus the cheat sheet, or more than one outreach generator), and which one the seeker actually sees.
- Leftover code paths from Aimed Outreach or earlier designs that are still reachable by the seeker.
- Whether docs/product-vision.md matches this workflow, and every place it does not.
- A prioritized list of what must be fixed for the workflow to work end to end, most blocking first.
