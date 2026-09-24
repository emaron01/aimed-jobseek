/**
 * PRODUCT_AI_REASONING_EFFORT — Product role only; other roles unchanged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  getProductAiConfig,
  getResearchAiConfig,
  getScoringAiConfig,
} from "@/lib/ai/config";
import { AiConfigError } from "@/lib/ai/errors";
import { clearAiProviderCache } from "@/lib/ai/provider";
import { createOpenAiResponsesProvider } from "@/lib/ai/providers/openai-responses";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  clearAiProviderCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setProductResponsesEnv(opts?: {
  model?: string;
  reasoningEffort?: string;
}) {
  process.env.PRODUCT_AI_PROVIDER = "openai-responses";
  process.env.PRODUCT_AI_MODEL = opts?.model ?? "gpt-5.6-luna";
  process.env.PRODUCT_AI_MODEL_URL = "https://api.openai.com/v1/responses";
  process.env.PRODUCT_AI_API_KEY = "sk-product-test";
  if (opts?.reasoningEffort !== undefined) {
    process.env.PRODUCT_AI_REASONING_EFFORT = opts.reasoningEffort;
  } else {
    delete process.env.PRODUCT_AI_REASONING_EFFORT;
  }
}

function setResearchResponsesEnv() {
  process.env.RESEARCH_AI_PROVIDER = "openai-responses";
  process.env.RESEARCH_AI_MODEL = "research-model";
  process.env.RESEARCH_AI_MODEL_URL = "https://api.openai.com/v1/responses";
  process.env.RESEARCH_AI_API_KEY = "sk-research-test";
}

function setScoringResponsesEnv() {
  process.env.SCORING_AI_PROVIDER = "openai-responses";
  process.env.SCORING_AI_MODEL = "scoring-model";
  process.env.SCORING_AI_MODEL_URL = "https://api.openai.com/v1/responses";
  process.env.SCORING_AI_API_KEY = "sk-scoring-test";
}

const productSchema = z.object({
  productDraft: z.record(z.string(), z.unknown()),
  productMessagingDraft: z.record(z.string(), z.unknown()),
  suggestedPersonas: z.array(z.unknown()),
  personaDrafts: z.array(z.unknown()),
});

function okProductResponse() {
  return new Response(
    JSON.stringify({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                productDraft: {},
                productMessagingDraft: {},
                suggestedPersonas: [],
                personaDrafts: [],
              }),
            },
          ],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200 },
  );
}

describe("PRODUCT_AI_REASONING_EFFORT", () => {
  it("defaults Product reasoning effort to low when env unset", () => {
    setProductResponsesEnv();
    const config = getProductAiConfig();
    expect(config.reasoningEffort).toBe("low");
    expect(config.role).toBe("product");
  });

  it("reads PRODUCT_AI_REASONING_EFFORT from env", () => {
    setProductResponsesEnv({ reasoningEffort: "medium" });
    expect(getProductAiConfig().reasoningEffort).toBe("medium");
  });

  it("rejects unsupported reasoning effort values", () => {
    setProductResponsesEnv({ reasoningEffort: "turbo" });
    expect(() => getProductAiConfig()).toThrow(AiConfigError);
  });

  it("passes reasoning.effort from Product role config into Responses body", async () => {
    setProductResponsesEnv({ reasoningEffort: "low" });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return okProductResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiResponsesProvider(getProductAiConfig());
    await provider.generateStructured({
      messages: [{ role: "user", content: "synthesize" }],
      schema: productSchema,
      schemaName: "product_setup_synthesis",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.temperature).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });

  it("passes configured effort without hard-coding low in the provider", async () => {
    setProductResponsesEnv({ reasoningEffort: "high" });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return okProductResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    await createOpenAiResponsesProvider(getProductAiConfig()).generateStructured({
      messages: [{ role: "user", content: "synthesize" }],
      schema: productSchema,
      schemaName: "t",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("does not add reasoning for Research AI (reasoningEffort null)", async () => {
    setResearchResponsesEnv();
    const research = getResearchAiConfig();
    expect(research.reasoningEffort).toBeNull();

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "web_search_call",
              action: {
                type: "search",
                sources: [{ url: "https://example.com", title: "Ex" }],
              },
            },
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify({ ok: true }) }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await createOpenAiResponsesProvider(research).generateStructured({
      messages: [{ role: "user", content: "research" }],
      schema: z.object({ ok: z.boolean() }),
      schemaName: "t",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.reasoning).toBeUndefined();
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });

  it("does not add reasoning for Scoring AI (reasoningEffort null)", async () => {
    setScoringResponsesEnv();
    const scoring = getScoringAiConfig();
    expect(scoring.reasoningEffort).toBeNull();

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify({ score: 1 }) }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await createOpenAiResponsesProvider(scoring).generateStructured({
      messages: [{ role: "user", content: "score" }],
      schema: z.object({ score: z.number() }),
      schemaName: "t",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.reasoning).toBeUndefined();
  });
});
