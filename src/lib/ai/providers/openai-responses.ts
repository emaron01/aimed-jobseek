import type { AiConfig } from "@/lib/ai/config";
import {
  AiProviderError,
  AiTimeoutError,
  AiValidationError,
} from "@/lib/ai/errors";
import { redactSecrets } from "@/lib/ai/redact";
import { buildOpenAiJsonSchemaFormat } from "@/lib/ai/zod-json-schema";
import type {
  AiProvider,
  AiStructuredRequest,
  AiStructuredResponse,
  NormalizedRetrievedSource,
  AiUsageMetadata,
} from "@/lib/ai/types";
import { recordAiStructuredUsage } from "@/lib/usage/ai-call";
import { ZodError } from "zod";
import { vocab } from "@/lib/product-config";

/**
 * Resolve the Responses API URL from a role-specific *_AI_MODEL_URL.
 * Accepted forms:
 * - https://api.openai.com/v1/responses (used as-is)
 * - https://api.openai.com/v1 (appends /responses)
 * - https://api.openai.com/v1/chat/completions (rewrites to /responses)
 * - https://api.openai.com (appends /v1/responses)
 *
 * Endpoint construction stays inside this adapter only.
 */
export function resolveOpenAiResponsesUrl(configuredUrl: string): string {
  const trimmed = configuredUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new AiProviderError(
      "AI model URL is empty; cannot resolve Responses endpoint.",
      { retryable: false },
    );
  }

  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path.endsWith("/responses")) {
      return `${url.origin}${path}`;
    }
    if (path.endsWith("/chat/completions")) {
      return `${url.origin}${path.replace(/\/chat\/completions$/, "/responses")}`;
    }
    if (path === "/v1" || path.endsWith("/v1")) {
      return `${url.origin}${path}/responses`;
    }
    if (path === "/" || path === "") {
      return `${url.origin}/v1/responses`;
    }
    // Custom gateway path — append /responses
    return `${url.origin}${path}/responses`;
  } catch {
    throw new AiProviderError(
      "AI model URL is invalid; cannot resolve Responses endpoint.",
      { retryable: false },
    );
  }
}

type ParsedResponsesPayload = {
  outputText: string;
  retrievedSources: NormalizedRetrievedSource[];
  webSearchCalls: number;
  usage: AiUsageMetadata;
};

type ResponsesRoleMode = "research_web_search" | "structured_only";

function structuredTextFormat(request: AiStructuredRequest<unknown>) {
  return {
    format: buildOpenAiJsonSchemaFormat(
      request.schemaName ?? "structured_response",
      request.schema,
    ),
  };
}

function parseStructuredOutput<T>(
  request: AiStructuredRequest<T>,
  dataJson: unknown,
  label: string,
  usage?: AiUsageMetadata,
  rawText?: string,
): { data: T; coercedFields: string[] } {
  const rawTextPreview =
    typeof rawText === "string" && rawText.trim()
      ? redactSecrets(rawText).slice(0, 800)
      : undefined;

  if (request.parseOutput) {
    try {
      const parsed = request.parseOutput(dataJson);
      return {
        data: parsed.data,
        coercedFields: parsed.coercedFields,
      };
    } catch (error) {
      if (error instanceof AiValidationError) throw error;
      if (error instanceof ZodError) {
        throw new AiValidationError(
          `${label} structured output failed validation after normalization.`,
          {
            issues: error.issues.slice(0, 30).map((issue) => ({
              path: issue.path.join(".") || "(root)",
              code: issue.code,
              expected:
                "expected" in issue && issue.expected != null
                  ? String(issue.expected).slice(0, 80)
                  : undefined,
            })),
            usage,
            rawTextPreview,
          },
        );
      }
      throw new AiValidationError(
        `${label} structured output failed validation after normalization.`,
        { usage, rawTextPreview },
      );
    }
  }

  const validated = request.schema.safeParse(dataJson);
  if (!validated.success) {
    throw new AiValidationError(
      `${label} structured output failed validation.`,
      {
        issues: validated.error.issues.slice(0, 30).map((issue) => ({
          path: issue.path.join(".") || "(root)",
          code: issue.code,
          expected:
            "expected" in issue && issue.expected != null
              ? String(issue.expected).slice(0, 80)
              : undefined,
        })),
        usage,
        rawTextPreview,
      },
    );
  }
  return { data: validated.data, coercedFields: [] };
}

