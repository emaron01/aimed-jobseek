# Prompt: Implement Harper last-10-years and green-state rules

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Production code only: no repair or migration of existing data.

TASK: Implement the two Harper changes from the report, as approved. Work on main. Commit and push when all checks pass.

1. Harper asks only about the last 10 years
Add to the Questions block of CONSULTATION_COACH_SYSTEM_INSTRUCTIONS in src/lib/prompt-content/consultation.ts:
"Career walk-through: cover only roles held within the last 10 years from today. Never ask about a role that ended more than 10 years ago, in the walk-through or in any gap question. If the seeker volunteers experience from an older role, you may still use it as evidence."
Bump CONSULTATION_PROMPT_VERSION to "25" in src/lib/consultation/contract.ts.

2. Harper green
In consultationFacts in src/lib/application/tracker.ts, set complete to !unanswered (remove && !openGaps). Harper is green when every Harper question is answered; open gaps alone no longer keep it yellow. Keep the existing behavior that new questions or results return it to yellow until answered.

TESTS
- The coach instructions contain the 10-year rule, and the prompt version is "25".
- Harper is green when every question is answered, even with open gaps.
- Harper returns to yellow when new questions or results appear, until they are answered.

REPORT
What changed, files changed, and a full-suite result.
