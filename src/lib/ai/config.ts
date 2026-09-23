/**
 * Centralized AI configuration — role-specific only.
 * Research and Scoring never share runtime env vars.
 * Do not scatter process.env.* outside this module.
 *
 * Legacy AI_PROVIDER / AI_MODEL / AI_MODEL_URL / AI_API_KEY are NOT used.
 * There is no silent fallback to those names.
 */

import { AiConfigError } from "@/lib/ai/errors";
import { sanitizeModelUrlIdentifier } from "@/lib/ai/redact";
import { vocab } from "@/lib/product-config";

/**
 * Scoring AI supports:
 * - openai-compatible: chat completions
 * - openai-responses: Responses API without web_search
 */
export type ScoringAiProviderKind = "openai-compatible" | "openai-responses";

/**
 * Research AI supports:
 * - openai-compatible: chat completions (no native web_search)
 * - openai-responses: Responses API + built-in web_search (production)
 */
export type ResearchAiProviderKind = "openai-compatible" | "openai-responses";

export type AiProviderKind = ScoringAiProviderKind | ResearchAiProviderKind;

export type AiRole =
  | "research"
  | "scoring"
  | "interpretation"
  | "contact_research"
  | "product"
  | "persona"
  | "email"
  | "email_facts"
  | "consultation"
  | "asset";

/**
 * OpenAI Responses `reasoning.effort` values.
 * Exact support is model-dependent; invalid values fail closed at config time.
 */
export type AiReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export const AI_REASONING_EFFORT_VALUES: readonly AiReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type AiConfig = {
  role: AiRole;
  provider: AiProviderKind;
  model: string;
  modelUrl: string;
  /** Sanitized URL identifier for provenance (no secrets). */
  modelUrlIdentifier: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  /**
   * When set, openai-responses includes `reasoning: { effort }`.
   * Product/Persona AI; other roles leave this null.
   */
  reasoningEffort: AiReasoningEffort | null;
};

type RoleEnv = {
  provider: string;
  model: string;
  modelUrl: string;
  apiKey: string;
  timeoutMs: string;
  maxRetries: string;
  temperature: string;
  /** Product AI only. */
  reasoningEffort?: string;
};

