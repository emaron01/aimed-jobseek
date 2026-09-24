import Link from "next/link";
import { notFound } from "next/navigation";
import { generateApplicationSummaryAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { PrintApplicationSummaryButton } from "@/components/PrintApplicationSummaryButton";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
import { getApplicationSummaryView } from "@/lib/application-summary/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canOpenCampaignDetail } from "@/lib/campaign/visibility";
import type { JobScorecard } from "@/lib/job-requirement/types";
import {
  applicationSummaryConfig,
  evidenceStrengthLabels,
  interviewConfig,
} from "@/lib/product-config";
import { stageTypeLabel } from "@/lib/interview/stages";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

type PageProps = { params: Promise<{ id: string }> };

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

function competencyRefs(value: unknown): Array<{ id: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) {
      return [{ id: entry.trim(), text: entry.trim() }];
    }
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const id =
      typeof row.id === "string"
        ? row.id
        : typeof row.targetKey === "string"
          ? row.targetKey
          : null;
    const text = typeof row.text === "string" ? row.text : id;
    return id?.trim() && text?.trim()
      ? [{ id: id.trim(), text: text.trim() }]
      : [];
  });
}

function TextList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">Not stated.</p>;
  return (
    <ul className="list-disc space-y-2 pl-5 text-sm text-slate-800">
      {items.map((item, index) => (
        <li key={`${index}:${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="application-summary-section break-inside-avoid rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
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
  const strengths = view.assessments.filter(
    (item) => item.strength === "STRONG" || item.strength === "PARTIAL",
  );
  const gaps = view.assessments.filter((item) => item.strength === "NONE");
  const directRoles = view.roles.filter((role) => role.involvement === "DIRECT");
  const indirectRoles = view.roles.filter((role) => role.involvement === "INDIRECT");
  const approvedStories = view.stories.filter(
    (story) =>
      (story.interviewAnswer && story.interviewAnswerApprovedAt) ||
      (story.resumeBullet && story.resumeBulletApprovedAt),
  );
  const storyByTarget = new Map<string, (typeof approvedStories)[number][]>();
  for (const story of approvedStories) {
    for (const ref of competencyRefs(story.competencyLinks)) {
      for (const key of new Set([ref.id, ref.text])) {
        storyByTarget.set(key, [...(storyByTarget.get(key) ?? []), story]);
      }
    }
  }
  const storyGroups = new Map<string, (typeof approvedStories)[number][]>();
  for (const story of approvedStories) {
    const labels = competencyRefs(story.competencyLinks).map((ref) => ref.text);
    for (const label of labels.length > 0 ? labels : ["Other"]) {
      storyGroups.set(label, [...(storyGroups.get(label) ?? []), story]);
    }
  }
  const summaryStatus = view.summary?.status ?? null;
  const actionLabel =
    summaryStatus === "FAILED"
      ? applicationSummaryConfig.actions.retry
      : summaryStatus === "READY"
        ? applicationSummaryConfig.actions.regenerate
        : applicationSummaryConfig.actions.generate;

  return (
    <main className="application-summary mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={applicationSummaryConfig.title}
        description={`${view.campaign.name} · ${applicationSummaryConfig.description}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {summaryStatus === "READY" ? <PrintApplicationSummaryButton /> : null}
            <Link href={`/campaigns/${id}`} className={SECONDARY_BUTTON_CLASS}>
              Back to application
            </Link>
          </div>
        }
      />

      <div className="print:hidden">
        {view.summary?.generatedAt ? (
          <p className="text-sm text-slate-600">
            Generated {view.summary.generatedAt.toLocaleString()}
            {view.stale ? " · Stale because source information changed" : ""}
          </p>
        ) : null}
        {summaryStatus === "FAILED" ? (
          <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {view.summary?.generationError ?? "Summary synthesis failed. Retry."}
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

      <SummarySection title={applicationSummaryConfig.sections.company}>
        <div>
          <h3 className="font-medium text-slate-900">What they do</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {view.research?.whatTheySell ?? view.research?.companySummary ?? "Not available."}
          </p>
        </div>
        <div>
          <h3 className="font-medium text-slate-900">Customers</h3>
          <TextList items={lines(view.research?.customerTypes)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-medium text-slate-900">Stage, size, and recent news</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
              {[view.research?.companySizeContext, view.research?.companySummary]
                .filter(Boolean)
                .join("\n\n") || "Not available."}
            </p>
            {view.research?.companySummary ? (
              <p className="mt-2 text-xs text-slate-500">
                Culture references: {applicationSummaryConfig.cultureEvidenceLabel}.
              </p>
            ) : null}
          </div>
          <div>
            <h3 className="font-medium text-slate-900">Hiring and growth signals</h3>
            <TextList items={lines(view.research?.hiringSignals)} />
          </div>
        </div>
        <div>
          <h3 className="font-medium text-slate-900">Employer risk signals</h3>
          <TextList items={lines(view.research?.riskSignals)} />
        </div>
      </SummarySection>

      <SummarySection title={applicationSummaryConfig.sections.position}>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ["Title", view.requirement.title],
            ["Reporting line", view.requirement.reportingLine],
            ["Location", view.requirement.location],
            ["Work arrangement", view.requirement.workArrangement],
            ["Compensation in posting", view.requirement.compensationRange],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="mt-1 text-sm text-slate-900">{value || "Not stated."}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="font-medium text-slate-900">Mission</h3>
          <p className="mt-1 text-sm text-slate-800">
            {requirementScorecard.mission?.text ?? "Not stated."}
          </p>
        </div>
        <div>
          <h3 className="font-medium text-slate-900">Key outcomes</h3>
          <TextList items={requirementScorecard.outcomes.map((item) => item.text)} />
        </div>
        <div>
          <h3 className="font-medium text-slate-900">Competencies</h3>
          <TextList items={requirementScorecard.competencies.map((item) => item.text)} />
        </div>
      </SummarySection>

      <SummarySection title={applicationSummaryConfig.sections.strengths}>
        {strengths.length === 0 ? (
          <p className="text-sm text-slate-500">No assessed strengths yet.</p>
        ) : (
          strengths.map((assessment) => {
            const stories = storyByTarget.get(assessment.targetKey) ?? [];
            return (
              <article key={assessment.id} className="break-inside-avoid border-b border-slate-100 pb-4 last:border-0">
                <h3 className="font-medium text-slate-900">
                  {assessment.text}{" "}
                  <span className="text-xs text-slate-500">
                    (
                    {evidenceStrengthLabels[
                      assessment.strength as keyof typeof evidenceStrengthLabels
                    ] ?? assessment.strength}
                    )
                  </span>
                </h3>
                {assessment.explanation ? <p className="mt-1 text-sm text-slate-700">{assessment.explanation}</p> : null}
                {stories.map((story) => (
                  <div key={story.id} className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-800">
                    {story.interviewAnswerApprovedAt ? story.interviewAnswer : story.resumeBullet}
                  </div>
                ))}
              </article>
            );
          })
        )}
      </SummarySection>

      <SummarySection title={applicationSummaryConfig.sections.gaps}>
        {gaps.length === 0 ? (
          <p className="text-sm text-slate-500">No remaining assessed gaps.</p>
        ) : (
          gaps.map((assessment) => (
            <article key={assessment.id} className="break-inside-avoid">
              <h3 className="font-medium text-slate-900">{assessment.text}</h3>
              <p className="mt-1 text-sm text-slate-700">{assessment.strategyText}</p>
            </article>
          ))
        )}
      </SummarySection>

      <SummarySection title={applicationSummaryConfig.sections.hiringTeam}>
        <div>
          <h3 className="font-semibold text-slate-900">Direct</h3>
          <div className="mt-3 space-y-4">
            {directRoles.map((role) => (
              <article key={role.id} className="break-inside-avoid">
                <h4 className="font-medium text-slate-900">{role.name}</h4>
                <p className="text-xs text-slate-500">{role.likelyTitles.join(", ")}</p>
                <p className="mt-2 text-sm font-medium text-slate-800">Top talking points</p>
                <TextList items={role.talkingPoints} />
                <p className="mt-2 text-sm font-medium text-slate-800">Likely concerns</p>
                <TextList items={role.concerns} />
              </article>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Indirect</h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-800">
            {indirectRoles.map((role) => (
              <li key={role.id}>
                <span className="font-medium">{role.name}:</span>{" "}
                {role.impact ?? role.reason}
              </li>
            ))}
          </ul>
        </div>
      </SummarySection>

      <SummarySection title={applicationSummaryConfig.sections.interviewStages}>
        {view.stages.length === 0 ? (
          <p className="text-sm text-slate-500">No interview stages yet.</p>
        ) : (
          <>
            <div>
              <h3 className="font-medium text-slate-900">
                {applicationSummaryConfig.sections.completedStages}
              </h3>
              <ul className="mt-2 space-y-3 text-sm text-slate-800">
                {view.stages
                  .filter((stage) => stage.outcome)
                  .map((stage) => (
                    <li key={stage.id}>
                      <span className="font-medium">{stageTypeLabel(stage.type)}</span>
                      {stage.notesAfter ? `: ${stage.notesAfter}` : ""}
                    </li>
                  ))}
              </ul>
            </div>
            {(() => {
              const next = view.stages.find((stage) => !stage.outcome);
              return next ? (
                <div>
                  <h3 className="font-medium text-slate-900">
                    {applicationSummaryConfig.sections.nextStage}
                  </h3>
                  <p className="mt-2 text-sm text-slate-800">
                    {stageTypeLabel(next.type)}
                  </p>
                  <Link
                    href={`/campaigns/${id}/interviews/${next.id}`}
                    className="mt-2 inline-block text-sm font-medium text-slate-700 underline print:hidden"
                  >
                    {interviewConfig.labels.openGuide}
                  </Link>
                </div>
              ) : null;
            })()}
          </>
        )}
      </SummarySection>

      <SummarySection title={applicationSummaryConfig.sections.guidance}>
        {summaryStatus !== "READY" || !view.guidance ? (
          <p className="text-sm text-slate-600">
            {summaryStatus === "FAILED"
              ? "Guidance generation failed. Use Retry summary above."
              : "Generate the summary to create Harper's guidance."}
          </p>
        ) : (
          <>
            <div>
              <h3 className="font-medium text-slate-900">Coaching summary</h3>
              <TextList items={view.guidance.coachingSummary.map((item) => item.text)} />
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Questions to prepare for</h3>
              <TextList items={view.guidance.questionsToPrepare.map((item) => item.text)} />
            </div>
            {view.guidance.questionsForDirectRoles.map((role) => (
              <div key={role.roleId} className="break-inside-avoid">
                <h3 className="font-medium text-slate-900">Questions to ask {role.roleName}</h3>
                <TextList items={role.questions.map((item) => item.text)} />
              </div>
            ))}
          </>
        )}
      </SummarySection>

      <SummarySection title={applicationSummaryConfig.sections.stories}>
        {storyGroups.size === 0 ? (
          <p className="text-sm text-slate-500">No approved STAR statements yet.</p>
        ) : (
          [...storyGroups].map(([competency, stories]) => (
            <div key={competency}>
              <h3 className="font-medium text-slate-900">{competency}</h3>
              <div className="mt-2 space-y-3">
                {stories.map((story) => (
                  <article key={`${competency}:${story.id}`} className="break-inside-avoid rounded-md bg-slate-50 p-4 text-sm text-slate-800">
                    {story.interviewAnswerApprovedAt && story.interviewAnswer ? (
                      <p>{story.interviewAnswer}</p>
                    ) : null}
                    {story.resumeBulletApprovedAt && story.resumeBullet ? (
                      <p className="mt-2 font-medium">{story.resumeBullet}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
      </SummarySection>
    </main>
  );
}
