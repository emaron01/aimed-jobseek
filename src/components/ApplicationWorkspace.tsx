import {
  confirmApplicationEmployerIdentityAction,
  nameApplicationEmployerAction,
  rejectApplicationEmployerIdentityAction,
  rescoreApplicationFitAction,
  retryApplicationNextStepAction,
} from "@/app/actions/application";
import { ApplicationResearchStatus } from "@/components/ApplicationResearchStatus";
import { ApplicationFitOverride } from "@/components/ApplicationFitOverride";
import {
  ApplicationWorkspaceLive,
  WorkspaceProgress,
} from "@/components/ApplicationWorkspaceLive";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { supersedeObsoleteWorkspaceFailures } from "@/lib/application-jobs/obsolete-failures";
import {
  WORKSPACE_CARD_WRAP_CLASS,
  WORKSPACE_MESSAGE_WRAP_CLASS,
  workspaceCampaignSummaryHref,
  workspaceProfileEditHref,
  workspaceProfileHref,
} from "@/lib/application/workspace-links";
import { mergeExistingHiringTeamRoles } from "@/lib/hiring-team/merge-existing";
import { getApplicationResearchStatus } from "@/lib/application/research-status";
import {
  addApplicationRoleAction,
  addHiringTeamPersonAction,
  addTemplateRoleAction,
  approveApplicationRoleAction,
  buildAllDirectRolesAction,
  buildApplicationRoleAction,
  moveApplicationRoleInvolvementAction,
  rebuildApplicationRoleAction,
  removeApplicationRoleAction,
  saveRoleAsTemplateAction,
  updateApplicationRoleAction,
} from "@/app/actions/hiring-team";
import {
  parseIndividualProfile,
  parseLinkedInExtracted,
} from "@/lib/contact-profile/service";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { InterviewStagesSection } from "@/components/InterviewStagesSection";
import { ApplicationAssetsSection } from "@/components/ApplicationAssetsSection";
import { ApplicationCompanyBriefing } from "@/components/ApplicationCompanyBriefing";
import { ApplicationJobRequirementActions } from "@/components/ApplicationJobRequirementActions";
import { EmptyState } from "@/components/design";
import { OpenDetailsOnMount } from "@/components/OpenDetailsOnMount";
import {
  applicationStepByKey,
  applicationStepCopy,
  type ApplicationStepKey,
} from "@/lib/product-config";
import {
  ApplicationAppliedSection,
  ApplicationOutreachSection,
} from "@/components/ApplicationOutreachSections";
import { isOutreachAssetType } from "@/lib/product-config";
import { HiringTeamDisclosureGroup } from "@/components/HiringTeamDisclosureGroup";
import { HiringTeamRoleActions } from "@/components/HiringTeamRoleActions";
import {
  displayedFitBucket,
  fitCriterionReason,
  fitSignalLabels,
  formatFitBucketLabel,
} from "@/lib/application/fit";
import type { ApplicationFitOutcome } from "@/lib/application/fit";
import { readApplicationFitStale } from "@/lib/application/service";
import type { JobScorecard, ScorecardItem } from "@/lib/job-requirement/types";
import { prisma } from "@/lib/prisma";
import {
  coverLetterEvidenceIsThin,
  coverLetterThinEvidenceCopy,
} from "@/lib/application-assets/service";
import { presentationPlanSchema } from "@/lib/application-assets/plan-contract";
import { ensureApplicationNextStep } from "@/lib/application/next-step";
import { applicationResearchCopy, applicationSummaryConfig, applicationWorkspaceCopy, consultationConfig, consultationConversationCopy, employerIdentityCopy, hiringTeamConfig, hiringTeamDetailsTitle, outreachConfig, polishCopy, vocab } from "@/lib/product-config";
import {
  parseIdentityVerification,
} from "@/lib/job-requirement/identity-verification";
import { ensureHiringTeamAfterResearch, ensureIdentityVerification } from "@/lib/application/service";
import { AppActionLink } from "@/components/ui";
import { parseStringArray } from "@/lib/research";
import type { ResearchSource } from "@/lib/research/types";
import { hasUsableCompanyResearchFields } from "@/lib/research/freshness";
import { researchStatusLabel } from "@/lib/tenant/companies";
import { formatDate, formatNumber } from "@/lib/utils";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { persistExtractedExperienceDates } from "@/lib/product-research/restore-role-dates";
import { persistExtractedContactDetails } from "@/lib/product-research/restore-contact-details";
import { missingResumeContactLabels } from "@/lib/application-assets/header";

function textList(value: unknown): string[] {
  return parseStringArray(value);
}

function readScorecard(value: unknown): JobScorecard {
  if (!value || typeof value !== "object") {
    return { mission: null, outcomes: [], competencies: [] };
  }
  const row = value as Partial<JobScorecard>;
  const item = (entry: unknown): ScorecardItem | null => {
    if (!entry || typeof entry !== "object") return null;
    const candidate = entry as Partial<ScorecardItem>;
    if (typeof candidate.text !== "string" || !candidate.text.trim()) return null;
    if (typeof candidate.id !== "string") return null;
    return {
      id: candidate.id,
      text: candidate.text,
      inferred: candidate.inferred === true,
    };
  };
  return {
    mission: item(row.mission),
    outcomes: Array.isArray(row.outcomes)
      ? row.outcomes.map(item).filter((entry): entry is ScorecardItem => Boolean(entry))
      : [],
    competencies: Array.isArray(row.competencies)
      ? row.competencies.map(item).filter((entry): entry is ScorecardItem => Boolean(entry))
      : [],
  };
}

function readOutcomes(value: unknown): ApplicationFitOutcome[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ApplicationFitOutcome => {
    if (!entry || typeof entry !== "object") return false;
    return typeof (entry as { name?: unknown }).name === "string";
  });
}

