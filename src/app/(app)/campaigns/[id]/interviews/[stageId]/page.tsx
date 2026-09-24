import Link from "next/link";
import { notFound } from "next/navigation";
import { generateInterviewGuideAction } from "@/app/actions/interview";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { PrintApplicationSummaryButton } from "@/components/PrintApplicationSummaryButton";
import { PageHeader, SECONDARY_BUTTON_CLASS, TenantMissing } from "@/components/ui";
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
            <Link href={`/campaigns/${id}`} className={SECONDARY_BUTTON_CLASS}>
              Back to application
            </Link>
          </div>
        }
      />

      <div className="print:hidden">
        {view.stale ? (
          <p className="text-sm text-amber-900">{interviewConfig.labels.staleGuide}</p>
        ) : null}
        {view.stage.guide?.generationError ? (
          <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
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
        <section className="application-summary-section rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">
            Generate the guide after you add interviewers and notes.
          </p>
        </section>
      ) : (
        <>
          <section className="application-summary-section break-inside-avoid rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-950">Purpose</h2>
            <p className="mt-3 text-sm text-slate-800">{content.purpose.text}</p>
          </section>
          {content.interviewers.map((interviewer) => (
            <section
              key={interviewer.contactId}
              className="application-summary-section break-inside-avoid rounded-lg border border-slate-200 bg-white p-6"
            >
              <h2 className="text-xl font-semibold text-slate-950">
                {interviewer.whoTheyAre.text}
              </h2>
              <p className="mt-3 text-sm text-slate-800">
                {interviewer.whatTheyEvaluate.text}
              </p>
              <h3 className="mt-4 font-medium text-slate-900">Likely questions</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-800">
                {interviewer.likelyQuestions.map((item) => (
                  <li key={item.question.id}>
                    <p>{item.question.text}</p>
                    <p className="mt-1 text-slate-600">{item.answerMaterial.text}</p>
                    <p className="mt-2 text-sm text-slate-800">
                      <span className="font-medium">
                        {interviewConfig.labels.exampleAnswer}:
                      </span>{" "}
                      {item.exampleAnswer.text}
                    </p>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 font-medium text-slate-900">Questions to ask</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-800">
                {interviewer.questionsToAsk.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </section>
          ))}
          <section className="application-summary-section break-inside-avoid rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-950">Talking points</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-800">
              {content.talkingPoints.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </section>
          {content.chronologicalWalkthrough?.length ? (
            <section className="application-summary-section break-inside-avoid rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-semibold text-slate-950">
                Chronological walk-through
              </h2>
              <div className="mt-3 space-y-4">
                {content.chronologicalWalkthrough.map((role) => (
                  <article key={role.roleId}>
                    <h3 className="font-medium text-slate-900">
                      {role.title} · {role.employer}
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
                      {role.accomplishments.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm text-slate-700">
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
