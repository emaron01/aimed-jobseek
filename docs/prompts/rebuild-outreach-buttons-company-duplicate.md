SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Rebuild Send Outreach to work the way Aimed Outreach's contact and email sequence workspace works, make Hiring Team personas visibly clickable, standardize every button, and remove a duplicate on the Company page. Work on main. Commit and push when all checks pass. Do not over-engineer; change nothing else.

PART 1: Send Outreach, the Aimed Outreach way
The current outreach page is a generator form with no record of who was sent what. Replace it with the contact and sequence workspace pattern that Aimed Outreach uses (that workspace code is in this repository, gated off; reuse it rather than building new).
1. Add contact: first name, last name, and title (required), email and LinkedIn URL (optional). The seeker assigns a Hiring Team role (persona) to the contact, as Aimed Outreach assigns a persona today.
2. Contact list for the application: each contact shows name, title, Hiring Team role, and status.
3. Selected contact: the sequence of every message to that contact, in order, with its type and sent date. Messages are generated and curated one at a time; the seeker adds the next message to the sequence.
4. Each message is flagged with its type: Email, LinkedIn connection note, or LinkedIn InMail.
5. Sending works as today: email opens in Outlook web, Outlook desktop, or Gmail; LinkedIn messages are copied. The seeker marks each message sent with its date.
6. Remove the current generator form from the Send Outreach page.

PART 2: Hiring Team personas are visibly clickable
The Hiring Team page gives no indication that a persona can be clicked to edit it or build it. Make each persona's Edit and Build actions clearly visible as buttons.

PART 3: Every button standardized
Buttons across the app are not standardized. In production, the email handoff buttons (Outlook web, Outlook desktop, Gmail) render as white text on white, and the account button in the top right is a bright blue block with low-contrast gray text and a black circle.
1. Every button and action link in the seeker-facing app uses the shared button component and its variants (primary, secondary, danger), styled only from the design tokens. Find and replace every button that does not.
2. Every button's text meets WCAG AA contrast against its background.
3. Restyle the top-right account button with the design tokens: readable name, clean avatar, consistent with the rest of the header.
4. Walk every seeker-facing page in the browser after the change and fix any button that is unreadable or inconsistent. Include screenshots in the report.

PART 4: Company page duplicate
The Company page shows "Employer research: Done. Research finished." twice, once under Company and again under Employer identity. Show it once.

TESTS
- A contact is added with name and title, assigned a Hiring Team role, and appears in the list with status.
- Each contact's sequence lists every message with its type and sent date.
- Messages can be Email, LinkedIn connection note, or LinkedIn InMail.
- Hiring Team personas show visible Edit and Build buttons.
- Every seeker-facing button uses the shared component and passes contrast checks, including the handoff buttons and the account button.
- "Employer research" status appears once on the Company page.

REPORT
What changed in each part, what was reused from the Aimed Outreach workspace, every button replaced, screenshots of the outreach page, the Hiring Team page, the Company page, and the header, files changed, and a full-suite result. CONFIRM EACH WAS COMPLETED
