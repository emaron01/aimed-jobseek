SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Do not remove any other existing functionality, button, or section.

TASK: Fix Harper's page and "Where you stand" as seen on the production CSC application, and add "Share some details" to every open gap. Work on main. Commit and push when all checks pass. Repair existing applications, not only new ones.

PART 1: Share some details on every open gap
1. Every open gap in "Where you stand" has a "Share some details" box.
2. When the seeker submits, Harper analyzes the input with the full Personal Profile (not just saves it) and does exactly one of:
   a. Writes a usable statement (talk track and resume bullet), and the gap closes.
   b. Asks one follow-up question, when something needed is missing.
   c. Confirms it as a real gap, with an honest talk track that bridges to related Personal Profile experience.
3. The result appears under that gap, with Approve and Regenerate as elsewhere. Reuse Harper's existing answer machinery; do not build a second one.

PART 2: Correct state
1. Production showed "Consultation is skipped" while questions were still open. The status must reflect the real state.
2. "The question plan is complete" appeared three times, stacked, while gaps were open and questions unanswered. Show only the latest closing note, and only when every gap is closed or confirmed and every question is answered.
3. Open gaps must never sit without a question or a Share some details box.

PART 3: Clean up existing data
1. Remove the old templated question "Do you have experience with Join us to help protect the world's most valuable digital brands... that Harper does not see?" from existing sessions.
2. Merge existing near-duplicate questions (for example, three career walk-through questions). Keep the one with the seeker's answer; if none has an answer, keep the most recent.
3. A mission statement or company tagline (for example, "Join us to help protect the world's most valuable digital brands...") is never rated as a requirement in "Where you stand". Remove it from existing assessments.
4. Interviewer prep (for example, "Harper prepares the seeker for Christina Schivley...") is never listed as a gap. Remove it from existing gap lists.
5. "Why you want to work at this company" closes only with the seeker's own stated motivation, never with a work story. Production closed it with the OpenText ARM story although the seeker had answered ("They are a global company we compete with today. Winning culture and known to be an outstanding employer with forward-thinking leadership."). Re-link existing cases to the seeker's actual motivation answer.
6. A "Your reply" entry in production contains third-person system text ("...he also reports building the business from under $2M to $6.8M..."), which the seeker did not write. Find how system text got into a seeker reply, stop it, and repair existing replies so they contain only what the seeker wrote.

PART 4: Remove duplication in "Where you stand"
1. Production shows two "Where you stand" blocks. Show one.
2. Evidence items are shown twice with identical text (for example, "Scaled, coached, and led a consultative sales team." appears two times in a row). When an item's label and detail are identical, show it once. Keep the label-plus-details layout only when they differ (for example, a role title followed by the role's full details).
3. Evidence shows the seeker's raw typed replies, typos included (for example, "I have built OpenText's ARM products... by completely retool the GTM..."). Evidence shows the clean Personal Profile fact instead.
4. Remove the stray "Resume" heading in the middle of the Harper page.

PART 5: Scores
After the seeker added their security background and manager-development answers, the score dropped from Strong 10 / Partial 4 to Strong 6 / Partial 8. Find why. New evidence the seeker adds must never lower a rating unless it contradicts earlier evidence.

PART 6: Background tied to roles
When seeker-stated background (such as "9 years of cybersecurity sales") is not tied to specific roles and it matters for a gap, Harper asks which roles it came from as part of that gap's question.

VERIFY
With the web app and worker running, on data shaped like the production CSC application: submit Share some details on an open gap and get each of the three outcomes; confirm the state, cleanup, duplication, and score fixes on existing data.

TESTS
- Every open gap has a Share some details box; each of the three outcomes works and uses the full Personal Profile.
- Status, closing note, and plan-complete reflect the real state; only the latest closing note shows.
- Templated and duplicate questions, mission targets, and interviewer-prep gaps are removed from existing sessions.
- Why-this-company closes only with the seeker's motivation.
- Seeker replies contain only seeker-written text.
- One "Where you stand" block; identical evidence shown once; label-plus-details kept only when they differ; evidence shows clean profile facts; no stray "Resume" heading.
- Adding supporting evidence never lowers a rating.

REPORT
The cause of each defect, the fix, what was repaired on existing data, a screenshot of the corrected Harper page, files changed, and a full-suite result.
