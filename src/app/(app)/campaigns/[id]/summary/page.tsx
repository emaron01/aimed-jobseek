import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateApplicationPageMetadata } from "@/lib/application/page-metadata";
import { generateApplicationSummaryAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppActionLink } from "@/components/AppButton";
import { CheatSheetPersonBody } from "@/components/CheatSheetPersonBody";
import {
  CheatSheetFilterProvider,
  CheatSheetPeopleFilter,
  CheatSheetPersonSection,
  CheatSheetPrintButton,
  CheatSheetSharedSection,
} from "@/components/CheatSheetPeopleFilter";
import { PrintApplicationSummaryButton } from "@/components/PrintApplicationSummaryButton";
import { PageHeader, TenantMissing } from "@/components/ui";
import { getApplicationSummaryView } from "@/lib/application-summary/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canOpenCampaignDetail } from "@/lib/campaign/visibility";
import type { JobScorecard } from "@/lib/job-requirement/types";
import {
  applicationSummaryConfig,
  interviewConfig,
} from "@/lib/product-config";
import { stageTypeLabel } from "@/lib/interview/stages";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

type PageProps = { params: Promise<{ id: string }> };

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
  if (items.length === 0) return <p className="text-sm text-subtle">Not stated.</p>;
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
      {items.map((item, index) => (
        <li key={`${index}:${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function SummarySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-print-id={id}
      className="application-summary-section break-inside-avoid rounded-lg border border-edge bg-surface p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        <PrintApplicationSummaryButton sectionId={id} />
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default async function ApplicationSummaryPage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  if (!organization) return <TenantMissing />;
  const { id } = await params;
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

  return (
    <CheatSheetFilterProvider options={filterOptions}>
    <main className="application-summary mx-auto max-w-5xl space-y-6">
      <style>{`
        @media print {
          body[data-print-section] .application-summary-section { display: none !important; }
          body[data-print-section] .application-summary-section[data-print-active="true"] { display: block !important; }
        }
      `}</style>
      <PageHeader
        title={applicationSummaryConfig.title}
        description={`${view.campaign.name} · ${applicationSummaryConfig.description}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {summaryStatus === "READY" ? <CheatSheetPrintButton /> : null}
            <AppActionLink href={`/campaigns/${id}`}>
              Back to application
            </AppActionLink>
          </div>
        }
      />

      <div className="print:hidden">
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
      <SummarySection id="overview" title={applicationSummaryConfig.sections.overview}>
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
      </SummarySection>
      </CheatSheetSharedSection>

      {view.people.map((person) => {
        const section =
          guidance?.people.find((item) => item.sectionKey === person.sectionKey) ?? null;
        const notes = person.contactId
          ? view.notesByContactId.get(person.contactId) ?? []
          : [];
        return (
          <CheatSheetPersonSection key={person.sectionKey} sectionKey={person.sectionKey}>
          <SummarySection id={person.sectionKey} title={person.heading}>
            <CheatSheetPersonBody
              campaignId={id}
              canEdit={canGenerate}
              sectionKey={person.sectionKey}
              section={section}
              notes={notes}
              personaBuilt={person.personaBuilt}
              personaId={person.roleId}
            />
          </SummarySection>
          </CheatSheetPersonSection>
        );
      })}

      <CheatSheetSharedSection>
      <SummarySection id="company" title={applicationSummaryConfig.sections.company}>
        <div>
          <h3 className="font-medium text-ink">What they do</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
            {view.research?.whatTheySell ?? view.research?.companySummary ?? "Not available."}
          </p>
        </div>
        <div>
          <h3 className="font-medium text-ink">Customers</h3>
          <TextList items={lines(view.research?.customerTypes)} />
        </div>
        <TextList items={lines(view.research?.hiringSignals)} />
      </SummarySection>

      <SummarySection id="position" title={applicationSummaryConfig.sections.position}>
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
      </SummarySection>

      <SummarySection id="stages" title={applicationSummaryConfig.sections.interviewStages}>
        {view.stages.length === 0 ? (
          <p className="text-sm text-subtle">No interview stages yet.</p>
        ) : (
          <>
            <ul className="space-y-3 text-sm text-ink">
              {view.stages.map((stage) => (
                <li key={stage.id}>
                  <span className="font-medium">{stageTypeLabel(stage.type)}</span>
                  {stage.notesAfter ? `: ${stage.notesAfter}` : ""}
                </li>
              ))}
            </ul>
            {(() => {
              const next = view.stages.find((stage) => !stage.outcome);
              return next ? (
                <AppActionLink
                  href={`/campaigns/${id}/interviews/${next.id}`}
                  className="print:hidden"
                >
                  {interviewConfig.labels.openGuide}
                </AppActionLink>
              ) : null;
            })()}
          </>
        )}
      </SummarySection>
      </CheatSheetSharedSection>
    </main>
    </CheatSheetFilterProvider>
  );
}
