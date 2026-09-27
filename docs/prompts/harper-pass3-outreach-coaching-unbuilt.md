Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below.

TASK: Pass 3 of the approved plan: Send Outreach, Harper coaching after the follow-up limit, and unbuilt personas in outreach (plan items 7, 9, and 10), with the decisions below. Work on main. Commit and push when all checks pass.

1. Send Outreach (plan item 7)
- The page opens on outreach: the contact list, the selected person's messages, and the generator. The add-contact form is hidden until the seeker presses Add Contact.
- Add Contact is a button at the top and at the bottom of the page; both open the same existing form.
- Each generated message has Regenerate with a "What should Harper change?" box; it creates the next version of that message.
- When a message finishes generating, show a visible ready indicator on that person (for example, "Email ready"), with no job ids or timestamps.
- Keep the one generator and the sent history (type and date) under each person as they are.

2. Harper coaching after the follow-up limit (plan item 9)
- Pass followUpAlreadyUsed to the extract call.
- Add to Harper's extract instructions: when followUpAlreadyUsed is true and the reply is still incomplete, write coaching only: a short note to "you", then one example of a strong answer. The example uses only facts already in the Personal Profile, and marks missing pieces in brackets, such as [what you did], [the result], or [the number]. Never invent a metric, employer, title, or outcome. followUpQuestion is null. Ask no new question.
- Save that coaching as a Harper note on the gap that is not a follow-up: it does not count toward the follow-up limit, it produces no interview answer or resume bullet, and the gap stays open with Share some details available.
- The incomplete decision remains Harper's; add no text-pattern logic.
- Bump the consultation prompt version.

3. Unbuilt personas in outreach (plan item 10)
- When the seeker generates a message for a role whose persona is not fully built, do not build automatically. Show the existing cheat sheet prompt: "You have not fully built this persona. Do you want to build it now?"
- Yes builds the persona, then generates the message once the build is complete. No leaves the generator as it was, with no build and no message.
- Automatic role identification after company research stays unchanged.

TESTS
- Send Outreach opens without the add-contact form; both Add Contact buttons open it; each message has Regenerate with instructions; a completed message shows its ready indicator; the generator and sent history are unchanged.
- A second incomplete reply after the follow-up is used saves a Harper coaching note with a bracketed example, creates no follow-up and no statements, and leaves the gap open.
- Generating outreach for an unbuilt persona shows the build prompt and does not build; Yes builds, then generates; No does nothing; role identification after research is unchanged.

REPORT
What changed, one live Harper coaching note after the follow-up limit verbatim (with the web app, worker, and real model), files changed, and a full-suite result.
