SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- No hardcoded vocabulary, branding, or tenant-specific values; use the product configuration module.
- Every error path handled; no silent failures or swallowed exceptions.
- Schema changes go through Prisma migrations that are safe on existing data.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.
- If anything cannot be completed to this standard, stop and report it rather than shipping a partial version.

TASK: Restructure the application workspace from one long page into an overview plus one page per step, with a numbered progress tracker in the side navigation, Harper as a docked side panel on every step, and a visual design system. Work on main. Commit and push when all checks pass.

WHY
The workspace is one long page of twelve stacked sections. The seeker scrolls to find things, everything competes for attention, nothing shows where they are, and ready notices stack up (production showed "Cover Letter is ready. View it" four times). Well-designed workflow products use a step rail with one step per page, an overview per item, and an assistant docked beside the work. Harper is the seeker's coach and belongs beside every step, not in a section they scroll to.

PART 1: Structure
1. Application overview page: company and job title, application status as a colored pill, applied date, Harper's next step, the key facts (employer fit rating, location and work arrangement, compensation as stated in the posting), and the progress tracker in summary form with links to each step.
2. One page per step, each with its own URL so links, bookmarks, and the browser back button work: Company, Job requirement (including employer fit), Hiring Team, Resume and Cover Letter, Outreach (including contacts), Interviews, Interview Cheat Sheet. Applied is an action on the overview and in the tracker, not a page. Move each existing section's content and behavior to its page; nothing is lost.
3. Step names come from the vocabulary module; the step list and order come from configuration.

PART 2: Progress tracker in the side navigation
1. Inside an application, the top of the side navigation shows the application's name and its numbered steps.
2. Each step shows its state: not started or needs attention in red, in progress in yellow with a spinner, done in green with a check. What "done" means for each step is defined in one place in code, from the application's real data (for example, Resume is done when a version is approved; Applied is done when an applied date is set).
3. The current step is highlighted in blue. Each step links to its page.
4. A step with a newly ready result shows a small "new" marker until the seeker views it. This replaces ready banners. At most one notice per item ever appears, for its latest result, cleared once viewed.
5. The tracker updates live as work completes, without a reload.
6. On small screens, the tracker collapses to a compact progress bar showing the current step, expandable to the full list.

PART 3: Harper as a docked panel
1. Harper lives in a panel docked on the right side of every application page, open by default on desktop and collapsible to a slim tab. On small screens, Harper opens as a full-height sheet from a floating button.
2. One continuous conversation per application, shared across all steps.
3. Harper knows which step the seeker is on and offers step-specific help as suggested actions in the panel, generated from the application's state (for example, on Resume: review this resume against the job; on Hiring Team: prepare for a specific person; on Interviews: prep for the next stage). These suggestions are model-written or drawn from configured action types, never hardcoded copy in components.
4. Keep all existing behavior: the briefing, the "Where you stand" summary with expandable evidence, the thinking indicator, polished statements with Use this, Change something, and Not accurate, and flags.
5. The panel's width is adjustable on desktop, and the step content reflows cleanly beside it.

PART 4: Visual design system
1. Define a design token set in one place (colors, typography scale, spacing, radii, shadows) and use it everywhere. No raw color values in components.
2. Palette, with meaning attached:
   - Blue: primary actions, links, the current step, focus rings.
   - Black (near-black ink): the side navigation background and headings, with white text on the navigation.
   - Green: done, success, approved.
   - Red: not started, needs attention, errors.
   - Yellow (amber): in progress, flags to review, warnings.
   - Neutral grays: surfaces, borders, secondary text.
   Pick specific values that pass WCAG AA contrast for text on their backgrounds, including white on blue and white on the navigation. Light tints of green, red, and yellow for status backgrounds, with darker shades for their text.
3. Status pills, cards, section headers, empty states (a short line of guidance and the next action, never a blank area), and skeleton loaders while content loads, all from shared components.
4. Apply the system across the whole seeker-facing app, not only the workspace: navigation, Personal Profile, Target Employers, applications list, settings, and billing. Fix every low-contrast element found, including the referral button, which currently renders white on white.
5. Keep the shared button component and spinner from the earlier task; restyle them with the tokens.

TESTS
- Each step has its own route, and back and forward navigation work.
- Step done states follow their definitions from real data; the tracker updates without reload and links correctly.
- New markers appear and clear on view; no duplicate ready notices render.
- Harper's panel keeps one conversation across steps and knows the current step.
- No component uses raw color values outside the token set.
- Automated contrast checks pass for text and status colors, including the referral button.

VERIFY
Run the app locally with the worker, on a real-scale application, and walk every step page in the browser on desktop and a small-screen viewport: the tracker states and colors, Harper's panel on each step, a ready marker clearing on view, and the referral button.

REPORT
The route structure, the step definitions of done, the token set with its color values and contrast results, screenshots of the overview, two step pages with Harper docked, and the small-screen tracker, files changed, and a full-suite result.
