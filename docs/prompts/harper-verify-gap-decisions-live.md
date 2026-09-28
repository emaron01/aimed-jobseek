Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only Harper's extract instructions, and only if the verification below fails.

TASK: Verify gap decisions live now that the text-pattern overrides are removed.

1. With the web app, the worker, and the real model on the CSC-shaped application, submit these as new Share some details replies on open gaps (not stored results from earlier runs):
   a. "I have never sold digital brand protection, domain services, or digital-risk products. My closest work is patient-identity software at Contoso Health." Expected: no_evidence, Confirmed, a bridging talk track, no resume bullet, no follow-up.
   b. "I have used forecasting." Expected: incomplete, Open, coaching and one follow-up addressing the seeker as "you", no interview answer, no resume bullet.
2. If either result is wrong, fix it only in the extract instructions: a seeker saying they have not done the work is no_evidence even when they name adjacent experience; a reply without specifics (what they did, how, and the result) is incomplete. Bump the prompt version, rerun both, and repeat until both are correct. Never add text-pattern logic to code.
3. Commit and push only if the instructions changed.

REPORT
Both live outputs verbatim (decision, status, talk track or coaching and follow-up), whether the instructions changed, and the full-suite result if they did.
