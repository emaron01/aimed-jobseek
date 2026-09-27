# Prompt: Phase 4 Pass A — remove legacy repair + assets page

SCOPE GUARD
This task runs ONLY in the aimed-jobseek repository. Confirm the repository and remote before making changes. Never touch any other repository.

PRODUCTION STANDARD (applies to every change in this task)
- No placeholders, TODOs, stubs, mock data in production paths, commented-out code, or temporary fallbacks.
- Every error path handled; no silent failures or swallowed exceptions.
- Tests cover the new behavior, and the full suite, typecheck, lint, and production build pass.

SURGICAL RULE
Change only what is listed below. Passes B and C of the approved Phase 4 plan come later; do not start them.

TASK: Phase 4 Pass A: remove legacy data repair (plan section 1, as approved), and fix the resume and cover letter page. Work on main. Commit and push when all checks pass.

PART 1: Remove legacy data repair (plan section 1)
Implement the plan's "Remove" classifications as written:
- Delete prepareExistingConsultationSession and every call site (ConsultationSection, startConsultation, and the CONSULTATION job path).
- Delete repairExistingConsultationSession and repair-existing.ts, reextractExistingWhyThisCompanyMotivation, regenerateCannedConsultationWording, and regenerateFirstPersonCoaching, with their once-markers.
- Remove the page-load repair_results enqueue and the repair_results job path. Polish that fails at write time shows the existing Retry state; seeker-triggered Regenerate stays.
- Remove the automatic page-load reassessment on prompt version changes. Keep reassessment from seeker actions: Missing relevant experience, interview notes, and job requirement updates.
- Slim the seen-state migration to return current-version data as is, with no rewriting of old key shapes.
- Delete queueExistingInterviewerProfileRebuilds.
- Remove queueMissingNamedEmployerResearch from worker startup. First confirm that creating or updating an application with a named employer always starts research in the normal flow, and prove it with a test.
- enqueueMissingInterviewerCheatSheetSections: keep only enqueuing a section a current interviewer needs and does not have; remove any scan-and-backfill behavior.
Keep as is: abandonStale* recovery, supersedeObsoleteWorkspaceFailures, mergeExistingHiringTeamRoles (a later pass), duplicate-question prevention, and the 10-question cap. Confirm both of the latter are enforced when questions are created, including follow-ups.

PART 2: Resume and cover letter page
Production shows every part of the resume and cover letter as editable text boxes, with no document formatting (for example, the name, city, phone, and email each sit in separate boxes with stray separators). The seeker must see the finished document.
1. At the top of the page, two buttons: "View/Edit Resume" and "View/Edit Cover Letter". One document shows at a time, full width. The resume shows by default.
2. The document shows formatted as it will look in the DOCX: the name as the heading, the contact details on one line separated by " | ", section headings, roles with dates, and bullets. No text boxes in this view.
3. An "Adjust manually" button switches that document into edit mode. Save as new version saves the edits and returns to the formatted view; Cancel returns without saving.
4. Below the document: the "What should Harper change?" box and Regenerate.
5. Keep versions, Approve, and Download DOCX.

TESTS
- No removed repair routine or marker remains in live code; opening the Harper page or processing a job changes no stored data except what the action itself requires.
- Creating or updating an application with a named employer starts research without the worker startup queue.
- Duplicate prevention and the 10-question cap hold for new questions and follow-ups.
- The resume and cover letter page shows one document at a time via the two top buttons, formatted with no text boxes; Adjust manually enters edit mode and Save as new version returns to the formatted view; Regenerate with instructions sits below the document; versions, Approve, and Download DOCX still work.

REPORT
What was removed and what was kept, the named-employer research proof, files changed, a screenshot of the formatted resume view and of edit mode, and a full-suite result.
