import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { clearAiProviderCache, createAiProvider } from "@/lib/ai/provider";
import {
  assertConsultationAiConfigured,
  getEmailAiConfig,
  getEmailFactsAiConfig,
  getResearchAiConfig,
  getScoringAiConfig,
  isEmailAiConfigured,
  isEmailFactsAiConfigured,
  isResearchAiConfigured,
  isScoringAiConfigured,
} from "@/lib/ai/config";
import { AiConfigError } from "@/lib/ai/errors";
import { redactSecrets, sanitizeModelUrlIdentifier } from "@/lib/ai/redact";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  clearAiProviderCache();
});

function setResearchEnv(model = "research-model-x") {
  process.env.RESEARCH_AI_PROVIDER = "openai-compatible";
  process.env.RESEARCH_AI_MODEL = model;
  process.env.RESEARCH_AI_MODEL_URL =
    "https://research.example.test/v1/chat/completions";
  process.env.RESEARCH_AI_API_KEY = "research-secret-key";
  process.env.RESEARCH_AI_TIMEOUT_MS = "12000";
  process.env.RESEARCH_AI_MAX_RETRIES = "1";
  process.env.RESEARCH_AI_TEMPERATURE = "0.1";
}

function setScoringEnv(model = "scoring-model-y") {
  process.env.SCORING_AI_PROVIDER = "openai-compatible";
  process.env.SCORING_AI_MODEL = model;
  process.env.SCORING_AI_MODEL_URL =
    "https://scoring.example.test/v1/chat/completions";
  process.env.SCORING_AI_API_KEY = "scoring-secret-key";
  process.env.SCORING_AI_TIMEOUT_MS = "15000";
  process.env.SCORING_AI_MAX_RETRIES = "2";
  process.env.SCORING_AI_TEMPERATURE = "0.0";
}

function clearAllAiEnv() {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("RESEARCH_AI_") ||
      key.startsWith("SCORING_AI_") ||
      key.startsWith("INTERPRETATION_AI_") ||
      key.startsWith("CONTACT_RESEARCH_AI_") ||
      key.startsWith("PRODUCT_AI_") ||
      key.startsWith("PERSONA_AI_") ||
      key.startsWith("EMAIL_AI_") ||
      key.startsWith("EMAIL_FACTS_AI_") ||
      key.startsWith("CONSULTATION_AI_") ||
      key.startsWith("ASSET_AI_") ||
      key.startsWith("AI_")
    ) {
      delete process.env[key];
    }
  }
}