function roleMode(config: AiConfig): ResponsesRoleMode {
  if (config.role === "research") return "research_web_search";
  if (
    config.role === "scoring" ||
    config.role === "interpretation" ||
    config.role === "contact_research" ||
    config.role === "product" ||
    config.role === "persona" ||
    config.role === "email" ||
    // Structured JSON pick of company-fact candidates — same as scoring/product.
    // Was omitted when email_facts was added to parseProvider; no special mode needed.
    config.role === "email_facts" ||
    config.role === "consultation" ||
    config.role === "consultation_reply" ||
    config.role === "asset"
  ) {
    return "structured_only";
  }
  throw new AiProviderError(
    `openai-responses adapter does not support role "${config.role}".`,
    { retryable: false },
  );
}

function roleLabel(config: AiConfig): string {
  switch (config.role) {
    case "research":
      return "Research";
    case "scoring":
      return "Scoring";
    case "interpretation":
      return "Interpretation";
    case "contact_research":
      return `${vocab.contact.Singular} research`;
    case "product":
      return vocab.product.Singular;
    case "persona":
      return vocab.persona.Singular;
    case "email":
      return "Email generation";
    case "email_facts":
      return "Email company-fact selection";
    case "consultation":
      return "Consultation";
    case "consultation_reply":
      return "Consultation reply";
    case "asset":
      return "Application asset generation";
    default:
      return "AI";
  }
}

/**
 * GPT-5 / reasoning models reject non-default temperature on Responses.
 * Omit the field entirely rather than sending env defaults (e.g. 0.2).
 */
export function responsesModelOmitsTemperature(model: string): boolean {
  const m = model.trim().toLowerCase();
  return (
    m.startsWith("gpt-5") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4") ||
    /^o[0-9]/.test(m)
  );
}

function parseOpenAiErrorBody(safeBody: string): {
  code: string | null;
  type: string | null;
} {
  try {
    const parsed = JSON.parse(safeBody) as {
      error?: { code?: string; type?: string };
    };
    return {
      code: typeof parsed.error?.code === "string" ? parsed.error.code : null,
      type: typeof parsed.error?.type === "string" ? parsed.error.type : null,
    };
  } catch {
    return { code: null, type: null };
  }
}


/**
 * OpenAI Responses API adapter.
 *
 * Research (RESEARCH_AI_PROVIDER=openai-responses):
 * - Explicitly enables tools: [{ type: "web_search" }]
 * - Requests include: ["web_search_call.action.sources"]
 * - Requires usable web search activity/sources
 *
 * Scoring / other structured roles (SCORING_AI_PROVIDER=openai-responses):
 * - Responses API without web_search tools
 * - JSON structured output only
 *
 * Shared:
 * - store: false (stateless; app persists results)
 */
