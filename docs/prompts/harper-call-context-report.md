Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

REPORT ONLY. Do not change any code, configuration, schema, or data.

TASK: Report exactly what context each Harper call receives.

For each of these calls:
1. Coach (assessment, "Where you stand", and question drafting)
2. Extract (reading an answer and deciding the gap: evidence, incomplete, or no_evidence)
3. Polish (writing the resume bullet and talk track, including confirmed-gap talk tracks)
4. Interviewer prep

Report:
- Whether it receives the full Personal Profile (every role, achievement, and fact, including background added through What You Should Know About Me), only the items the assessment linked to that gap, or only the seeker's answer.
- Whether it receives the job requirements, company research, Hiring Team personas, earlier answers in the session, and interview learnings (stage notes and What I've learned).
- The file and function that assemble its payload.
- One real example payload, trimmed, from the CSC-like application.

Finally, answer directly:
- Can a gap be judged no_evidence from the seeker's answer alone when the Personal Profile contains related experience?
- Can a talk track or resume bullet use Personal Profile experience that the seeker did not repeat in their answer?
