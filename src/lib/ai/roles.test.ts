import { afterEach, describe, expect, it } from "vitest";
import {
  assertScoringAiRolesConfigured,
  listAiRoleStatuses,
  listUnconfiguredScoringRoles,
  scoringAiReady,
} from "@/lib/ai/roles";
import { AiConfigError } from "@/lib/ai/errors";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

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
      key.startsWith("CONSULTATION_AI_")
    ) {
      delete process.env[key];
    }
  }
}

function setRole(prefix: string) {
  process.env[`${prefix}_PROVIDER`] = "openai-compatible";
  process.env[`${prefix}_MODEL`] = `${prefix}-model`;
  process.env[`${prefix}_MODEL_URL`] = `https://${prefix}.example.test/v1`;
  process.env[`${prefix}_API_KEY`] = `${prefix}-key`;
}

describe("AI role readiness", () => {
  it("lists every role and required env without secrets", () => {
    clearAllAiEnv();
    const statuses = listAiRoleStatuses();
    expect(statuses.map((row) => row.role)).toEqual([
      "research",
      "scoring",
      "contact_research",
      "interpretation",
      "product",
      "persona",
      "email",
      "email_facts",
      "consultation",
    ]);
    expect(statuses.every((row) => !row.configured)).toBe(true);
    expect(
      JSON.stringify(statuses),
    ).not.toMatch(/-key/);
  });

  it("treats scoring as unready until scoring and contact research are both set", () => {
    clearAllAiEnv();
    setRole("SCORING_AI");
    expect(scoringAiReady()).toBe(false);
    expect(listUnconfiguredScoringRoles().map((row) => row.role)).toEqual([
      "contact_research",
    ]);
    setRole("CONTACT_RESEARCH_AI");
    expect(scoringAiReady()).toBe(true);
    expect(listUnconfiguredScoringRoles()).toEqual([]);
  });

  it("does not require contact research env when contact research is disabled for the org", () => {
    clearAllAiEnv();
    setRole("SCORING_AI");
    expect(
      listUnconfiguredScoringRoles({ contactResearchEnabled: false }).map(
        (row) => row.role,
      ),
    ).toEqual([]);
    expect(scoringAiReady({ contactResearchEnabled: false })).toBe(true);
  });

  it("throws a loud config error naming the unset scoring roles", () => {
    clearAllAiEnv();
    setRole("SCORING_AI");
    expect(() => assertScoringAiRolesConfigured()).toThrow(AiConfigError);
    expect(() => assertScoringAiRolesConfigured()).toThrow(
      /CONTACT_RESEARCH_AI_PROVIDER/,
    );
  });

  it("surfaces config errors when EMAIL_FACTS vars are set but provider is rejected", () => {
    clearAllAiEnv();
    setRole("EMAIL_FACTS_AI");
    process.env.EMAIL_FACTS_AI_PROVIDER = "not-a-real-provider";
    const facts = listAiRoleStatuses().find((row) => row.role === "email_facts");
    expect(facts?.configured).toBe(false);
    expect(facts?.missingEnv).toEqual([]);
    expect(facts?.configError).toMatch(/Unsupported EMAIL_FACTS_AI_PROVIDER/);
  });

  it("marks email_facts configured when openai-responses is set", () => {
    clearAllAiEnv();
    process.env.EMAIL_FACTS_AI_PROVIDER = "openai-responses";
    process.env.EMAIL_FACTS_AI_MODEL = "facts-model";
    process.env.EMAIL_FACTS_AI_MODEL_URL = "https://api.openai.com/v1/responses";
    process.env.EMAIL_FACTS_AI_API_KEY = "facts-key";
    const facts = listAiRoleStatuses().find((row) => row.role === "email_facts");
    expect(facts?.configured).toBe(true);
    expect(facts?.configError).toBeNull();
  });
});
