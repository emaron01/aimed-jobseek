Save this prompt to docs/prompts/ before starting.

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

Read docs/product-vision.md before starting. No product code may write narrative, questions, or coaching text; the model writes, product code validates and organizes.

TASK: Make Harper a coach, not a form. Work on main. Commit and push when all checks pass. Do Part A first.

WHY
In production, the application workspace reads as a stack of forms: templated questions with Save buttons, a checklist of resume roles to hide, internal ids, and duplicated requirements. The product's promise is an honest personal recruiter who leads the seeker: tells them where they stand, draws out their stories in conversation, improves them on the spot, and recommends how to present them.

PART A: Defects
1. In production, the workspace showed "Consultation coaching could not be written. The planned questions are still here." followed by product-code-templated questions ("Tell a story about "<requirement text>". Cover the situation...") and a generic note ("Recruiter will care about this: A posted Director of Enterprise Sales role is screened before it reaches the hiring manager."). Remove every remaining code-written question, strategy, or note, including this fallback. When Harper's model call fails, show a clear status with a retry action and log the error with its cause. Find why the call failed in production (for example, missing CONSULTATION_AI_* configuration) and make a missing configuration fail loudly at startup, as brand configuration does.
2. Never show internal ids (for example, "direction_function_1, role_5") to the seeker. Show the evidence in plain language (the role title and employer, or the achievement text), with the detail available on selection.
3. Merge duplicated requirements: when a scorecard item and a posting requirement say the same thing, show one item. Deduplicate by meaning.

PART B: Harper as a conversation
1. Opening briefing: at the top of the consultation, Harper writes a short briefing: how the seeker stacks up for this role overall, their two or three strongest angles, the two or three gaps that matter most, and the plan (which stories to work on first).
2. Conversation thread: replace the question form with a chat-style thread. Harper asks one question at a time. The seeker replies in their own words, as much or as little as they like. Harper responds in the thread with brief coaching (what is strong, what would make it stronger), and, when the story is complete enough, the polished interview answer and resume bullet inline.
3. Confirmation is conversational: under each polished result, "Use this" (confirms the facts and statements; the existing confirmation and write-back apply), "Change something" (the seeker types what to change and Harper revises), or "Not accurate" (Harper asks what is wrong). No separate Save answer step. The seeker can always type freely in the thread instead of using the buttons.
4. Harper moves to the next priority on its own when a topic is done, and tells the seeker when the plan is complete.
5. The requirement-by-requirement evidence view becomes a collapsible "Where you stand" panel, deduplicated, in plain language, updated as the conversation progresses.
6. The thread persists; the seeker can leave and return to it.

PART C: Resume and cover letter as recommendations
1. Before generating a resume, Harper writes a resume plan for this job: which roles lead, which stories and bullets to feature, the summary angle, and a recommendation for older or less relevant roles (for example, condensing roles older than a configured number of years into an "Earlier experience" section listing title and employer). Each recommendation has a one-line reason.
2. The seeker accepts the plan with one click or adjusts it by typing to Harper. The role checklist moves to an "Adjust manually" option, collapsed by default.
3. Condensing a role is presentation, not hiding: condensed roles still appear with title and employer. The system never removes a role without the seeker accepting a plan that says so.
4. The cover letter follows the same pattern: a short plan (angle, the stories to use, how to handle the main gap), accept or adjust, then generate.
5. "What should change?" remains available after generation for revisions.

PART D: Guided next step
At the top of the application workspace, show one clear next step written by Harper based on the application's state (for example: "Start with Harper: two stories will strengthen this application", "Your resume plan is ready", "Mark this application as applied once you submit it"). Other sections stay available below, collapsed until relevant.

TESTS
- No code-written question, strategy, or note text exists anywhere; a model failure shows status and retry only.
- Missing CONSULTATION_AI_* configuration fails at startup in production.
- No internal id is rendered in seeker-facing views.
- Duplicate requirements merge by meaning.
- The thread supports free reply, Use this, Change something, and Not accurate; Use this writes through the existing confirmation path.
- Harper advances to the next priority and reports when the plan is complete.
- The resume plan must be accepted before any role is condensed; condensed roles still show title and employer.
- The next-step card changes with application state.

REPORT
Real model output from the ASSET_AI and CONSULTATION_AI roles, using a sales leadership profile and a Director of Enterprise Sales posting: Harper's opening briefing, a two-turn conversation (a brief seeker reply, Harper's coaching, the seeker's fuller reply, the polished result), the resume plan with reasons, and the next-step card at three application states. Also the production failure cause, migrations, prompt versions, files changed, and a full-suite result.
