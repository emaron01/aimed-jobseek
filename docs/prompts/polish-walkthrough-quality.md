Save this prompt to docs/prompts/ before starting.
SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.
PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.
TASK: Polish two quality defects from the walkthrough rerun. Work on main. Commit and push when all checks pass.
1. Identity verification evidence
The evidence shown to the seeker is garbled: "Industry: posting 'Senior' vs research 'not a commercial'" and "Size or stage: 'Senior' vs 'grades 9'". The conclusion was correct, but the reasons would confuse a seeker.
- Each check compares like with like: the posting's industry or business description against the research's; the posting's location against the research's; the posting's stated size or stage against the research's. Seniority, job titles, and fragments are never used as industry or size evidence.
- When the posting does not state a value, the check says "Not stated in the posting" rather than using an unrelated fragment.
- Each check shows a short plain-language reason a seeker understands (for example, "The posting describes a commercial warehouse robotics company; the research found a high school robotics team.").
- Test with the student-team fixture: each check's reason is coherent, and no check uses seniority or a title as evidence.
2. Cover letter coherence
The third paragraph paired an acknowledged gap (ROS2 ramp) with an unrelated fact (the Contoso member-identity API).
- Each paragraph has one purpose. A gap, when Harper's strategy is to acknowledge it, gets its own brief treatment tied to how the seeker would close it, and is never combined with unrelated experience.
- Add a check that rejects and regenerates paragraphs mixing unrelated topics.
- Bump the cover letter prompt version.
- Test with the fixture: the gap and unrelated experience never share a paragraph.
REPORT
Real model output: the identity evidence for the student-team fixture, and the regenerated cover letter. Also prompt versions, files changed, and a full-suite result.
