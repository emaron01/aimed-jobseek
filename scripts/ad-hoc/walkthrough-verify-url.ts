import { PrismaClient } from "@prisma/client";

const EMAIL = "alex.walkthrough.0924@example.com";
const prisma = new PrismaClient();

async function main() {
  const authUser = await prisma.authUser.findUnique({
    where: { email: EMAIL },
  });
  if (!authUser) {
    throw new Error("walkthrough auth user not found");
  }
  await prisma.authUser.update({
    where: { id: authUser.id },
    data: { emailVerified: true },
  });
  const appUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
  });
  if (appUser && !appUser.emailVerifiedAt) {
    await prisma.user.update({
      where: { id: appUser.id },
      data: { emailVerifiedAt: new Date() },
    });
  }
  console.log(
    JSON.stringify({
      markedVerified: true,
      hasAppUser: Boolean(appUser),
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
