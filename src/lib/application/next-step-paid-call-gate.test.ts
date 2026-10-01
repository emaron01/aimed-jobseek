import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";

const generateStructured = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationReplyAiConfigured: () => true,
    getConsultationReplyAiProvider: () => ({ generateStructured }),
  };
});

import {
  APPLICATION_NEXT_STEP_OPERATION,
  writeApplicationNextStep,
  type NextStepState,
} from "@/lib/application/next-step";

const TEXT = "Schedule your initial consultation with Harper.";

describe.skipIf(!hasTestDatabase())(
  "application next-step paid-call gate",
  { timeout: 60_000 },
  () => {
    const suffix = `next-${Date.now()}`;
    let organizationId = "";
    const campaignId = `camp_${suffix}`;

    beforeAll(async () => {
      process.env.CONSULTATION_REPLY_AI_PROVIDER = "openai-responses";
      process.env.CONSULTATION_REPLY_AI_MODEL = "gpt-5.6-luna";
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Next step gate ${suffix}`,
          slug: `next-step-gate-${suffix}`,
        },
      });
      organizationId = org.id;
      generateStructured.mockResolvedValue({ data: { text: TEXT } });
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    function request(stateKey: string): {
      state: NextStepState;
      usage: AiCallUsageContext;
    } {
      return {
        state: {
          key: stateKey,
          facts: { consultation: stateKey },
        },
        usage: {
          organizationId,
          campaignId,
          category: "CONSULTATION",
          operation: "APPLICATION_NEXT_STEP",
        } satisfies AiCallUsageContext,
      };
    }

    it("calls the model once and reuses the stored result for an identical request", async () => {
      generateStructured.mockClear();
      const first = await writeApplicationNextStep(request("consultation_not_started"));
      expect(first).toEqual({ ok: true, text: TEXT });
      expect(generateStructured).toHaveBeenCalledTimes(1);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId, operation: APPLICATION_NEXT_STEP_OPERATION },
        }),
      ).toBe(1);

      const second = await writeApplicationNextStep(request("consultation_not_started"));
      expect(second).toEqual(first);
      expect(generateStructured).toHaveBeenCalledTimes(1);
    });

    it("calls the model when the input changes", async () => {
      generateStructured.mockClear();
      await writeApplicationNextStep(request("consultation_in_progress"));
      expect(generateStructured).toHaveBeenCalledTimes(1);
      expect(
        await prisma.paidCallReceipt.count({
          where: { organizationId, operation: APPLICATION_NEXT_STEP_OPERATION },
        }),
      ).toBe(2);
    });
  },
);
