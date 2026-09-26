SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

TASK: Restore editing and Harper's interactions, remove leftover flags, restyle the side navigation, and move the application date and status step to the top. Work on main. Commit and push when all checks pass. Change nothing else.

1. Company page: add an update section so the seeker can edit the company information and add information.
2. Job requirements page: restore the ability to edit the job requirements. Editing was lost in the restructure.
3. Harper page (/campaigns/[id]/consultation):
   - Restore every interaction that was in the removed right-hand pane. The seeker can reply to Harper in a message box, Harper asks questions and responds, and the seeker can use Use this, Change something, and Not accurate on polished statements, plus the step-specific suggested actions. Today the page shows the conversation as text only, with no way to interact. Only the pane's redundant text was meant to be removed, not its interactions.
   - Once the seeker's reply is stored, show only Harper's content. The seeker's own replies are hidden, collapsed behind a control to show them again when the seeker wants to go back to them.
4. Interview Cheat Sheet: it still shows "This number isn't in your materials. Keep it, edit it, or remove it." Remove claim flags entirely: remove flag generation from every generator and all flag UI, and clear existing flag data with a migration that is safe on existing data, so no flag renders anywhere again.
5. Side navigation: navy blue background with white buttons. Keep the red, yellow, and green step states and the step numbers. Update the design tokens.
6. Move "Update application date and status" to the top: it becomes step 1 in the side navigation tracker and in the Application steps list on the overview, and its section appears at the top of the overview page. Renumber the other steps in their current order.

TESTS
- The company information can be edited and added to.
- The job requirements can be edited.
- On the Harper page, the seeker can reply, receive Harper's response, and use Use this, Change something, Not accurate, and the suggested actions.
- After a reply is stored, only Harper's content shows; the seeker's replies are collapsed and can be shown again.
- No flag renders anywhere, including on existing records.
- The side navigation is navy with white buttons and keeps the step states and numbers; contrast passes WCAG AA.
- "Update application date and status" is step 1 in the tracker and the steps list, and its section is at the top of the overview.

REPORT
What changed for each item, the navy token value and its contrast results, files changed, and a full-suite result.
