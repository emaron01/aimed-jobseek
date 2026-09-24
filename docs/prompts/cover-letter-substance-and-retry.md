Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.
PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.
TASK: Cover letter substance and retry rate, plus a display fix. Work on main. Commit and push when all checks pass.
1. Substance, not length
The last cover letter passed validation by cutting content: one proof point, no specifics about what the seeker did, and a five-attempt retry. Do not add a word minimum. Instead:
- The body must include the seeker's strongest one or two stories for this role's most important outcomes, each with what the seeker personally did and the result, drawn from approved statements where they exist.
- When approved statements exist for the role's top outcomes, a letter that omits all of them is rejected with a specific reason and regenerated.
- If the seeker's material is genuinely thin, a short letter is correct; say so in the workspace with a suggestion to run a consultation round, rather than stretching.
2. Retry rate
Log every validation failure reason per attempt for cover letter generation. Using those reasons, align the prompt with the validators so first-attempt passes are the norm. Report the failure reasons from the previous five-attempt run and the attempt counts after the change.
3. Location display
Identity verification reasons show locations and other values as written in the source (for example, "Austin, TX"), not lowercased. Normalize only for comparison.
REPORT
Real model output: the regenerated cover letter for the fixture with its attempt count, the logged failure reasons before and after, the identity evidence with corrected casing, prompt version, files changed, and a full-suite result.
