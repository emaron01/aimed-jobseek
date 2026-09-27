Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Passes 2 and 3 of the approved plan come later; do not start them.

TASK: Pass 1 of the approved plan: navigation colors, NEW pills, labels, and Job requirements top buttons (plan items 1 to 4), with the product owner's decisions below. Work on main. Commit and push when all checks pass.

1. Navigation colors (plan item 1), with these decisions replacing the plan's proposals where they differ
- Red = nothing started. Yellow = started but not finished. Green = complete. A failed step that already has work is yellow, not red.
- Application Status: red with no applied date; green when the applied date is set.
- Company: as in the plan.
- Job requirements: red with no job title; yellow while the requirements are re-processing after the seeker adds new ones; green otherwise. Do not use employer fit (it no longer exists).
- Harper: red with no session. Green when every Harper question is answered. When new data presents (new questions, new gaps from reassessment, or new Harper results), it goes back to yellow until those questions are answered.
- Resume and cover letter: as in the plan (green when the latest resume is approved; yellow while a newer unapproved draft exists or generation is running).
- Personas and Interviewers: red with no roles; yellow with "Review remaining personas" until every persona is built; green when every persona is built.
- Send Outreach: label it "Send Outreach". Red with no contacts; blue-green once a contact exists; it is never marked done or green.
- Interview stages and Interview cheat sheet: as in the plan, including mapping INTERVIEW_GUIDE into the interview stages step.
- When Harper changes something in a green step, that step shows yellow and its NEW pill until the seeker opens it.

2. NEW pills (plan item 2)
As in the plan: each pill says what is new, with no job ids, timestamps, or internal keys. Rewrite existing seen-state to the new keys once on read, so there is no burst of NEW pills after deploy.

3. Labels (plan item 3)
"Update application date and status" becomes "Application Status". "Review Hiring Personas – Add Who Will Be Interviewing" becomes "Personas and Interviewers". Via the vocabulary module.

4. Job requirements (plan item 4)
As in the plan: a top button "Enter any new requirements you have learned here" that opens the existing learned-notes form, and a top Edit button that opens the existing posting editor. Keep both existing sections.

TESTS
- Each step shows red, yellow, and green under the rules above, including Harper returning to yellow when new data presents, Personas green only when every persona is built, Send Outreach never green, and failed-after-start as yellow.
- A step Harper changed after green shows yellow and a specific NEW pill until opened.
- NEW pills never read "NEW" alone and never contain ids or timestamps; no NEW burst after deploy.
- The two labels are updated everywhere.
- Both Job requirements top buttons open the existing forms; the existing sections remain.

REPORT
What changed, the red/yellow/green rule for each step as implemented, a screenshot of the sidebar showing all three colors and a specific NEW pill, files changed, and a full-suite result.
