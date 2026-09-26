Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Show each person's sent history under their name, and replace the separate message cards with one generator. Work on main. Commit and push when all checks pass. Change nothing else.

1. Sent history under each person: in the contact list on the Send Outreach page, under each person's name, list what was sent and when, like the Aimed Outreach sequence (for example, "Email · Sent Sep 26", "LinkedIn connection note · Sent Sep 27"). Clicking an entry opens that message.
2. One generator for the selected person, replacing the separate cards per message type. The seeker chooses what they are sending:
   - Email
   - LinkedIn connection note
   - LinkedIn InMail
   - Interview thank-you / follow-up
3. A prompt box with the generator, where the seeker types instructions for this message (for example, "thank her for the call and mention the forecast discussion"). The instructions are used when generating.
4. Each generated message is saved to that person's sequence with its type and, once marked sent, its sent date.
5. Keep the existing sending buttons as they are: Open in Outlook web, Open in Outlook desktop, Open in Gmail, Copy message, and Download approved resume.

TESTS
- Each person's sent messages appear under their name with type and date, and open on click.
- One generator produces each of the four message types for the selected person.
- The prompt box instructions are used in generation.
- Generated messages save to the person's sequence with type and sent date.

REPORT
What changed, a screenshot of the Send Outreach page with a person showing two sent messages and the generator, files changed, and a full-suite result.