export function createOpenAiResponsesProvider(config: AiConfig): AiProvider {
  const mode = roleMode(config);
  const label = roleLabel(config);
  const responsesUrl = resolveOpenAiResponsesUrl(config.modelUrl);

  return {
    async generateStructured<T>(
      request: AiStructuredRequest<T>,
    ): Promise<AiStructuredResponse<T>> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      const started = Date.now();
      let recordedUsage: AiUsageMetadata | undefined;

      try {
        const input = request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        }));

        const includeTemperature = !responsesModelOmitsTemperature(config.model);
        const reasoning =
          config.reasoningEffort != null
            ? { effort: config.reasoningEffort }
            : undefined;

        const useWebSearch =
          mode === "research_web_search" && request.webSearchEnabled !== false;
        const body = useWebSearch
            ? {
                model: config.model,
                input,
                tools: [{ type: "web_search" }],
                // Force tool use so research cannot silently skip browsing.
                tool_choice: "required" as const,
                include: ["web_search_call.action.sources"],
                store: false,
                ...(includeTemperature
                  ? { temperature: config.temperature }
                  : {}),
                ...(reasoning ? { reasoning } : {}),
                ...(request.promptCacheKey
                  ? { prompt_cache_key: request.promptCacheKey }
                  : {}),
                text: structuredTextFormat(request),
              }
            : {
                model: config.model,
                input,
                store: false,
                ...(includeTemperature
                  ? { temperature: config.temperature }
                  : {}),
                ...(reasoning ? { reasoning } : {}),
                ...(request.promptCacheKey
                  ? { prompt_cache_key: request.promptCacheKey }
                  : {}),
                text: structuredTextFormat(request),
              };

        const response = await fetch(responsesUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const rawBody = await response.text();
        const safeBody = redactSecrets(rawBody, config.apiKey);

        if (!response.ok) {
          const retryable =
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          const unsupportedTool =
            useWebSearch &&
            response.status === 400 &&
            /web_search|tool|not support/i.test(safeBody);
          const { code, type } = parseOpenAiErrorBody(safeBody);

          throw new AiProviderError(
            unsupportedTool
              ? `Research web search is not supported by the configured model/endpoint (${response.status}): ${safeBody.slice(0, 400)}`
              : `${label} Responses API request failed (${response.status}): ${safeBody.slice(0, 400)}`,
            {
              retryable: unsupportedTool ? false : retryable,
              status: response.status,
              providerCode: code,
              providerType: type,
            },
          );
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawBody);
        } catch {
          throw new AiProviderError(
            `${label} Responses API returned non-JSON response.`,
            { retryable: false },
          );
        }

        const parsed = parseResponsesPayload(parsedJson, config.apiKey, label);
        recordedUsage = parsed.usage;

        if (
          useWebSearch &&
          parsed.webSearchCalls === 0 &&
          parsed.retrievedSources.length === 0
        ) {
          throw new AiProviderError(
            "Research web search did not return usable search activity or sources. Check model/tool support.",
            { retryable: false },
          );
        }

        let dataJson: unknown;
        try {
          dataJson = JSON.parse(extractJsonObject(parsed.outputText));
        } catch {
          throw new AiValidationError(
            `${label} Responses API returned content that is not valid JSON.`,
            {
              usage: parsed.usage,
              rawTextPreview: redactSecrets(parsed.outputText).slice(0, 800),
            },
          );
        }

        const validated = parseStructuredOutput(
          request,
          dataJson,
          label,
          {
            ...parsed.usage,
            webSearchCalls: useWebSearch ? parsed.webSearchCalls : 0,
          },
          parsed.outputText,
        );

        const result = {
          data: validated.data,
          rawText: parsed.outputText,
          provider: config.provider,
          model: config.model,
          modelUrlIdentifier: config.modelUrlIdentifier,
          retrievedSources: useWebSearch ? parsed.retrievedSources : [],
          usage: {
            ...parsed.usage,
            webSearchCalls: useWebSearch ? parsed.webSearchCalls : 0,
          },
          coercedFields:
            validated.coercedFields.length > 0
              ? validated.coercedFields
              : undefined,
        };
        if (request.usage) {
          await recordAiStructuredUsage({
            context: request.usage,
            provider: config.provider,
            model: config.model,
            usage: result.usage,
            durationMs: Date.now() - started,
            status: "SUCCESS",
          });
        }
        return result;
      } catch (error) {
        const usageFromError =
          error instanceof AiValidationError ? error.usage : recordedUsage;
        if (request.usage) {
          try {
            await recordAiStructuredUsage({
              context: request.usage,
              provider: config.provider,
              model: config.model,
              usage: usageFromError,
              durationMs: Date.now() - started,
              status: "FAILED",
            });
          } catch (recordError) {
            console.error(
              JSON.stringify({
                event: "ai_usage_record_failed",
                message:
                  recordError instanceof Error
                    ? recordError.message
                    : "unknown",
              }),
            );
          }
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new AiTimeoutError(
            `${label} Responses API timed out after ${config.timeoutMs}ms.`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function parseResponsesUsage(
  usageRaw: Record<string, unknown> | undefined,
): AiUsageMetadata {
  const details =
    usageRaw?.input_tokens_details &&
    typeof usageRaw.input_tokens_details === "object"
      ? (usageRaw.input_tokens_details as Record<string, unknown>)
      : usageRaw?.prompt_tokens_details &&
          typeof usageRaw.prompt_tokens_details === "object"
        ? (usageRaw.prompt_tokens_details as Record<string, unknown>)
        : undefined;
  const cachedTokens =
    typeof details?.cached_tokens === "number"
      ? details.cached_tokens
      : undefined;
  const cacheWriteTokens =
    typeof details?.cache_write_tokens === "number"
      ? details.cache_write_tokens
      : typeof details?.cache_creation_input_tokens === "number"
        ? details.cache_creation_input_tokens
        : undefined;
  return {
    inputTokens:
      typeof usageRaw?.input_tokens === "number"
        ? usageRaw.input_tokens
        : typeof usageRaw?.prompt_tokens === "number"
          ? usageRaw.prompt_tokens
          : undefined,
    cachedInputTokens: cachedTokens,
    cacheWriteTokens,
    outputTokens:
      typeof usageRaw?.output_tokens === "number"
        ? usageRaw.output_tokens
        : typeof usageRaw?.completion_tokens === "number"
          ? usageRaw.completion_tokens
          : undefined,
  };
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/**
 * Normalize Responses API output into plain text + source allowlist.
 * Provider-specific shapes stay inside this module.
 */
export function parseResponsesPayload(
  payload: unknown,
  apiKey?: string,
  label = "Research",
): ParsedResponsesPayload {
  if (!payload || typeof payload !== "object") {
    throw new AiProviderError("Invalid Responses API payload.", {
      retryable: false,
    });
  }

  const root = payload as Record<string, unknown>;
  const sourceMap = new Map<string, NormalizedRetrievedSource>();
  let webSearchCalls = 0;
  const textParts: string[] = [];

  const output = Array.isArray(root.output) ? root.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? "");

    if (type === "web_search_call") {
      webSearchCalls += 1;
      const action = row.action as Record<string, unknown> | undefined;
      const sources = action?.sources;
      if (Array.isArray(sources)) {
        for (const source of sources) {
          addNormalizedSource(sourceMap, source);
        }
      }
      // Some payloads nest results on the call itself
      if (Array.isArray(row.results)) {
        for (const result of row.results) {
          addNormalizedSource(sourceMap, result);
        }
      }
    }

    if (type === "message") {
      const content = Array.isArray(row.content) ? row.content : [];
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const block = part as Record<string, unknown>;
        if (block.type === "output_text" && typeof block.text === "string") {
          textParts.push(block.text);
        }
        const annotations = Array.isArray(block.annotations)
          ? block.annotations
          : [];
        for (const annotation of annotations) {
          if (!annotation || typeof annotation !== "object") continue;
          const ann = annotation as Record<string, unknown>;
          if (ann.type === "url_citation") {
            addNormalizedSource(sourceMap, {
              url: ann.url,
              title: ann.title,
            });
          }
        }
      }
    }
  }

  // Fallback: some SDKs expose output_text at the root
  if (textParts.length === 0 && typeof root.output_text === "string") {
    textParts.push(root.output_text);
  }

  const usageRaw = root.usage as Record<string, unknown> | undefined;
  const usage = parseResponsesUsage(usageRaw);

  const outputText = textParts.join("\n").trim();
  if (!outputText) {
    const safe = redactSecrets(JSON.stringify(payload).slice(0, 200), apiKey);
    throw new AiProviderError(
      `${label} Responses API returned no output text. ${safe}`,
      { retryable: false },
    );
  }

  return {
    outputText,
    retrievedSources: [...sourceMap.values()],
    webSearchCalls,
    usage,
  };
}

function addNormalizedSource(
  map: Map<string, NormalizedRetrievedSource>,
  raw: unknown,
): void {
  if (!raw || typeof raw !== "object") return;
  const row = raw as Record<string, unknown>;
  const url = typeof row.url === "string" ? row.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) return;
  let key: string;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    key = parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return;
  }
  if (map.has(key)) return;
  map.set(key, {
    url,
    title: typeof row.title === "string" ? row.title : null,
    publisher: typeof row.publisher === "string" ? row.publisher : null,
  });
}

/** Test helper: inspect whether a request body enables web search. */
export function responsesRequestEnablesWebSearch(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const tools = (body as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return false;
  return tools.some(
    (tool) =>
      tool &&
      typeof tool === "object" &&
      (tool as { type?: string }).type === "web_search",
  );
}
