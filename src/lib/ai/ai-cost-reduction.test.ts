import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createOpenAiResponsesProvider,
  parseResponsesUsage,
} from "@/lib/ai/providers/openai-responses";
import { getConsultationAiConfig, getConsultationReplyAiConfig } from "@/lib/ai/config";
import { clearAiProviderCache } from "@/lib/ai/provider";
import { buildResumeAssetMessages } from "@/lib/application-assets/prompt";
import { buildConsultationExtractMessages } from "@/lib/consultation/prompt";
import { applicationPromptCacheKey } from "@/lib/usage/ai-call";
import { estimateEventCostUsd } from "@/lib/platform/cost";
import { SEED_AI_MODEL_RATES } from "@/lib/platform/model-rates";

const recordUsageEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/usage/events-service", () => ({
  recordUsageEvent,
}));

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  clearAiProviderCache();
  recordUsageEvent.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setConsultationRoles() {
  process.env.CONSULTATION_AI_PROVIDER = "openai-responses";
  process.env.CONSULTATION_AI_MODEL = "gpt-5.6-terra";
  process.env.CONSULTATION_AI_MODEL_URL = "https://api.openai.com/v1/responses";
  process.env.CONSULTATION_AI_API_KEY = "consultation-key";
  process.env.CONSULTATION_REPLY_AI_PROVIDER = "openai-responses";
  process.env.CONSULTATION_REPLY_AI_MODEL = "gpt-5.6-luna";
  process.env.CONSULTATION_REPLY_AI_MODEL_URL =
    "https://api.openai.com/v1/responses";
  process.env.CONSULTATION_REPLY_AI_API_KEY = "consultation-reply-key";
}

