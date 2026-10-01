import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import {
  HEARTBEAT_STALE_MS,
  abandonStaleApplicationJobs,
} from "@/lib/application-jobs/service";
import {
  RUN_ABANDON_MS,
  abandonStaleResearchRuns,
  createResearchRun,
} from "@/lib/research/runs-service";

const pastJobGrace = () => new Date(Date.now() - HEARTBEAT_STALE_MS - 1_000);
const pastRunAbandon = () => new Date(Date.now() - RUN_ABANDON_MS - 1_000);

describe.skipIf(!hasTestDatabase())(
  "stale recovery sweeps do not overwrite a row that recovered",
  { timeout: 60_000 },
  () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let organizationId = "";
    let campaignId = "";
    let userId = "";

    beforeAll(async () => {
      const { createIndividualWorkspace } = await import("@/lib/org/signup");
      const workspace = await createIndividualWorkspace({
        email: `stale-sweep-${suffix}@example.test`,
        name: "Stale Sweep Seeker",
      });
      organizationId = workspace.organization.id;
      userId = workspace.user.id;
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
          ownerUserId: userId,
          name: `Sweep ${suffix}`,
          productId: product.id,
        },
      });
      campaignId = campaign.id;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    function interceptJobRead(jobId: string, mutate: () => Promise<void>) {
      const original = prisma.applicationJob.findMany.bind(prisma.applicationJob);
      vi.spyOn(prisma.applicationJob, "findMany").mockImplementation(
        ((args) =>
          original(args).then(async (rows) => {
            if (rows.some((row) => "id" in row && row.id === jobId)) await mutate();
            return rows;
          })) as typeof prisma.applicationJob.findMany,
      );
    }

    function interceptRunRead(runId: string, mutate: () => Promise<void>) {
      const original = prisma.researchRun.findMany.bind(prisma.researchRun);
      vi.spyOn(prisma.researchRun, "findMany").mockImplementation(
        ((args) =>
          original(args).then(async (rows) => {
            if (rows.some((row) => "id" in row && row.id === runId)) await mutate();
            return rows;
          })) as typeof prisma.researchRun.findMany,
      );
    }

    async function createJob(input: {
      type: "RESUME" | "COVER_LETTER";
      startedAt: Date | null;
      workerHeartbeatAt: Date | null;
    }) {
      return prisma.applicationJob.create({
        data: {
          organizationId,
          campaignId,
          type: input.type,
          targetId: `job-${Math.random().toString(16).slice(2)}`,
          status: "IN_PROGRESS",
          startedAt: input.startedAt,
          workerHeartbeatAt: input.workerHeartbeatAt,
        },
      });
    }

    it("does not reset a job that completes after the stale snapshot", async () => {
      const completed = await createJob({
        type: "RESUME",
        startedAt: pastJobGrace(),
        workerHeartbeatAt: pastJobGrace(),
      });
      const stillStale = await createJob({
        type: "COVER_LETTER",
        startedAt: pastJobGrace(),
        workerHeartbeatAt: pastJobGrace(),
      });
      interceptJobRead(completed.id, () =>
        prisma.applicationJob.update({
          where: { id: completed.id },
          data: {
            status: "COMPLETED",
            error: null,
            completedAt: new Date(),
            workerHeartbeatAt: new Date(),
          },
        }).then(() => undefined),
      );

      const reset = await abandonStaleApplicationJobs();
      expect(reset).toBeGreaterThanOrEqual(1);
      const finished = await prisma.applicationJob.findUniqueOrThrow({
        where: { id: completed.id },
      });
      expect(finished.status).toBe("COMPLETED");
      const requeued = await prisma.applicationJob.findUniqueOrThrow({
        where: { id: stillStale.id },
      });
      expect(requeued.status).toBe("PENDING");
      expect(requeued.error).toMatch(/heartbeat went stale/i);
    });

    it("does not reset a job that heartbeats after the stale snapshot", async () => {
      const recovered = await createJob({
        type: "RESUME",
        startedAt: pastJobGrace(),
        workerHeartbeatAt: pastJobGrace(),
      });
      interceptJobRead(recovered.id, () =>
        prisma.applicationJob
          .update({
            where: { id: recovered.id },
            data: { workerHeartbeatAt: new Date() },
          })
          .then(() => undefined),
      );

      await abandonStaleApplicationJobs();
      const job = await prisma.applicationJob.findUniqueOrThrow({
        where: { id: recovered.id },
      });
      expect(job.status).toBe("IN_PROGRESS");
      expect(job.error).toBeNull();
    });

    it("still requeues a genuinely stale in-progress job", async () => {
      const stale = await createJob({
        type: "RESUME",
        startedAt: pastJobGrace(),
        workerHeartbeatAt: pastJobGrace(),
      });
      const reset = await abandonStaleApplicationJobs();
      expect(reset).toBeGreaterThanOrEqual(1);
      const job = await prisma.applicationJob.findUniqueOrThrow({
        where: { id: stale.id },
      });
      expect(job.status).toBe("PENDING");
      expect(job.error).toBe("Worker heartbeat went stale. The job was requeued.");
    });

    it("does not reset a just-claimed job that has not sent its first heartbeat", async () => {
      const claimed = await createJob({
        type: "RESUME",
        startedAt: new Date(),
        workerHeartbeatAt: null,
      });
      await abandonStaleApplicationJobs();
      const job = await prisma.applicationJob.findUniqueOrThrow({
        where: { id: claimed.id },
      });
      expect(job.status).toBe("IN_PROGRESS");
      expect(job.error).toBeNull();
    });

    async function createRun(input: {
      startedAt: Date | null;
      workerHeartbeatAt: Date | null;
    }) {
      const list = await prisma.contactList.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `List ${Math.random().toString(16).slice(2)}`,
        },
      });
      return prisma.researchRun.create({
        data: {
          organizationId,
          contactListId: list.id,
          status: "IN_PROGRESS",
          totalCompanies: 1,
          startedAt: input.startedAt,
          workerHeartbeatAt: input.workerHeartbeatAt,
        },
      });
    }

    it("does not fail a research run that completes after the stale snapshot", async () => {
      const completed = await createRun({
        startedAt: pastRunAbandon(),
        workerHeartbeatAt: pastRunAbandon(),
      });
      const stillStale = await createRun({
        startedAt: pastRunAbandon(),
        workerHeartbeatAt: pastRunAbandon(),
      });
      interceptRunRead(completed.id, () =>
        prisma.researchRun
          .update({
            where: { id: completed.id },
            data: {
              status: "COMPLETED",
              lastError: null,
              completedAt: new Date(),
              workerHeartbeatAt: new Date(),
            },
          })
          .then(() => undefined),
      );

      const abandoned = await abandonStaleResearchRuns();
      expect(abandoned).toBeGreaterThanOrEqual(1);
      const finished = await prisma.researchRun.findUniqueOrThrow({
        where: { id: completed.id },
      });
      expect(finished.status).toBe("COMPLETED");
      const failed = await prisma.researchRun.findUniqueOrThrow({
        where: { id: stillStale.id },
      });
      expect(failed.status).toBe("FAILED");
      expect(failed.lastError).toBe(
        "Run abandoned after 30 minutes without progress.",
      );
    });

    it("does not fail a research run that heartbeats after the stale snapshot", async () => {
      const recovered = await createRun({
        startedAt: pastRunAbandon(),
        workerHeartbeatAt: pastRunAbandon(),
      });
      interceptRunRead(recovered.id, () =>
        prisma.researchRun
          .update({
            where: { id: recovered.id },
            data: { workerHeartbeatAt: new Date() },
          })
          .then(() => undefined),
      );

      await abandonStaleResearchRuns();
      const run = await prisma.researchRun.findUniqueOrThrow({
        where: { id: recovered.id },
      });
      expect(run.status).toBe("IN_PROGRESS");
      expect(run.lastError).toBeNull();
    });

    it("still fails a genuinely stale in-progress research run", async () => {
      const stale = await createRun({
        startedAt: pastRunAbandon(),
        workerHeartbeatAt: pastRunAbandon(),
      });
      const abandoned = await abandonStaleResearchRuns();
      expect(abandoned).toBeGreaterThanOrEqual(1);
      const run = await prisma.researchRun.findUniqueOrThrow({
        where: { id: stale.id },
      });
      expect(run.status).toBe("FAILED");
      expect(run.lastError).toBe(
        "Run abandoned after 30 minutes without progress.",
      );
    });

    it("does not fail a just-claimed research run that has not heartbeated", async () => {
      const claimed = await createRun({
        startedAt: new Date(),
        workerHeartbeatAt: null,
      });
      await abandonStaleResearchRuns();
      const run = await prisma.researchRun.findUniqueOrThrow({
        where: { id: claimed.id },
      });
      expect(run.status).toBe("IN_PROGRESS");
      expect(run.lastError).toBeNull();
    });

    it("does not fail a research run that heartbeats after it was read as stale", async () => {
      const stale = await createRun({
        startedAt: pastJobGrace(),
        workerHeartbeatAt: pastJobGrace(),
      });
      const original = prisma.researchRun.findFirst.bind(prisma.researchRun);
      vi.spyOn(prisma.researchRun, "findFirst").mockImplementation(
        ((args) =>
          original(args).then(async (row) => {
            if (
              row &&
              "id" in row &&
              "workerHeartbeatAt" in row &&
              row.id === stale.id &&
              row.workerHeartbeatAt instanceof Date &&
              row.workerHeartbeatAt < new Date(Date.now() - 60_000)
            ) {
              await prisma.researchRun.update({
                where: { id: row.id },
                data: { workerHeartbeatAt: new Date() },
              });
            }
            return row;
          })) as typeof prisma.researchRun.findFirst,
      );

      const result = await createResearchRun({
        organizationId,
        contactListId: stale.contactListId!,
        initiatedByUserId: userId,
      });
      expect(result.ok).toBe(false);
      const run = await prisma.researchRun.findUniqueOrThrow({
        where: { id: stale.id },
      });
      expect(run.status).toBe("IN_PROGRESS");
      expect(run.lastError).toBeNull();
    });
  },
);
