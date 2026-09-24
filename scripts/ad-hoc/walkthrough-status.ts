import { PrismaClient } from "@prisma/client";

const EMAIL = "alex.walkthrough.0924@example.com";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { id: true, activeOrganizationId: true },
  });
  if (!user?.activeOrganizationId) {
    console.log(JSON.stringify({ found: false }));
    return;
  }
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: user.activeOrganizationId },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log(
    JSON.stringify({
      found: true,
      organizationId: user.activeOrganizationId,
      campaigns: campaigns.map((row) => ({
        id: row.id,
        name: row.name,
      })),
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
