SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Make Harper do her core job: surface the gaps, ask about each one, follow up when needed, and close each gap with evidence and a talk track or confirm it as a real gap. Fix Harper's voice everywhere. Work on main. Commit and push when all checks pass. Change nothing else.

PART 1: Harper's core loop
Today "Where you stand" lists the gaps, then tells the seeker to close them ("Close the management-depth gap with a specific example of hiring or developing sales managers..."), while Harper's questions do not target those gaps. Harper must do the work:
1. Review the Personal Profile against the job and surface the gaps.
2. For each gap, Harper asks the seeker about it directly (for example: "The job wants someone who has built front-line managers. I don't see that in your background. Tell me about a manager you developed."). Harper's questions come from the gaps, most important first.
3. Follow-up: when the seeker's answer is partial, vague, or missing what is needed to close the gap (for example, no result or no specifics), Harper asks a follow-up question targeting exactly what is missing, before deciding. At most one follow-up per gap.
4. If the answers provide evidence, the gap is closed: Harper gives the talk track (the interview answer) and the resume bullet.
5. If the seeker has no evidence, the gap is confirmed as a real gap, and Harper gives a talk track for addressing it honestly in an interview.
6. "Where you stand" shows each gap with its status: open, closed (with its talk track), or confirmed gap (with its talk track). Remove every instruction telling the seeker to go close a gap, prepare a story, or find an example; Harper asks instead.

PART 2: Harper's voice, everywhere
Harper is coaching the seeker. Everywhere Harper speaks (the briefing, "Where you stand", strengths, gaps, questions, follow-ups, coaching, the Interview Cheat Sheet's coaching, and every other Harper text), she addresses the seeker as "you". Anything the seeker will say (talk tracks, interview answers, sample answers, the career summary) is written in first person as "I". Never refer to the seeker in third person by name or as "he", "she", or "the seeker". Apply this to all existing Harper content when it is next displayed or regenerated, and regenerate the briefing and "Where you stand" for existing applications.

TESTS
- Harper's questions are generated from the surfaced gaps, one per gap, most important first.
- A partial or vague answer produces one follow-up targeting what is missing, before the gap is decided.
- An answer with evidence closes the gap with a talk track and resume bullet; an answer without evidence confirms the gap with a talk track for addressing it.
- "Where you stand" shows each gap's status and contains no instructions to the seeker to close gaps or prepare stories.
- No Harper text refers to the seeker in third person; coaching uses "you", and talk tracks use "I".

REPORT
Real output for the CSC application: the gaps surfaced, Harper's question for each, one follow-up Harper asked, one gap closed with its talk track, one confirmed gap with its talk track, and the regenerated "Where you stand". Also files changed and a full-suite result.
