import { PrismaClient } from "@prisma/client";

const EMAIL = "alex.walkthrough.0924@example.com";
const prisma = new PrismaClient();

async function main() {
  const appUser = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { id: true, activeOrganizationId: true },
  });
  if (!appUser?.activeOrganizationId) {
    throw new Error("walkthrough user or organization not found");
  }
  const billing = await prisma.organizationBillingProfile.update({
    where: { organizationId: appUser.activeOrganizationId },
    data: {
      planCode: "COMPED",
      billingStatus: "FREE",
      lockReason: null,
    },
    select: { planCode: true, billingStatus: true },
  });
  console.log(
    JSON.stringify({
      unlocked: true,
      planCode: billing.planCode,
      billingStatus: billing.billingStatus,
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
