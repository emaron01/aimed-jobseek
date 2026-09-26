import { notFound } from "next/navigation";
import { generateInterviewGuideAction } from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { PrintApplicationSummaryButton } from "@/components/PrintApplicationSummaryButton";
import {PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canOpenCampaignDetail } from "@/lib/campaign/visibility";
import { getInterviewGuideView } from "@/lib/interview/guide";
import { stageTypeLabel } from "@/lib/interview/stages";
import { interviewConfig } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

type PageProps = { params: Promise<{ id: string; stageId: string }> };

export default async function InterviewGuidePage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  if (!organization) return <TenantMissing />;
  const { id, stageId } = await params;
  let view: Awaited<ReturnType<typeof getInterviewGuideView>>;
  try {
    view = await getInterviewGuideView({
      organizationId: organization.id,
      campaignId: id,
      stageId,
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
      campaign: {
        ownerUserId: view.stage.campaign.ownerUserId,
        visibility: view.stage.campaign.visibility,
      },
    })
  ) {
    notFound();
  }

  const canEdit = view.stage.campaign.ownerUserId === user.id;
  const content = view.content;

  return (
    <main className="application-summary mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={stageTypeLabel(view.stage.type)}
        description={interviewConfig.labels.sectionTitle}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {content ? <PrintApplicationSummaryButton /> : null}
            <AppActionLink href={`/campaigns/${id}`} variant="secondary">
              Back to application
            </AppActionLink>
          </div>
        }
      />

      <div className="print:hidden">
        {view.stale ? (
          <p className="text-sm text-warning">{interviewConfig.labels.staleGuide}</p>
        ) : null}
        {view.stage.guide?.generationError ? (
          <p role="alert" className="mt-2 rounded-md border border-danger bg-danger-tint p-3 text-sm text-danger">
            {view.stage.guide.generationError}
          </p>
        ) : null}
        {canEdit ? (
          <ApplicationActionForm
            action={generateInterviewGuideAction}
            submitLabel={
              view.stage.guide?.generationError
                ? interviewConfig.labels.retryGuide
                : content
                  ? interviewConfig.labels.regenerateGuide
                  : interviewConfig.labels.generateGuide
            }
            testId="interview-guide-generate"
          >
            <input type="hidden" name="campaignId" value={id} />
            <input type="hidden" name="stageId" value={stageId} />
          </ApplicationActionForm>
        ) : null}
      </div>

      {!content ? (
        <section className="application-summary-section rounded-lg border border-edge bg-surface p-6">
          <p className="text-sm text-muted">
            Generate the guide after you add interviewers and notes.
          </p>
        </section>
      ) : (
        <>
          <section className="application-summary-section break-inside-avoid rounded-lg border border-edge bg-surface p-6">
            <h2 className="text-xl font-semibold text-ink">Purpose</h2>
            <p className="mt-3 text-sm text-ink">{content.purpose.text}</p>
          </section>
          {content.interviewers.map((interviewer) => (
            <section
              key={interviewer.contactId}
              className="application-summary-section break-inside-avoid rounded-lg border border-edge bg-surface p-6"
            >
              <h2 className="text-xl font-semibold text-ink">
                {interviewer.whoTheyAre.text}
              </h2>
              <p className="mt-3 text-sm text-ink">
                {interviewer.whatTheyEvaluate.text}
              </p>
              <h3 className="mt-4 font-medium text-ink">Likely questions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink">
                {interviewer.likelyQuestions.map((item) => (
                  <li key={item.question.id}>
                    <p>{item.question.text}</p>
                    <p className="mt-1 text-muted">{item.answerMaterial.text}</p>
                    <p className="mt-2 text-sm text-ink">
                      <span className="font-medium">
                        {interviewConfig.labels.exampleAnswer}:
                      </span>{" "}
                      {item.exampleAnswer.text}
                    </p>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 font-medium text-ink">Questions to ask</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink">
                {interviewer.questionsToAsk.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </section>
          ))}
          <section className="application-summary-section break-inside-avoid rounded-lg border border-edge bg-surface p-6">
            <h2 className="text-xl font-semibold text-ink">Talking points</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
              {content.talkingPoints.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </section>
          {content.chronologicalWalkthrough?.length ? (
            <section className="application-summary-section break-inside-avoid rounded-lg border border-edge bg-surface p-6">
              <h2 className="text-xl font-semibold text-ink">
                Chronological walk-through
              </h2>
              <div className="mt-3 space-y-4">
                {content.chronologicalWalkthrough.map((role) => (
                  <article key={role.roleId}>
                    <h3 className="font-medium text-ink">
                      {role.title} · {role.employer}
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                      {role.accomplishments.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm text-ink">
                      {role.reasonUnknown
                        ? interviewConfig.leaveReasonUnknownLabel
                        : role.reasonForLeaving}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
