Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PLAN ONLY. Do not change any code, configuration, schema, prompts, or data. Write the plan and stop. Coding starts only after the product owner approves it.

PRINCIPLES (the plan must follow these)
- Surgical: never remove existing functionality, buttons, or sections beyond what is listed.
- The seeker sees end results, never how the product makes them: no internal plans, raw inputs, mappings, timestamps, or technical wording.
- All of Harper's wording comes from her prompts; product code handles structure only.
- Anything the seeker adds is used by Harper (analyzed and applied), not just saved.

CHANGES TO PLAN

1. Application navigation colors
Red = nothing started. Yellow = started but not finished, including when Harper changes something in that step. Green = complete. Today only red and green appear. Send Outreach keeps its existing never-done treatment. Define exactly what counts as started and complete for each step.

2. NEW pills
Every NEW pill says what is new and where (for example, "New: cover letter version 3"). Today it only says NEW.

3. Labels
- "Update application date and status" becomes "Application Status".
- "Review Hiring Personas – Add Who Will Be Interviewing" becomes "Personas and Interviewers".

4. Job requirements
- "What I've learned" becomes a button at the top: "Enter any new requirements you have learned here". Keep the existing section too.
- Move the Edit button to the top. Keep the existing one too.

5. Resume and cover letter
- Show only the finished resume and cover letter. Remove Harper's plan text from view and the list that repeats every line as an edit box; editing happens in the document itself.
- Each document gets Regenerate with a "What should Harper change?" box. Harper uses the input to rewrite that document.
- Keep versions, Approve, and Download DOCX.

6. Personas and Interviewers
"I know who is interviewing me in this group" works the same as interview stages: choose from the application's existing contacts, or add new.

7. Send Outreach
- The page opens with outreach, not a data-entry form. Add Contact is a button at the top and at the bottom that opens data entry.
- Each generated message gets Regenerate.
- A visible indicator shows when generated content is ready.
- Report whether the earlier outreach task landed (one generator for Email, LinkedIn connection note, LinkedIn InMail, and Interview thank-you or follow-up, plus each person's sent history, with type and date, under their name), and plan whatever is missing.

8. Interview stage
- Next to the open stage, a button: "Add newly gained information here". Harper uses what is entered (regenerates that person's cheat sheet section and reassesses where relevant), not just saves it.
- A button: "Review open questions for this interview", which goes to that interview's open questions on the Interview Cheat Sheet.

9. Harper coaching after the follow-up limit
When a gap has used its one follow-up and the seeker sends another thin reply, Harper gives a short coaching note with an example of a strong answer, and asks no new question. The example uses the seeker's real Personal Profile facts and marks missing pieces in [brackets]; it never invents numbers or claims. Share some details stays open. This goes in Harper's prompt, not code.

10. Unbuilt personas in outreach
Personas are built only when the seeker needs them, never automatically. When the seeker picks a role for outreach whose persona is not fully built, show: "You have not fully built this persona. Do you want to build it now?" Yes builds it, then generates the message. This matches the existing behavior on the Interview Cheat Sheet.

THE PLAN MUST INCLUDE, for each change:
- Files and functions affected, and what each becomes.
- Prompt text to add or change, where relevant.
- Schema changes, and how they are safe on existing data.
- Risks, and anything that could change or break for the seeker.
- The tests that will prove it.

Also include: a proposed split into two or three coding passes, the order of work, anything in this list you believe is wrong or would cause harm (with reasons), and anything you find that conflicts with an earlier change.
