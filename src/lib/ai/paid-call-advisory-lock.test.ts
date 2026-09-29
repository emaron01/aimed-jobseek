import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  paidCallAdvisoryLockKey,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";

describe("paid-call gate advisory lock (source)", () => {
  it("uses Postgres advisory locks, not an in-memory Map", () => {
    const src = readFileSync("src/lib/ai/paid-call-gate.ts", "utf8");
    expect(src).toContain("pg_advisory_xact_lock");
    expect(src).toContain("paidCallAdvisoryLockKey");
    expect(src).not.toMatch(/new Map\s*</);
    expect(src).not.toContain("subjectLocks");
  });
});

describe.skipIf(!hasTestDatabase())(
  "paid-call gate advisory lock (two connections)",
  { timeout: 60_000 },
  () => {
    const suffix = `adv-${Date.now().toString(36)}`;
    let organizationId = "";
    let clientA: PrismaClient | null = null;
    let clientB: PrismaClient | null = null;

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] ADV ${suffix}`, slug: `adv-${suffix}` },
      });
      organizationId = org.id;
      clientA = new PrismaClient();
      clientB = new PrismaClient();
      await clientA.$connect();
      await clientB.$connect();
    });

    afterAll(async () => {
      await clientA?.$disconnect().catch(() => undefined);
      await clientB?.$disconnect().catch(() => undefined);
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    it("two separate DB connections serialize on the same advisory lock key", async () => {
      const lockKey = paidCallAdvisoryLockKey(
        organizationId,
        "COMPANY_RESEARCH",
        `${organizationId}:co-adv-${suffix}`,
      );
      let holder: "none" | "a" | "b" = "none";
      let aSawExclusive = false;
      let bSawExclusive = false;

      const runA = clientA!.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
          expect(holder).toBe("none");
          holder = "a";
          aSawExclusive = true;
          await new Promise((r) => setTimeout(r, 120));
          holder = "none";
        },
        { maxWait: 30_000, timeout: 30_000 },
      );

      await new Promise((r) => setTimeout(r, 30));

      const runB = clientB!.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
          expect(holder).toBe("none");
          holder = "b";
          bSawExclusive = true;
          holder = "none";
        },
        { maxWait: 30_000, timeout: 30_000 },
      );

      await Promise.all([runA, runB]);
      expect(aSawExclusive).toBe(true);
      expect(bSawExclusive).toBe(true);
    });

    it("two concurrent paid calls on separate connections make at most one provider call", async () => {
      const subjectKey = `${organizationId}:co-paid-${suffix}`;
      const fingerprint = `fp-${suffix}`;
      let calls = 0;
      const usable = {
        companySummary: "Locked once",
        whatTheySell: "Software",
      };
      const callProvider = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 80));
        return usable;
      };

      // Two concurrent gate entries: pool gives distinct connections; advisory
      // lock forces the second to wait and then reuse the first receipt.
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
      expect(first.data.companySummary).toBe("Locked once");
      expect(second.data.companySummary).toBe("Locked once");
      expect(first.skipped || second.skipped).toBe(true);

      // Prove the second connection path can still read the receipt after unlock.
      const third = await runPaidStructuredCall({
        organizationId,
        operation: "COMPANY_RESEARCH",
        subjectKey,
        inputFingerprint: fingerprint,
        parseStored: (json) => json as typeof usable,
        isResultUsable: (row) => Boolean(row?.companySummary?.trim()),
        callProvider,
      });
      expect(calls).toBe(1);
      expect(third.skipped).toBe(true);
    });
  },
);
