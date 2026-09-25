import Link from "next/link";
import {
  confirmApplicationEmployerIdentityAction,
  nameApplicationEmployerAction,
  rejectApplicationEmployerIdentityAction,
  rescoreApplicationFitAction,
  retryApplicationNextStepAction,
  retryApplicationResearchAction,
} from "@/app/actions/application";
import { ApplicationResearchStatus } from "@/components/ApplicationResearchStatus";
import { ApplicationFitOverride } from "@/components/ApplicationFitOverride";
import {
  ApplicationWorkspaceLive,
  WorkspaceProgress,
} from "@/components/ApplicationWorkspaceLive";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { getApplicationResearchStatus } from "@/lib/application/research-status";
import type { ApplicationResearchStatusView } from "@/lib/application/research-status";
import {
  addApplicationRoleAction,
  addHiringTeamPersonAction,
  addTemplateRoleAction,
  approveApplicationRoleAction,
  buildAllDirectRolesAction,
  buildApplicationRoleAction,
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
import { ConsultationSection } from "@/components/ConsultationSection";
import { ApplicationAssetsSection } from "@/components/ApplicationAssetsSection";
import {
  ApplicationAppliedSection,
  ApplicationContactsSection,
  ApplicationOutreachSection,
} from "@/components/ApplicationOutreachSections";
import { isOutreachAssetType } from "@/lib/product-config";
import { HiringTeamDisclosureGroup } from "@/components/HiringTeamDisclosureGroup";
import {
  displayedFitBucket,
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
import { applicationResearchCopy, applicationSummaryConfig, applicationWorkspaceCopy, consultationConversationCopy, criterionFlags, employerIdentityCopy, hiringTeamConfig, outreachConfig, vocab } from "@/lib/product-config";
import {
  parseIdentityVerification,
} from "@/lib/job-requirement/identity-verification";
import { ensureHiringTeamAfterResearch, ensureIdentityVerification } from "@/lib/application/service";
import { SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { parseStringArray } from "@/lib/research";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { persistExtractedExperienceDates } from "@/lib/product-research/restore-role-dates";

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
      <h3 className="text-sm font-medium text-slate-900">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="text-sm text-slate-800" data-scorecard-id={item.id}>
            {item.text}
            {item.inferred ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-950">
                {criterionFlags.inference}
              </span>
            ) : null}
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
  research,
  researchStatus,
}: {
  campaignId: string;
  canEdit: boolean;
  requirement: {
    campaignId: string;
    identityConfirmation: "PENDING" | "CONFIRMED" | "REJECTED";
    identityVerificationJson: unknown;
    employerSkipReason: string | null;
  };
  research: {
    status: string;
    identityAmbiguous: boolean;
    companySummary: string | null;
    whatTheySell: string | null;
    businessModel: string | null;
    hiringSignals: unknown;
    riskSignals: unknown;
  } | null;
  researchStatus: ApplicationResearchStatusView;
}) {
  const verification = parseIdentityVerification(requirement.identityVerificationJson);
  const researchFailed =
    Boolean(requirement.employerSkipReason) &&
    (!research || research.status === "FAILED" || research.status === "NOT_STARTED");
  const showRetry =
    canEdit &&
    !researchStatus.canRetry &&
    researchStatus.phase !== "queued" &&
    researchStatus.phase !== "researching" &&
    (researchFailed || !research || research.status === "FAILED" || research.status === "NOT_STARTED");
  const showCandidate =
    verification &&
    requirement.identityConfirmation !== "CONFIRMED" &&
    (verification.verdict === "AMBIGUOUS" || requirement.identityConfirmation === "REJECTED");
  const confirmedResearch =
    research &&
    !research.identityAmbiguous &&
    (requirement.identityConfirmation === "CONFIRMED" ||
      verification?.verdict === "MATCHED");

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4" data-testid="employer-identity">
      <h2 className="text-base font-semibold text-slate-900">{employerIdentityCopy.title}</h2>
      {requirement.identityConfirmation === "CONFIRMED" ? (
        <p className="text-sm text-slate-700">{employerIdentityCopy.confirmed}</p>
      ) : null}
      {requirement.identityConfirmation === "REJECTED" ? (
        <p className="text-sm text-amber-950">{employerIdentityCopy.rejected}</p>
      ) : null}
      {showCandidate ? (
        <div
          className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3"
          data-testid="employer-identity-candidate"
        >
          <p className="text-sm text-amber-950">{employerIdentityCopy.unmatched}</p>
          <div className="space-y-1 text-sm text-slate-800">
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
              <li key={check.key} className="text-sm text-slate-800">
                <span className="font-medium">
                  {employerIdentityCopy.checkLabels[check.key]}
                </span>
                <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-xs font-medium text-slate-800">
                  {employerIdentityCopy.status[check.status]}
                </span>
                <span className="mt-1 block text-slate-700">{check.reason}</span>
                {check.postingEvidence ? (
                  <span className="mt-1 block text-slate-600">
                    {employerIdentityCopy.postingEvidence}: {check.postingEvidence}
                  </span>
                ) : null}
                {check.researchEvidence ? (
                  <span className="block text-slate-600">
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
                <span className="font-medium text-slate-700">{employerIdentityCopy.supplyName}</span>
                <input
                  name="employerName"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{employerIdentityCopy.supplyWebsite}</span>
                <input
                  name="website"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </ApplicationActionForm>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <ApplicationResearchStatus
          campaignId={campaignId}
          canEdit={canEdit}
          initialStatus={researchStatus}
        />
        {confirmedResearch ? (
          <div className="space-y-2 text-sm text-slate-800">
            <p>{research.companySummary || "No summary yet."}</p>
            <p>{research.whatTheySell ? `Products: ${research.whatTheySell}` : null}</p>
            <p>{research.businessModel ? `Business model: ${research.businessModel}` : null}</p>
            <BulletList title="Hiring and growth" items={textList(research.hiringSignals)} />
            <BulletList title="Employer risk" items={textList(research.riskSignals)} />
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Employer research has not been confirmed for this {vocab.campaign.singular}.
          </p>
        )}
        {showRetry ? (
          <ApplicationActionForm
            action={retryApplicationResearchAction}
            submitLabel={employerIdentityCopy.retry}
            testId="retry-research"
          >
            <input type="hidden" name="campaignId" value={campaignId} />
          </ApplicationActionForm>
        ) : null}
      </div>
    </div>
  );
}

export async function ApplicationWorkspace({
  campaignId,
  organizationId,
  canEdit,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  await ensureIdentityVerification({ organizationId, campaignId });
  await ensureHiringTeamAfterResearch({ organizationId, campaignId });
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId, organizationId },
    include: {
      company: { include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } } },
      campaign: {
        select: {
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
  if (!requirement) return null;

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
      profile: await persistExtractedExperienceDates({
        organizationId,
        productId: requirement.campaign.product.id,
        profile: profile.profile,
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
  const [nextStep, live] = await Promise.all([
    ensureApplicationNextStep({
      organizationId,
      campaignId,
    }),
    getApplicationWorkspaceLive({ organizationId, campaignId }),
  ]);
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
  const consultationOpen =
    nextStep.stateKey === "consultation_not_started" ||
    nextStep.stateKey === "consultation_in_progress" ||
    nextStep.stateKey === "consultation_failed";
  const shownBucket = fit
    ? displayedFitBucket({
        bucket: fit.bucket,
        overrideBucket: fit.overrideBucket,
      })
    : null;

  return (
    <>
    <section
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="application-next-step"
    >
      <h2 id="application-next-step" className="text-base font-semibold text-slate-900">
        {consultationConversationCopy.nextStepTitle}
      </h2>
      <ApplicationWorkspaceLive campaignId={campaignId} initialJobs={live.jobs} />
      <WorkspaceProgress jobs={live.jobs} type="NEXT_STEP" />
      {nextStep.failed ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-950">
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
        <p className="text-sm text-slate-800">{nextStep.text}</p>
      )}
    </section>
    <details
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="application-company"
      id="company"
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        {applicationWorkspaceCopy.companyTitle}
      </summary>
      <div className="mt-4 space-y-4">
        <ApplicationResearchStatus
          campaignId={campaignId}
          canEdit={canEdit}
          initialStatus={researchStatus}
        />
        <IdentityVerificationPanel
          campaignId={campaignId}
          canEdit={canEdit}
          requirement={requirement}
          research={research}
          researchStatus={researchStatus}
        />
      </div>
    </details>
    <details className="space-y-4 rounded-lg border border-slate-200 bg-white p-5" data-testid="application-workspace">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        {applicationWorkspaceCopy.jobRequirementTitle}
      </summary>
      <div className="mt-4 space-y-4">
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {applicationWorkspaceCopy.jobRequirementTitle}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Parsed from the pasted posting. Empty fields were not in the posting.
          </p>
        </div>
      </div>
      <dl className="grid gap-3 md:grid-cols-2">
        <Field label="Title" value={requirement.title} />
        <Field label="Employer as stated" value={requirement.companyName} />
        <Field label="Location" value={requirement.location} />
        <Field label="Work arrangement" value={requirement.workArrangement} />
        <Field label="Employment type" value={requirement.employmentType} />
        <Field label="Seniority" value={requirement.seniority} />
        <Field label="Compensation" value={requirement.compensationRange} />
        <Field label="Reports to" value={requirement.reportingLine} />
      </dl>
      <BulletList title="Responsibilities" items={textList(requirement.responsibilities)} />
      <BulletList title="Required" items={textList(requirement.requiredItems)} />
      <BulletList title="Preferred" items={textList(requirement.preferredItems)} />
      <div className="space-y-3 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Scorecard</h3>
        {scorecard.mission ? (
          <p className="text-sm text-slate-800">
            {scorecard.mission.text}
            {scorecard.mission.inferred ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-950">
                {criterionFlags.inference}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-slate-500">No mission was stated.</p>
        )}
        <ScorecardList title="Outcomes" items={scorecard.outcomes} />
        <ScorecardList title="Competencies" items={scorecard.competencies} />
      </div>

      {requirement.employerSkipReason ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="employer-skip-reason">
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
            <span className="font-medium text-slate-700">Employer name</span>
            <input
              name="employerName"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{employerIdentityCopy.supplyWebsite}</span>
            <input
              name="website"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </ApplicationActionForm>
      ) : null}

    </section>
      </div>
    </details>
    <details
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      data-testid="employer-fit"
      id="employer-fit"
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        {applicationWorkspaceCopy.employerFitTitle}
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-600">
          Scored against {icp.name}. A mismatch is a signal. It does not block contacts or outreach.
        </p>
        {shownBucket ? (
          <p className="text-sm font-medium text-slate-900" data-testid="employer-fit-bucket">
            {fit?.overrideBucket
              ? `Your result: ${formatFitBucketLabel(shownBucket)} (scored ${formatFitBucketLabel(fit.bucket)})`
              : `Scored result: ${formatFitBucketLabel(shownBucket)}`}
          </p>
        ) : (
          <p className="text-sm text-slate-600">Fit has not been scored.</p>
        )}
        {stale?.stale ? (
          <p className="text-sm text-amber-900" data-testid="employer-fit-stale">
            {stale.reason}
          </p>
        ) : null}
        <ul className="space-y-2">
          {outcomes.map((outcome) => {
            const labels = fitSignalLabels(outcome);
            return (
              <li key={outcome.criterionId ?? outcome.name} className="text-sm text-slate-800">
                <span className="font-medium">{outcome.name}</span>
                {labels.map((label) => (
                  <span
                    key={label}
                    className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800"
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
                {outcome.evidence ? (
                  <span className="mt-1 block text-slate-600">{outcome.evidence}</span>
                ) : null}
                {outcome.source ? (
                  <span className="block text-xs text-slate-500">{outcome.source}</span>
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
    <HiringTeamSection
      campaignId={requirement.campaignId}
      organizationId={organizationId}
      canEdit={canEdit}
      jobs={live.jobs}
    />
    <ConsultationSection
      campaignId={requirement.campaignId}
      organizationId={organizationId}
      canEdit={canEdit}
      defaultOpen={consultationOpen}
      jobs={live.jobs}
    />
    <div id="assets">
    <WorkspaceProgress jobs={live.jobs} type="RESUME" />
    <WorkspaceProgress jobs={live.jobs} type="COVER_LETTER" />
    <ApplicationAssetsSection
      campaignId={requirement.campaignId}
      canEdit={canEdit}
      defaultOpen={assetsOpen}
      plans={presentationPlans}
      invalidPlanTypes={invalidPlanTypes}
      coverLetterThinNotice={
        coverLetterEvidenceThin ? coverLetterThinEvidenceCopy() : null
      }
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
          createdAt: asset.createdAt.toISOString(),
        }))}
    />
    </div>
    <details
      className="rounded-lg border border-slate-200 bg-white p-5"
      data-testid="application-contacts-wrap"
      id="contacts"
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        {applicationWorkspaceCopy.contactsTitle}
      </summary>
      <div className="mt-4">
    <ApplicationContactsSection
      campaignId={requirement.campaignId}
      canEdit={canEdit}
      roles={requirement.campaign.hiringTeamRoles}
      contacts={requirement.campaign.contacts.map(toContactRow)}
    />
      </div>
    </details>
    <div id="outreach">
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
          emailLength: asset.emailLength,
          content: asset.contentJson,
        }))}
    />
    </div>
    <details
      className="rounded-lg border border-slate-200 bg-white p-5"
      data-testid="application-applied-wrap"
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
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
    <details
      className="rounded-lg border border-slate-200 bg-white p-5"
      data-testid="application-summary-wrap"
      id="application-summary"
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        {applicationSummaryConfig.title}
      </summary>
      <div className="mt-4 space-y-3">
        <WorkspaceProgress jobs={live.jobs} type="APPLICATION_SUMMARY" />
        <p className="text-sm text-slate-600">{applicationSummaryConfig.description}</p>
        <Link href={`/campaigns/${campaignId}/summary`} className={SECONDARY_BUTTON_CLASS}>
          {applicationSummaryConfig.title}
        </Link>
      </div>
    </details>
    </>
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
    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
      {kind === "FACT" ? "Fact" : "Inference"}
    </span>
  );
}

async function HiringTeamSection({
  campaignId,
  organizationId,
  canEdit,
  jobs = [],
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
  jobs?: import("@/lib/application-jobs/workspace-status").WorkspaceJobStatusView[];
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
  const fieldClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
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
    <details
      key={role.id}
      className="rounded-md border border-slate-200 p-4"
      data-testid="hiring-team-role"
    >
      <summary className="cursor-pointer list-none space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-900">{role.name}</h4>
          <span className="text-xs text-slate-500">
            {hiringTeamStatusLabel(role.setupStatus, role.approvalStatus, role.staleAt)}
          </span>
        </div>
        <p className="text-sm text-slate-700">
          {textList(role.targetTitles).join(", ") || "No likely titles."}
        </p>
        {role.whyThisPersonaMatters ? (
          <p className="text-sm text-slate-800">{role.whyThisPersonaMatters}</p>
        ) : null}
      </summary>
      <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
        {role.department ? (
          <p className="text-sm text-slate-700">{role.department}</p>
        ) : null}
        {narrative?.overview ? (
          <p className="text-sm text-slate-800">{narrative.overview}</p>
        ) : role.definition ? (
          <p className="text-sm text-slate-800">{role.definition}</p>
        ) : null}
        {narrative?.impact ? (
          <p className="text-sm text-slate-800">
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
              <p className="text-sm text-slate-800">
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
          <p className="text-sm text-amber-900">{narrative.modelNote}</p>
        ) : null}
        {role.additionalContext ? (
          <p className="text-sm text-slate-700">{role.additionalContext}</p>
        ) : null}
        {canEdit ? (
          <div className="space-y-3 print:hidden">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                {hiringTeamConfig.actions.edit}
              </summary>
            <ApplicationActionForm
              action={updateApplicationRoleAction}
              submitLabel="Save edits"
              testId={`edit-role-${role.id}`}
            >
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="personaId" value={role.id} />
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Name</span>
                <input name="name" required defaultValue={role.name} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Likely titles</span>
                <textarea
                  name="likelyTitles"
                  rows={2}
                  defaultValue={textList(role.targetTitles).join("\n")}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Department</span>
                <input name="department" defaultValue={role.department ?? ""} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Why this role matters</span>
                <textarea
                  name="whyThisRoleMatters"
                  rows={2}
                  defaultValue={role.whyThisPersonaMatters ?? ""}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Notes</span>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={role.additionalContext ?? ""}
                  className={fieldClass}
                />
              </label>
            </ApplicationActionForm>
            </details>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                {hiringTeamConfig.actions.addPerson}
              </summary>
              <ApplicationActionForm
                action={addHiringTeamPersonAction}
                submitLabel={hiringTeamConfig.actions.addPerson}
                testId={`add-person-${role.id}`}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="personaId" value={role.id} />
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">First name</span>
                  <input name="firstName" required className={fieldClass} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Last name</span>
                  <input name="lastName" required className={fieldClass} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Title</span>
                  <input name="title" required className={fieldClass} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Email</span>
                  <input name="email" type="email" className={fieldClass} />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    {outreachConfig.labels.pasteLinkedIn}
                  </span>
                  <textarea name="linkedInProfileText" rows={6} className={fieldClass} />
                </label>
              </ApplicationActionForm>
            </details>
            <div className="flex flex-wrap gap-3">
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
                testId={`remove-role-${role.id}`}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="personaId" value={role.id} />
              </ApplicationActionForm>
              <ApplicationActionForm
                action={saveRoleAsTemplateAction}
                submitLabel="Save as template"
                testId={`save-role-template-${role.id}`}
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="personaId" value={role.id} />
              </ApplicationActionForm>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
  return (
    <details id="hiring-team" className="space-y-4 rounded-lg border border-slate-200 bg-white p-5" data-testid="hiring-team">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        {hiringTeamConfig.workspaceTitle}
      </summary>
      <div className="mt-4 space-y-4">
      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {hiringTeamConfig.addPersonNote}
      </p>
      <WorkspaceProgress jobs={jobs} type="HIRING_TEAM_IDENTIFY" />
      <WorkspaceProgress jobs={jobs} type="HIRING_TEAM_BUILD" />
      <WorkspaceProgress jobs={jobs} type="CONTACT_PROFILE" />
      <div>
        <p className="mt-1 text-sm text-slate-600">
          Roles for this {vocab.campaign.singular} are identified from the job and employer research. Review each draft before you rely on it. Saved templates are added only when you choose one.
        </p>
      </div>
      {roles.length === 0 ? (
        <p className="text-sm text-slate-600">No {vocab.persona.plural} yet.</p>
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
              <p className="text-sm text-slate-500">
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
            <span className="font-medium text-slate-700">Name</span>
            <input name="name" required className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Likely titles</span>
            <textarea name="likelyTitles" rows={3} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Department</span>
            <input name="department" className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Why this role matters</span>
            <textarea name="whyThisRoleMatters" rows={2} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Notes</span>
            <textarea name="notes" rows={2} className={fieldClass} />
          </label>
        </ApplicationActionForm>
      ) : null}
      {canEdit && templates.length > 0 ? (
        <ApplicationActionForm action={addTemplateRoleAction} submitLabel="Add saved template" testId="add-template-role">
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Saved template</span>
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
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-medium text-slate-900">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
        {items.map((item) => (
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
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-900">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
