import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { generateApplicationPageMetadata } from "@/lib/application/page-metadata";
import { generateApplicationSummaryAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { CheatSheetGenerationError } from "@/components/CheatSheetGenerationError";
import { CheatSheetInterviewPrepGuideButton } from "@/components/InterviewPrepGuideButton";
import { CheatSheetCompanyResearch } from "@/components/ApplicationCompanyBriefing";
import {
  WorkspaceProgress,
} from "@/components/ApplicationWorkspaceLive";
import {
  CheatSheetPrintBanner,
  CheatSheetSection,
  CheatSheetSubsection,
} from "@/components/CheatSheetCollapsible";
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
import { CheatSheetPageLinkProvider } from "@/components/PrintApplicationSummaryButton";
import { PageHeader, TenantMissing } from "@/components/ui";
import {
  applicationHasHarperQuestion,
  loadAskHarperDrafts,
} from "@/lib/consultation/ask-harper";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { loadCheatSheetCoachQaByContact } from "@/lib/application-summary/coach-qa";
import { statedListItems } from "@/lib/application-summary/display";
import { latestApplicationSummaryFailure } from "@/lib/application-summary/failure-message";
import { isTitleOnlyPrepGuide, personSectionNeedsGeneration } from "@/lib/application-summary/people";
import type { ApplicationSummaryGuidance } from "@/lib/application-summary/contract";
import { compileApplicationInterviewNotes } from "@/lib/application-summary/interview-notes";
import { getApplicationSummaryView } from "@/lib/application-summary/service";
import { loadOrderedAnsweredHarperQuestions } from "@/lib/consultation/harper-display-qa";
import { personViewListQuestions } from "@/lib/consultation/harper-layout";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canOpenCampaignDetail } from "@/lib/campaign/visibility";
import type { JobScorecard } from "@/lib/job-requirement/types";
import { applicationSummaryConfig, interviewConfig } from "@/lib/product-config";
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

type SummaryView = Awaited<ReturnType<typeof getApplicationSummaryView>>;

function AtAGlanceBody({
  overview,
}: {
  overview: ApplicationSummaryGuidance["overview"] | null | undefined;
}) {
  if (!overview) {
    return (
      <p className="text-sm text-muted">
        {`Generate the ${applicationSummaryConfig.title} to create the company background, job requirements, and where you shine.`}
      </p>
    );
  }
  return (
    <>
      <div>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.companyBackground}
        </h3>
        <p className="mt-1 text-sm text-ink">{overview.companyBackground.text}</p>
      </div>
      <div>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.jobRequirements}
        </h3>
        <TextList items={overview.jobRequirements.map((item) => item.text)} />
      </div>
      <div>
        <h3 className="font-medium text-ink">
          {applicationSummaryConfig.sections.whereSeekerShines}
        </h3>
        <TextList items={overview.whereSeekerShines.map((item) => item.text)} />
      </div>
    </>
  );
}

function CompanyProfileBody({
  research,
  companyName,
  postingText,
}: {
  research: SummaryView["research"];
  companyName: string | null;
  postingText: string | null;
}) {
  return (
    <>
      <CheatSheetCompanyResearch
        companySummary={research?.companySummary ?? null}
        whatTheySell={research?.whatTheySell ?? null}
        jobFocus={research?.jobFocus ?? null}
        jobFocusDetail={research?.jobFocusDetail ?? null}
        sources={research?.researchSources ?? []}
        companyName={companyName}
        anchorHost={research?.anchorHost ?? null}
        sisterHosts={research?.sisterHosts ?? null}
        postingText={postingText}
      />
      <div>
        <h3 className="font-medium text-ink">Customers</h3>
        <TextList items={lines(research?.customerTypes)} />
      </div>
      {statedListItems(lines(research?.hiringSignals)).length > 0 ? (
        <TextList items={lines(research?.hiringSignals)} />
      ) : null}
    </>
  );
}

