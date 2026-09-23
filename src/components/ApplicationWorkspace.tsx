import {
  nameApplicationEmployerAction,
  overrideApplicationFitAction,
  rescoreApplicationFitAction,
} from "@/app/actions/application";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { displayedFitBucket, fitSignalLabels } from "@/lib/application/fit";
import type { ApplicationFitOutcome } from "@/lib/application/fit";
import { readApplicationFitStale } from "@/lib/application/service";
import type { JobScorecard, ScorecardItem } from "@/lib/job-requirement/types";
import { prisma } from "@/lib/prisma";
import { criterionFlags, vocab } from "@/lib/product-config";
import { parseStringArray } from "@/lib/research";

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
  const shownBucket = fit
    ? displayedFitBucket({
        bucket: fit.bucket,
        overrideBucket: fit.overrideBucket,
      })
    : null;

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5" data-testid="application-workspace">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Job requirement</h2>
        <p className="mt-1 text-sm text-slate-600">
          Parsed from the pasted posting. Empty fields were not in the posting.
        </p>
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