describe("role-specific AI configuration", () => {
  it("keeps Research AI and Scoring AI configs independent", () => {
    clearAllAiEnv();
    setResearchEnv("research-only-model");
    setScoringEnv("scoring-only-model");

    const research = getResearchAiConfig();
    const scoring = getScoringAiConfig();

    expect(research.role).toBe("research");
    expect(scoring.role).toBe("scoring");
    expect(research.model).toBe("research-only-model");
    expect(scoring.model).toBe("scoring-only-model");
    expect(research.modelUrl).toContain("research.example.test");
    expect(scoring.modelUrl).toContain("scoring.example.test");
    expect(research.apiKey).toBe("research-secret-key");
    expect(scoring.apiKey).toBe("scoring-secret-key");
    expect(research.timeoutMs).toBe(12000);
    expect(scoring.timeoutMs).toBe(15000);
  });

  it("does not silently fall back to legacy AI_* variables", () => {
    clearAllAiEnv();
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_MODEL = "legacy-model";
    process.env.AI_MODEL_URL = "https://legacy.example.test/v1/chat/completions";
    process.env.AI_API_KEY = "legacy-key";

    expect(isResearchAiConfigured()).toBe(false);
    expect(isScoringAiConfigured()).toBe(false);
    expect(() => getResearchAiConfig()).toThrow(/Automated company research is not configured/);
    expect(() => getScoringAiConfig()).toThrow(/AI scoring is not configured/);
  });

  it("allows Research AI configured while Scoring AI is missing", () => {
    clearAllAiEnv();
    setResearchEnv();
    expect(isResearchAiConfigured()).toBe(true);
    expect(isScoringAiConfigured()).toBe(false);
    expect(() => getScoringAiConfig()).toThrow(AiConfigError);
  });

  it("allows Scoring AI configured while Research AI is missing", () => {
    clearAllAiEnv();
    setScoringEnv();
    expect(isScoringAiConfigured()).toBe(true);
    expect(isResearchAiConfigured()).toBe(false);
    expect(() => getResearchAiConfig()).toThrow(AiConfigError);
  });

  it("research config never reads scoring model", () => {
    clearAllAiEnv();
    setResearchEnv("must-be-research");
    setScoringEnv("must-not-leak-into-research");
    expect(getResearchAiConfig().model).toBe("must-be-research");
    expect(getResearchAiConfig().model).not.toBe("must-not-leak-into-research");
  });

  it("scoring config never reads research model", () => {
    clearAllAiEnv();
    setResearchEnv("must-not-leak-into-scoring");
    setScoringEnv("must-be-scoring");
    expect(getScoringAiConfig().model).toBe("must-be-scoring");
    expect(getScoringAiConfig().model).not.toBe("must-not-leak-into-scoring");
  });

  it("provider factory works with role-specific configuration", () => {
    clearAllAiEnv();
    setResearchEnv("factory-research");
    setScoringEnv("factory-scoring");
    const researchProvider = createAiProvider(getResearchAiConfig());
    const scoringProvider = createAiProvider(getScoringAiConfig());
    expect(researchProvider).toBeTruthy();
    expect(scoringProvider).toBeTruthy();
    expect(getResearchAiConfig().model).not.toBe(getScoringAiConfig().model);
  });

  it("keeps Email AI isolated and reads model from EMAIL_AI_MODEL", () => {
    clearAllAiEnv();
    setResearchEnv("must-not-leak-into-email");
    process.env.EMAIL_AI_PROVIDER = "openai-responses";
    process.env.EMAIL_AI_MODEL = "email-model-from-env";
    process.env.EMAIL_AI_MODEL_URL =
      "https://api.openai.com/v1/responses";
    process.env.EMAIL_AI_API_KEY = "email-secret-key";

    expect(isEmailAiConfigured()).toBe(true);
    const email = getEmailAiConfig();
    expect(email.role).toBe("email");
    expect(email.provider).toBe("openai-responses");
    expect(email.model).toBe("email-model-from-env");
    expect(email.model).not.toBe(getResearchAiConfig().model);
  });

  it("does not fall back to another role when Email AI is missing", () => {
    clearAllAiEnv();
    setScoringEnv();
    expect(isEmailAiConfigured()).toBe(false);
    expect(() => getEmailAiConfig()).toThrow(
      /Missing required environment variable: EMAIL_AI_/,
    );
  });

  it("keeps Email Facts AI isolated and reads model from EMAIL_FACTS_AI_MODEL", () => {
    clearAllAiEnv();
    setResearchEnv("must-not-leak-into-email-facts");
    process.env.EMAIL_FACTS_AI_PROVIDER = "openai-compatible";
    process.env.EMAIL_FACTS_AI_MODEL = "email-facts-model-from-env";
    process.env.EMAIL_FACTS_AI_MODEL_URL =
      "https://facts.example.test/v1/chat/completions";
    process.env.EMAIL_FACTS_AI_API_KEY = "email-facts-secret-key";

    expect(isEmailFactsAiConfigured()).toBe(true);
    const facts = getEmailFactsAiConfig();
    expect(facts.role).toBe("email_facts");
    expect(facts.provider).toBe("openai-compatible");
    expect(facts.model).toBe("email-facts-model-from-env");
    expect(facts.model).not.toBe(getResearchAiConfig().model);
  });

  it("allows openai-responses for Research and Scoring independently", () => {
    clearAllAiEnv();
    process.env.RESEARCH_AI_PROVIDER = "openai-responses";
    process.env.RESEARCH_AI_MODEL = "research-responses";
    process.env.RESEARCH_AI_MODEL_URL = "https://api.example.test/v1/responses";
    process.env.RESEARCH_AI_API_KEY = "research-key";
    process.env.SCORING_AI_PROVIDER = "openai-responses";
    process.env.SCORING_AI_MODEL = "scoring-responses";
    process.env.SCORING_AI_MODEL_URL = "https://api.openai.com/v1/responses";
    process.env.SCORING_AI_API_KEY = "scoring-key";

    expect(getResearchAiConfig().provider).toBe("openai-responses");
    expect(getScoringAiConfig().provider).toBe("openai-responses");
    expect(getResearchAiConfig().model).not.toBe(getScoringAiConfig().model);
  });

  it("allows openai-responses for Email Facts AI (same host as other roles)", () => {
    clearAllAiEnv();
    process.env.EMAIL_FACTS_AI_PROVIDER = "openai-responses";
    process.env.EMAIL_FACTS_AI_MODEL = "email-facts-responses";
    process.env.EMAIL_FACTS_AI_MODEL_URL =
      "https://api.openai.com/v1/responses";
    process.env.EMAIL_FACTS_AI_API_KEY = "email-facts-key";

    expect(isEmailFactsAiConfigured()).toBe(true);
    expect(getEmailFactsAiConfig().provider).toBe("openai-responses");
  });

  it("never includes API key in sanitized URL identifier", () => {
    const id = sanitizeModelUrlIdentifier(
      "https://user:secret@example.test/v1/chat/completions?api_key=abc",
    );
    expect(id).not.toContain("secret");
    expect(id).not.toContain("abc");
    expect(id).toContain("example.test");
  });

  it("fails loudly when CONSULTATION_AI configuration is missing", () => {
    clearAllAiEnv();
    expect(() => assertConsultationAiConfigured()).toThrow(/CONSULTATION_AI_API_KEY|Consultation AI is not configured/);
    const instrumentation = readFileSync("src/instrumentation.ts", "utf8");
    expect(instrumentation).toContain("assertConsultationAiConfigured");
    expect(instrumentation).toContain("assertAssetAiConfigured");
  });

  it("redacts research and scoring API keys from log text", () => {
    const researchKey = "research-secret-aaa";
    const scoringKey = "scoring-secret-bbb";
    expect(redactSecrets(`Bearer ${researchKey}`, researchKey)).not.toContain(
      researchKey,
    );
    expect(redactSecrets(`Bearer ${scoringKey}`, scoringKey)).not.toContain(
      scoringKey,
    );
  });
});
