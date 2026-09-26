import { generateApplicationSummaryAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { CheatSheetCoachItems } from "@/components/CheatSheetCoachItems";
import type { CheatSheetNote } from "@/lib/application-summary/notes";
import type { CheatSheetPersonSection } from "@/lib/application-summary/contract";
import { applicationSummaryConfig } from "@/lib/product-config";

function TextList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return <p className="text-sm text-subtle">Not stated.</p>;
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
      {items.map((item, index) => (
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
}: {
  campaignId: string;
  canEdit: boolean;
  sectionKey: string;
  section: CheatSheetPersonSection | null;
  notes: CheatSheetNote[];
}) {
  if (!section) {
    return (
      <div className="space-y-3">
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
      {notes.length > 0 ? (
        <div>
          <h3 className="font-medium text-ink">
            {applicationSummaryConfig.sections.gainedInformation}
          </h3>
          <TextList items={notes.map((note) => note.text)} />
        </div>
      ) : null}
      {section.linkedinAddendum ? (
        <>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.linkedinBackground}
            </h3>
            <p className="mt-1 text-sm text-ink">{section.linkedinAddendum.background.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.linkedinFocus}
            </h3>
            <p className="mt-1 text-sm text-ink">{section.linkedinAddendum.focus.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.linkedinConnection}
            </h3>
            <p className="mt-1 text-sm text-ink">
              {section.linkedinAddendum.seekerConnection.text}
            </p>
          </div>
        </>
      ) : null}
      <div>
        <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.caresAbout}</h3>
        <TextList items={section.caresAbout.map((item) => item.text)} />
      </div>
      <div>
        <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.bestMaterial}</h3>
        <TextList items={section.bestMaterial.map((item) => item.text)} />
      </div>
      {section.recruiter ? (
        <>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.recruiterSummary}
            </h3>
            <p className="mt-1 text-sm text-ink">{section.recruiter.sixtySecondSummary.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.whyThisCompany}
            </h3>
            <p className="mt-1 text-sm text-ink">{section.recruiter.whyThisCompany.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.whyThisRole}
            </h3>
            <p className="mt-1 text-sm text-ink">{section.recruiter.whyThisRole.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.logistics}</h3>
            <p className="mt-1 text-sm text-ink">{section.recruiter.logistics.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.compensation}
            </h3>
            <p className="mt-1 text-sm text-ink">
              {section.recruiter.compensationReadiness.text}
            </p>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.flagAnswers}
            </h3>
            <CheatSheetCoachItems
              campaignId={campaignId}
              canEdit={canEdit}
              items={section.recruiter.flagAnswers}
            />
          </div>
        </>
      ) : null}
      {section.hiringManager ? (
        <>
          <div>
            <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.scorecard}</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink">
              {section.hiringManager.scorecardOutcomes.map((item) => (
                <li key={item.outcome}>
                  {item.outcome}
                  {item.storyId ? ` · story ${item.storyId}` : ""}
                  {item.note ? ` — ${item.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.firstNinetyDays}
            </h3>
            <p className="mt-1 text-sm text-ink">{section.hiringManager.firstNinetyDays.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.drillDowns}</h3>
            <CheatSheetCoachItems
              campaignId={campaignId}
              canEdit={canEdit}
              items={section.hiringManager.drillDowns}
            />
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.gapsToPrepare}
            </h3>
            <CheatSheetCoachItems
              campaignId={campaignId}
              canEdit={canEdit}
              items={section.hiringManager.gaps}
            />
          </div>
        </>
      ) : null}
      {section.executive ? (
        <>
          <div>
            <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.strategy}</h3>
            <p className="mt-1 text-sm text-ink">{section.executive.strategy.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.judgment}</h3>
            <p className="mt-1 text-sm text-ink">{section.executive.judgment.text}</p>
          </div>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.businessImpact}
            </h3>
            <p className="mt-1 text-sm text-ink">{section.executive.businessImpact.text}</p>
          </div>
        </>
      ) : null}
      {section.crossFunctional ? (
        <>
          <div>
            <h3 className="font-medium text-ink">
              {applicationSummaryConfig.sections.howWorkedAcross}
            </h3>
            <p className="mt-1 text-sm text-ink">
              {section.crossFunctional.howWorkedAcross.text}
            </p>
          </div>
          <div>
            <h3 className="font-medium text-ink">{applicationSummaryConfig.sections.dayToDay}</h3>
            <p className="mt-1 text-sm text-ink">{section.crossFunctional.dayToDay.text}</p>
          </div>
        </>
      ) : null}
      <div>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.likelyQuestions}
        </h3>
        <CheatSheetCoachItems
          campaignId={campaignId}
          canEdit={canEdit}
          items={section.likelyQuestions}
        />
      </div>
      <div>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.questionsToAsk}
        </h3>
        <TextList items={section.questionsToAsk.map((item) => item.text)} />
      </div>
    </div>
  );
}