const ROLE_ENV: Record<AiRole, RoleEnv> = {
  research: {
    provider: "RESEARCH_AI_PROVIDER",
    model: "RESEARCH_AI_MODEL",
    modelUrl: "RESEARCH_AI_MODEL_URL",
    apiKey: "RESEARCH_AI_API_KEY",
    timeoutMs: "RESEARCH_AI_TIMEOUT_MS",
    maxRetries: "RESEARCH_AI_MAX_RETRIES",
    temperature: "RESEARCH_AI_TEMPERATURE",
  },
  scoring: {
    provider: "SCORING_AI_PROVIDER",
    model: "SCORING_AI_MODEL",
    modelUrl: "SCORING_AI_MODEL_URL",
    apiKey: "SCORING_AI_API_KEY",
    timeoutMs: "SCORING_AI_TIMEOUT_MS",
    maxRetries: "SCORING_AI_MAX_RETRIES",
    temperature: "SCORING_AI_TEMPERATURE",
  },
  interpretation: {
    provider: "INTERPRETATION_AI_PROVIDER",
    model: "INTERPRETATION_AI_MODEL",
    modelUrl: "INTERPRETATION_AI_MODEL_URL",
    apiKey: "INTERPRETATION_AI_API_KEY",
    timeoutMs: "INTERPRETATION_AI_TIMEOUT_MS",
    maxRetries: "INTERPRETATION_AI_MAX_RETRIES",
    temperature: "INTERPRETATION_AI_TEMPERATURE",
  },
  contact_research: {
    provider: "CONTACT_RESEARCH_AI_PROVIDER",
    model: "CONTACT_RESEARCH_AI_MODEL",
    modelUrl: "CONTACT_RESEARCH_AI_MODEL_URL",
    apiKey: "CONTACT_RESEARCH_AI_API_KEY",
    timeoutMs: "CONTACT_RESEARCH_AI_TIMEOUT_MS",
    maxRetries: "CONTACT_RESEARCH_AI_MAX_RETRIES",
    temperature: "CONTACT_RESEARCH_AI_TEMPERATURE",
  },
  product: {
    provider: "PRODUCT_AI_PROVIDER",
    model: "PRODUCT_AI_MODEL",
    modelUrl: "PRODUCT_AI_MODEL_URL",
    apiKey: "PRODUCT_AI_API_KEY",
    timeoutMs: "PRODUCT_AI_TIMEOUT_MS",
    maxRetries: "PRODUCT_AI_MAX_RETRIES",
    temperature: "PRODUCT_AI_TEMPERATURE",
    reasoningEffort: "PRODUCT_AI_REASONING_EFFORT",
  },
  persona: {
    provider: "PERSONA_AI_PROVIDER",
    model: "PERSONA_AI_MODEL",
    modelUrl: "PERSONA_AI_MODEL_URL",
    apiKey: "PERSONA_AI_API_KEY",
    timeoutMs: "PERSONA_AI_TIMEOUT_MS",
    maxRetries: "PERSONA_AI_MAX_RETRIES",
    temperature: "PERSONA_AI_TEMPERATURE",
    reasoningEffort: "PERSONA_AI_REASONING_EFFORT",
  },
  email: {
    provider: "EMAIL_AI_PROVIDER",
    model: "EMAIL_AI_MODEL",
    modelUrl: "EMAIL_AI_MODEL_URL",
    apiKey: "EMAIL_AI_API_KEY",
    timeoutMs: "EMAIL_AI_TIMEOUT_MS",
    maxRetries: "EMAIL_AI_MAX_RETRIES",
    temperature: "EMAIL_AI_TEMPERATURE",
  },
  email_facts: {
    provider: "EMAIL_FACTS_AI_PROVIDER",
    model: "EMAIL_FACTS_AI_MODEL",
    modelUrl: "EMAIL_FACTS_AI_MODEL_URL",
    apiKey: "EMAIL_FACTS_AI_API_KEY",
    timeoutMs: "EMAIL_FACTS_AI_TIMEOUT_MS",
    maxRetries: "EMAIL_FACTS_AI_MAX_RETRIES",
    temperature: "EMAIL_FACTS_AI_TEMPERATURE",
  },
  consultation: {
    provider: "CONSULTATION_AI_PROVIDER",
    model: "CONSULTATION_AI_MODEL",
    modelUrl: "CONSULTATION_AI_MODEL_URL",
    apiKey: "CONSULTATION_AI_API_KEY",
    timeoutMs: "CONSULTATION_AI_TIMEOUT_MS",
    maxRetries: "CONSULTATION_AI_MAX_RETRIES",
    temperature: "CONSULTATION_AI_TEMPERATURE",
  },
  asset: {
    provider: "ASSET_AI_PROVIDER",
    model: "ASSET_AI_MODEL",
    modelUrl: "ASSET_AI_MODEL_URL",
    apiKey: "ASSET_AI_API_KEY",
    timeoutMs: "ASSET_AI_TIMEOUT_MS",
    maxRetries: "ASSET_AI_MAX_RETRIES",
    temperature: "ASSET_AI_TEMPERATURE",
  },
};

function notConfiguredMessage(role: AiRole): string {
  switch (role) {
    case "research":
      return "Automated company research is not configured.";
    case "scoring":
      return "AI scoring is not configured.";
    case "interpretation":
      return `${vocab.icp.singular} and ${vocab.persona.singular} interpretation is not configured.`;
    case "contact_research":
      return `${vocab.contact.Singular} role research is not configured.`;
    case "product":
      return `${vocab.product.Singular} research & assisted setup AI is not configured.`;
    case "persona":
      return `${vocab.persona.Singular} research & synthesis AI is not configured.`;
    case "email":
      return "Email generation AI is not configured.";
    case "email_facts":
      return "Email company-fact selection AI is not configured.";
    case "consultation":
      return "Consultation AI is not configured.";
    case "asset":
      return "Application asset AI is not configured.";
  }
}