describe("AI cost reduction", () => {
  it("parses cached and cache-write tokens from Responses usage", () => {
    expect(
      parseResponsesUsage({
        input_tokens: 1200,
        output_tokens: 80,
        input_tokens_details: {
          cached_tokens: 900,
          cache_write_tokens: 50,
        },
      }),
    ).toEqual({
      inputTokens: 1200,
      cachedInputTokens: 900,
      cacheWriteTokens: 50,
      outputTokens: 80,
    });
  });

  it("sends prompt_cache_key and returns cached token usage", async () => {
    setConsultationRoles();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.prompt_cache_key).toBe("application:camp_1");
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ ok: true }),
                },
              ],
            },
          ],
          usage: {
            input_tokens: 400,
            output_tokens: 20,
            input_tokens_details: { cached_tokens: 250 },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiResponsesProvider(getConsultationReplyAiConfig());
    const result = await provider.generateStructured({
      messages: [{ role: "user", content: "hello" }],
      schema: z.object({ ok: z.boolean() }),
      promptCacheKey: applicationPromptCacheKey("camp_1"),
    });
    expect(result.usage?.inputTokens).toBe(400);
    expect(result.usage?.cachedInputTokens).toBe(250);
    expect(result.usage?.outputTokens).toBe(20);
    expect(result.model).toBe("gpt-5.6-luna");
  });

  it("records a usage event with operation, campaign, tokens, duration, and cost", async () => {
    setConsultationRoles();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ ok: true }),
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 1000,
              output_tokens: 50,
              input_tokens_details: { cached_tokens: 400 },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const provider = createOpenAiResponsesProvider(getConsultationReplyAiConfig());
    await provider.generateStructured({
      messages: [{ role: "user", content: "hello" }],
      schema: z.object({ ok: z.boolean() }),
      promptCacheKey: applicationPromptCacheKey("camp_cost"),
      usage: {
        organizationId: "org_1",
        userId: "user_1",
        campaignId: "camp_cost",
        category: "CONSULTATION",
        operation: "CONSULTATION_REPLY",
      },
    });

    expect(recordUsageEvent).toHaveBeenCalledOnce();
    const event = recordUsageEvent.mock.calls[0]?.[0] as {
      organizationId: string;
      campaignId: string;
      operation: string;
      model: string;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      durationMs: number;
      status: string;
    };
    expect(event).toMatchObject({
      organizationId: "org_1",
      campaignId: "camp_cost",
      operation: "CONSULTATION_REPLY",
      model: "gpt-5.6-luna",
      inputTokens: 1000,
      cachedInputTokens: 400,
      outputTokens: 50,
      status: "SUCCESS",
    });
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(
      estimateEventCostUsd(
        {
          provider: "openai",
          model: event.model,
          inputTokens: event.inputTokens,
          cachedInputTokens: event.cachedInputTokens,
          outputTokens: event.outputTokens,
          occurredAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        SEED_AI_MODEL_RATES,
      ),
    ).toBeGreaterThan(0);
  });

  it("keeps Harper plan on CONSULTATION_AI and replies/next-step on CONSULTATION_REPLY_AI", () => {
    setConsultationRoles();
    expect(getConsultationAiConfig().model).toBe("gpt-5.6-terra");
    expect(getConsultationReplyAiConfig().model).toBe("gpt-5.6-luna");
    const consultationAi = readFileSync(
      resolve("src/lib/consultation/ai.ts"),
      "utf8",
    );
    expect(consultationAi).toContain("getConsultationAiProvider()");
    expect(consultationAi).toContain("getConsultationReplyAiProvider()");
    expect(consultationAi).toMatch(
      /planConsultationWithModel[\s\S]*getConsultationAiProvider/,
    );
    expect(consultationAi).toMatch(
      /extractWithModel[\s\S]*getConsultationReplyAiProvider/,
    );
    expect(consultationAi).toMatch(
      /polishAnswerWithModel[\s\S]*getConsultationReplyAiProvider/,
    );
    const nextStep = readFileSync(
      resolve("src/lib/application/next-step.ts"),
      "utf8",
    );
    expect(nextStep).toContain("getConsultationReplyAiProvider");
    expect(nextStep).not.toContain("getConsultationAiProvider");
  });

  it("uses EMAIL_AI and EMAIL_FACTS_AI for outreach and ASSET_AI for resume/cover", () => {
    const assets = readFileSync(
      resolve("src/lib/application-assets/ai.ts"),
      "utf8",
    );
    expect(assets).toContain("getEmailAiProvider");
    expect(assets).toContain("getEmailFactsAiProvider");
    expect(assets).toMatch(/generateResumeWithModel[\s\S]*getAssetAiProvider/);
    expect(assets).toMatch(
      /generateCoverLetterWithModel[\s\S]*getAssetAiProvider/,
    );
    expect(assets).toMatch(/generateOutreachWithModel[\s\S]*getEmailAiProvider/);
    expect(assets).not.toMatch(
      /generateOutreachWithModel[\s\S]*getAssetAiProvider/,
    );
  });

  it("orders shared application prefix first and omits unused resume persona", () => {
    const messages = buildResumeAssetMessages({
      context: {
        organizationId: "org",
        userId: "user",
        campaign: {
          id: "camp",
          name: "App",
          ownerUserId: "user",
          applicationGuidance: "tailor",
          appliedAt: null,
          applicationProgress: null,
        },
        profile: {
          schemaVersion: 1,
          identity: {},
          direction: {},
          experience: [],
          skills: [],
          education: [],
          credentials: [],
        },
        requirement: {
          id: "req",
          title: "Director",
          companyName: "Acme",
          location: null,
          workArrangement: null,
          seniority: "senior",
          reportingLine: null,
          compensationRange: null,
          responsibilities: [],
          requiredItems: [],
          preferredItems: [],
          scorecard: null,
          rawText: "Director role",
        },
        companyResearch: {
          id: "res",
          companySummary: "Acme sells widgets",
          whatTheySell: "Widgets",
          customerTypes: [],
          primaryMarkets: [],
          businessModel: null,
          companySizeContext: null,
          hiringSignals: [],
          riskSignals: [],
          researchSources: [],
          updatedAt: new Date(),
        },
        persona: {
          id: "persona",
          name: "Hiring Manager",
          suggestionKey: "hiring_manager",
          likelyTitles: ["VP"],
          profileJson: { narrative: { unused: "blob" } },
        },
        hiringManagerPersonaId: null,
        hiringManagerContactName: null,
        assessments: [],
        approvedStatements: [],
        stories: [],
        voiceSamples: [],
        sources: [],
        seekerAnswers: [],
      } as never,
      hiddenRoleIds: [],
      condensedRoleIds: [],
      regenerationInstruction: "tighten",
      qualityFeedback: [],
    });
    expect(messages[0]?.role).toBe("system");
    const shared = JSON.parse(messages[1]?.content ?? "{}") as {
      personalProfile: unknown;
      jobRequirement: { title: string };
      companyResearch: { companySummary: string };
      persona?: unknown;
      assessments?: unknown;
    };
    const call = JSON.parse(messages[2]?.content ?? "{}") as {
      regenerationInstruction: string;
    };
    expect(shared.personalProfile).toBeTruthy();
    expect(shared.jobRequirement.title).toBe("Director");
    expect(shared.companyResearch.companySummary).toBe("Acme sells widgets");
    expect(shared.persona).toBeUndefined();
    expect(shared.assessments).toBeUndefined();
    expect(call.regenerationInstruction).toBe("tighten");
  });

  it("keeps Harper extract prefix stable and answer last", () => {
    const messages = buildConsultationExtractMessages({
      answer: "I led the rewrite",
      question: "Tell a story",
      target: { key: "comp", kind: "COMPETENCY", text: "Ownership" },
      targets: [{ key: "comp", kind: "COMPETENCY", text: "Ownership" }],
    });
    expect(messages[0]?.role).toBe("system");
    const prefix = JSON.parse(messages[1]?.content ?? "{}") as {
      availableTargets: unknown;
      answer?: string;
    };
    const call = JSON.parse(messages[2]?.content ?? "{}") as {
      answer: string;
    };
    expect(prefix.availableTargets).toHaveLength(1);
    expect(prefix.answer).toBeUndefined();
    expect(call.answer).toBe("I led the rewrite");
  });

  it("uses a per-application prompt cache key", () => {
    expect(applicationPromptCacheKey("camp_9")).toBe("application:camp_9");
    const events = readFileSync(
      resolve("src/lib/usage/events-service.ts"),
      "utf8",
    );
    expect(events).toContain("cachedInputTokens");
    expect(events).toContain("cacheWriteTokens");
    const consultationAi = readFileSync(
      resolve("src/lib/consultation/ai.ts"),
      "utf8",
    );
    expect(consultationAi).toContain("aiCallTracking");
    const assets = readFileSync(
      resolve("src/lib/application-assets/ai.ts"),
      "utf8",
    );
    expect(assets).toContain("aiCallTracking");
    const page = readFileSync(resolve("src/app/platform/costs/page.tsx"), "utf8");
    expect(page).toContain("Spend by operation");
    expect(page).toContain("Spend per application");
  });
});
