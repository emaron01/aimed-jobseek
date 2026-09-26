import { notFound } from "next/navigation";
import { getMembershipForCurrentUser } from "@/lib/auth/authz";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  canEditCampaignTemplate,
  canOpenCampaignDetail,
} from "@/lib/campaign/visibility";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { getCurrentOrganization } from "@/lib/tenant/getCurrentOrganization";

export type ApplicationWorkspaceAccess =
  | { kind: "missing-tenant" }
  | {
      kind: "ok";
      organizationId: string;
      campaignId: string;
      canEdit: boolean;
    };

export async function requireApplicationWorkspace(
  campaignId: string,
): Promise<ApplicationWorkspaceAccess> {
  const organization = await getCurrentOrganization();
  const user = await requireCurrentUser();
  if (!organization) return { kind: "missing-tenant" };
  let campaign: {
    id: string;
    ownerUserId: string;
    visibility: "PERSONAL" | "SHARED";
    archivedAt: Date | null;
  } | null;
  try {
    campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: organization.id },
      select: {
        id: true,
        ownerUserId: true,
        visibility: true,
        archivedAt: true,
      },
    });
  } catch (error) {
    if (error instanceof TenantError) notFound();
    throw error;
  }
  if (!campaign) notFound();
  const membership = await getMembershipForCurrentUser(organization.id);
  if (
    !canOpenCampaignDetail({
      role: membership.membership.role,
      userId: user.id,
      campaign,
    })
  ) {
    notFound();
  }
  return {
    kind: "ok",
    organizationId: organization.id,
    campaignId: campaign.id,
    canEdit:
      canEditCampaignTemplate({
        userId: user.id,
        role: membership.membership.role,
        campaign,
      }) && campaign.archivedAt == null,
  };
}
