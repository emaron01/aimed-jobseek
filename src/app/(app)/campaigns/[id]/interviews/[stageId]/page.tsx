import { notFound } from "next/navigation";
import { InterviewStagePanel } from "@/components/InterviewStagePanel";
import { PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { listApplicationContacts } from "@/lib/application/contacts";
import { getApplicationSummaryView } from "@/lib/application-summary/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canOpenCampaignDetail } from "@/lib/campaign/visibility";
import { listInterviewStages, stageTypeLabel } from "@/lib/interview/stages";
import { interviewConfig } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

type PageProps = { params: Promise<{ id: string; stageId: string }> };

export default async function InterviewStagePage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  if (!organization) return <TenantMissing />;
  const { id, stageId } = await params;
  let stages: Awaited<ReturnType<typeof listInterviewStages>>;
  let summary: Awaited<ReturnType<typeof getApplicationSummaryView>>;
  let memberships: Awaited<ReturnType<typeof listApplicationContacts>>;
  try {
    [stages, summary, memberships] = await Promise.all([
      listInterviewStages({ organizationId: organization.id, campaignId: id }),
      getApplicationSummaryView({ organizationId: organization.id, campaignId: id }),
      listApplicationContacts({ organizationId: organization.id, campaignId: id }),
    ]);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }
  const stage = stages.find((item) => item.id === stageId);
  if (!stage) notFound();
  const membership = await getMembershipForCurrentUser(organization.id);
  if (
    !canOpenCampaignDetail({
      role: membership.membership.role,
      userId: user.id,
      campaign: {
        ownerUserId: summary.campaign.ownerUserId,
        visibility: summary.campaign.visibility,
      },
    })
  ) {
    notFound();
  }

  const canEdit = summary.campaign.ownerUserId === user.id;
  const interviewer = stage.interviewers[0] ?? null;
  const sectionKey = interviewer ? `contact:${interviewer.contactId}` : null;
  const person = sectionKey
    ? summary.people.find((item) => item.sectionKey === sectionKey)
    : null;
  const section = sectionKey
    ? summary.guidance?.people.find((item) => item.sectionKey === sectionKey) ?? null
    : null;
  const notes = interviewer
    ? summary.notesByContactId.get(interviewer.contactId) ?? []
    : [];
  const heading =
    person?.heading
    ?? (interviewer
      ? [interviewer.contact.firstName, interviewer.contact.lastName]
          .filter(Boolean)
          .join(" ")
          .trim()
      : interviewConfig.labels.interviewer);

  return (
    <main className="application-summary mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={stageTypeLabel(stage.type)}
        description={interviewConfig.labels.sectionTitle}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <AppActionLink href={`/campaigns/${id}/interviews`} variant="secondary">
              Back to application
            </AppActionLink>
          </div>
        }
      />
      <InterviewStagePanel
        campaignId={id}
        canEdit={canEdit}
        stageId={stage.id}
        interviewerContactId={interviewer?.contactId ?? null}
        people={memberships.map((row) => ({
          contactId: row.contactId,
          name:
            [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim()
            || row.contact.title
            || row.chosenPersona?.name
            || row.contactId,
          title: row.contact.title,
          personaId: row.chosenPersonaId,
          personaName: row.chosenPersona?.name ?? null,
        }))}
        roles={summary.roles.map((role) => ({ id: role.id, name: role.name }))}
        heading={heading}
        sectionKey={sectionKey}
        section={section}
        notes={notes}
      />
    </main>
  );
}
