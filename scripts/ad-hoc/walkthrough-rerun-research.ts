import { PrismaClient } from "@prisma/client";
import { nameApplicationEmployer } from "@/lib/application/service";
import { runWithTenantContext } from "@/lib/tenant/request-context";

const EMAIL = "alex.walkthrough.0924@example.com";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { id: true, activeOrganizationId: true },
  });
  if (!user?.activeOrganizationId) {
    throw new Error("walkthrough organization not found");
  }
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaign: { organizationId: user.activeOrganizationId } },
    select: {
      campaignId: true,
      companyId: true,
      companyName: true,
      namedContactsJson: true,
    },
  });
  if (!requirement?.companyId || !requirement.campaignId || !requirement.companyName) {
    throw new Error("walkthrough job requirement is missing an employer");
  }
  await runWithTenantContext(
    { organizationId: user.activeOrganizationId, userId: user.id },
    () =>
      nameApplicationEmployer({
        organizationId: user.activeOrganizationId!,
        campaignId: requirement.campaignId,
        employerName: requirement.companyName!,
        companyId: requirement.companyId,
      }),
  );
  const after = await prisma.jobRequirement.findFirst({
    where: { id: requirement.campaignId ? undefined : undefined, campaignId: requirement.campaignId },
    select: { employerSkipReason: true, employerDisposition: true },
  });
  const roles = await prisma.persona.count({
    where: { campaignId: requirement.campaignId, archivedAt: null },
  });
  const contacts = await prisma.campaignContact.count({
    where: { campaignId: requirement.campaignId },
  });
  console.log(
    JSON.stringify({
      namedContactCount: Array.isArray(requirement.namedContactsJson)
        ? requirement.namedContactsJson.length
        : 0,
      skipReason: after?.employerSkipReason ?? null,
      disposition: after?.employerDisposition ?? null,
      roles,
      contacts,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