function readRequired(role: AiRole, name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} Missing required environment variable: ${name}.`,
    );
  }
  return value;
}

function readOptionalNumber(
  role: AiRole,
  name: string,
  fallback: number,
  options?: { min?: number; max?: number },
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} Invalid numeric value for ${name}.`,
    );
  }
  if (options?.min != null && parsed < options.min) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} ${name} must be >= ${options.min}.`,
    );
  }
  if (options?.max != null && parsed > options.max) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} ${name} must be <= ${options.max}.`,
    );
  }
  return parsed;
}

function parseProvider(
  role: AiRole,
  raw: string,
  envName: string,
): AiProviderKind {
  if (raw === "openai-compatible") return "openai-compatible";
  if (raw === "openai-responses") {
    if (
      role === "research" ||
      role === "scoring" ||
      role === "interpretation" ||
      role === "contact_research" ||
      role === "product" ||
      role === "persona" ||
      role === "email" ||
      role === "email_facts" ||
      role === "consultation" ||
      role === "asset"
    ) {
      return "openai-responses";
    }
  }
  throw new AiConfigError(
    `${notConfiguredMessage(role)} Unsupported ${envName} "${raw}". Supported: openai-compatible, openai-responses.`,
  );
}

function readOptionalReasoningEffort(
  role: AiRole,
  name: string,
  fallback: AiReasoningEffort,
): AiReasoningEffort {
  const raw = process.env[name]?.trim().toLowerCase();
  const value = (raw || fallback) as string;
  if (!(AI_REASONING_EFFORT_VALUES as readonly string[]).includes(value)) {
    throw new AiConfigError(
      `${notConfiguredMessage(role)} Invalid ${name} "${raw || fallback}". Supported: ${AI_REASONING_EFFORT_VALUES.join(", ")}.`,
    );
  }
  return value as AiReasoningEffort;
}

function getAiConfigForRole(role: AiRole): AiConfig {
  const env = ROLE_ENV[role];
  const provider = parseProvider(
    role,
    readRequired(role, env.provider),
    env.provider,
  );
  const model = readRequired(role, env.model);
  const modelUrl = readRequired(role, env.modelUrl);
  const apiKey = readRequired(role, env.apiKey);

  return {
    role,
    provider,
    model,
    modelUrl,
    modelUrlIdentifier: sanitizeModelUrlIdentifier(modelUrl),
    apiKey,
    timeoutMs: readOptionalNumber(role, env.timeoutMs, 60_000, { min: 1_000 }),
    maxRetries: readOptionalNumber(role, env.maxRetries, 2, { min: 0, max: 10 }),
    temperature: readOptionalNumber(role, env.temperature, 0.2, {
      min: 0,
      max: 2,
    }),
    // Product/Persona synthesis defaults to low effort; other roles omit reasoning.
    reasoningEffort:
      (role === "product" || role === "persona") && env.reasoningEffort
        ? readOptionalReasoningEffort(role, env.reasoningEffort, "low")
        : null,
  };
}

/** Fail closed for Research AI. Never reads Scoring AI vars. */
export function getResearchAiConfig(): AiConfig {
  return getAiConfigForRole("research");
}

/** Fail closed for Scoring AI. Never reads Research AI vars. */
export function getScoringAiConfig(): AiConfig {
  return getAiConfigForRole("scoring");
}

export function isResearchAiConfigured(): boolean {
  try {
    getResearchAiConfig();
    return true;
  } catch {
    return false;
  }
}