function ScorecardList({
  title,
  items,
}: {
  title: string;
  items: ScorecardItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="text-sm text-ink" data-scorecard-id={item.id}>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdentityVerificationPanel({
  campaignId,
  canEdit,
  requirement,
}: {
  campaignId: string;
  canEdit: boolean;
  requirement: {
    campaignId: string;
    identityConfirmation: "PENDING" | "CONFIRMED" | "REJECTED";
    identityVerificationJson: unknown;
  };
}) {
  const verification = parseIdentityVerification(requirement.identityVerificationJson);
  const showCandidate =
    verification &&
    requirement.identityConfirmation !== "CONFIRMED" &&
    (verification.verdict === "AMBIGUOUS" || requirement.identityConfirmation === "REJECTED");

  return (
    <div className="space-y-3 border-t border-edge pt-4" data-testid="employer-identity">
      <h2 className="text-base font-semibold text-ink">{employerIdentityCopy.title}</h2>
      {requirement.identityConfirmation === "CONFIRMED" ? (
        <p className="text-sm text-ink">{employerIdentityCopy.confirmed}</p>
      ) : null}
      {requirement.identityConfirmation === "REJECTED" ? (
        <p className="text-sm text-warning">{employerIdentityCopy.rejected}</p>
      ) : null}
      {showCandidate ? (
        <div
          className="space-y-3 rounded-md border border-warning bg-warning-tint p-3"
          data-testid="employer-identity-candidate"
        >
          <p className="text-sm text-warning">{employerIdentityCopy.unmatched}</p>
          <div className="space-y-1 text-sm text-ink">
            <p className="font-medium">
              {verification.candidate.name || employerIdentityCopy.unknownCompany}
            </p>
            {verification.candidate.summary ? <p>{verification.candidate.summary}</p> : null}
            {verification.candidate.whatTheyDo ? (
              <p>
                {employerIdentityCopy.candidateLabels.whatTheyDo}: {verification.candidate.whatTheyDo}
              </p>
            ) : null}
            {verification.candidate.location ? (
              <p>
                {employerIdentityCopy.candidateLabels.location}: {verification.candidate.location}
              </p>
            ) : null}
            {verification.candidate.sizeOrStage ? (
              <p>
                {employerIdentityCopy.candidateLabels.sizeOrStage}: {verification.candidate.sizeOrStage}
              </p>
            ) : null}
            {verification.candidate.website ? (
              <p>
                {employerIdentityCopy.candidateLabels.website}: {verification.candidate.website}
              </p>
            ) : null}
          </div>
          <ul className="space-y-2" data-testid="employer-identity-checks">
            {verification.checks.map((check) => (
              <li key={check.key} className="text-sm text-ink">
                <span className="font-medium">
                  {employerIdentityCopy.checkLabels[check.key]}
                </span>
                <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-ink">
                  {employerIdentityCopy.status[check.status]}
                </span>
                <span className="mt-1 block text-ink">{check.reason}</span>
                {check.postingEvidence ? (
                  <span className="mt-1 block text-muted">
                    {employerIdentityCopy.postingEvidence}: {check.postingEvidence}
                  </span>
                ) : null}
                {check.researchEvidence ? (
                  <span className="block text-muted">
                    {employerIdentityCopy.researchEvidence}: {check.researchEvidence}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit && requirement.identityConfirmation !== "REJECTED" ? (
            <div className="flex flex-wrap gap-3">
              <ApplicationActionForm
                action={confirmApplicationEmployerIdentityAction}
                submitLabel={employerIdentityCopy.confirm}
                testId="confirm-employer-identity"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
              </ApplicationActionForm>
              <ApplicationActionForm
                action={rejectApplicationEmployerIdentityAction}
                submitLabel={employerIdentityCopy.reject}
                testId="reject-employer-identity"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
              </ApplicationActionForm>
            </div>
          ) : null}
          {canEdit ? (
            <ApplicationActionForm
              action={nameApplicationEmployerAction}
              submitLabel={employerIdentityCopy.rerun}
              testId="correct-employer-form"
            >
              <input type="hidden" name="campaignId" value={requirement.campaignId} />
              <label className="block text-sm">
                <span className="font-medium text-ink">{employerIdentityCopy.supplyName}</span>
                <input
                  name="employerName"
                  className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">{employerIdentityCopy.supplyWebsite}</span>
                <input
                  name="website"
                  className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
                />
              </label>
            </ApplicationActionForm>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}

export type ApplicationWorkspaceFocus = ApplicationStepKey | "overview" | "all";

function showFocus(
  focus: ApplicationWorkspaceFocus,
  keys: ApplicationWorkspaceFocus[],
): boolean {
  return focus === "all" || keys.includes(focus);
}

export async function ApplicationWorkspace({
  campaignId,
  organizationId,
  canEdit,
  focus = "all",
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  focus?: ApplicationWorkspaceFocus;
}) {
  await ensureIdentityVerification({ organizationId, campaignId });
  await ensureHiringTeamAfterResearch({ organizationId, campaignId });
  await mergeExistingHiringTeamRoles({ organizationId, campaignId });
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId, organizationId },
    include: {
      company: { include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } } },
      campaign: {
        select: {
          companyResearchNotes: true,
          icp: {
            select: { updatedAt: true, interpretationPromptVersion: true, name: true },
          },
          applicationFit: true,
          product: { select: { id: true, profileJson: true } },
          appliedAt: true,
          applicationProgress: true,
          contacts: {
            include: {
              contact: true,
              chosenPersona: {
                select: { id: true, name: true, suggestionKey: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          hiringTeamRoles: {
            where: { archivedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, suggestionKey: true },
          },
          applicationAssets: {
            orderBy: [{ type: "asc" }, { version: "desc" }],
          },
          presentationPlans: true,
        },
      },
    },
  });
  if (!requirement) {
    const step =
      focus === "all" || focus === "overview"
        ? null
        : applicationStepByKey(focus);
    return (
      <EmptyState
        title={step?.title ?? applicationStepCopy.overviewTitle}
        description={step?.emptyGuidance ?? applicationStepCopy.factMissing}
        actions={
          <AppActionLink href="/campaigns" variant="secondary">
            {polishCopy.backToApplications}
          </AppActionLink>
        }
      />
    );
  }

  const researchStatus = await getApplicationResearchStatus({
    organizationId,
    campaignId,
  });
  const scorecard = readScorecard(requirement.scorecardJson);
  const research = requirement.company?.research[0] ?? null;
  const fit = requirement.campaign.applicationFit;
  const icp = requirement.campaign.icp;
  const stale = fit
    ? readApplicationFitStale({
        stale: fit.stale,
        staleReason: fit.staleReason,
        computedAt: fit.computedAt,
        icpUpdatedAt: fit.icpUpdatedAt,
        companyResearchUpdatedAt: fit.companyResearchUpdatedAt,
        interpretationPromptVersion: fit.interpretationPromptVersion,
        currentIcpUpdatedAt: icp.updatedAt,
        currentResearchUpdatedAt: research?.updatedAt ?? null,
        currentPromptVersion: icp.interpretationPromptVersion,
      })
    : null;
  const outcomes = fit ? readOutcomes(fit.outcomesJson) : [];
  let profile = parseCandidateProfileSafe(
    requirement.campaign.product.profileJson,
  );
  if (profile.ok && canEdit) {
    profile = {
      ok: true,
      profile: await persistExtractedContactDetails({
        organizationId,
        productId: requirement.campaign.product.id,
        profile: await persistExtractedExperienceDates({
          organizationId,
          productId: requirement.campaign.product.id,
          profile: profile.profile,
        }),
      }),
    };
  }
  const [approvedStatementCount, approvedStoryCount] = await Promise.all([
    prisma.consultationStatement.count({
      where: {
        organizationId,
        session: { campaignId },
        status: "APPROVED",
      },
    }),
    prisma.profileStory.count({
      where: {
        organizationId,
        productId: requirement.campaign.product.id,
      },
    }),
  ]);
  const coverLetterEvidenceThin = coverLetterEvidenceIsThin({
    approvedStatementCount,
    approvedStoryCount,
    achievementTexts: profile.ok
      ? profile.profile.experience.flatMap((role) =>
          role.achievements.map((item) => item.text),
        )
      : [],
  });
  await supersedeObsoleteWorkspaceFailures({ organizationId, campaignId });
  const [nextStep, live] = await Promise.all([
    ensureApplicationNextStep({
      organizationId,
      campaignId,
    }),
    getApplicationWorkspaceLive({ organizationId, campaignId }),
  ]);
  const profileHref = workspaceProfileHref(requirement.campaign.product.id);
  const profileEditHref = workspaceProfileEditHref(
    requirement.campaign.product.id,
  );
  const invalidPlanTypes = requirement.campaign.presentationPlans.flatMap(
    (row) =>
      presentationPlanSchema.safeParse(row.planJson).success
        ? []
        : [row.type as "RESUME" | "COVER_LETTER"],
  );
  const presentationPlans = requirement.campaign.presentationPlans.flatMap(
    (row) => {
      const parsed = presentationPlanSchema.safeParse(row.planJson);
      if (!parsed.success) return [];
      return [
        {
          type: row.type as "RESUME" | "COVER_LETTER",
          status: row.status as "DRAFT" | "ACCEPTED",
          plan: parsed.data,
        },
      ];
    },
  );
  const assetsOpen =
    nextStep.stateKey === "resume_plan_ready" ||
    nextStep.stateKey === "cover_plan_ready" ||
    nextStep.stateKey === "resume_ready" ||
    nextStep.stateKey === "cover_ready";
  const shownBucket = fit
    ? displayedFitBucket({
        bucket: fit.bucket,
        overrideBucket: fit.overrideBucket,
      })
    : null;

  const asPage = focus !== "all";

  return (
    <div className={`space-y-4 ${WORKSPACE_CARD_WRAP_CLASS}`}>
    {showFocus(focus, ["overview", "applied"]) ? (
    <details
      className="rounded-lg border border-edge bg-surface p-5"
      data-testid="application-applied-wrap"
      id="applied"
    >
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationWorkspaceCopy.appliedTitle}
      </summary>
      <div className="mt-4">
    <ApplicationAppliedSection
      campaignId={requirement.campaignId}
      canEdit={canEdit}
      appliedAt={requirement.campaign.appliedAt?.toISOString() ?? null}
      applicationProgress={requirement.campaign.applicationProgress}
    />
      </div>
    </details>
    ) : null}
    {showFocus(focus, ["overview"]) ? (
    <section
      className={`space-y-3 rounded-lg border border-edge bg-surface p-5 ${WORKSPACE_CARD_WRAP_CLASS}`}
      data-testid="application-next-step"
    >
      <h2 id="application-next-step" className="text-base font-semibold text-ink">
        {consultationConversationCopy.nextStepTitle}
      </h2>
      <ApplicationWorkspaceLive
        campaignId={campaignId}
        initialJobs={live.jobs}
        profileHref={profileHref}
      />
      <WorkspaceProgress jobs={live.jobs} type="NEXT_STEP" />
      {nextStep.failed ? (
        <div className="space-y-2">
          <p className={`text-sm text-warning ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>
            {consultationConversationCopy.nextStepFailed}
          </p>
          {canEdit ? (
            <ApplicationActionForm
              action={retryApplicationNextStepAction}
              submitLabel={consultationConversationCopy.nextStepRetry}
              testId="retry-next-step"
            >
              <input type="hidden" name="campaignId" value={campaignId} />
            </ApplicationActionForm>
          ) : null}
        </div>
      ) : (
        <p className={`text-sm text-ink ${WORKSPACE_MESSAGE_WRAP_CLASS}`}>{nextStep.text}</p>
      )}
    </section>
    ) : null}
    {showFocus(focus, ["company"]) ? (
    <details
      className="space-y-4 rounded-lg border border-edge bg-surface p-5"
      data-testid="application-company"
      id="company"
    >
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationWorkspaceCopy.companyTitle}
      </summary>
      <div className="mt-4 space-y-4">
        <ApplicationResearchStatus
          campaignId={campaignId}
          canEdit={canEdit}
          initialStatus={researchStatus}
          hideRetry
        />
        <IdentityVerificationPanel
          campaignId={campaignId}
          canEdit={canEdit}
          requirement={requirement}
        />
        <ApplicationCompanyBriefing
          campaignId={campaignId}
          canEdit={canEdit}
          companyName={
            requirement.company?.name ??
            requirement.companyName ??
            applicationWorkspaceCopy.companyTitle
          }
          meta={{
            domain:
              requirement.company?.normalizedDomain ??
              requirement.company?.website ??
              null,
            industry: requirement.company?.industry ?? null,
            location: requirement.company?.location ?? null,
            employeeCount:
              requirement.company?.employeeCount != null
                ? formatNumber(requirement.company.employeeCount)
                : null,
            revenue:
              requirement.company?.revenue != null
                ? String(requirement.company.revenue)
                : null,
            lastResearched: research?.researchedAt
              ? formatDate(research.researchedAt)
              : null,
          }}
          defaults={{
            companySummary: research?.companySummary ?? null,
            whatTheySell: research?.whatTheySell ?? null,
            customerTypes: research?.customerTypes ?? [],
            primaryMarkets: research?.primaryMarkets ?? [],
            businessModel: research?.businessModel ?? null,
            companySizeContext: research?.companySizeContext ?? null,
            relevantTechnologies: research?.relevantTechnologies ?? [],
            hiringSignals: research?.hiringSignals ?? [],
            riskSignals: research?.riskSignals ?? [],
          }}
          sources={
            Array.isArray(research?.researchSources)
              ? (research.researchSources as ResearchSource[])
              : []
          }
          researchMethod={research?.researchMethod ?? null}
          researchStatus={
            research &&
            (research.status === "COMPLETED" || research.status === "PARTIAL")
              ? hasUsableCompanyResearchFields(research)
                ? "Researched"
                : "No usable details found"
              : researchStatusLabel(research?.status)
          }
          notes={requirement.campaign.companyResearchNotes ?? ""}
          researchLive={
            researchStatus.phase === "queued" ||
            researchStatus.phase === "researching"
          }
        />
      </div>
    </details>
    ) : null}
    {showFocus(focus, ["job"]) ? (
    <>
    <details className="space-y-4 rounded-lg border border-edge bg-surface p-5" data-testid="application-workspace">
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationWorkspaceCopy.jobRequirementTitle}
      </summary>
      <div className="mt-4 space-y-4">
    <section className="space-y-4">
      <p className="text-sm text-muted">
        {applicationWorkspaceCopy.jobPostingHelp}
      </p>
      <dl className="grid gap-3 md:grid-cols-2" data-testid="job-requirement-view">
        <Field label={applicationWorkspaceCopy.fieldTitle} value={requirement.title} />
        <Field label={applicationWorkspaceCopy.fieldEmployer} value={requirement.companyName} />
        <Field label={applicationWorkspaceCopy.fieldLocation} value={requirement.location} />
        <Field label={applicationWorkspaceCopy.fieldWorkArrangement} value={requirement.workArrangement} />
        <Field label={applicationWorkspaceCopy.fieldEmploymentType} value={requirement.employmentType} />
        <Field label={applicationWorkspaceCopy.fieldSeniority} value={requirement.seniority} />
        <Field label={applicationWorkspaceCopy.fieldCompensation} value={requirement.compensationRange} />
        <Field label={applicationWorkspaceCopy.fieldReportsTo} value={requirement.reportingLine} />
      </dl>
      <BulletList title={applicationWorkspaceCopy.responsibilitiesTitle} items={textList(requirement.responsibilities)} />
      <BulletList title={applicationWorkspaceCopy.requiredTitle} items={textList(requirement.requiredItems)} />
      <BulletList title={applicationWorkspaceCopy.preferredTitle} items={textList(requirement.preferredItems)} />
      <div className="space-y-3 border-t border-edge pt-4">
        <h3 className="text-sm font-semibold text-ink">{applicationWorkspaceCopy.scorecardTitle}</h3>
        {scorecard.mission ? (
          <p className="text-sm text-ink">{scorecard.mission.text}</p>
        ) : (
          <p className="text-sm text-subtle">{applicationWorkspaceCopy.noMission}</p>
        )}
        <ScorecardList title={applicationWorkspaceCopy.outcomesTitle} items={scorecard.outcomes} />
        <ScorecardList title={applicationWorkspaceCopy.competenciesTitle} items={scorecard.competencies} />
        <p className="text-sm text-muted" data-testid="scorecard-note">
          {applicationWorkspaceCopy.scorecardNote
            .replaceAll("{product}", vocab.product.Singular)
            .replaceAll("{consultant}", consultationConfig.displayName)}
        </p>
      </div>
      {canEdit ? (
        <ApplicationJobRequirementActions
          campaignId={requirement.campaignId}
          rawText={requirement.rawText}
          learnedNotes={requirement.seekerLearnedNotes ?? ""}
        />
      ) : null}

      {requirement.employerSkipReason ? (
        <p className="rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning" data-testid="employer-skip-reason">
          {requirement.employerSkipReason}
        </p>
      ) : null}

      {canEdit && requirement.employerDisposition !== "IDENTIFIED" && !parseIdentityVerification(requirement.identityVerificationJson) ? (
        <ApplicationActionForm
          action={nameApplicationEmployerAction}
          submitLabel={applicationResearchCopy.saveEmployer}
          testId="confirm-employer-form"
        >
          <input type="hidden" name="campaignId" value={requirement.campaignId} />
          <label className="block text-sm">
            <span className="font-medium text-ink">Employer name</span>
            <input
              name="employerName"
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">{employerIdentityCopy.supplyWebsite}</span>
            <input
              name="website"
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </label>
        </ApplicationActionForm>
      ) : null}

    </section>
      </div>
    </details>
    <details
      className="space-y-4 rounded-lg border border-edge bg-surface p-5"
      data-testid="employer-fit"
      id="employer-fit"
    >
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationWorkspaceCopy.employerFitTitle}
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted">
          {applicationWorkspaceCopy.fitHelp.replace("{name}", icp.name)}
        </p>
        {shownBucket ? (
          <p className="text-sm font-medium text-ink" data-testid="employer-fit-bucket">
            {applicationWorkspaceCopy.fitScoredLabel}: {formatFitBucketLabel(shownBucket)}
          </p>
        ) : (
          <p className="text-sm text-muted">{applicationWorkspaceCopy.fitMissing}</p>
        )}
        {stale?.stale ? (
          <p className="text-sm text-warning" data-testid="employer-fit-stale">
            {stale.reason}
          </p>
        ) : null}
        <ul className="space-y-2" data-testid="employer-fit-criteria">
          {outcomes.map((outcome) => {
            const labels = fitSignalLabels(outcome);
            const result = fitCriterionReason(outcome);
            return (
              <li
                key={outcome.criterionId ?? outcome.name}
                className="text-sm text-ink"
                data-testid="employer-fit-criterion"
                data-fit-status={result.status}
              >
                <span className="font-medium">{outcome.name}</span>
                <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
                  {result.label}
                </span>
                {labels.map((label) => (
                  <span
                    key={label}
                    className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink"
                    data-testid={
                      outcome.dealBreakerHit
                        ? "deal-breaker-signal"
                        : outcome.mustHaveMiss
                          ? "must-have-signal"
                          : undefined
                    }
                  >
                    {label}
                  </span>
                ))}
                <span className="mt-1 block text-muted">{result.reason}</span>
                {outcome.evidence ? (
                  <span className="mt-1 block text-muted">{outcome.evidence}</span>
                ) : null}
                {outcome.source ? (
                  <span className="block text-xs text-subtle">{outcome.source}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canEdit && fit && shownBucket ? (
          <ApplicationFitOverride
            campaignId={requirement.campaignId}
            bucket={shownBucket}
          />
        ) : null}
        {canEdit && stale?.stale && requirement.employerDisposition === "IDENTIFIED" ? (
          <ApplicationActionForm
            action={rescoreApplicationFitAction}
            submitLabel="Rescore employer fit"
            testId="rescore-employer-fit"
          >
            <input type="hidden" name="campaignId" value={requirement.campaignId} />
          </ApplicationActionForm>
        ) : null}
      </div>
    </details>
    </>
    ) : null}
    {showFocus(focus, ["hiring-team"]) ? (
    <HiringTeamSection
      campaignId={requirement.campaignId}
      organizationId={organizationId}
      canEdit={canEdit}
      jobs={live.jobs}
      asPage={asPage}
    />
    ) : null}
    {showFocus(focus, ["assets"]) ? (
    <div id="assets">
    <WorkspaceProgress
      jobs={live.jobs}
      type="RESUME"
      profileHref={profileHref}
    />
    <WorkspaceProgress
      jobs={live.jobs}
      type="COVER_LETTER"
      profileHref={profileHref}
    />
    <ApplicationAssetsSection
      campaignId={requirement.campaignId}
      canEdit={canEdit}
      defaultOpen={assetsOpen}
      plans={presentationPlans}
      invalidPlanTypes={invalidPlanTypes}
      coverLetterThinNotice={
        coverLetterEvidenceThin ? coverLetterThinEvidenceCopy() : null
      }
      missingResumeContacts={
        profile.ok ? missingResumeContactLabels(profile.profile) : []
      }
      profileHref={profileHref}
      profileEditHref={profileEditHref}
      profileRoles={
        profile.ok
          ? profile.profile.experience.map((role) => ({
              id: role.id,
              employer: role.employer,
              title: role.title,
              startDate: role.startDate,
              endDate: role.endDate,
            }))
          : []
      }
      assets={requirement.campaign.applicationAssets
        .filter(
          (
            asset,
          ): asset is typeof asset & { type: "RESUME" | "COVER_LETTER" } =>
            asset.type === "RESUME" || asset.type === "COVER_LETTER",
        )
        .map((asset) => ({
          id: asset.id,
          type: asset.type,
          version: asset.version,
          status: asset.status,
          content: asset.contentJson,
          guidance: asset.guidance,
          promptVersion: asset.promptVersion,
          staleReason: asset.staleReason,
          createdAt: asset.createdAt.toISOString(),
        }))}
    />
    </div>
    ) : null}
    {showFocus(focus, ["outreach"]) ? (
    <div id="outreach" data-testid="application-contacts-wrap">
    <p className="sr-only">{applicationWorkspaceCopy.contactsTitle}</p>
    <WorkspaceProgress jobs={live.jobs} type="OUTREACH" />
    <ApplicationOutreachSection
      campaignId={requirement.campaignId}
      canEdit={canEdit}
      approvedResumeId={
        requirement.campaign.applicationAssets.find(
          (asset) => asset.type === "RESUME" && asset.status === "APPROVED",
        )?.id ?? null
      }
      roles={requirement.campaign.hiringTeamRoles}
      contacts={requirement.campaign.contacts.map(toContactRow)}
      assets={requirement.campaign.applicationAssets
        .filter((asset): asset is typeof asset & {
          type: "EMAIL" | "LINKEDIN_CONNECTION_NOTE" | "LINKEDIN_INMAIL";
        } => isOutreachAssetType(asset.type))
        .map((asset) => ({
          id: asset.id,
          type: asset.type,
          version: asset.version,
          status: asset.status,
          personaId: asset.personaId,
          contactId: asset.contactId,
          purpose: asset.purpose,
          sentAt: asset.sentAt?.toISOString() ?? null,
          createdAt: asset.createdAt.toISOString(),
          emailLength: asset.emailLength,
          content: asset.contentJson,
        }))}
    />
    </div>
    ) : null}
    {showFocus(focus, ["interviews"]) ? (
    <div id="interviews">
    <WorkspaceProgress jobs={live.jobs} type="INTERVIEW_GUIDE" />
    <InterviewStagesSection
      campaignId={requirement.campaignId}
      organizationId={organizationId}
      canEdit={canEdit}
      roles={requirement.campaign.hiringTeamRoles}
      contacts={requirement.campaign.contacts.map((row) => ({
        contactId: row.contact.id,
        personaId: row.chosenPersonaId,
      }))}
    />
    </div>
    ) : null}
    {showFocus(focus, ["summary"]) ? (
    <details
      className="rounded-lg border border-edge bg-surface p-5"
      data-testid="application-summary-wrap"
      id="application-summary"
    >
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {applicationSummaryConfig.title}
      </summary>
      <div className="mt-4 space-y-3">
        <WorkspaceProgress jobs={live.jobs} type="APPLICATION_SUMMARY" />
        <p className="text-sm text-muted">{applicationSummaryConfig.description}</p>
        <AppActionLink href={workspaceCampaignSummaryHref(campaignId)} variant="secondary">
          {applicationSummaryConfig.title}
        </AppActionLink>
      </div>
    </details>
    ) : null}
    </div>
  );
}

function annotatedList(value: unknown): Array<{ text: string; kind: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { text?: unknown; kind?: unknown };
    if (typeof row.text !== "string" || !row.text.trim()) return [];
    return [{ text: row.text.trim(), kind: row.kind === "FACT" ? "FACT" : "INFERENCE" }];
  });
}

function readNarrative(value: unknown): {
  involvement: string | null;
  modelNote: string | null;
  overview: string | null;
  pressures: Array<{ text: string; kind: string }>;
  impact: { text: string; kind: string } | null;
  needs: Array<{ text: string; kind: string }>;
  concerns: Array<{ text: string; kind: string }>;
  interviewStage: { text: string; kind: string } | null;
  evaluates: Array<{ text: string; kind: string }>;
  talkingPoints: Array<{ text: string; kind: string }>;
  communication: Array<{ text: string; kind: string }>;
  identificationEvidence: Array<{ text: string; kind: string }>;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    narrative?: unknown;
    involvement?: unknown;
    identification?: unknown;
    modelNote?: unknown;
  };
  const narrative = row.narrative;
  const body =
    narrative && typeof narrative === "object" ? (narrative as Record<string, unknown>) : null;
  const one = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as { text?: unknown; kind?: unknown };
    if (typeof item.text !== "string" || !item.text.trim()) return null;
    return { text: item.text.trim(), kind: item.kind === "FACT" ? "FACT" : "INFERENCE" };
  };
  const identification = row.identification;
  const evidence =
    identification && typeof identification === "object" && Array.isArray((identification as { evidence?: unknown }).evidence)
      ? annotatedList(
          (identification as { evidence: unknown[] }).evidence.map((item) => {
            if (!item || typeof item !== "object") return null;
            const claim = item as { claim?: unknown; kind?: unknown };
            return { text: claim.claim, kind: claim.kind };
          }),
        )
      : [];
  return {
    involvement: typeof row.involvement === "string" ? row.involvement : null,
    modelNote: typeof row.modelNote === "string" && row.modelNote.trim() ? row.modelNote.trim() : null,
    overview: body ? (one(body.overview)?.text ?? null) : null,
    pressures: body ? annotatedList(body.pressures) : [],
    impact: body ? one(body.impact) : null,
    needs: body ? annotatedList(body.needs) : [],
    concerns: body ? annotatedList(body.concerns) : [],
    interviewStage: body ? one(body.interviewStage) : null,
    evaluates: body ? annotatedList(body.evaluates) : [],
    talkingPoints: body ? annotatedList(body.talkingPoints) : [],
    communication: body ? annotatedList(body.communication) : [],
    identificationEvidence: evidence,
  };
}

function toContactRow(row: {
  chosenPersonaId: string | null;
  roleConfirmed: boolean;
  linkedInProfileText: string | null;
  linkedInExtractedJson: unknown;
  individualProfileJson: unknown;
  individualProfileStatus: string | null;
  individualProfileError: string | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    linkedinUrl: string | null;
  };
  chosenPersona: { name: string } | null;
}) {
  const extracted = parseLinkedInExtracted(row.linkedInExtractedJson);
  const individual = parseIndividualProfile(row.individualProfileJson);
  return {
    contactId: row.contact.id,
    firstName: row.contact.firstName,
    lastName: row.contact.lastName,
    title: row.contact.title,
    email: row.contact.email,
    linkedinUrl: row.contact.linkedinUrl,
    personaId: row.chosenPersonaId,
    personaName: row.chosenPersona?.name ?? null,
    roleConfirmed: row.roleConfirmed,
    linkedInProfileText: row.linkedInProfileText,
    extractedTitle: extracted?.currentTitle?.text ?? null,
    individualStatus: row.individualProfileStatus,
    individualError: row.individualProfileError,
    commonGround: individual?.commonGround ?? [],
    caresAbout: individual?.caresAbout ?? [],
  };
}

function hiringTeamStatusLabel(
  setupStatus: string,
  approvalStatus: string,
  staleAt: Date | null,
): string {
  if (staleAt) return hiringTeamConfig.status.stale;
  if (approvalStatus === "APPROVED") return hiringTeamConfig.status.approved;
  if (setupStatus === "FAILED") return hiringTeamConfig.status.failed;
  if (setupStatus === "SYNTHESIZING") return hiringTeamConfig.status.building;
  if (setupStatus === "NEEDS_REVIEW") return hiringTeamConfig.status.built;
  if (setupStatus === "PARTIAL") return hiringTeamConfig.status.built;
  return hiringTeamConfig.status.identified;
}

function KindMark({ kind }: { kind: string }) {
  return (
    <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
      {kind === "FACT" ? "Fact" : "Inference"}
    </span>
  );
}

async function HiringTeamSection({
  campaignId,
  organizationId,
  canEdit,
  jobs = [],
  asPage = false,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  jobs?: import("@/lib/application-jobs/workspace-status").WorkspaceJobStatusView[];
  asPage?: boolean;
}) {
  const [roles, templates] = await Promise.all([
    prisma.persona.findMany({
      where: { organizationId, campaignId, archivedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.personaTemplate.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";
  const organizedRoles = roles.map((role) => ({
    role,
    narrative: readNarrative(role.profileJson),
  }));
  const directRoles = organizedRoles.filter(
    ({ narrative }) => narrative?.involvement !== "INDIRECT",
  );
  const indirectRoles = organizedRoles.filter(
    ({ narrative }) => narrative?.involvement === "INDIRECT",
  );

  const roleCard = ({
    role,
    narrative,
  }: (typeof organizedRoles)[number]) => (
    <div
      key={role.id}
      className="rounded-md border border-edge p-4"
      data-testid="hiring-team-role"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-ink">{role.name}</h4>
            <span className="text-xs text-subtle">
              {hiringTeamStatusLabel(role.setupStatus, role.approvalStatus, role.staleAt)}
            </span>
          </div>
          {canEdit ? (
            <HiringTeamRoleActions
              personaId={role.id}
              addPersonForm={
                <ApplicationActionForm
                  action={addHiringTeamPersonAction}
                  submitLabel={hiringTeamConfig.actions.addPerson}
                  testId={`add-person-${role.id}`}
                >
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="personaId" value={role.id} />
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      {outreachConfig.labels.fieldFirstName}
                    </span>
                    <input name="firstName" required className={fieldClass} />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      {outreachConfig.labels.fieldLastName}
                    </span>
                    <input name="lastName" required className={fieldClass} />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      {outreachConfig.labels.fieldTitle}
                    </span>
                    <input name="title" required className={fieldClass} />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      {outreachConfig.labels.fieldEmail}
                    </span>
                    <input name="email" type="email" className={fieldClass} />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-ink">
                      {outreachConfig.labels.fieldLinkedIn}
                    </span>
                    <input name="linkedinUrl" type="url" className={fieldClass} />
                  </label>
                </ApplicationActionForm>
              }
              editForm={
            <ApplicationActionForm
              action={updateApplicationRoleAction}
              submitLabel="Save edits"
              testId={`save-role-${role.id}`}
            >
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="personaId" value={role.id} />
              <label className="block text-sm">
                <span className="font-medium text-ink">Name</span>
                <input name="name" required defaultValue={role.name} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Likely titles</span>
                <textarea
                  name="likelyTitles"
                  rows={2}
                  defaultValue={textList(role.targetTitles).join("\n")}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Department</span>
                <input name="department" defaultValue={role.department ?? ""} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Why this role matters</span>
                <textarea
                  name="whyThisRoleMatters"
                  rows={2}
                  defaultValue={role.whyThisPersonaMatters ?? ""}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Notes</span>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={role.additionalContext ?? ""}
                  className={fieldClass}
                />
              </label>
            </ApplicationActionForm>
            }
            />
          ) : null}
        </div>
        <p className="text-sm text-ink">
          {textList(role.targetTitles).join(", ") || "No likely titles."}
        </p>
        {role.whyThisPersonaMatters ? (
          <p className="text-sm text-ink">{role.whyThisPersonaMatters}</p>
        ) : null}
        {canEdit ? (
          <ApplicationActionForm
            action={
              role.setupStatus === "FAILED" || role.staleAt
                ? rebuildApplicationRoleAction
                : buildApplicationRoleAction
            }
            submitLabel={
              role.setupStatus === "FAILED"
                ? hiringTeamConfig.actions.retry
                : role.staleAt
                  ? hiringTeamConfig.actions.rebuild
                  : hiringTeamConfig.actions.build
            }
            testId={`build-role-${role.id}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="personaId" value={role.id} />
          </ApplicationActionForm>
        ) : null}
        {canEdit ? (
          <ApplicationActionForm
            action={moveApplicationRoleInvolvementAction}
            submitLabel={
              narrative?.involvement === "INDIRECT"
                ? hiringTeamConfig.actions.moveToDirect
                : hiringTeamConfig.actions.moveToIndirect
            }
            variant="secondary"
            testId={`move-role-involvement-${role.id}`}
          >
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="personaId" value={role.id} />
            <input
              type="hidden"
              name="involvement"
              value={narrative?.involvement === "INDIRECT" ? "DIRECT" : "INDIRECT"}
            />
          </ApplicationActionForm>
        ) : null}
      </div>
      <details className="mt-4 border-t border-edge pt-4">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        {hiringTeamDetailsTitle(role.name)}
      </summary>
      <div className="mt-4 space-y-3">
        {role.department ? (
          <p className="text-sm text-ink">{role.department}</p>
        ) : null}
        {narrative?.overview ? (
          <p className="text-sm text-ink">{narrative.overview}</p>
        ) : role.definition ? (
          <p className="text-sm text-ink">{role.definition}</p>
        ) : null}
        {narrative?.impact ? (
          <p className="text-sm text-ink">
            {narrative.impact.text}
            <KindMark kind={narrative.impact.kind} />
          </p>
        ) : null}
        {narrative ? (
          <>
            <AnnotatedBlock title="Pressures" items={narrative.pressures} />
            <AnnotatedBlock title="What they need" items={narrative.needs} />
            <AnnotatedBlock title="Concerns" items={narrative.concerns} />
            {narrative.interviewStage ? (
              <p className="text-sm text-ink">
                Interview stage: {narrative.interviewStage.text}
                <KindMark kind={narrative.interviewStage.kind} />
              </p>
            ) : null}
            <AnnotatedBlock title="What they evaluate" items={narrative.evaluates} />
            <AnnotatedBlock title="Talking points" items={narrative.talkingPoints} />
            <AnnotatedBlock title="How to communicate" items={narrative.communication} />
            <AnnotatedBlock
              title="Why they were identified"
              items={narrative.identificationEvidence}
            />
          </>
        ) : null}
        {narrative?.modelNote ? (
          <p className="text-sm text-warning">{narrative.modelNote}</p>
        ) : null}
        {role.additionalContext ? (
          <p className="text-sm text-ink">{role.additionalContext}</p>
        ) : null}
        {canEdit ? (
          <div className="space-y-3 print:hidden">
            <div className="flex flex-wrap gap-3">
              <ApplicationActionForm
                action={approveApplicationRoleAction}
                submitLabel="Approve"
                testId={`approve-role-${role.id}`}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="personaId" value={role.id} />
              </ApplicationActionForm>
              <ApplicationActionForm
                action={removeApplicationRoleAction}
                submitLabel="Remove role"
                variant="danger"
                testId={`remove-role-${role.id}`}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="personaId" value={role.id} />
              </ApplicationActionForm>
              <ApplicationActionForm
                action={saveRoleAsTemplateAction}
                submitLabel="Save as template"
                testId={`save-role-template-${role.id}`}
                variant="secondary"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="personaId" value={role.id} />
              </ApplicationActionForm>
            </div>
          </div>
        ) : null}
      </div>
      </details>
    </div>
  );
  return (
    <details id="hiring-team" className="space-y-4 rounded-lg border border-edge bg-surface p-5" data-testid="hiring-team">
      {asPage ? <OpenDetailsOnMount /> : null}
      <summary className="cursor-pointer text-base font-semibold text-ink">
        {hiringTeamConfig.workspaceTitle}
      </summary>
      <div className="mt-4 space-y-4">
      <p className="rounded-md border border-edge bg-canvas px-3 py-2 text-sm text-ink">
        {hiringTeamConfig.assumptionIntro}
      </p>
      <WorkspaceProgress jobs={jobs} type="HIRING_TEAM_IDENTIFY" />
      <WorkspaceProgress jobs={jobs} type="HIRING_TEAM_BUILD" />
      <WorkspaceProgress jobs={jobs} type="CONTACT_PROFILE" />
      <div>
        <p className="mt-1 text-sm text-muted">
          Saved templates are added only when you choose one.
        </p>
      </div>
      {roles.length === 0 ? (
        <p className="text-sm text-muted">No {vocab.persona.plural} yet.</p>
      ) : (
        <div className="space-y-5">
          <HiringTeamDisclosureGroup
            groupKey="direct"
            title={hiringTeamConfig.sections.direct}
          >
            {directRoles.map(roleCard)}
          </HiringTeamDisclosureGroup>
          <HiringTeamDisclosureGroup
            groupKey="indirect"
            title={hiringTeamConfig.sections.indirect}
          >
            {indirectRoles.length > 0 ? (
              indirectRoles.map(roleCard)
            ) : (
              <p className="text-sm text-subtle">
                No indirect {vocab.persona.plural.toLowerCase()}.
              </p>
            )}
          </HiringTeamDisclosureGroup>
        </div>
      )}
      {canEdit ? (
        <ApplicationActionForm
          action={buildAllDirectRolesAction}
          submitLabel={hiringTeamConfig.actions.buildAllDirect}
          testId="build-all-direct-roles"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
        </ApplicationActionForm>
      ) : null}
      {canEdit ? (
        <ApplicationActionForm action={addApplicationRoleAction} submitLabel={`Add ${vocab.persona.singular}`} testId="add-hiring-team-role">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="block text-sm">
            <span className="font-medium text-ink">Name</span>
            <input name="name" required className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Likely titles</span>
            <textarea name="likelyTitles" rows={3} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Department</span>
            <input name="department" className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Why this role matters</span>
            <textarea name="whyThisRoleMatters" rows={2} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Notes</span>
            <textarea name="notes" rows={2} className={fieldClass} />
          </label>
        </ApplicationActionForm>
      ) : null}
      {canEdit && templates.length > 0 ? (
        <ApplicationActionForm action={addTemplateRoleAction} submitLabel="Add saved template" testId="add-template-role">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="block text-sm">
            <span className="font-medium text-ink">Saved template</span>
            <select name="templateId" required className={fieldClass} defaultValue="">
              <option value="" disabled>
                Choose a template
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </ApplicationActionForm>
      ) : null}
      </div>
    </details>
  );
}

function AnnotatedBlock({
  title,
  items,
}: {
  title: string;
  items: Array<{ text: string; kind: string }>;
}) {
  const visible = items.filter((item) => item.text.replace(/\s+/g, " ").trim());
  if (visible.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-medium text-ink">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
        {visible.map((item) => (
          <li key={item.text}>
            {item.text}
            <KindMark kind={item.kind} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  const visible = items.filter((item) => item.replace(/\s+/g, " ").trim());
  if (visible.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
        {visible.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
