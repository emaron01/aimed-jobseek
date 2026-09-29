import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  PAID_CALL_LOCK_ACQUIRE_MAX_WAIT_MS,
  paidCallAdvisoryLockIds,
  paidCallAdvisoryLockKey,
  paidCallLockDatabaseUrl,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";

describe("paid-call gate advisory lock (source)", () => {
  it("uses dedicated-connection session locks, not Prisma interactive transactions", () => {
    const src = readFileSync("src/lib/ai/paid-call-gate.ts", "utf8");
    expect(src).toContain("pg_try_advisory_lock");
    expect(src).toContain("pg_advisory_unlock");
    expect(src).toContain("connection_limit");
    expect(src).toContain("paidCallLockDatabaseUrl");
    expect(src).toContain("new PrismaClient");
    expect(src).toContain("paidCallAdvisoryLockKey");
    expect(src).not.toContain("pg_advisory_xact_lock");
    expect(src).not.toMatch(/\$transaction\s*\(/);
    expect(src).not.toMatch(/new Map\s*</);
    expect(src).not.toContain("subjectLocks");
    expect(src).not.toContain("createRequire");
    expect(src).not.toContain('nodeRequire("pg")');
    expect(PAID_CALL_LOCK_ACQUIRE_MAX_WAIT_MS).toBe(600_000);
  });
});

describe.skipIf(!hasTestDatabase())(
  "paid-call gate dedicated advisory lock",
  { timeout: 90_000 },
  () => {
    const suffix = `adv-${Date.now().toString(36)}`;
    let organizationId = "";
    let lockUrl = "";

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] ADV ${suffix}`, slug: `adv-${suffix}` },
      });
      organizationId = org.id;
      const raw = process.env.DATABASE_URL?.trim();
      if (!raw) throw new Error("DATABASE_URL required");
      lockUrl = paidCallLockDatabaseUrl(raw);
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    it("two separate DB connections serialize on the same session advisory lock key", async () => {
      const lockKey = paidCallAdvisoryLockKey(
        organizationId,
        "COMPANY_RESEARCH",
        `${organizationId}:co-adv-${suffix}`,
      );
      const [k1, k2] = paidCallAdvisoryLockIds(lockKey);
      let holder: "none" | "a" | "b" = "none";
      let aSawExclusive = false;
      let bSawExclusive = false;

      const clientA = new PrismaClient({
        datasources: { db: { url: lockUrl } },
        log: ["error"],
      });
      const clientB = new PrismaClient({
        datasources: { db: { url: lockUrl } },
        log: ["error"],
      });
      await clientA.$connect();
      await clientB.$connect();
      try {
        const runA = (async () => {
          const got = await clientA.$queryRaw<Array<{ locked: boolean }>>`
            SELECT pg_try_advisory_lock(${k1}::integer, ${k2}::integer) AS locked
          `;
          expect(got[0]?.locked).toBe(true);
          expect(holder).toBe("none");
          holder = "a";
          aSawExclusive = true;
          await new Promise((r) => setTimeout(r, 150));
          holder = "none";
          await clientA.$queryRaw`SELECT pg_advisory_unlock(${k1}::integer, ${k2}::integer)`;
        })();

        await new Promise((r) => setTimeout(r, 40));

        const runB = (async () => {
          let locked = false;
          const deadline = Date.now() + 10_000;
          while (!locked && Date.now() < deadline) {
            const got = await clientB.$queryRaw<Array<{ locked: boolean }>>`
              SELECT pg_try_advisory_lock(${k1}::integer, ${k2}::integer) AS locked
            `;
            locked = Boolean(got[0]?.locked);
            if (!locked) await new Promise((r) => setTimeout(r, 30));
          }
          expect(locked).toBe(true);
          expect(holder).toBe("none");
          holder = "b";
          bSawExclusive = true;
          holder = "none";
          await clientB.$queryRaw`SELECT pg_advisory_unlock(${k1}::integer, ${k2}::integer)`;
        })();

        await Promise.all([runA, runB]);
        expect(aSawExclusive).toBe(true);
        expect(bSawExclusive).toBe(true);
      } finally {
        await clientA.$disconnect().catch(() => undefined);
        await clientB.$disconnect().catch(() => undefined);
      }
    });

    it("two concurrent paid calls make at most one provider call when the provider exceeds 5s", async () => {
      const subjectKey = `${organizationId}:co-slow-${suffix}`;
      const fingerprint = `fp-slow-${suffix}`;
      let calls = 0;
      const usable = {
        companySummary: "Slow locked once",
        whatTheySell: "Software",
      };
      const callProvider = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 5_500));
        return usable;
      };

      const transactionSpy = vi.spyOn(prisma, "$transaction");
      try {
        const [first, second] = await Promise.all([
          runPaidStructuredCall({
            organizationId,
            operation: "COMPANY_RESEARCH",
            subjectKey,
            inputFingerprint: fingerprint,
            parseStored: (json) => json as typeof usable,
            isResultUsable: (row) => Boolean(row?.companySummary?.trim()),
            callProvider,
          }),
          runPaidStructuredCall({
            organizationId,
            operation: "COMPANY_RESEARCH",
            subjectKey,
            inputFingerprint: fingerprint,
            parseStored: (json) => json as typeof usable,
            isResultUsable: (row) => Boolean(row?.companySummary?.trim()),
            callProvider,
          }),
        ]);

        expect(calls).toBe(1);
        expect(first.data.companySummary).toBe("Slow locked once");
        expect(second.data.companySummary).toBe("Slow locked once");
        expect(first.skipped || second.skipped).toBe(true);
        expect(transactionSpy).not.toHaveBeenCalled();

        const receipt = await prisma.paidCallReceipt.findUnique({
          where: {
            organizationId_operation_subjectKey: {
              organizationId,
              operation: "COMPANY_RESEARCH",
              subjectKey,
            },
          },
        });
        expect(receipt?.inputHash).toBe(fingerprint);
      } finally {
        transactionSpy.mockRestore();
      }
    });

    it("a provider call lasting longer than 5 seconds completes and records its receipt", async () => {
      const subjectKey = `${organizationId}:co-long-${suffix}`;
      const fingerprint = `fp-long-${suffix}`;
      const usable = { companySummary: "Long call", whatTheySell: "Widgets" };
      const started = Date.now();
      const result = await runPaidStructuredCall({
        organizationId,
        operation: "COMPANY_RESEARCH",
        subjectKey,
        inputFingerprint: fingerprint,
        parseStored: (json) => json as typeof usable,
        isResultUsable: (row) => Boolean(row?.companySummary?.trim()),
        callProvider: async () => {
          await new Promise((r) => setTimeout(r, 5_200));
          return usable;
        },
      });
      expect(Date.now() - started).toBeGreaterThanOrEqual(5_000);
      expect(result.skipped).toBe(false);
      expect(result.data.companySummary).toBe("Long call");
      const receipt = await prisma.paidCallReceipt.findUnique({
        where: {
          organizationId_operation_subjectKey: {
            organizationId,
            operation: "COMPANY_RESEARCH",
            subjectKey,
          },
        },
      });
      expect(receipt?.inputHash).toBe(fingerprint);
    });

    it("releases the lock after a provider error so the next caller proceeds", async () => {
      const subjectKey = `${organizationId}:co-err-${suffix}`;
      const fingerprint = `fp-err-${suffix}`;
      await expect(
        runPaidStructuredCall({
          organizationId,
          operation: "COMPANY_RESEARCH",
          subjectKey,
          inputFingerprint: fingerprint,
          parseStored: (json) => json as { companySummary: string },
          isResultUsable: (row) => Boolean(row?.companySummary?.trim()),
          callProvider: async () => {
            throw new Error("provider boom");
          },
        }),
      ).rejects.toThrow("provider boom");

      const usable = { companySummary: "Recovered", whatTheySell: "OK" };
      const next = await runPaidStructuredCall({
        organizationId,
        operation: "COMPANY_RESEARCH",
        subjectKey,
        inputFingerprint: fingerprint,
        parseStored: (json) => json as typeof usable,
        isResultUsable: (row) => Boolean(row?.companySummary?.trim()),
        callProvider: async () => usable,
      });
      expect(next.skipped).toBe(false);
      expect(next.data.companySummary).toBe("Recovered");
    });

    it("different subjects run in parallel without waiting on each other", async () => {
      const usableA = { companySummary: "Subject A", whatTheySell: "A" };
      const usableB = { companySummary: "Subject B", whatTheySell: "B" };
      let aStarted = 0;
      let bStarted = 0;
      const wallStart = Date.now();

      const [a, b] = await Promise.all([
        runPaidStructuredCall({
          organizationId,
          operation: "COMPANY_RESEARCH",
          subjectKey: `${organizationId}:parallel-a-${suffix}`,
          inputFingerprint: `fp-a-${suffix}`,
          parseStored: (json) => json as typeof usableA,
          isResultUsable: (row) => Boolean(row?.companySummary?.trim()),
          callProvider: async () => {
            aStarted = Date.now();
            await new Promise((r) => setTimeout(r, 300));
            return usableA;
          },
        }),
        runPaidStructuredCall({
          organizationId,
          operation: "COMPANY_RESEARCH",
          subjectKey: `${organizationId}:parallel-b-${suffix}`,
          inputFingerprint: `fp-b-${suffix}`,
          parseStored: (json) => json as typeof usableB,
          isResultUsable: (row) => Boolean(row?.companySummary?.trim()),
          callProvider: async () => {
            bStarted = Date.now();
            await new Promise((r) => setTimeout(r, 300));
            return usableB;
          },
        }),
      ]);

      const wallMs = Date.now() - wallStart;
      expect(a.data.companySummary).toBe("Subject A");
      expect(b.data.companySummary).toBe("Subject B");
      // Each provider sleeps 300ms; sequential would be >=600ms of sleep alone.
      // Allow headroom for dedicated lock-client connect under suite load.
      expect(wallMs).toBeLessThan(900);
      expect(Math.abs(aStarted - bStarted)).toBeLessThan(250);
    });
  },
);
