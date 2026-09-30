import {
  buildCheatSheetPersonaAction,
  generateApplicationSummaryAction,
} from "@/app/actions/application-summary";
import { AdditionalInterviewPrepQa } from "@/components/AdditionalInterviewPrepQa";
import { CheatSheetSubsection } from "@/components/CheatSheetCollapsible";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { CheatSheetCoachItems } from "@/components/CheatSheetCoachItems";
import { statedListItems } from "@/lib/application-summary/display";
import { cheatSheetLikelyQuestionsElementId } from "@/lib/application-summary/filter";
import type { NotesFromInterviewEntry } from "@/lib/application-summary/interview-notes";
import { notesFromInterviewsWithHeading } from "@/lib/application-summary/interview-notes";
import type { CheatSheetNote } from "@/lib/application-summary/notes";
import type { CheatSheetPersonSection } from "@/lib/application-summary/contract";
import type { AdditionalPrepQaEntry } from "@/lib/consultation/additional-prep-qa";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { ADDITIONAL_INTERVIEW_PREP_QA_HEADING } from "@/lib/consultation/additional-prep-qa";
import {
  applicationSummaryConfig,
  consultationConversationCopy,
} from "@/lib/product-config";

function CoachingDisclaimer() {
  return (
    <p className="text-sm text-muted" data-testid="harper-coaching-disclaimer">
      {consultationConversationCopy.coachingDisclaimer}
    </p>
  );
}

