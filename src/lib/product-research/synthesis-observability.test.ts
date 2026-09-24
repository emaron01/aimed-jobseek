/**
 * Product synthesis observability, error categories, temperature omit, retry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiConfigError,
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
} from "@/lib/ai/errors";
import { responsesModelOmitsTemperature } from "@/lib/ai/providers/openai-responses";
import { getProductAiConfigDiagnostic } from "@/lib/ai/config";
import {
  classifyProductSynthesisError,
  logProductSynthesisFailure,
  USER_FACING_SYNTHESIS_FAILURE,
} from "@/lib/product-research/synthesis-errors";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("responsesModelOmitsTemperature", () => {
  it("omits temperature for GPT-5 / Luna and reasoning models", () => {
    expect(responsesModelOmitsTemperature("gpt-5.6-luna")).toBe(true);
    expect(responsesModelOmitsTemperature("gpt-5")).toBe(true);
    expect(responsesModelOmitsTemperature("o3-mini")).toBe(true);
    expect(responsesModelOmitsTemperature("gpt-4.1")).toBe(false);
    expect(responsesModelOmitsTemperature("gpt-4o")).toBe(false);
  });
});

describe("classifyProductSynthesisError", () => {
  it("maps missing config to CONFIG", () => {
    const info = classifyProductSynthesisError(
      new AiConfigError("PRODUCT_AI_API_KEY is required."),
    );
    expect(info.category).toBe("CONFIG");
  });

  it("maps 401/403 to AUTH without exposing keys", () => {
    const info = classifyProductSynthesisError(
      new AiProviderError(
        'Product Responses API request failed (401): {"error":{"message":"Incorrect API key sk-secret","type":"invalid_request_error","code":"invalid_api_key"}}',
        { status: 401, providerCode: "invalid_api_key" },
      ),
    );
    expect(info.category).toBe("AUTH");
    expect(info.httpStatus).toBe(401);
  });

  it("maps model not found to MODEL_NOT_FOUND", () => {
    const info = classifyProductSynthesisError(
      new AiProviderError(
        'Product Responses API request failed (404): {"error":{"message":"The model `gpt-x` does not exist","code":"model_not_found"}}',
        { status: 404, providerCode: "model_not_found" },
      ),
    );
    expect(info.category).toBe("MODEL_NOT_FOUND");
  });

  it("maps 429 to RATE_LIMIT", () => {
    expect(
      classifyProductSynthesisError(
        new AiProviderError("rate limited", { status: 429 }),
      ).category,
    ).toBe("RATE_LIMIT");
  });

  it("maps timeout to TIMEOUT", () => {
    expect(
      classifyProductSynthesisError(new AiTimeoutError("timed out")).category,
    ).toBe("TIMEOUT");
  });

  it("maps 5xx to PROVIDER_5XX", () => {
    expect(
      classifyProductSynthesisError(
        new AiProviderError("boom", { status: 503 }),
      ).category,
    ).toBe("PROVIDER_5XX");
  });

  it("maps invalid schema errors to STRUCTURED_OUTPUT", () => {
    expect(
      classifyProductSynthesisError(
        new AiProviderError(
          'failed (400): {"error":{"message":"Invalid schema for response_format","code":"invalid_json_schema"}}',
          { status: 400, providerCode: "invalid_json_schema" },
        ),
      ).category,
    ).toBe("STRUCTURED_OUTPUT");
  });

  it("maps Zod/AiValidationError to VALIDATION with safe issues", () => {
    const info = classifyProductSynthesisError(
      new AiValidationError("validation failed", {
        issues: [{ path: "productDraft.description", code: "invalid_type", expected: "string" }],
      }),
    );
    expect(info.category).toBe("VALIDATION");
    expect(info.validationIssues?.[0]?.path).toBe("productDraft.description");
  });
});

describe("logProductSynthesisFailure safety", () => {
  it("never logs API keys or raw evidence", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logProductSynthesisFailure({
      event: "product_synthesis_error",
      organizationId: "org_1",
      productId: "prod_1",
      setupRunId: "run_1",
      evidenceBundleId: "bundle_1",
      correlationId: "corr_1",
      provider: "openai-responses",
      model: "gpt-5.6-luna",
      endpoint: "https://api.openai.com/v1/responses",
      stage: "generateStructured",
      category: "AUTH",
      httpStatus: 401,
      durationMs: 12,
      retryCount: 0,
      messageSafe: "Incorrect API key sk-secret-should-not-matter",
    });
    expect(spy).toHaveBeenCalled();
    const logged = String(spy.mock.calls[0]?.[1] ?? spy.mock.calls[0]?.[0]);
    expect(logged).toContain("product_synthesis_error");
    expect(logged).toContain("AUTH");
    expect(logged).not.toContain("evidence text");
    expect(logged).not.toMatch(/full prompt/i);
    spy.mockRestore();
  });

  it("user-facing message stays generic", () => {
    expect(USER_FACING_SYNTHESIS_FAILURE).toContain("Acquired evidence was preserved");
    expect(USER_FACING_SYNTHESIS_FAILURE).not.toMatch(/sk-/);
  });
});

describe("getProductAiConfigDiagnostic", () => {
  it("reports configured=false and missing env without API key", () => {
    delete process.env.PRODUCT_AI_PROVIDER;
    delete process.env.PRODUCT_AI_MODEL;
    delete process.env.PRODUCT_AI_MODEL_URL;
    delete process.env.PRODUCT_AI_API_KEY;
    const d = getProductAiConfigDiagnostic();
    expect(d.configured).toBe(false);
    expect(d.missingEnv).toEqual(
      expect.arrayContaining([
        "PRODUCT_AI_PROVIDER",
        "PRODUCT_AI_MODEL",
        "PRODUCT_AI_MODEL_URL",
        "PRODUCT_AI_API_KEY",
      ]),
    );
    expect(JSON.stringify(d)).not.toMatch(/sk-/);
    expect(d).not.toHaveProperty("apiKey");
  });

  it("reports configured=true with public fields only", () => {
    process.env.PRODUCT_AI_PROVIDER = "openai-responses";
    process.env.PRODUCT_AI_MODEL = "gpt-5.6-luna";
    process.env.PRODUCT_AI_MODEL_URL = "https://api.openai.com/v1/responses";
    process.env.PRODUCT_AI_API_KEY = "sk-test-product-key-never-returned";
    const d = getProductAiConfigDiagnostic();
    expect(d.configured).toBe(true);
    expect(d.provider).toBe("openai-responses");
    expect(d.model).toBe("gpt-5.6-luna");
    expect(d.endpointHostPath).toContain("api.openai.com");
    expect(JSON.stringify(d)).not.toContain("sk-test-product-key");
  });
});

describe("retry synthesis architecture (source inspection)", () => {
  it("resynthesizeFromBundle reuses bundle and does not call acquire/search/fetch", async () => {
    const fs = await import("node:fs");
    const synth = fs.readFileSync("src/lib/product-research/synthesize.ts", "utf8");
    expect(synth).toContain("resynthesizeFromBundle");
    expect(synth).toContain("synthesizeProductSetup");
    expect(synth).not.toContain("acquireProductEvidence");
    expect(synth).not.toContain("runProgressiveProductWebSearch");
    expect(synth).not.toContain("fetchProductPageUrl");
    expect(synth).not.toContain("extractDocumentText");
    expect(synth).toContain("logProductSynthesisFailure");
    expect(synth).toContain("PRODUCT_SYNTHESIS");
  });

  it("openai-responses omits temperature for gpt-5.6-luna in request body", async () => {
    process.env.PRODUCT_AI_PROVIDER = "openai-responses";
    process.env.PRODUCT_AI_MODEL = "gpt-5.6-luna";
    process.env.PRODUCT_AI_MODEL_URL = "https://api.openai.com/v1/responses";
    process.env.PRODUCT_AI_API_KEY = "sk-test";
    process.env.PRODUCT_AI_TEMPERATURE = "0.2";

    const { getProductAiConfig } = await import("@/lib/ai/config");
    const { createOpenAiResponsesProvider } = await import(
      "@/lib/ai/providers/openai-responses"
    );
    const { z } = await import("zod");

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
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
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = getProductAiConfig();
    const provider = createOpenAiResponsesProvider(config);
    await provider.generateStructured({
      messages: [{ role: "user", content: "x" }],
      schema: z.object({
        productDraft: z.record(z.string(), z.unknown()),
        productMessagingDraft: z.record(z.string(), z.unknown()),
        suggestedPersonas: z.array(z.unknown()),
        personaDrafts: z.array(z.unknown()),
      }),
      schemaName: "t",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.temperature).toBeUndefined();
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(body.tools).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