function PositionBody({
  requirement,
  requirementScorecard,
}: {
  requirement: SummaryView["requirement"];
  requirementScorecard: JobScorecard;
}) {
  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2">
        {[
          ["Title", requirement.title],
          ["Reporting line", requirement.reportingLine],
          ["Location", requirement.location],
          ["Work arrangement", requirement.workArrangement],
          ["Compensation in posting", requirement.compensationRange],
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
    </>
  );
}

function PrepGuidePrimaryCard({
  testId,
  title,
  children,
}: {
  testId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="space-y-4 rounded-md border-2 border-edge-strong bg-surface p-4"
      data-testid={testId}
    >
      <h2 className="text-sm font-semibold text-ink" data-print-section-chrome>
        {title}
      </h2>
      {children}
    </section>
  );
}

export async function InterviewPrepGuides({
  campaignId,
  person = null,
  showPageHeader = true,
}: {
  campaignId: string;
  person?: string | null;
  showPageHeader?: boolean;
}) {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  if (!organization) return showPageHeader ? <TenantMissing /> : null;
  const id = campaignId;
  let view: Awaited<ReturnType<typeof getApplicationSummaryView>>;
  try {
    view = await getApplicationSummaryView({
      organizationId: organization.id,
      campaignId: id,
    });
  } catch (error) {
    if (error instanceof TenantError) {
      if (showPageHeader) notFound();
      return null;
    }
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
    if (showPageHeader) notFound();
    return null;
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
  const summaryFailure = latestApplicationSummaryFailure({
    jobs: live.jobs,
    summaryStatus,
    generationError: view.summary?.generationError ?? null,
    fallback: `${applicationSummaryConfig.title} could not be generated. Retry.`,
  });
  const pageFailure = summaryFailure?.sectionKey ? null : summaryFailure;
  const actionLabel = pageFailure
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
  const [askHarperDrafts, hasHarperQuestion] = await Promise.all([
    loadAskHarperDrafts({
      organizationId: organization.id,
      campaignId: id,
    }),
    applicationHasHarperQuestion({
      organizationId: organization.id,
      campaignId: id,
    }),
  ]);
  const titleOnlyGuides = view.people.filter((person) => isTitleOnlyPrepGuide(person));
  const namedGuides = view.people.filter((person) => !isTitleOnlyPrepGuide(person));
  const applicationInterviewNotes = compileApplicationInterviewNotes({
    people: [...view.notesByContactId.entries()].map(([contactId, notes]) => ({
      contactId,
      name: personNameByContactId.get(contactId) ?? interviewConfig.labels.interviewer,
      notes,
    })),
    stages: stagesForNotes,
  });

  return (
    <CheatSheetPageLinkProvider href={showPageHeader ? null : `/campaigns/${id}/summary`}>
    <CheatSheetFilterProvider
      options={filterOptions}
      initialPersonKey={person}
    >
    <main className="application-summary mx-auto max-w-5xl space-y-6">
      <CheatSheetPrintBanner />
      <style>{`
        @media print {
          body[data-print-section] [data-print-section-chrome] { display: none !important; }
          body[data-print-section] [data-testid="prep-guide-personas"]:not(:has([data-print-active="true"])) {
            display: none !important;
          }
          body[data-print-section] [data-testid="prep-guide-by-title"]:not(:has([data-print-active="true"])) {
            display: none !important;
          }
          body[data-print-section] .application-summary-section { display: none !important; }
          body[data-print-section] .application-summary-section[data-print-active="true"] {
            display: block !important;
          }
          body[data-print-section] .application-summary-section[data-print-active="true"],
          body[data-print-section] .application-summary-section[data-print-active="true"] * {
            break-before: auto !important;
            break-after: auto !important;
            break-inside: auto !important;
            page-break-before: auto !important;
            page-break-after: auto !important;
            page-break-inside: auto !important;
          }
        }
      `}</style>
      <div data-print-section-chrome>
      <AskHarperBox
        campaignId={id}
        canEdit={canGenerate}
        drafts={askHarperDrafts}
        hasQuestion={hasHarperQuestion}
      />
      {showPageHeader ? (
      <PageHeader
        title={applicationSummaryConfig.title}
        description={`${view.campaign.name} · ${applicationSummaryConfig.description}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {summaryStatus === "READY" ? <CheatSheetPrintButton /> : null}
          </div>
        }
      />
      ) : null}
      </div>

      <div className="print:hidden">
        <WorkspaceProgress
          jobs={live.jobs}
          type="APPLICATION_SUMMARY"
          stayAndWatch
          hideFailure
        />
        {filterOptions.length > 0 ? (
          <div className="mb-4">
            <CheatSheetPeopleFilter />
          </div>
        ) : null}
        <CheatSheetGenerationError message={pageFailure?.message ?? null} />
        {canGenerate ? (
          <div className="mt-3">
            <ApplicationActionForm
              action={generateApplicationSummaryAction}
              submitLabel={actionLabel}
              testId="application-summary-generation"
              suppressJobFailure
            >
              <input type="hidden" name="campaignId" value={id} />
            </ApplicationActionForm>
          </div>
        ) : null}
      </div>

      <HarperDraftProvider>
      {[
        {
          testId: "prep-guide-personas",
          title: applicationSummaryConfig.sections.interviewPersonas,
          people: namedGuides,
          showEmpty: true,
        },
        {
          testId: "prep-guide-by-title",
          title: applicationSummaryConfig.sections.prepByTitle,
          people: titleOnlyGuides,
          showEmpty: false,
        },
      ].map((group) => (
      <PrepGuidePrimaryCard
        key={group.testId}
        testId={group.testId}
        title={group.title}
      >
      {group.showEmpty && group.people.length === 0 ? <CheatSheetEmptyState campaignId={id} /> : null}
      {!group.showEmpty && group.people.length === 0 ? (
        <p className="text-sm text-subtle">Not stated.</p>
      ) : null}
      {group.people.map((person) => {
        const section =
          guidance?.people.find((item) => item.sectionKey === person.sectionKey) ?? null;
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
                {canGenerate && section && !person.contactId ? (
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
            {person.contactId ? (
              <CheatSheetInterviewPrepGuideButton
                campaignId={id}
                contactId={person.contactId}
                sectionKey={person.sectionKey}
                hasGuide={Boolean(section) && !personSectionNeedsGeneration(section)}
                canEdit={canGenerate}
                failed={summaryFailure?.sectionKey === person.sectionKey}
                failureMessage={summaryFailure?.message ?? null}
                roles={view.roles.map((role) => ({ id: role.id, name: role.name }))}
              />
            ) : summaryFailure?.sectionKey === person.sectionKey ? (
              <div className="space-y-2">
                <CheatSheetGenerationError message={summaryFailure.message} />
                {canGenerate ? (
                  <ApplicationActionForm
                    action={generateApplicationSummaryAction}
                    submitLabel={applicationSummaryConfig.actions.retry}
                    testId={`retry-cheat-sheet-${person.sectionKey}`}
                    suppressJobFailure
                    formClassName="print:hidden"
                  >
                    <input type="hidden" name="campaignId" value={id} />
                    <input type="hidden" name="sectionKey" value={person.sectionKey} />
                  </ApplicationActionForm>
                ) : null}
              </div>
            ) : null}
            <CheatSheetSubsection
              id={`${person.sectionKey}-overview`}
              title={applicationSummaryConfig.sections.overview}
            >
              <AtAGlanceBody overview={guidance?.overview} />
            </CheatSheetSubsection>
            <CheatSheetSubsection
              id={`${person.sectionKey}-guide-notes`}
              title={applicationSummaryConfig.sections.interviewNotes}
            >
              <CheatSheetInterviewNotes notes={applicationInterviewNotes} />
            </CheatSheetSubsection>
            <CheatSheetPersonBody
              campaignId={id}
              canEdit={canGenerate}
              sectionKey={person.sectionKey}
              section={section}
              notes={[]}
              personaBuilt={person.personaBuilt}
              personaId={person.roleId}
              coachQaItems={coachQaItems}
              jobsActive={consultationBusy}
              personQuestions={personQuestions}
              prepGuideOwnsContact
            />
          </CheatSheetSection>
          </CheatSheetPersonSection>
        );
      })}
      </PrepGuidePrimaryCard>
      ))}
      <CheatSheetSharedSection>
      <CheatSheetSection
        id="general-questions"
        title={applicationSummaryConfig.sections.generalStudyQuestions}
        primary
        testId="prep-guide-general-questions"
      >
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
      </CheatSheetSharedSection>
      </HarperDraftProvider>

      <CheatSheetSharedSection>
      <CheatSheetSection
        id="interview-notes"
        title={applicationSummaryConfig.sections.consolidatedInterviewNotes}
        primary
        testId="prep-guide-consolidated-notes"
      >
        <CheatSheetInterviewNotes notes={applicationInterviewNotes} />
      </CheatSheetSection>

      <CheatSheetSection
        id="position"
        title={applicationSummaryConfig.sections.position}
        primary
        testId="prep-guide-position"
      >
        <PositionBody
          requirement={view.requirement}
          requirementScorecard={requirementScorecard}
        />
      </CheatSheetSection>

      <CheatSheetSection
        id="company"
        title={applicationSummaryConfig.sections.company}
        primary
        testId="prep-guide-company"
      >
        <CompanyProfileBody
          research={view.research}
          companyName={view.requirement.companyName}
          postingText={view.requirement.rawText}
        />
      </CheatSheetSection>
      </CheatSheetSharedSection>
    </main>
    </CheatSheetFilterProvider>
    </CheatSheetPageLinkProvider>
  );
}

export default async function ApplicationSummaryPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <InterviewPrepGuides
      campaignId={id}
      person={query.person ?? null}
      showPageHeader
    />
  );
}
