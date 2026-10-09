import "server-only";

import {
  confirmApplicationEmployerIdentityAction,
  nameApplicationEmployerAction,
  rejectApplicationEmployerIdentityAction,
  saveApplicationEmployerWebsiteAction,
} from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { ApplicationCompanyBriefing } from "@/components/ApplicationCompanyBriefing";
import { ApplicationResearchStatus } from "@/components/ApplicationResearchStatus";
import { ApplicationWorkspaceEmpty } from "@/components/ApplicationWorkspaceEmpty";
import { OpenDetailsOnMount } from "@/components/OpenDetailsOnMount";
import {
  loadApplicationWorkspaceModel,
  type LoadedApplicationWorkspace,
} from "@/components/application-workspace-model";
import { employerSitePrefillFromPostingUrl } from "@/lib/application/company-website";
import { WORKSPACE_CARD_WRAP_CLASS } from "@/lib/application/workspace-links";
import { parseIdentityVerification } from "@/lib/job-requirement/identity-verification";
import {
  applicationWorkspaceCopy,
  employerIdentityCopy,
} from "@/lib/product-config";
import { hasUsableCompanyResearchFields } from "@/lib/research/freshness";
import type { ResearchSource } from "@/lib/research/types";
import { researchStatusLabel } from "@/lib/tenant/companies";
import { formatDate, formatNumber } from "@/lib/utils";

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
                  required
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

export function ApplicationCompanyDetails({
  model,
  canEdit,
  asPage,
}: {
  model: LoadedApplicationWorkspace;
  canEdit: boolean;
  asPage: boolean;
}) {
  const {
    requirement,
    researchStatus,
    researchAnchor,
    researchAnchored,
    research,
    employerResearch,
  } = model;
  return (
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
          campaignId={requirement.campaignId}
          canEdit={canEdit}
          initialStatus={researchStatus}
          hideRetry
        />
        {!researchAnchor ? (
          <div
            className="space-y-3 rounded-md border border-warning bg-warning-tint p-3"
            data-testid="company-website-required"
          >
            <p className="text-sm text-ink">
              {applicationWorkspaceCopy.companyWebsitePrompt}
            </p>
            {canEdit ? (
              <ApplicationActionForm
                action={saveApplicationEmployerWebsiteAction}
                submitLabel={applicationWorkspaceCopy.companyWebsiteSave}
                testId="save-company-website"
              >
                <input type="hidden" name="campaignId" value={requirement.campaignId} />
                <label className="block text-sm">
                  <span className="font-medium text-ink">
                    {applicationWorkspaceCopy.companyWebsiteLabel}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted">
                    {applicationWorkspaceCopy.companyWebsiteHint}
                  </span>
                  <input
                    name="companyWebsite"
                    required
                    data-testid="company-website"
                    defaultValue={
                      employerSitePrefillFromPostingUrl(requirement.postingUrl) ?? ""
                    }
                    placeholder="https://www.cscglobal.com"
                    className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm"
                  />
                </label>
              </ApplicationActionForm>
            ) : null}
          </div>
        ) : null}
        {researchAnchored ? null : (
        <IdentityVerificationPanel
          campaignId={requirement.campaignId}
          canEdit={canEdit}
          requirement={requirement}
        />
        )}
        <ApplicationCompanyBriefing
          campaignId={requirement.campaignId}
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
            jobFocus: employerResearch?.jobFocus ?? null,
            jobFocusDetail: employerResearch?.jobFocusDetail ?? null,
          }}
          sources={
            Array.isArray(research?.researchSources)
              ? (research.researchSources as ResearchSource[])
              : []
          }
          anchorHost={employerResearch?.anchorHost ?? researchAnchor?.domain ?? null}
          sisterHosts={employerResearch?.sisterHosts ?? null}
          postingText={requirement.rawText}
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
  );
}

export async function ApplicationCompanyBody({
  campaignId,
  organizationId,
  canEdit,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const model = await loadApplicationWorkspaceModel(
    organizationId,
    campaignId,
    canEdit,
    false,
    false,
  );
  if (!model.requirement) {
    return <ApplicationWorkspaceEmpty focus="company" />;
  }
  return (
    <div className={`space-y-4 ${WORKSPACE_CARD_WRAP_CLASS}`}>
      <ApplicationCompanyDetails model={model} canEdit={canEdit} asPage />
    </div>
  );
}
