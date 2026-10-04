import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateApplicationPageMetadata } from "@/lib/application/page-metadata";
import { generateApplicationSummaryAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { CheatSheetCompanyResearch } from "@/components/ApplicationCompanyBriefing";
import {
  WorkspaceProgress,
} from "@/components/ApplicationWorkspaceLive";
import { CheatSheetPrintBanner, CheatSheetSection } from "@/components/CheatSheetCollapsible";
import { CheatSheetInterviewNotes } from "@/components/CheatSheetInterviewNotes";
import { CheatSheetEmptyState } from "@/components/CheatSheetEmptyState";
import {
  CheatSheetPersonBody,
  RefreshLikelyQuestionsButton,
} from "@/components/CheatSheetPersonBody";
import { CheatSheetQuestionCards } from "@/components/CheatSheetQuestionCards";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import { HiringTeamCheatSheetToggle } from "@/components/HiringTeamCheatSheetControls";
import {
  CheatSheetFilterProvider,
  CheatSheetPeopleFilter,
  CheatSheetPersonSection,
  CheatSheetPrintButton,
  CheatSheetSharedSection,
} from "@/components/CheatSheetPeopleFilter";
import { AskHarperBox } from "@/components/AskHarperBox";
import { PageHeader, TenantMissing } from "@/components/ui";
import { loadAskHarperDrafts } from "@/lib/consultation/ask-harper";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { loadCheatSheetCoachQaByContact } from "@/lib/application-summary/coach-qa";
import { statedListItems } from "@/lib/application-summary/display";
import {
  compileApplicationInterviewNotes,
  compileNotesFromInterviewsWithPerson,
} from "@/lib/application-summary/interview-notes";
import { getApplicationSummaryView } from "@/lib/application-summary/service";
import { loadOrderedAnsweredHarperQuestions } from "@/lib/consultation/harper-display-qa";
import { personViewListQuestions } from "@/lib/consultation/harper-layout";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canOpenCampaignDetail } from "@/lib/campaign/visibility";
import type { JobScorecard } from "@/lib/job-requirement/types";
import { applicationSummaryConfig, interviewConfig } from "@/lib/product-config";
import { stageTypeLabel } from "@/lib/interview/stages";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ person?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return generateApplicationPageMetadata(id, "summary");
}

function scorecard(value: unknown): JobScorecard {
  if (!value || typeof value !== "object") {
    return { mission: null, outcomes: [], competencies: [] };
  }
  const row = value as Partial<JobScorecard>;
  return {
    mission:
      row.mission && typeof row.mission.text === "string" ? row.mission : null,
    outcomes: Array.isArray(row.outcomes) ? row.outcomes : [],
    competencies: Array.isArray(row.competencies) ? row.competencies : [],
  };
}

