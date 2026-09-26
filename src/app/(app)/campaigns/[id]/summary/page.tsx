import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateApplicationPageMetadata } from "@/lib/application/page-metadata";
import { generateApplicationSummaryAction } from "@/app/actions/application-summary";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { AppActionLink } from "@/components/AppButton";
import { CheatSheetCoachItems } from "@/components/CheatSheetCoachItems";
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
  const approvedStories = view.stories.filter(
    (story) =>
      (story.interviewAnswer && story.interviewAnswerApprovedAt) ||
      (story.resumeBullet && story.resumeBulletApprovedAt),
  );
  const summaryStatus = view.summary?.status ?? null;
  const actionLabel =
    summaryStatus === "FAILED"
      ? applicationSummaryConfig.actions.retry
      : summaryStatus === "READY"
        ? applicationSummaryConfig.actions.regenerate
        : applicationSummaryConfig.actions.generate;
  const guidance = view.guidance;

  return (
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
            {summaryStatus === "READY" ? <PrintApplicationSummaryButton /> : null}
            <AppActionLink href={`/campaigns/${id}`}>
              Back to application
            </AppActionLink>
          </div>
        }
      />

      <div className="print:hidden">
        {view.summary?.generatedAt ? (
          <p className="text-sm text-muted">
            Generated {view.summary.generatedAt.toLocaleString()}
            {view.stale ? " · Stale because source information changed" : ""}
          </p>
        ) : null}
        {summaryStatus === "FAILED" ? (
          <p role="alert" className="mt-2 rounded-md border border-danger bg-danger-tint p-3 text-sm text-danger">
            {view.summary?.generationError ?? "Cheat sheet synthesis failed. Retry."}
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

      <SummarySection id="overview" title={applicationSummaryConfig.sections.overview}>
        {summaryStatus !== "READY" || !guidance ? (
          <p className="text-sm text-muted">
            {summaryStatus === "FAILED"
              ? "Guidance generation failed. Use Retry above."
              : `Generate the ${applicationSummaryConfig.title} to create the 30-second fit, career recap, and gaps.`}
          </p>
        ) : (
          <>
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.thirtySecondFit}
              </h3>
              <p className="mt-1 text-sm text-ink">{guidance.overview.thirtySecondFit.text}</p>
            </div>
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.careerRecap}
              </h3>
              <p className="mt-1 text-sm text-ink">{guidance.overview.careerRecap.text}</p>
            </div>
            <div>
              <h3 className="font-medium text-ink">
                {applicationSummaryConfig.sections.gapsToPrepare}
              </h3>
              <CheatSheetCoachItems
                campaignId={id}
                canEdit={canGenerate}
                items={guidance.overview.gapsToPrepare}
              />
            </div>
          </>
        )}
      </SummarySection>

      {(guidance?.people ?? view.people).map((person) => {
        const section = guidance?.people.find((item) => item.sectionKey === ("sectionKey" in person ? person.sectionKey : ""));
        const heading = section?.heading ?? ("heading" in person ? person.heading : "");
        const sectionKey = section?.sectionKey ?? ("sectionKey" in person ? person.sectionKey : heading);
        return (
          <SummarySection key={sectionKey} id={sectionKey} title={heading}>
            {!section ? (
              <p className="text-sm text-muted">
                Generate the {applicationSummaryConfig.title} for this person.
              </p>
            ) : (
              <>
                <div>
                  <h3 className="font-medium text-ink">
                    {applicationSummaryConfig.sections.caresAbout}
                  </h3>
                  <TextList items={section.caresAbout.map((item) => item.text)} />
                </div>
                <div>
                  <h3 className="font-medium text-ink">
                    {applicationSummaryConfig.sections.bestMaterial}
                  </h3>
                  <TextList items={section.bestMaterial.map((item) => item.text)} />
                </div>
                {section.recruiter ? (
                  <>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.recruiterSummary}
                      </h3>
                      <p className="mt-1 text-sm text-ink">
                        {section.recruiter.sixtySecondSummary.text}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.whyThisCompany}
                      </h3>
                      <p className="mt-1 text-sm text-ink">
                        {section.recruiter.whyThisCompany.text}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.whyThisRole}
                      </h3>
                      <p className="mt-1 text-sm text-ink">{section.recruiter.whyThisRole.text}</p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.logistics}
                      </h3>
                      <p className="mt-1 text-sm text-ink">{section.recruiter.logistics.text}</p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.compensation}
                      </h3>
                      <p className="mt-1 text-sm text-ink">
                        {section.recruiter.compensationReadiness.text}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.flagAnswers}
                      </h3>
                      <CheatSheetCoachItems
                        campaignId={id}
                        canEdit={canGenerate}
                        items={section.recruiter.flagAnswers}
                      />
                    </div>
                  </>
                ) : null}
                {section.hiringManager ? (
                  <>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.scorecard}
                      </h3>
                      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink">
                        {section.hiringManager.scorecardOutcomes.map((item) => (
                          <li key={item.outcome}>
                            {item.outcome}
                            {item.storyId ? ` · story ${item.storyId}` : ""}
                            {item.note ? ` — ${item.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.firstNinetyDays}
                      </h3>
                      <p className="mt-1 text-sm text-ink">
                        {section.hiringManager.firstNinetyDays.text}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.drillDowns}
                      </h3>
                      <CheatSheetCoachItems
                        campaignId={id}
                        canEdit={canGenerate}
                        items={section.hiringManager.drillDowns}
                      />
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.gapsToPrepare}
                      </h3>
                      <CheatSheetCoachItems
                        campaignId={id}
                        canEdit={canGenerate}
                        items={section.hiringManager.gaps}
                      />
                    </div>
                  </>
                ) : null}
                {section.executive ? (
                  <>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.strategy}
                      </h3>
                      <p className="mt-1 text-sm text-ink">{section.executive.strategy.text}</p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.judgment}
                      </h3>
                      <p className="mt-1 text-sm text-ink">{section.executive.judgment.text}</p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.businessImpact}
                      </h3>
                      <p className="mt-1 text-sm text-ink">
                        {section.executive.businessImpact.text}
                      </p>
                    </div>
                  </>
                ) : null}
                {section.crossFunctional ? (
                  <>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.howWorkedAcross}
                      </h3>
                      <p className="mt-1 text-sm text-ink">
                        {section.crossFunctional.howWorkedAcross.text}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-medium text-ink">
                        {applicationSummaryConfig.sections.dayToDay}
                      </h3>
                      <p className="mt-1 text-sm text-ink">
                        {section.crossFunctional.dayToDay.text}
                      </p>
                    </div>
                  </>
                ) : null}
                <div>
                  <h3 className="font-medium text-ink">
                    {applicationSummaryConfig.sections.likelyQuestions}
                  </h3>
                  <CheatSheetCoachItems
                    campaignId={id}
                    canEdit={canGenerate}
                    items={section.likelyQuestions}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-ink">
                    {applicationSummaryConfig.sections.questionsToAsk}
                  </h3>
                  <TextList items={section.questionsToAsk.map((item) => item.text)} />
                </div>
              </>
            )}
          </SummarySection>
        );
      })}

      <SummarySection id="stories" title={applicationSummaryConfig.sections.stories}>
        {guidance && guidance.stories.length > 0 ? (
          guidance.stories.map((story) => (
            <article key={story.storyId} className="break-inside-avoid rounded-md bg-canvas p-4">
              <h3 className="font-medium text-ink">{story.headline}</h3>
              <p className="mt-2 text-sm text-ink">{story.situation}</p>
              <p className="mt-3 text-sm font-medium text-ink">
                {applicationSummaryConfig.sections.thisStoryAnswers}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
                {story.answers.map((item) => (
                  <li key={`${item.requirement}:${item.question}`}>
                    {item.requirement}: {item.question}
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-2">
                {story.variations.map((variation) => (
                  <p key={variation.angle} className="text-sm text-ink">
                    <span className="font-medium">{variation.angle}: </span>
                    {variation.text}
                  </p>
                ))}
              </div>
            </article>
          ))
        ) : approvedStories.length === 0 ? (
          <p className="text-sm text-subtle">No approved STAR statements yet.</p>
        ) : (
          approvedStories.map((story) => (
            <article key={story.id} className="break-inside-avoid rounded-md bg-canvas p-4 text-sm text-ink">
              {story.interviewAnswerApprovedAt && story.interviewAnswer ? (
                <p>{story.interviewAnswer}</p>
              ) : null}
              {story.resumeBulletApprovedAt && story.resumeBullet ? (
                <p className="mt-2 font-medium">{story.resumeBullet}</p>
              ) : null}
              <p className="mt-2 text-xs text-subtle">
                {applicationSummaryConfig.sections.thisStoryAnswers}{" "}
                {competencyRefs(story.competencyLinks)
                  .map((ref) => ref.text)
                  .join("; ") || "Not linked yet."}
              </p>
            </article>
          ))
        )}
      </SummarySection>

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
    </main>
  );
}
