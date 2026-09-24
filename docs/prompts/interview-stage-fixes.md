Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Interview stage fixes. Work on main. Commit and push when all checks pass.

0. Local configuration
In .env.local only (never any other file, never printed), add ASSET_AI_* and CONSULTATION_AI_* entries, copying the provider, model URL, and API key from the existing PERSONA_AI_* entries. Set ASSET_AI_MODEL and CONSULTATION_AI_MODEL to gpt-5.6-terra, ASSET_AI_TEMPERATURE to 0.5, CONSULTATION_AI_TEMPERATURE to 0.3, timeouts to 90000, and retries to 2. From now on, live samples use these roles directly, with no process-only mapping.

1. Consultation focus from new gaps
When post-stage notes reveal a new gap and the seeker starts the offered consultation, thread the focus into the consultation planner so the first questions target that gap. Test that the first round targets the focus.

2. Guide voice
Every interview guide addresses the seeker in second person ("you") throughout, in a coaching voice. Reject and regenerate guide text that narrates in first person about the seeker ("I can", "my background") outside of example answers the seeker would say aloud. Example answers remain in first person and are clearly labeled as things to say.

3. Thank-you and check-in quality
- Before generating a thank-you, check whether the post-stage notes describe the conversation (topics discussed, something the interviewer said, a point the seeker wants to reinforce). When the notes are thin, Harper asks up to two short questions to draw that out; the seeker can answer or skip.
- A thank-you thanks the interviewer for the conversation, references specific topics from the notes, and may reinforce one relevant proof point. It never thanks the interviewer for information in place of the conversation.
- Messages are status-aware: once an application is Interviewing or later, messages never mention having applied or submitted an application.
- Subjects are specific to the conversation (for example, referencing a topic discussed), never generic ("Thank you for the update").
- Bump the affected prompt versions.

4. Retry rate
Log each validation failure reason per attempt. Using those logs, align the interview guide prompt with its validators so first-attempt passes are the norm. The maximum attempts come from configuration; after the maximum, show the failure with a retry action. Report attempts per sample.

TESTS
- The consultation planner targets the new-gap focus first.
- First-person narration in guide text regenerates; labeled example answers are allowed.
- Thin notes produce up to two questions before a thank-you.
- No message after Interviewing mentions applying.
- Generic thank-you subjects regenerate.

REPORT
Real model output using the ASSET_AI and CONSULTATION_AI roles from .env.local: the recruiter screen guide and the hiring manager guide (with attempt counts and any validation failures), Harper's questions for thin notes, a thank-you email after the seeker answers them, and the first consultation question for the new-gap focus. Also prompt versions and files changed.