export function isScoringAiConfigured(): boolean {
  try {
    getScoringAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Fail closed for Interpretation AI. Never reads Research or Scoring vars. */
export function getInterpretationAiConfig(): AiConfig {
  return getAiConfigForRole("interpretation");
}

/** Fail closed for Contact Research AI. Never reads Research or Scoring vars. */
export function getContactResearchAiConfig(): AiConfig {
  return getAiConfigForRole("contact_research");
}

export function isInterpretationAiConfigured(): boolean {
  try {
    getInterpretationAiConfig();
    return true;
  } catch {
    return false;
  }
}

export function isContactResearchAiConfigured(): boolean {
  try {
    getContactResearchAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Fail closed for Product AI. Never reads Research/Scoring/Interpretation vars. */
export function getProductAiConfig(): AiConfig {
  return getAiConfigForRole("product");
}

export function isProductAiConfigured(): boolean {
  try {
    getProductAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Fail closed for Persona AI. Never reads Product/Research/Scoring vars. */
export function getPersonaAiConfig(): AiConfig {
  return getAiConfigForRole("persona");
}

export function isPersonaAiConfigured(): boolean {
  try {
    getPersonaAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Fail closed for Email AI. Never reads other role variables. */
export function getEmailAiConfig(): AiConfig {
  return getAiConfigForRole("email");
}

export function isEmailAiConfigured(): boolean {
  try {
    getEmailAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Fail closed for email company-fact selection AI. Never reads Email AI vars. */
export function getEmailFactsAiConfig(): AiConfig {
  return getAiConfigForRole("email_facts");
}

export function isEmailFactsAiConfigured(): boolean {
  try {
    getEmailFactsAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Fail closed for Consultation AI. Never reads another role's variables. */
export function getConsultationAiConfig(): AiConfig {
  return getAiConfigForRole("consultation");
}

export function isConsultationAiConfigured(): boolean {
  try {
    getConsultationAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Fail closed for resume and cover-letter generation. */
export function getAssetAiConfig(): AiConfig {
  const config = getAiConfigForRole("asset");
  return {
    ...config,
    temperature: process.env.ASSET_AI_TEMPERATURE?.trim()
      ? config.temperature
      : 0.5,
  };
}

/** Validation uses the same model and endpoint, always at temperature zero. */
export function getAssetValidationAiConfig(): AiConfig {
  return { ...getAssetAiConfig(), temperature: 0 };
}

export function isAssetAiConfigured(): boolean {
  try {
    getAssetAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** Safe summary for logs/UI — never includes API key. */
export function getAiConfigPublicSummary(config: AiConfig): {
  role: AiRole;
  provider: string;
  model: string;
  modelUrlIdentifier: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  reasoningEffort: AiReasoningEffort | null;
} {
  return {
    role: config.role,
    provider: config.provider,
    model: config.model,
    modelUrlIdentifier: config.modelUrlIdentifier,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    temperature: config.temperature,
    reasoningEffort: config.reasoningEffort,
  };
}

/**
 * Product AI config diagnostic for SUPER_ADMIN / development.
 * Never returns API keys. Reports which PRODUCT_AI_* vars are present.
 */
export function getProductAiConfigDiagnostic(): {
  configured: boolean;
  provider: string | null;
  model: string | null;
  endpointHostPath: string | null;
  timeoutMs: number | null;
  maxRetries: number | null;
  temperature: number | null;
  reasoningEffort: AiReasoningEffort | null;
  missingEnv: string[];
  presentEnv: string[];
} {
  const env = ROLE_ENV.product;
  const keys = [
    env.provider,
    env.model,
    env.modelUrl,
    env.apiKey,
    env.timeoutMs,
    env.maxRetries,
    env.temperature,
    env.reasoningEffort,
  ].filter((k): k is string => Boolean(k));

  const presentEnv: string[] = [];
  const missingEnv: string[] = [];
  for (const key of keys) {
    const val = process.env[key]?.trim();
    // Optional knobs are not required for configured=true
    if (
      key === env.timeoutMs ||
      key === env.maxRetries ||
      key === env.temperature ||
      key === env.reasoningEffort
    ) {
      if (val) presentEnv.push(key);
      continue;
    }
    if (val) presentEnv.push(key);
    else missingEnv.push(key);
  }

  try {
    const config = getProductAiConfig();
    return {
      configured: true,
      provider: config.provider,
      model: config.model,
      endpointHostPath: config.modelUrlIdentifier,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      temperature: config.temperature,
      reasoningEffort: config.reasoningEffort,
      missingEnv,
      presentEnv,
    };
  } catch {
    return {
      configured: false,
      provider: process.env[env.provider]?.trim() || null,
      model: process.env[env.model]?.trim() || null,
      endpointHostPath: process.env[env.modelUrl]?.trim()
        ? sanitizeModelUrlIdentifier(process.env[env.modelUrl]!)
        : null,
      timeoutMs: null,
      maxRetries: null,
      temperature: null,
      reasoningEffort: null,
      missingEnv,
      presentEnv,
    };
  }
}
