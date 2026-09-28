import {
  buildCheatSheetPersonaAction,
  generateApplicationSummaryAction,
} from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { CheatSheetCoachItems } from "@/components/CheatSheetCoachItems";
import { statedListItems } from "@/lib/application-summary/display";
import { cheatSheetLikelyQuestionsElementId } from "@/lib/application-summary/filter";
import type { CheatSheetNote } from "@/lib/application-summary/notes";
import type { CheatSheetPersonSection } from "@/lib/application-summary/contract";
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

export function CheatSheetPersonBody({
  campaignId,
  canEdit,
  sectionKey,
  section,
  notes,
  personaBuilt,
  personaId,
  showCoachAnswerForms = true,
}: {
  campaignId: string;
  canEdit: boolean;
  sectionKey: string;
  section: CheatSheetPersonSection | null;
  notes: CheatSheetNote[];
  personaBuilt: boolean;
  personaId: string;
  /** When false, likely questions display without the Cheat Sheet reply form (Harper person view). */
  showCoachAnswerForms?: boolean;
}) {
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
        {notes.length > 0 ? (
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.gainedInformation}
            </h3>
            <TextList items={notes.map((note) => note.text)} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CoachingDisclaimer />
      {notes.length > 0 ? (
        <div>
          <h3 className="font-medium text-ink">
            {applicationSummaryConfig.sections.gainedInformation}
          </h3>
          <TextList items={notes.map((note) => note.text)} />
        </div>
      ) : null}
      <div>
        <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.caresAbout}</h3>
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
      </div>
      <div>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.positioningStatements}
        </h3>
        <TextList items={section.positioningStatements.map((item) => item.text)} />
      </div>
      <div>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.keyStatements}
        </h3>
        <TextList items={section.keyStatements.map((item) => item.text)} />
      </div>
      <div id={cheatSheetLikelyQuestionsElementId(sectionKey)}>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.likelyQuestions}
        </h3>
        <CheatSheetCoachItems
          campaignId={campaignId}
          canEdit={canEdit && showCoachAnswerForms}
          items={section.likelyQuestions}
        />
      </div>
      <div>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.questionsToAsk}
        </h3>
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
      </div>
    </div>
  );
}
