# Prompt: Phase 4 Pass C — sidebar and display

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Production code only: no repair or migration of existing data.

TASK: Phase 4 Pass C: sidebar and display (plan sections 5, 6, and 7, with the product owner's decisions). Work on main. Commit and push when all checks pass.

1. Personas and Interviewers step (plan section 5)
- Red with no Direct roles. Green when every Direct role's persona is built. Yellow otherwise. Indirect roles never affect the color.
- Remove the "Review remaining personas" pill entirely. NEW is the only prompt in the sidebar.
- Building a persona is always the seeker's choice; nothing is built automatically to change the color.

2. Application Status step
Red only when nothing on the application has started. Yellow as soon as any other step is green. Green when the applied date is set.

3. Plain experience line (plan section 6)
"Verified experience: 14.7–16.5 years (176–198 months) toward 10 years across..." becomes a plain sentence, such as "About 15 years of relevant experience across OpenText, Login VSI, Micro Focus, and Gryphon Networks." No months, ranges, or role date lists. Missing dates read plainly, such as "Add dates for [role names]."

4. Sidebar layout (plan section 7)
A NEW pill never overlaps or covers a step name, including on a narrow sidebar.

TESTS
- Personas: built Direct plus unbuilt Indirect is green; unbuilt Direct is yellow; no Direct roles is red; the "Review remaining personas" pill no longer exists.
- Application Status: red with nothing started; yellow when any other step is green; green with an applied date.
- The experience line has no months or ranges.
- A NEW pill never covers the step name.

REPORT
What changed, files changed, and a full-suite result.
