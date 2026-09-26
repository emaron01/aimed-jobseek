import type { UsageEventStatus } from "@prisma/client";
import type {
  AiCallUsageContext,
  AiStructuredRequest,
  AiUsageMetadata,
} from "@/lib/ai/types";
import { recordUsageEvent } from "@/lib/usage/events-service";

export type { AiCallUsageContext };

export function applicationPromptCacheKey(campaignId: string): string {
  return `application:${campaignId}`;
}

export function aiCallTracking(input: AiCallUsageContext): Pick<
  AiStructuredRequest<unknown>,
  "usage" | "promptCacheKey"
> {
  return {
    usage: input,
    promptCacheKey: input.campaignId
      ? applicationPromptCacheKey(input.campaignId)
      : undefined,
  };
}

export async function recordAiStructuredUsage(input: {
  context: AiCallUsageContext;
  provider: string;
  model: string;
  usage?: AiUsageMetadata | null;
  durationMs: number;
  status: UsageEventStatus;
}): Promise<void> {
  await recordUsageEvent({
    organizationId: input.context.organizationId,
    userId: input.context.userId ?? null,
    category: input.context.category,
    operation: input.context.operation,
    provider: input.provider,
    model: input.model,
    campaignId: input.context.campaignId ?? null,
    companyId: input.context.companyId ?? null,
    contactId: input.context.contactId ?? null,
    inputTokens: input.usage?.inputTokens ?? null,
    cachedInputTokens: input.usage?.cachedInputTokens ?? null,
    cacheWriteTokens: input.usage?.cacheWriteTokens ?? null,
    outputTokens: input.usage?.outputTokens ?? null,
    webSearchCalls: input.usage?.webSearchCalls ?? null,
    status: input.status,
    durationMs: input.durationMs,
  });
}
