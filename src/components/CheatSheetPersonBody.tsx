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
import { personSectionRoleCoachViews } from "@/lib/application-summary/coach";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
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
  coachQaItems = [],
  jobsActive = false,
  showReply = true,
  /** Harper person view only: restore legacy recruiter/HM coach blocks. Cheat Sheet leaves false. */
  showRoleKindCoachSections = false,
}: {
  campaignId: string;
  canEdit: boolean;
  sectionKey: string;
  section: CheatSheetPersonSection | null;
  notes: CheatSheetNote[];
  personaBuilt: boolean;
  personaId: string;
  showCoachAnswerForms?: boolean;
  coachQaItems?: ConsultationQaItem[];
  jobsActive?: boolean;
  showReply?: boolean;
  showRoleKindCoachSections?: boolean;
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

  const roleCoach = showRoleKindCoachSections
    ? personSectionRoleCoachViews(section)
    : { recruiter: null, hiringManager: null };
  const coachCanEdit = canEdit && showCoachAnswerForms;

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
      {roleCoach.recruiter ? (
        <div className="space-y-4" data-testid="harper-role-coach-recruiter">
          {roleCoach.recruiter.sixtySecondSummary ? (
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.recruiterSummary}
              </h3>
              <p className="mt-1 text-sm text-ink">
                {roleCoach.recruiter.sixtySecondSummary}
              </p>
            </div>
          ) : null}
          {roleCoach.recruiter.whyThisCompany ? (
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.whyThisCompany}
              </h3>
              <p className="mt-1 text-sm text-ink">
                {roleCoach.recruiter.whyThisCompany}
              </p>
            </div>
          ) : null}
          {roleCoach.recruiter.whyThisRole ? (
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.whyThisRole}
              </h3>
              <p className="mt-1 text-sm text-ink">{roleCoach.recruiter.whyThisRole}</p>
            </div>
          ) : null}
          {roleCoach.recruiter.logistics ? (
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.logistics}
              </h3>
              <p className="mt-1 text-sm text-ink">{roleCoach.recruiter.logistics}</p>
            </div>
          ) : null}
          {roleCoach.recruiter.compensationReadiness ? (
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.compensation}
              </h3>
              <p className="mt-1 text-sm text-ink">
                {roleCoach.recruiter.compensationReadiness}
              </p>
            </div>
          ) : null}
          {roleCoach.recruiter.flagAnswers.length > 0 ? (
            <div data-testid="harper-coach-flagAnswers">
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.flagAnswers}
              </h3>
              <CheatSheetCoachItems
                campaignId={campaignId}
                canEdit={coachCanEdit}
                items={roleCoach.recruiter.flagAnswers}
                qaItems={coachQaItems}
                jobsActive={jobsActive}
                showReply={showReply}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {roleCoach.hiringManager ? (
        <div className="space-y-4" data-testid="harper-role-coach-hiring-manager">
          {roleCoach.hiringManager.scorecardOutcomes.length > 0 ? (
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.scorecard}
              </h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink">
                {roleCoach.hiringManager.scorecardOutcomes.map((item) => (
                  <li key={item.outcome}>
                    {item.outcome}
                    {item.storyId ? ` · story ${item.storyId}` : ""}
                    {item.note ? ` — ${item.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {roleCoach.hiringManager.firstNinetyDays ? (
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.firstNinetyDays}
              </h3>
              <p className="mt-1 text-sm text-ink">
                {roleCoach.hiringManager.firstNinetyDays}
              </p>
            </div>
          ) : null}
          {roleCoach.hiringManager.drillDowns.length > 0 ? (
            <div data-testid="harper-coach-drill">
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.drillDowns}
              </h3>
              <CheatSheetCoachItems
                campaignId={campaignId}
                canEdit={coachCanEdit}
                items={roleCoach.hiringManager.drillDowns}
                qaItems={coachQaItems}
                jobsActive={jobsActive}
                showReply={showReply}
              />
            </div>
          ) : null}
          {roleCoach.hiringManager.gaps.length > 0 ? (
            <div data-testid="harper-coach-gap">
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.gapsToPrepare}
              </h3>
              <CheatSheetCoachItems
                campaignId={campaignId}
                canEdit={coachCanEdit}
                items={roleCoach.hiringManager.gaps}
                qaItems={coachQaItems}
                jobsActive={jobsActive}
                showReply={showReply}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div id={cheatSheetLikelyQuestionsElementId(sectionKey)}>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.likelyQuestions}
        </h3>
        <CheatSheetCoachItems
          campaignId={campaignId}
          canEdit={coachCanEdit}
          items={section.likelyQuestions}
          qaItems={coachQaItems}
          jobsActive={jobsActive}
          showReply={showReply}
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
