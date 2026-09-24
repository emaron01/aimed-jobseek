Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Fix outreach message quality and test flakiness. Work on main. Commit and push when all checks pass.

1. Greetings
Use the contact's first name with the greeting style from configuration (default "Hi {firstName},"). Never full-name formal greetings such as "Dear Priya Shah,". The neutral greeting for messages without a contact stays as configured.

2. Redirect line only for guesses
The "if you're not the right person, a pointer to who is would help" line is used only when the recipient's role is unconfirmed: no contact, or a contact whose role was matched from a title the seeker found. Contacts named in the posting, and contacts whose role the seeker has confirmed, never get the redirect line. Store whether a contact's role is confirmed, via migration if needed.

3. Follow-ups add something new
- A follow-up is shorter than the original message.
- It references the earlier message in a few words and adds something new: a different proof point or approved statement, a relevant company development from research, or a specific reason the timing matters. It does not repeat the earlier message's proof point, ask, or sentences.
- Add a thread-level repetition check: any sentence or proof point substantially repeated from an earlier message in the same thread triggers regeneration.
- If no new material exists, keep the follow-up to a brief, polite check-in rather than repeating content.

4. Persona-specific relevance
For proactive messages to Hiring Team roles, the reason this person is relevant must come from that role's persona: their pressures, what the hire changes for them, or how the seeker's work would connect to theirs. Generic statements such as "given the role's collaboration with the team" are rejected and regenerated.

5. Test flakiness
The platform-admin, zod-json-schema, and pending-signup-intent tests time out under the parallel run. Fix the causes as done previously (fake timers, mocks, isolation, avoiding heavy imports). Only a test that is legitimately slow after that gets an explicit per-test timeout with a comment. Run the full suite three times in a row; it must pass all three.

Bump the prompt versions for every outreach type changed.

TESTS
- Greeting uses the first name and configured style.
- No redirect line for posting-named or confirmed contacts; present for guesses.
- A follow-up shorter than the original, with no repeated proof point or sentence.
- A thread repetition hit triggers regeneration.
- Generic relevance statements are rejected.

REPORT
Real model output (actual calls) regenerating the four samples from the last report: the connection note, the InMail to an Indirect role, the email to Priya, and the follow-up. Also prompt versions, any migration, the flake causes found, and three full-suite results.
