import Link from "next/link";
import { notFound } from "next/navigation";
import type { ScoreLabel, ResearchStatus } from "@prisma/client";
import { ResearchRunPanel } from "@/components/ResearchRunPanel";
import { ScoreContactsPanel } from "@/components/ScoreContactsPanel";
import { ScoreReportClient } from "@/components/ScoreReportClient";
import { TitleSuggestionReview } from "@/components/TitleSuggestionReview";
import { PageHeader, Panel, PrimaryButton, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import {
  getCampaignForListWorkflow,
  getScoreReportRows,
  getScoringRun,
  listPersonas,
  type ScoreReportSort,
} from "@/lib/tenant/data";
import { getCompaniesNeedingResearchForScoringRun } from "@/lib/tenant/companies";
import {
  getActiveResearchRunForContactList,
  getLatestResearchRunForContactList,
} from "@/lib/research/runs";
import { getScoringReadiness } from "@/lib/scoring/engine";
import { collectMandatorySuggestions } from "@/lib/scoring/mandatory-suggestion";
import type { IcpSnapshot } from "@/lib/scoring/types";
import { listTitleSuggestionsForRun } from "@/lib/scoring/title-suggestions";
import {
  contactMatchesSuppressionSet,
  listActiveNormalizedEmails,
} from "@/lib/suppression/service";
import { isResearchAiConfigured } from "@/lib/ai/config";
import { loadResearchBillingContext } from "@/lib/billing/research-billing-context";
import {
  listAiRoleStatuses,
  listUnconfiguredScoringRoles,
} from "@/lib/ai/roles";
import { AiRoleStatusList } from "@/components/AiRoleStatusList";
import { CONTACT_RESEARCH_DISABLED_USER_MESSAGE } from "@/lib/contact-research/policy";
import {
  getCurrentOrganization,
  TenantError,
} from "@/lib/tenant/getCurrentOrganization";
import { getMembershipForCurrentUser } from "@/lib/org/authz";
import { getActiveResearchedCompanyUsage } from "@/lib/usage/quota";
import { formatDate, formatNumber } from "@/lib/utils";
import {
  listDetailHref,
  parseCampaignId,
  scoringRunDisplayName,
} from "@/lib/lists/campaign-query";
import { SaveAndReturnToCampaignButton } from "@/components/SaveAndReturnToCampaignButton";
import { readQualificationBucket } from "@/lib/workflow/qualification";
import { vocab } from "@/lib/product-config";

type PageProps = {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{
    scoreLabel?: string;
    minOverallScore?: string;
    company?: string;
    researchStatus?: string;
    sort?: string;
    sortDir?: string;
    campaign?: string;
  }>;
};

const SORTS: ScoreReportSort[] = [
  "overallScore",
  "icpScore",
  "personaScore",
  "companyScore",
  "productRelevanceScore",
  "company",
  "name",
];

export default async function ScoringReportPage({
  params,
  searchParams,
}: PageProps) {
  const organization = await getCurrentOrganization();
  const { runId } = await params;
  const query = await searchParams;

  if (!organization) {
    return (
      <div>
        <PageHeader title="Score Report" description="Scoring run report." />
        <TenantMissing />
      </div>
    );
  }

  let run;
  try {
    run = await getScoringRun(runId);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }

  const sort = SORTS.includes(query.sort as ScoreReportSort)
    ? (query.sort as ScoreReportSort)
    : "name";
  const sortDir = query.sortDir === "desc" ? "desc" : "asc";
  const minOverallScore = query.minOverallScore
    ? Number.parseInt(query.minOverallScore, 10)
    : null;

  const membership = await getMembershipForCurrentUser(organization.id);
  const readOnly = run.contactList.ownerUserId !== membership.user.id;
  const [
    rows,
    researchPlan,
    scoringReadiness,
    personas,
    titleSuggestions,
    researchAllowance,
    researchBilling,
    activeResearchRun,
    latestResearchRun,
  ] = await Promise.all([
    getScoreReportRows(runId, {
      scoreLabel: (query.scoreLabel as ScoreLabel | undefined) || "",
      researchStatus:
        (query.researchStatus as ResearchStatus | undefined) || "",
      company: query.company || "",
      minOverallScore: Number.isFinite(minOverallScore)
        ? minOverallScore
        : null,
      sort,
      sortDir,
    }),
    getCompaniesNeedingResearchForScoringRun(runId, {
      associateMissing: !readOnly,
    }),
    getScoringReadiness(runId),
    listPersonas(run.productId),
    listTitleSuggestionsForRun(runId),
    getActiveResearchedCompanyUsage({
      organizationId: organization.id,
      userId: membership.user.id,
    }),
    loadResearchBillingContext(organization.id),
    getActiveResearchRunForContactList(run.contactListId, organization.id),
    getLatestResearchRunForContactList(run.contactListId, organization.id),
  ]);

  const suppressedEmails = await listActiveNormalizedEmails(
    organization.id,
    rows.map((row) => row.contact.email),
  );

  const mandatorySuggestions = collectMandatorySuggestions({
    criteria: (run.icpSnapshot as IcpSnapshot | null)?.criteria ?? [],
    scores: rows.map((row) => ({
      companyKey: row.contact.companyId ?? row.contactId,
      criterionAssessments: row.criterionAssessments,
      assessmentData: row.assessmentData,
    })),
  });

  const campaignIdFromQuery = parseCampaignId(query.campaign);
  const campaignId = campaignIdFromQuery ?? run.sourceCampaignId ?? null;
  const campaign = campaignId
    ? await getCampaignForListWorkflow(campaignId)
    : null;
  const runTitle = scoringRunDisplayName(run);
  const scoringFinished =
    run.status === "COMPLETED" || run.status === "PARTIAL";
  const leftOutCount = rows.filter(
    (row) => readQualificationBucket(row.assessmentData) === "EXCLUDED",
  ).length;

  const backToCampaignButton = campaign && !readOnly ? (
    <SaveAndReturnToCampaignButton
      campaignId={campaign.id}
      scoringRunId={run.id}
      testId="back-to-campaign"
    />
  ) : null;

  return (
    <div>
      <PageHeader
        title="Score Report"
        description={
          campaign
            ? `${runTitle}. Qualification by ${vocab.icp.singular} criteria and ${vocab.persona.singular} title fit. ${vocab.contact.Plural} are Ready to include, Check before including, or Left out — with a reason you can act on.`
            : `Qualification by ${vocab.icp.singular} criteria and ${vocab.persona.singular} title fit. ${vocab.contact.Plural} are Ready to include, Check before including, or Left out — with a reason you can act on.`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {backToCampaignButton}
            <Link
              href={listDetailHref(run.contactListId, {
                campaignId: campaign?.id,
              })}
              className={SECONDARY_BUTTON_CLASS}
            >
              Back to {vocab.list.singular}
            </Link>
          </div>
        }
      />
      {readOnly ? (
        <div className="mb-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Manager access is read-only. This scoring run belongs to{" "}
          {run.contactList.owner.name?.trim() || run.contactList.owner.email}.
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Meta label="Run" value={runTitle} />
        <Meta label={vocab.list.Singular} value={run.contactList.name} />
        <Meta label={vocab.product.Singular} value={run.product.name} />
        <Meta label={vocab.icp.singular} value={run.icp.name} />
        <Meta label={vocab.persona.Singular} value={run.persona?.name ?? "All personas"} />
        <Meta label={`Total ${vocab.contact.Plural}`} value={formatNumber(run.totalContacts)} />
        <Meta label={`Scored ${vocab.contact.Plural}`} value={formatNumber(run.scoredContacts)} />
        <Meta label="Status" value={run.status} />
        <Meta label="Created" value={formatDate(run.createdAt)} />
      </div>

      <div className="mb-6">
        <Panel
          title="AI Scoring"
          description={`Qualifies ${vocab.contact.plural} using company ${vocab.icp.singular} criteria and ${vocab.persona.singular} title fit. ${vocab.contact.Singular} role research runs when you generate email, not during scoring.`}
        >
          {readOnly ? (
            <p className="text-sm text-slate-600">
              Only the {vocab.list.singular} owner can run or rerun scoring.
            </p>
          ) : (
            <ScoreContactsPanel
              runId={run.id}
              readiness={scoringReadiness}
            />
          )}
        </Panel>
      </div>

      <div className="mb-6">
        <Panel
          title="Company Research"
          description={`Research is company-level and reusable across ${vocab.contact.plural}, ${vocab.list.plural}, and scoring runs in this organization.`}
        >
          {readOnly ? (
            <p className="text-sm text-slate-600">
              Only the {vocab.list.singular} owner can start or retry research.
            </p>
          ) : (
            <ResearchRunPanel
            runId={run.id}
            researchAiConfigured={isResearchAiConfigured()}
            allowance={researchAllowance}
            billing={researchBilling}
            initialActiveRun={activeResearchRun}
            initialLastRun={
              activeResearchRun ? null : latestResearchRun
            }
            plan={{
              totalContacts: researchPlan.totalContacts,
              uniqueCompanies: researchPlan.uniqueCompanies,
              alreadyResearched: researchPlan.alreadyResearched,
              needingResearch: researchPlan.needingResearch,
              noUsableResearch: researchPlan.noUsableResearch,
              statusCounts: researchPlan.statusCounts,
            }}
            />
          )}
        </Panel>
      </div>

      {scoringFinished && leftOutCount > 0 ? (
        <div
          className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
          data-testid="left-out-review-guidance"
        >
          <p className="font-medium">
            Review {vocab.contact.plural} left out before moving on
          </p>
          <p className="mt-1">
            {leftOutCount === 1
              ? `1 ${vocab.contact.singular} was left out of this run. Review them in the report below — you can restore any ${vocab.contact.singular} that should stay in play.`
              : `${leftOutCount} ${vocab.contact.plural} were left out of this run. Review them in the report below — you can restore any of them that should stay in play.`}
          </p>
        </div>
      ) : null}

      <div className="mb-6">
        <Panel
          title="AI roles for this run"
          description={
            scoringReadiness.contactResearchEnabled
              ? `Scoring needs ${vocab.contact.Singular} scoring and ${vocab.contact.Singular} research. Company research is optional but shown so an unset role cannot hide.`
              : `Scoring needs ${vocab.contact.Singular} scoring. ${vocab.contact.Singular} research is disabled for this workspace — email personalization uses company research only. Company research is optional but shown so an unset role cannot hide.`
          }
        >
          <AiRoleStatusList
            roles={listAiRoleStatuses().filter(
              (role) =>
                role.requiredForScoring || role.role === "research",
            )}
            orgDisabledNotes={
              scoringReadiness.contactResearchEnabled
                ? undefined
                : {
                    contact_research: CONTACT_RESEARCH_DISABLED_USER_MESSAGE,
                  }
            }
          />
          {listUnconfiguredScoringRoles({
            contactResearchEnabled: scoringReadiness.contactResearchEnabled,
          }).length > 0 ? (
            <p className="mt-3 text-sm text-amber-950">
              Score {vocab.contact.Plural} stays disabled until every required role is
              configured. Set the listed environment variables and restart.
            </p>
          ) : null}
        </Panel>
      </div>

      {!readOnly &&
      titleSuggestions.some((row) => row.status === "PENDING") ? (
        <div className="mb-6">
          <Panel
            title="Unmatched titles"
            description={`Review titles that did not match ${vocab.persona.aSingular}. Approvals are saved on the ${vocab.persona.singular} so the next ${vocab.list.singular} can match them automatically.`}
          >
            <TitleSuggestionReview
              runId={run.id}
              personas={personas.map((persona) => ({
                id: persona.id,
                name: persona.name,
              }))}
              suggestions={titleSuggestions.map((row) => ({
                id: row.id,
                unmatchedTitle: row.unmatchedTitle,
                contactCount: row.contactCount,
                proposedPersonaId: row.proposedPersonaId,
                proposedPersonaName: row.proposedPersonaName,
                reasoning: row.reasoning,
                status: row.status,
              }))}
            />
          </Panel>
        </div>
      ) : null}

      <Panel title="Filters" description="Simple tenant-scoped filters for this scoring run.">
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {campaign?.id ? (
            <input type="hidden" name="campaign" value={campaign.id} />
          ) : null}
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Score Label</span>
            <select
              name="scoreLabel"
              defaultValue={query.scoreLabel ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="EXCELLENT">EXCELLENT</option>
              <option value="GOOD">GOOD</option>
              <option value="FAIR">FAIR</option>
              <option value="POOR">POOR</option>
              <option value="DISQUALIFIED">DISQUALIFIED</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Min Overall</span>
            <input
              name="minOverallScore"
              type="number"
              min={0}
              max={100}
              defaultValue={query.minOverallScore ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Company</span>
            <input
              name="company"
              defaultValue={query.company ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Research Status</span>
            <select
              name="researchStatus"
              defaultValue={query.researchStatus ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="NOT_STARTED">NOT_STARTED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
              <option value="NOT_REQUIRED">NOT_REQUIRED</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Sort</span>
            <select
              name="sort"
              defaultValue={sort}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Direction</span>
            <select
              name="sortDir"
              defaultValue={sortDir}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <div className="flex items-end md:col-span-3 xl:col-span-6">
            <PrimaryButton type="submit">Apply</PrimaryButton>
          </div>
        </form>
      </Panel>

      <div className="mt-6">
        <ScoreReportClient
          runId={run.id}
          productId={run.productId}
          icpId={run.icpId}
          personaId={run.personaId}
          productName={run.product.name}
          icpName={run.icp.name}
          personaName={run.persona?.name ?? `All ${vocab.persona.plural}`}
          personas={personas.map((persona) => ({
            id: persona.id,
            name: persona.name,
          }))}
          mandatorySuggestions={mandatorySuggestions}
          readOnly={readOnly}
          rows={rows.map((row) => ({
            id: row.id,
            contactId: row.contactId,
            overallScore: row.overallScore,
            icpScore: row.icpScore,
            personaScore: row.personaScore,
            companyScore: row.companyScore,
            productRelevanceScore: row.productRelevanceScore,
            scoreLabel: row.scoreLabel,
            recommendedAction: row.recommendedAction,
            companySummary: row.companySummary,
            whatTheySell: row.whatTheySell,
            estimatedAov: row.estimatedAov,
            aovReasoning: row.aovReasoning,
            fitStrengths: row.fitStrengths,
            fitRisks: row.fitRisks,
            disqualifiers: row.disqualifiers,
            reasoning: row.reasoning,
            researchStatus: row.researchStatus,
            researchSources: row.researchSources,
            scoringStatus: row.scoringStatus,
            suppressed:
              row.scoringStatus === "SUPPRESSED" ||
              contactMatchesSuppressionSet(
                row.contact.email,
                suppressedEmails,
              ),
            assessmentData: row.assessmentData,
            aiProvider: row.aiProvider,
            aiModel: row.aiModel,
            aiModelUrlIdentifier: row.aiModelUrlIdentifier,
            promptVersion: row.promptVersion,
            scoringLogicVersion: row.scoringLogicVersion,
            scoredAt: row.scoredAt ? row.scoredAt.toISOString() : null,
            scoringError: row.scoringError,
            contact: {
              ...row.contact,
              companyRecord: row.contact.companyRecord
                ? {
                    ...row.contact.companyRecord,
                    research: row.contact.companyRecord.research.map((r) => {
                      const {
                        researchConfidence: _researchConfidence,
                        ...repVisibleResearch
                      } = r;
                      return {
                        ...repVisibleResearch,
                        researchedAt: r.researchedAt
                          ? r.researchedAt.toISOString()
                          : null,
                      };
                    }),
                  }
                : null,
            },
          }))}
        />
      </div>

      {campaign && !readOnly ? (
        <div className="mt-8 flex justify-start">
          <SaveAndReturnToCampaignButton
            campaignId={campaign.id}
            scoringRunId={run.id}
            testId="back-to-campaign-bottom"
          />
        </div>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
