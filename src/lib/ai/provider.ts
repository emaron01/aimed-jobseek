import {
  getContactResearchAiConfig,
  getEmailAiConfig,
  getConsultationAiConfig,
  getEmailFactsAiConfig,
  getInterpretationAiConfig,
  getPersonaAiConfig,
  getProductAiConfig,
  getResearchAiConfig,
  getScoringAiConfig,
  type AiConfig,
} from "@/lib/ai/config";
import { AiConfigError } from "@/lib/ai/errors";
import { createOpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";
import { createOpenAiResponsesProvider } from "@/lib/ai/providers/openai-responses";
import type { AiProvider } from "@/lib/ai/types";

/**
 * Build a provider from an explicit role config.
 * Callers must pass research or scoring config — never rely on a shared default.
 */
export function createAiProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case "openai-compatible":
      return createOpenAiCompatibleProvider(config);
    case "openai-responses":
      return createOpenAiResponsesProvider(config);
    default: {
      const _exhaustive: never = config.provider;
      throw new AiConfigError(
        `Unsupported AI provider: ${String(_exhaustive)}.`,
      );
    }
  }
}

const researchCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};
const scoringCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};
const interpretationCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};
const contactResearchCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};
const productCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};
const personaCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};
const emailCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};
const emailFactsCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};
const consultationCache: { key: string; provider: AiProvider | null } = {
  key: "",
  provider: null,
};

function cacheKey(config: AiConfig): string {
  return `${config.role}|${config.provider}|${config.model}|${config.modelUrl}`;
}

/** Research AI only — never uses Scoring AI configuration. */
export function getResearchAiProvider(): AiProvider {
  const config = getResearchAiConfig();
  const key = cacheKey(config);
  if (researchCache.key === key && researchCache.provider) {
    return researchCache.provider;
  }
  const provider = createAiProvider(config);
  researchCache.key = key;
  researchCache.provider = provider;
  return provider;
}

/** Scoring AI only — never uses Research AI configuration. */
export function getScoringAiProvider(): AiProvider {
  const config = getScoringAiConfig();
  const key = cacheKey(config);
  if (scoringCache.key === key && scoringCache.provider) {
    return scoringCache.provider;
  }
  const provider = createAiProvider(config);
  scoringCache.key = key;
  scoringCache.provider = provider;
  return provider;
}

/** Interpretation AI only — never uses Research or Scoring configuration. */
export function getInterpretationAiProvider(): AiProvider {
  const config = getInterpretationAiConfig();
  const key = cacheKey(config);
  if (interpretationCache.key === key && interpretationCache.provider) {
    return interpretationCache.provider;
  }
  const provider = createAiProvider(config);
  interpretationCache.key = key;
  interpretationCache.provider = provider;
  return provider;
}

/** Contact research AI only — never uses Research or Scoring configuration. */
export function getContactResearchAiProvider(): AiProvider {
  const config = getContactResearchAiConfig();
  const key = cacheKey(config);
  if (contactResearchCache.key === key && contactResearchCache.provider) {
    return contactResearchCache.provider;
  }
  const provider = createAiProvider(config);
  contactResearchCache.key = key;
  contactResearchCache.provider = provider;
  return provider;
}

/** Product AI only — never uses Research/Scoring/Interpretation configuration. */
export function getProductAiProvider(): AiProvider {
  const config = getProductAiConfig();
  const key = cacheKey(config);
  if (productCache.key === key && productCache.provider) {
    return productCache.provider;
  }
  const provider = createAiProvider(config);
  productCache.key = key;
  productCache.provider = provider;
  return provider;
}

/** Persona AI only — never uses Product/Research/Scoring configuration. */
export function getPersonaAiProvider(): AiProvider {
  const config = getPersonaAiConfig();
  const key = cacheKey(config);
  if (personaCache.key === key && personaCache.provider) {
    return personaCache.provider;
  }
  const provider = createAiProvider(config);
  personaCache.key = key;
  personaCache.provider = provider;
  return provider;
}

/** Email generation AI only — never uses another role's configuration. */
export function getEmailAiProvider(): AiProvider {
  const config = getEmailAiConfig();
  const key = cacheKey(config);
  if (emailCache.key === key && emailCache.provider) {
    return emailCache.provider;
  }
  const provider = createAiProvider(config);
  emailCache.key = key;
  emailCache.provider = provider;
  return provider;
}

/** Email company-fact selection AI only — never uses Email draft AI configuration. */
export function getEmailFactsAiProvider(): AiProvider {
  const config = getEmailFactsAiConfig();
  const key = cacheKey(config);
  if (emailFactsCache.key === key && emailFactsCache.provider) {
    return emailFactsCache.provider;
  }
  const provider = createAiProvider(config);
  emailFactsCache.key = key;
  emailFactsCache.provider = provider;
  return provider;
}

/** Consultation AI only — never uses another role's configuration. */
export function getConsultationAiProvider(): AiProvider {
  const config = getConsultationAiConfig();
  const key = cacheKey(config);
  if (consultationCache.key === key && consultationCache.provider) {
    return consultationCache.provider;
  }
  const provider = createAiProvider(config);
  consultationCache.key = key;
  consultationCache.provider = provider;
  return provider;
}

/** Test helper to clear provider caches. */
export function clearAiProviderCache(): void {
  researchCache.key = "";
  researchCache.provider = null;
  scoringCache.key = "";
  scoringCache.provider = null;
  interpretationCache.key = "";
  interpretationCache.provider = null;
  contactResearchCache.key = "";
  contactResearchCache.provider = null;
  productCache.key = "";
  productCache.provider = null;
  personaCache.key = "";
  personaCache.provider = null;
  emailCache.key = "";
  emailCache.provider = null;
  emailFactsCache.key = "";
  emailFactsCache.provider = null;
  consultationCache.key = "";
  consultationCache.provider = null;
}
