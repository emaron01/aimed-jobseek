import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasTestDatabase } from "@/test/database";

describe.skipIf(!hasTestDatabase())("application job heartbeat recovery", { timeout: 60_000 }, () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let campaignId = "";
  let nullHeartbeatJobId = "";
  let freshHeartbeatJobId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `heartbeat-recover-${suffix}@example.test`,
      name: "Heartbeat Recover Seeker",
    });
    organizationId = workspace.organization.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: workspace.user.id,
        name: `Heartbeat ${suffix}`,
        productId: product.id,
      },
    });
    campaignId = campaign.id;
    const fresh = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "COVER_LETTER",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
      },
    });
    freshHeartbeatJobId = fresh.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("re-queues IN_PROGRESS jobs whose workerHeartbeatAt is null", async () => {
    const { abandonStaleApplicationJobs, HEARTBEAT_STALE_MS } = await import(
      "@/lib/application-jobs/service"
    );
    const nullHeartbeat = await prisma.applicationJob.create({
      data: {
        organizationId,
        campaignId,
        type: "RESUME",
        status: "IN_PROGRESS",
        // Claim time is past the grace, so a missing heartbeat is still stale.
        startedAt: new Date(Date.now() - HEARTBEAT_STALE_MS - 1_000),
        workerHeartbeatAt: null,
      },
    });
    nullHeartbeatJobId = nullHeartbeat.id;
    await abandonStaleApplicationJobs();
    const recovered = await prisma.applicationJob.findUniqueOrThrow({
      where: { id: nullHeartbeatJobId },
    });
    expect(recovered.status).toBe("PENDING");
    expect(recovered.error).toMatch(/heartbeat went stale/i);
    const fresh = await prisma.applicationJob.findUniqueOrThrow({
      where: { id: freshHeartbeatJobId },
    });
    expect(fresh.status).toBe("IN_PROGRESS");
    expect(fresh.error).toBeNull();
  });
});
