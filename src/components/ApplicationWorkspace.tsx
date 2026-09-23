import Link from "next/link";
import {
  nameApplicationEmployerAction,
  overrideApplicationFitAction,
  rescoreApplicationFitAction,
} from "@/app/actions/application";
import {
  addApplicationRoleAction,
  addTemplateRoleAction,
  approveApplicationRoleAction,
  rebuildApplicationRoleAction,
  removeApplicationRoleAction,
  saveRoleAsTemplateAction,
  updateApplicationRoleAction,
} from "@/app/actions/hiring-team";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { ConsultationSection } from "@/components/ConsultationSection";
import { ApplicationAssetsSection } from "@/components/ApplicationAssetsSection";
import { HiringTeamDisclosureGroup } from "@/components/HiringTeamDisclosureGroup";
import { displayedFitBucket, fitSignalLabels } from "@/lib/application/fit";
import type { ApplicationFitOutcome } from "@/lib/application/fit";
import { readApplicationFitStale } from "@/lib/application/service";
import type { JobScorecard, ScorecardItem } from "@/lib/job-requirement/types";
import { prisma } from "@/lib/prisma";
import { applicationSummaryConfig, criterionFlags, hiringTeamConfig, vocab } from "@/lib/product-config";
import { SECONDARY_BUTTON_CLASS } from "@/components/ui";
import { parseStringArray } from "@/lib/research";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";

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

export async function ApplicationWorkspace({
  campaignId,
  organizationId,
  canEdit,
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
}) {
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
          product: { select: { profileJson: true } },
          applicationAssets: {
            orderBy: [{ type: "asc" }, { version: "desc" }],
          },
        },
      },
    },
  });
  if (!requirement) return null;

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
  const profile = parseCandidateProfileSafe(
    requirement.campaign.product.profileJson,
  );
  const shownBucket = fit
    ? displayedFitBucket({
        bucket: fit.bucket,
        overrideBucket: fit.overrideBucket,
      })
    : null;

  return (
    <>
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5" data-testid="application-workspace">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Job requirement</h2>
          <p className="mt-1 text-sm text-slate-600">
            Parsed from the pasted posting. Empty fields were not in the posting.
          </p>
        </div>
        <Link
          href={`/campaigns/${campaignId}/summary`}
          className={SECONDARY_BUTTON_CLASS}
        >
          {applicationSummaryConfig.title}
        </Link>
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

      {canEdit && requirement.employerDisposition !== "IDENTIFIED" ? (
        <ApplicationActionForm
          action={nameApplicationEmployerAction}
          submitLabel="Save employer and research"
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
        </ApplicationActionForm>
      ) : null}

      <div className="space-y-2 border-t border-slate-200 pt-4">
        <h2 className="text-base font-semibold text-slate-900">Employer research</h2>
        {research && !research.identityAmbiguous ? (
          <div className="space-y-2 text-sm text-slate-800">
            <p>{research.companySummary || "No summary yet."}</p>
            <p>{research.whatTheySell ? `Products: ${research.whatTheySell}` : null}</p>
            <p>{research.businessModel ? `Business model: ${research.businessModel}` : null}</p>
            <BulletList title="Hiring and growth" items={textList(research.hiringSignals)} />
            <BulletList title="Employer risk" items={textList(research.riskSignals)} />
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Employer research has not been run for this {vocab.campaign.singular}.
          </p>
        )}
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-4" data-testid="employer-fit">
        <h2 className="text-base font-semibold text-slate-900">Employer fit</h2>
        <p className="text-sm text-slate-600">
          Scored against {icp.name}. A mismatch is a signal. It does not block contacts or email.
        </p>
        {shownBucket ? (
          <p className="text-sm font-medium text-slate-900" data-testid="employer-fit-bucket">
            {fit?.overrideBucket
              ? `Your result: ${shownBucket} (scored ${fit.bucket})`
              : `Scored result: ${shownBucket}`}
          </p>
        ) : (
          <p className="text-sm text-slate-600">Fit has not been scored.</p>
        )}
        {fit?.overrideReason ? (
          <p className="text-sm text-slate-700" data-testid="employer-fit-override">
            Override: {fit.overrideReason}
          </p>
        ) : null}
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
        {canEdit && fit ? (
          <ApplicationActionForm
            action={overrideApplicationFitAction}
            submitLabel="Save override"
            testId="employer-fit-override-form"
          >
            <input type="hidden" name="campaignId" value={requirement.campaignId} />
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Your result</span>
              <select name="bucket" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" defaultValue={shownBucket ?? "NEEDS_REVIEW"}>
                <option value="GOOD">GOOD</option>
                <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
                <option value="POOR_FIT">POOR_FIT</option>
                <option value="EXCLUDED">EXCLUDED</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Reason</span>
              <textarea name="reason" required rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </ApplicationActionForm>
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
    </section>
    <HiringTeamSection
      campaignId={requirement.campaignId}
      organizationId={organizationId}
      canEdit={canEdit}
    />
    <ConsultationSection
      campaignId={requirement.campaignId}
      organizationId={organizationId}
      canEdit={canEdit}
    />
    <ApplicationAssetsSection
      campaignId={requirement.campaignId}
      canEdit={canEdit}
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
      assets={requirement.campaign.applicationAssets.map((asset) => ({
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

function hiringTeamStatusLabel(setupStatus: string, approvalStatus: string): string {
  if (approvalStatus === "APPROVED") return "Approved";
  if (setupStatus === "FAILED") return "Synthesis failed";
  if (setupStatus === "PARTIAL") return "Identification only";
  if (setupStatus === "NEEDS_REVIEW") return "Needs review";
  return "Identification only";
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
}: {
  campaignId: string;
  organizationId: string;
  canEdit: boolean;
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
            {hiringTeamStatusLabel(role.setupStatus, role.approvalStatus)}
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
                action={rebuildApplicationRoleAction}
                submitLabel={
                  role.setupStatus === "PARTIAL" || role.setupStatus === "FAILED"
                    ? "Retry synthesis"
                    : "Rebuild"
                }
                testId={`rebuild-role-${role.id}`}
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
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5" data-testid="hiring-team">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{vocab.persona.nav}</h2>
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
    </section>
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
