SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below.

TASK: Let the seeker edit contacts, with a Contacts page for each application. Work on main. Commit and push when all checks pass.

PROBLEM
Once a contact exists (for example, Christina Schivley, captured from the posting), there is no way to edit them or add their interviewer profile.

REQUIRED
1. One contact edit form, prefilled with the contact's current data: first name, last name, title, email, LinkedIn URL (an optional saved link only; never fetched), Hiring Team role, and "Paste Interviewer Profile". "Paste Interviewer Profile" accepts any pasted text about the person: a copied LinkedIn page, a bio, a company team page, or a document.
2. The global Contacts page gets Edit on every contact, opening that form.
3. Add a Contacts page for each application, listing that application's contacts with Edit on each. Link it at the bottom of the application's navigation, after the numbered steps.
4. Edit shortcuts open the same form in three more places: the Send Outreach contact list, the person shown under a Hiring Team persona, and the interviewer on an interview stage.
5. Saving updates the contact everywhere it appears. Saving new or changed "Paste Interviewer Profile" text runs the interviewer extraction on that text, rebuilds the individual profile (including likelyToValue), and regenerates that person's cheat sheet section.
6. Existing contacts keep all their data, messages, and interview stages.

TESTS
- Edit opens the same prefilled form from the global Contacts page, the application Contacts page, Send Outreach, the Hiring Team persona, and the interview stage.
- The application Contacts page lists only that application's contacts and is linked at the bottom of the application navigation.
- Saving updates the contact everywhere it appears.
- Pasting a LinkedIn page, a bio, or a team-page paragraph into an existing contact runs extraction and the individual profile, and regenerates their cheat sheet section.
- No existing contact data, messages, or stages are lost.

REPORT
What changed, files changed, and a full-suite result.
