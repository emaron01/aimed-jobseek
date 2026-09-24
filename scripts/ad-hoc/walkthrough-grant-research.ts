import { PrismaClient } from "@prisma/client";

const EMAIL = "alex.walkthrough.0924@example.com";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { activeOrganizationId: true },
  });
  if (!user?.activeOrganizationId) {
    throw new Error("walkthrough organization not found");
  }
  const policy = await prisma.organizationUsagePolicy.update({
    where: { organizationId: user.activeOrganizationId },
    data: { activeResearchedCompanyLimit: 50 },
    select: { activeResearchedCompanyLimit: true },
  });
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaign: { organizationId: user.activeOrganizationId } },
    select: {
      id: true,
      companyName: true,
      employerDisposition: true,
      companyId: true,
      employerSkipReason: true,
    },
  });
  console.log(
    JSON.stringify({
      limit: policy.activeResearchedCompanyLimit,
      requirement,
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
