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
  AiUsageMetadata,
} from "@/lib/ai/types";
import { parseResponsesUsage } from "@/lib/ai/providers/openai-responses";
import { recordAiStructuredUsage } from "@/lib/usage/ai-call";
import { ZodError } from "zod";

/**
 * Generic OpenAI-compatible chat completions adapter.
 * Endpoint and model come entirely from the passed AiConfig (role-specific env).
 */
export function createOpenAiCompatibleProvider(
  config: AiConfig,
): AiProvider {
  return {
    async generateStructured<T>(
      request: AiStructuredRequest<T>,
    ): Promise<AiStructuredResponse<T>> {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        config.timeoutMs,
      );
      const started = Date.now();
      let recordedUsage: AiUsageMetadata | undefined;

      try {
        const response = await fetch(config.modelUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            temperature: config.temperature,
            response_format: {
              type: "json_schema",
              json_schema: buildOpenAiJsonSchemaFormat(
                request.schemaName ?? "structured_response",
                request.schema,
              ),
            },
            messages: request.messages,
          }),
          signal: controller.signal,
        });

        const rawBody = await response.text();
        const safeBody = redactSecrets(rawBody, config.apiKey);

        if (!response.ok) {
          const retryable =
            response.status === 408 ||
            response.status === 429 ||
            response.status >= 500;
          throw new AiProviderError(
            `AI provider request failed (${response.status}): ${safeBody.slice(0, 400)}`,
            { retryable, status: response.status },
          );
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawBody);
        } catch {
          throw new AiProviderError(
            "AI provider returned non-JSON response.",
            { retryable: false },
          );
        }

        recordedUsage = parseResponsesUsage(
          (parsedJson as { usage?: Record<string, unknown> }).usage,
        );
        const content = extractMessageContent(parsedJson);
        if (!content) {
          throw new AiProviderError(
            "AI provider response missing message content.",
            { retryable: false },
          );
        }

        let dataJson: unknown;
        try {
          dataJson = JSON.parse(content);
        } catch {
          throw new AiValidationError(
            "AI provider returned content that is not valid JSON.",
            {
              rawTextPreview: redactSecrets(content).slice(0, 800),
            },
          );
        }

        let data: T;
        let coercedFields: string[] = [];
        if (request.parseOutput) {
          try {
            const parsed = request.parseOutput(dataJson);
            data = parsed.data;
            coercedFields = parsed.coercedFields;
          } catch (error) {
            if (error instanceof AiValidationError) throw error;
            if (error instanceof ZodError) {
              throw new AiValidationError(
                `AI structured output failed validation: ${error.message}`,
                {
                  issues: error.issues.slice(0, 30).map((issue) => ({
                    path: issue.path.join(".") || "(root)",
                    code: issue.code,
                    expected:
                      "expected" in issue && issue.expected != null
                        ? String(issue.expected).slice(0, 80)
                        : undefined,
                  })),
                  rawTextPreview: redactSecrets(content).slice(0, 800),
                },
              );
            }
            throw error;
          }
        } else {
          const validated = request.schema.safeParse(dataJson);
          if (!validated.success) {
            throw new AiValidationError(
              `AI structured output failed validation: ${validated.error.message}`,
              {
                issues: validated.error.issues.slice(0, 30).map((issue) => ({
                  path: issue.path.join(".") || "(root)",
                  code: issue.code,
                  expected:
                    "expected" in issue && issue.expected != null
                      ? String(issue.expected).slice(0, 80)
                      : undefined,
                })),
                rawTextPreview: redactSecrets(content).slice(0, 800),
              },
            );
          }
          data = validated.data;
        }

        const result = {
          data,
          rawText: content,
          provider: config.provider,
          model: config.model,
          modelUrlIdentifier: config.modelUrlIdentifier,
          usage: recordedUsage,
          coercedFields: coercedFields.length > 0 ? coercedFields : undefined,
        };
        if (request.usage) {
          await recordAiStructuredUsage({
            context: request.usage,
            provider: config.provider,
            model: config.model,
            usage: recordedUsage,
            durationMs: Date.now() - started,
            status: "SUCCESS",
          });
        }
        return result;
      } catch (error) {
        if (request.usage) {
          try {
            await recordAiStructuredUsage({
              context: request.usage,
              provider: config.provider,
              model: config.model,
              usage:
                error instanceof AiValidationError
                  ? error.usage
                  : recordedUsage,
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
            `AI request timed out after ${config.timeoutMs}ms.`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function extractMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } })
    ?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content;
  return null;
}