function lines(value: unknown): string[] {
  return parseStringArray(value);
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

export default async function ApplicationSummaryPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  if (!organization) return <TenantMissing />;
  const { id } = await params;
  const query = await searchParams;
  let view: Awaited<ReturnType<typeof getApplicationSummaryView>>;
  try {
    view = await getApplicationSummaryView({
      organizationId: organization.id,
      campaignId: id,
    });
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }
  const membership = await getMembershipForCurrentUser(organization.id);
  if (
    !canOpenCampaignDetail({
      role: membership.membership.role,
      userId: user.id,
      campaign: view.campaign,
    })
  ) {
    notFound();
  }

  const live = await getApplicationWorkspaceLive({
    organizationId: organization.id,
    campaignId: id,
  });
  const coachQaByContact = await loadCheatSheetCoachQaByContact({
    organizationId: organization.id,
    campaignId: id,
  });
  const { interviewerQuestionsByContactId, generalQuestions } =
    await loadOrderedAnsweredHarperQuestions({
      organizationId: organization.id,
      campaignId: id,
    });
  const canGenerate = view.campaign.ownerUserId === user.id;
  const requirementScorecard = scorecard(view.requirement.scorecardJson);
  const summaryStatus = view.summary?.status ?? null;
  const actionLabel =
    summaryStatus === "FAILED"
      ? applicationSummaryConfig.actions.retry
      : summaryStatus === "READY"
        ? applicationSummaryConfig.actions.regenerate
        : applicationSummaryConfig.actions.generate;
  const guidance = view.guidance;
  const filterOptions = view.people.map((person) => ({
    sectionKey: person.sectionKey,
    heading: person.heading,
    personName: person.contactId ? person.heading : null,
    personaName: person.roleName,
    titles: person.titles,
  }));
  const personNameByContactId = new Map(
    view.people.flatMap((person) =>
      person.contactId ? [[person.contactId, person.heading] as const] : [],
    ),
  );
  const stagesForNotes = view.stages.map((stage) => ({
    id: stage.id,
    type: stage.type,
    scheduledAt: stage.scheduledAt,
    notesBefore: stage.notesBefore,
    notesAfter: stage.notesAfter,
    interviewerContactIds: stage.interviewers.map((row) => row.contactId),
    interviewerNames: stage.interviewers.map(
      (row) =>
        personNameByContactId.get(row.contactId) ?? interviewConfig.labels.interviewer,
    ),
  }));
  const askHarperDrafts = await loadAskHarperDrafts({
    organizationId: organization.id,
    campaignId: id,
  });
  const applicationInterviewNotes = compileApplicationInterviewNotes({
    people: [...view.notesByContactId.entries()].map(([contactId, notes]) => ({
      contactId,
      name: personNameByContactId.get(contactId) ?? interviewConfig.labels.interviewer,
      notes,
    })),
    stages: stagesForNotes,
  });

  return (
    <CheatSheetFilterProvider
      options={filterOptions}
      initialPersonKey={query.person ?? null}
    >
    <main className="application-summary mx-auto max-w-5xl space-y-6">
      <CheatSheetPrintBanner />
      <style>{`
        @media print {
          body[data-print-section] .application-summary-section { display: none !important; }
          body[data-print-section] .application-summary-section[data-print-active="true"] { display: block !important; }
        }
      `}</style>
      <AskHarperBox
        campaignId={id}
        canEdit={canGenerate}
        drafts={askHarperDrafts}
      />
      <PageHeader
        title={applicationSummaryConfig.title}
        description={`${view.campaign.name} · ${applicationSummaryConfig.description}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {summaryStatus === "READY" ? <CheatSheetPrintButton /> : null}
          </div>
        }
      />

      <div className="print:hidden">
        <WorkspaceProgress jobs={live.jobs} type="APPLICATION_SUMMARY" stayAndWatch />
        {filterOptions.length > 0 ? (
          <div className="mb-4">
            <CheatSheetPeopleFilter />
          </div>
        ) : null}
        {summaryStatus === "FAILED" ? (
          <p role="alert" className="mt-2 rounded-md border border-danger bg-danger-tint p-3 text-sm text-danger">
            {view.summary?.generationError ?? `${applicationSummaryConfig.title} could not be generated. Retry.`}
          </p>
        ) : null}
        {canGenerate ? (
          <div className="mt-3">
            <ApplicationActionForm
              action={generateApplicationSummaryAction}
              submitLabel={actionLabel}
              testId="application-summary-generation"
            >
              <input type="hidden" name="campaignId" value={id} />
            </ApplicationActionForm>
          </div>
        ) : null}
      </div>

      <CheatSheetSharedSection>
      <CheatSheetSection id="overview" title={applicationSummaryConfig.sections.overview}>
        {!guidance?.overview ? (
          <p className="text-sm text-muted">
            {summaryStatus === "FAILED"
              ? `${applicationSummaryConfig.title} could not be generated. Use Retry above.`
              : `Generate the ${applicationSummaryConfig.title} to create the company background, job requirements, and where you shine.`}
          </p>
        ) : (
          <>
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.companyBackground}
              </h3>
              <p className="mt-1 text-sm text-ink">
                {guidance.overview.companyBackground.text}
              </p>
            </div>
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.jobRequirements}
              </h3>
              <TextList items={guidance.overview.jobRequirements.map((item) => item.text)} />
            </div>
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.whereSeekerShines}
              </h3>
              <TextList items={guidance.overview.whereSeekerShines.map((item) => item.text)} />
            </div>
          </>
        )}
      </CheatSheetSection>
      </CheatSheetSharedSection>

      <HarperDraftProvider>
      {view.people.length === 0 ? <CheatSheetEmptyState campaignId={id} /> : null}
      <CheatSheetSection id="general-questions" title="General Questions">
        <CheatSheetQuestionCards
          campaignId={id}
          canEdit={canGenerate}
          questions={generalQuestions}
          jobsActive={live.jobs.some(
            (job) =>
              job.type === "CONSULTATION" &&
              (job.status === "PENDING" || job.status === "IN_PROGRESS"),
          )}
          testId="cheat-sheet-general-questions"
        />
      </CheatSheetSection>
      <CheatSheetSection
        id="interview-notes"
        title={applicationSummaryConfig.sections.interviewNotes}
      >
        <CheatSheetInterviewNotes notes={applicationInterviewNotes} />
      </CheatSheetSection>
      {view.people.map((person) => {
        const section =
          guidance?.people.find((item) => item.sectionKey === person.sectionKey) ?? null;
        const notes = person.contactId
          ? view.notesByContactId.get(person.contactId) ?? []
          : [];
        const interviewNotes = person.contactId
          ? compileNotesFromInterviewsWithPerson({
              contactId: person.contactId,
              gainedNotes: notes,
              stages: stagesForNotes,
            })
          : [];
        const coachQaItems = person.contactId
          ? coachQaByContact.get(person.contactId) ?? []
          : [];
        const interviewerQuestions = person.contactId
          ? interviewerQuestionsByContactId.get(person.contactId) ?? []
          : [];
        const personQuestions = personViewListQuestions({
          questions: interviewerQuestions,
          profileCoachItemIds: (section?.likelyQuestions ?? [])
            .map((item) => item.id?.trim() ?? "")
            .filter(Boolean),
        });
        const consultationBusy = live.jobs.some(
          (job) =>
            job.type === "CONSULTATION" &&
            (job.status === "PENDING" || job.status === "IN_PROGRESS"),
        );
        return (
          <CheatSheetPersonSection key={person.sectionKey} sectionKey={person.sectionKey}>
          <CheatSheetSection id={person.sectionKey} title={person.heading}
            headerAside={
              <>
                {canGenerate && section ? (
                  <RefreshLikelyQuestionsButton
                    campaignId={id}
                    sectionKey={person.sectionKey}
                  />
                ) : null}
                {!person.contactId ? (
                  <HiringTeamCheatSheetToggle
                    campaignId={id}
                    personaId={person.roleId}
                    added
                  />
                ) : null}
              </>
            }
          >
            <CheatSheetPersonBody
              campaignId={id}
              canEdit={canGenerate}
              sectionKey={person.sectionKey}
              section={section}
              notes={notes}
              personaBuilt={person.personaBuilt}
              personaId={person.roleId}
              coachQaItems={coachQaItems}
              jobsActive={consultationBusy}
              interviewNotes={person.contactId ? interviewNotes : null}
              interviewNotesPersonName={person.contactId ? person.heading : null}
              generalQuestions={generalQuestions}
              personQuestions={personQuestions}
            />
          </CheatSheetSection>
          </CheatSheetPersonSection>
        );
      })}
      </HarperDraftProvider>

      <CheatSheetSharedSection>
      <CheatSheetSection id="company" title={applicationSummaryConfig.sections.company}>
        <CheatSheetCompanyResearch
          companySummary={view.research?.companySummary ?? null}
          whatTheySell={view.research?.whatTheySell ?? null}
          jobFocus={view.research?.jobFocus ?? null}
          jobFocusDetail={view.research?.jobFocusDetail ?? null}
          sources={view.research?.researchSources ?? []}
          companyName={view.requirement.companyName}
          anchorHost={view.research?.anchorHost ?? null}
          sisterHosts={view.research?.sisterHosts ?? null}
          postingText={view.requirement.rawText}
        />
        <div>
          <h3 className="font-medium text-ink">Customers</h3>
          <TextList items={lines(view.research?.customerTypes)} />
        </div>
        {statedListItems(lines(view.research?.hiringSignals)).length > 0 ? (
          <TextList items={lines(view.research?.hiringSignals)} />
        ) : null}
      </CheatSheetSection>

      <CheatSheetSection id="position" title={applicationSummaryConfig.sections.position}>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ["Title", view.requirement.title],
            ["Reporting line", view.requirement.reportingLine],
            ["Location", view.requirement.location],
            ["Work arrangement", view.requirement.workArrangement],
            ["Compensation in posting", view.requirement.compensationRange],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">{label}</dt>
              <dd className="mt-1 text-sm text-ink">{value || "Not stated."}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="font-medium text-ink">Mission</h3>
          <p className="mt-1 text-sm text-ink">
            {requirementScorecard.mission?.text ?? "Not stated."}
          </p>
        </div>
        <div>
          <h3 className="font-medium text-ink">Key outcomes</h3>
          <TextList items={requirementScorecard.outcomes.map((item) => item.text)} />
        </div>
      </CheatSheetSection>

      <CheatSheetSection id="stages" title={applicationSummaryConfig.sections.interviewStages}>
        {view.stages.length === 0 ? (
          <p className="text-sm text-subtle">No interview stages yet.</p>
        ) : (
          <>
            <ul className="space-y-3 text-sm text-ink">
              {view.stages.map((stage) => (
                <li key={stage.id}>
                  <span className="font-medium">{stageTypeLabel(stage.type)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CheatSheetSection>
      </CheatSheetSharedSection>
    </main>
    </CheatSheetFilterProvider>
  );
}
