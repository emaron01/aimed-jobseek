import { notFound } from "next/navigation";
import { InterviewStagePanel } from "@/components/InterviewStagePanel";
import { PageHeader, TenantMissing, AppActionLink } from "@/components/ui";
import { listApplicationContacts } from "@/lib/application/contacts";
import { requireCurrentUser } from "@/lib/auth/session";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { canOpenCampaignDetail } from "@/lib/campaign/visibility";
import { listInterviewStages, stageTypeLabel } from "@/lib/interview/stages";
import { interviewConfig } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";
import { prisma } from "@/lib/prisma-client";

type PageProps = { params: Promise<{ id: string; stageId: string }> };

export default async function InterviewStagePage({ params }: PageProps) {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  if (!organization) return <TenantMissing />;
  const { id, stageId } = await params;
  let stages: Awaited<ReturnType<typeof listInterviewStages>>;
  let memberships: Awaited<ReturnType<typeof listApplicationContacts>>;
  let campaign: { ownerUserId: string; visibility: "PERSONAL" | "SHARED" } | null;
  try {
    [stages, memberships, campaign] = await Promise.all([
      listInterviewStages({ organizationId: organization.id, campaignId: id }),
      listApplicationContacts({ organizationId: organization.id, campaignId: id }),
      prisma.campaign.findFirst({
        where: { id, organizationId: organization.id },
        select: { ownerUserId: true, visibility: true },
      }),
    ]);
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }
  const stage = stages.find((item) => item.id === stageId);
  if (!stage || !campaign) notFound();
  if (campaign.visibility !== "PERSONAL" && campaign.visibility !== "SHARED") {
    notFound();
  }  const membership = await getMembershipForCurrentUser(organization.id);
  if (
    !canOpenCampaignDetail({
      role: membership.membership.role,
      userId: user.id,
      campaign: {
        ownerUserId: campaign.ownerUserId,
        visibility: campaign.visibility,
      },
    })
  ) {
    notFound();
  }

  const canEdit = campaign.ownerUserId === user.id;
  const interviewer = stage.interviewers[0] ?? null;
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: organization.id,
      campaignId: id,
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

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
        roles={roles}
      />
    </main>
  );
}