function TextList({ items }: { items: readonly string[] }) {
  const stated = statedListItems(items);
  if (stated.length === 0) return <p className="text-sm text-subtle">Not stated.</p>;
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
      {stated.map((item, index) => (
        <li key={`${index}:${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function NotesFromInterviewsSection({
  personName,
  sectionKey,
  entries,
}: {
  personName: string;
  sectionKey: string;
  entries: NotesFromInterviewEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <CheatSheetSubsection
      id={`${sectionKey}-notes`}
      title={notesFromInterviewsWithHeading(personName)}
    >
      <div data-testid="notes-from-interviews-with">
        <ul className="space-y-3 text-sm text-ink">
          {entries.map((entry) => (
            <li key={entry.id} data-testid={`interview-note-${entry.id}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">
                {entry.interviewLabel} · {entry.kindLabel}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{entry.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </CheatSheetSubsection>
  );
}

export function CheatSheetPersonBody({
  campaignId,
  canEdit,
  sectionKey,
  section,
  notes,
  personaBuilt,
  personaId,
  showCoachAnswerForms = true,
  coachQaItems = [],
  jobsActive = false,
  showReply = true,
  harperLinkContactId = null,
  interviewNotes = null,
  interviewNotesPersonName = null,
  additionalPrepEntries = [],
}: {
  campaignId: string;
  canEdit: boolean;
  sectionKey: string;
  section: CheatSheetPersonSection | null;
  notes: CheatSheetNote[];
  personaBuilt: boolean;
  personaId: string;
  /**
   * When false, coach items still display; answer forms only appear when
   * this is true and jobsActive is false (Cheat Sheet default true).
   */
  showCoachAnswerForms?: boolean;
  /** Harper person view: existing ConsultationQaItems for profile coach items. */
  coachQaItems?: ConsultationQaItem[];
  jobsActive?: boolean;
  showReply?: boolean;
  /** Cheat Sheet read-only: Edit/Answer links open Harper for this contact. */
  harperLinkContactId?: string | null;
  /**
   * Cheat Sheet Batch B4: compiled interview notes. When non-null, replaces the
   * simple gained-information list (Harper still uses `notes`).
   */
  interviewNotes?: NotesFromInterviewEntry[] | null;
  interviewNotesPersonName?: string | null;
  /** Batch B5: Direct-role secondary answered Q&A (display-only). */
  additionalPrepEntries?: AdditionalPrepQaEntry[];
}) {
  const useInterviewNotesSection = interviewNotes != null;
  const notesBlock = useInterviewNotesSection ? (
    <NotesFromInterviewsSection
      personName={interviewNotesPersonName ?? ""}
      sectionKey={sectionKey}
      entries={interviewNotes}
    />
  ) : notes.length > 0 ? (
    <CheatSheetSubsection
      id={`${sectionKey}-notes`}
      title={applicationSummaryConfig.sections.gainedInformation}
    >
      <TextList items={notes.map((note) => note.text)} />
    </CheatSheetSubsection>
  ) : null;
  const additionalPrepBlock =
    additionalPrepEntries.length > 0 ? (
      <CheatSheetSubsection
        id={`${sectionKey}-additional-prep`}
        title={ADDITIONAL_INTERVIEW_PREP_QA_HEADING}
      >
        <AdditionalInterviewPrepQa
          campaignId={campaignId}
          entries={additionalPrepEntries}
          showHeading={false}
        />
      </CheatSheetSubsection>
    ) : null;

  if (!personaBuilt) {
    return (
      <div className="space-y-3" data-testid={`unbuilt-persona-${sectionKey}`}>
        <CoachingDisclaimer />
        <p className="text-sm text-ink">{applicationSummaryConfig.sections.unbuiltPersona}</p>
        {canEdit ? (
          <ApplicationActionForm
            action={buildCheatSheetPersonaAction}
            submitLabel={applicationSummaryConfig.actions.buildPersonaNow}
            testId={`build-cheat-sheet-persona-${sectionKey}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="personaId" value={personaId} />
          </ApplicationActionForm>
        ) : null}
        {notesBlock}
        {additionalPrepBlock}
      </div>
    );
  }

  if (!section) {
    return (
      <div className="space-y-3">
        <CoachingDisclaimer />
        {canEdit ? (
          <ApplicationActionForm
            action={generateApplicationSummaryAction}
            submitLabel={applicationSummaryConfig.actions.generateSection}
            testId={`generate-cheat-sheet-${sectionKey}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="sectionKey" value={sectionKey} />
          </ApplicationActionForm>
        ) : null}
        {notesBlock}
        {additionalPrepBlock}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CoachingDisclaimer />
      {notesBlock}
      <CheatSheetSubsection
        id={`${sectionKey}-cares-about`}
        title={applicationSummaryConfig.sections.caresAbout}
      >
        <ul className="list-disc space-y-3 pl-5 text-sm text-ink">
          {section.caresAbout.map((item, index) => (
            <li key={`${index}:${item.text}`}>
              <p>{item.text}</p>
              {item.seekerConnection ? (
                <p className="mt-1 text-ink">
                  <span className="font-medium">
                    {applicationSummaryConfig.sections.seekerConnection}:{" "}
                  </span>
                  {item.seekerConnection}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </CheatSheetSubsection>
      <CheatSheetSubsection
        id={`${sectionKey}-positioning`}
        title={applicationSummaryConfig.sections.positioningStatements}
      >
        <TextList items={section.positioningStatements.map((item) => item.text)} />
      </CheatSheetSubsection>
      <CheatSheetSubsection
        id={`${sectionKey}-key-statements`}
        title={applicationSummaryConfig.sections.keyStatements}
      >
        <TextList items={section.keyStatements.map((item) => item.text)} />
      </CheatSheetSubsection>
      <CheatSheetSubsection
        id={cheatSheetLikelyQuestionsElementId(sectionKey)}
        title={applicationSummaryConfig.sections.likelyQuestions}
      >
        <CheatSheetCoachItems
          campaignId={campaignId}
          canEdit={canEdit && showCoachAnswerForms}
          items={section.likelyQuestions}
          qaItems={coachQaItems}
          jobsActive={jobsActive}
          showReply={showReply}
          harperLinkContactId={harperLinkContactId}
        />
      </CheatSheetSubsection>
      <CheatSheetSubsection
        id={`${sectionKey}-questions-to-ask`}
        title={applicationSummaryConfig.sections.questionsToAsk}
      >
        <ul className="list-disc space-y-3 pl-5 text-sm text-ink">
          {section.questionsToAsk.map((item, index) => (
            <li key={`${index}:${item.text}`}>
              <p>{item.text}</p>
              {item.followUps.length > 0 ? (
                <div className="mt-1">
                  <p className="font-medium">
                    {applicationSummaryConfig.sections.followUps}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {item.followUps.map((followUp) => (
                      <li key={followUp}>{followUp}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </CheatSheetSubsection>
      {additionalPrepBlock}
    </div>
  );
}
