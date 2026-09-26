import type {
  UsageCategory,
  UsageOperation,
} from "@prisma/client";
import type { z } from "zod";

export type AiMessageRole = "system" | "user" | "assistant";

export type AiCallUsageContext = {
  organizationId: string;
  userId?: string | null;
  campaignId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  category: UsageCategory;
  operation: UsageOperation;
};

export type AiMessage = {
  role: AiMessageRole;
  content: string;
};

export type StructuredParseResult<T> = {
  data: T;
  coercedFields: string[];
};

export type AiStructuredRequest<T> = {
  messages: AiMessage[];
  schema: z.ZodType<T>;
  /** Optional schema name for adapters that support named JSON schemas. */
  schemaName?: string;
  /**
   * Optional normalizer/coercer run on raw model JSON before returning.
   * Use when the contract tolerates ambiguous values (defensive layer).
   */
  parseOutput?: (raw: unknown) => StructuredParseResult<T>;
  /**
   * When false on a research-role openai-responses provider, omit web_search
   * tools (website-first / structured-only stage). Default: enabled for research.
   */
  webSearchEnabled?: boolean;
  /** When set, the provider writes a UsageEvent for this call. */
  usage?: AiCallUsageContext;
  /** OpenAI Responses prompt_cache_key — use one key per application. */
  promptCacheKey?: string;
};

/** Adapter-normalized web/tool sources — never OpenAI-specific objects. */
export type NormalizedRetrievedSource = {
  url: string;
  title?: string | null;
  publisher?: string | null;
};

export type AiUsageMetadata = {
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  webSearchCalls?: number;
};

export type AiStructuredResponse<T> = {
  data: T;
  rawText: string;
  provider: string;
  model: string;
  modelUrlIdentifier: string;
  /** Sources recovered from tools (e.g. Responses web_search). */
  retrievedSources?: NormalizedRetrievedSource[];
  usage?: AiUsageMetadata;
  /** Field groups coerced while parsing structured output (if parseOutput used). */
  coercedFields?: string[];
};

export interface AiProvider {
  generateStructured<T>(
    request: AiStructuredRequest<T>,
  ): Promise<AiStructuredResponse<T>>;
}
