SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

Read docs/product-vision.md before starting. Follow the prompt content layer pattern in src/lib/prompt-content/. No product code may write narrative text; the model writes, product code validates and organizes.

TASK: Fix the employer identity controls, rebuild the Hiring Team flow to identify automatically and build on demand, add LinkedIn profile paste for real people, and move long generation out of web requests. These are production defects seen on Render. Work on main. Commit and push when all checks pass.

OBSERVED IN PRODUCTION
A. The seeker typed "CSC" in "Correct company name" and "https://www.cscglobal.com" in "Company website", then submitted. The form showed "Enter the employer's name." (the value was not received) and the button stayed on "Saving..." indefinitely.
B. On a posting where Location matched (Wilmington, Delaware) and Website matched (cscglobal.com on both sides), with Size or stage "Not stated in the research", the identity was still unconfirmed. Clicking "This is not the company" stayed on "Saving..." indefinitely.
C. Directly below, "Employer research: Not requested" was shown, although research results were displayed above it and the worker log shows the application's research runs COMPLETED.
D. Render log: {"event":"hiring_team_synthesis_failed","roleName":"Channel Partnerships Leader","message":"Hiring Team role Responses API timed out after 90000ms."} The identity save identifies AND synthesizes every Hiring Team role inside the web request, which is why the buttons hang.

PART 1: Employer identity controls
1. Form wiring: the correction form's fields must reach the server action. Find why the name arrived empty (field names, form state reset, or a controlled input not submitting) and fix it. Test by submitting the real form component, not only the action.
2. No stuck buttons: every button on the application workspace that calls a server action ends in a success state or a visible error, always. Find why these actions never resolved and fix the cause. Test that each identity action resolves.
3. Research status: the Employer research status reflects the application's actual research state (queued runs and CompanyResearch), consistent with the identity panel. Test that completed research never shows "Not requested".
4. Identity verdict: a matching website or domain is strong identity evidence. When the website matches and nothing is a material mismatch, the identity is MATCHED. "Not stated" on either side never counts as a mismatch. Test: location match plus website match plus size not stated is MATCHED.
5. After a correction (name and website), research is queued for the corrected employer, the status shows Queued, Researching, then Done, and the identity is verified again.

PART 2: Hiring Team, identified automatically and built on demand (the pattern this codebase uses for product personas)
1. Automatic: identification only. After research is confirmed (or from the job requirement when research is rejected or undisclosed), identify the roles as one queued job processed by the worker: role name, likely titles, department, Direct or Indirect, and why involved. The identity action queues it and returns immediately.
2. Review: the seeker reviews the identified list, can edit a role's name and titles, add a role the system missed, and remove roles.
3. Build on demand: each role has a Build persona action. The seeker builds only the roles they want, one at a time, plus a "Build all Direct roles" shortcut. Each build is a queued job with its own status (Queued, Building, Built, Failed with retry). Timeouts retry within the configured limit, then show Failed with retry.
4. Never rebuild automatically. When research or the job requirement changes, re-identification updates the list, and built personas are marked stale with a Rebuild action.
5. Downstream: generating outreach or an interview guide for a role whose persona is not built offers to build it first (queued, with status), then continues. Consultation and the Application Summary use built personas and name unbuilt roles without inventing detail.

PART 3: LinkedIn profile paste for a real person
When the seeker learns who they will meet (usually when an interview is scheduled), they get the person's real background. The persona is tightened with it.
1. On any contact (including interviewers), the seeker can paste the text of that person's LinkedIn profile. Paste only; nothing is fetched or scraped. Stored on the contact, scoped to this application.
2. From the pasted text, extract as FACT with provenance to the paste: current title, current employer and tenure, prior employers and roles, education, and stated areas of focus. The contact's actual title replaces the guessed title, and the contact's Hiring Team role match is re-checked; the seeker can change it.
3. Build an individual profile for that person, layered on their Hiring Team role persona: what their background suggests they will care about in this interview, and talking points tailored to them. Every inference is marked INFERENCE and phrased as such. Never speculate about personality, age, or personal life.
4. Common ground: list factual overlaps between the person and the seeker's Personal Profile (shared employers, schools, industries, or roles), each citing both sources. Only exact, verifiable overlaps; no stretching.
5. Interview guides, thank-you messages, and outreach to that contact use the individual profile when it exists. Regenerate is offered, never automatic.
6. The individual profile build is a queued job with status, like persona builds.

PART 4: Long generation out of web requests
Audit every generation path that runs inside a web request: consultation, resume, cover letter, outreach, interview guides, and the Application Summary. Move each one that can exceed a normal request duration to the worker queue, with visible status and a retry action on failure, following the research pattern. List every path and what you did with it.Next-step card quality: the card must describe an action the seeker can take in the product right now, in specific terms. Harper is started in the workspace, never "scheduled". Reject and regenerate generic or inaccurate cards. Test: the not-started consultation state produces a card that starts Harper, not one that schedules it.

Also check every form and button on the application workspace (application creation, Applied, contacts, assets, outreach, interview stages) for fields not reaching the action and buttons that can stay on "Saving..." forever. Fix any you find and list them.

TESTS
- The correction form submits its values; every identity action resolves.
- Completed research never shows "Not requested".
- Website match with no material mismatch is MATCHED; "Not stated" never counts as a mismatch.
- The identity save returns immediately and queues identification only; no persona is built automatically.
- Build persona and Build all Direct roles queue jobs with per-role status; timeouts end in Failed with retry.
- Changes mark built personas stale without rebuilding them.
- A pasted LinkedIn profile replaces the guessed title with FACT, re-checks the role match, and produces common ground only from exact overlaps.
- Guides and thank-yous for a contact with an individual profile use it.
- Every moved generation path runs through the queue with status and retry.

REPORT
The cause of each production defect, the fixes and tests, real model output for a Hiring Team identification, one built persona, and one individual profile from a sample pasted LinkedIn profile (with common ground), every generation path and where it now runs, every other form or button defect found, migrations, prompt versions, the environment variables the worker now needs (names only), files changed, and a full-suite result.
