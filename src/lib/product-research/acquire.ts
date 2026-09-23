import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import { getResearchPolicy } from "@/lib/usage/policy";
import { extractDocumentText } from "@/lib/product-research/extract";
import { fetchProductPageUrl } from "@/lib/product-research/fetch-url";
import { isUsableProductUrlExtraction } from "@/lib/product-research/extraction-quality";
import {
  createCorrelationId,
  isLinkedInProfileUrl,
  LINKEDIN_PROFILE_BLOCKED_MESSAGE,
  normalizeProductSourceUrl,
  sha256Hex,
} from "@/lib/product-research/url";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import { vocab } from "@/lib/product-config";

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function isUrlSourceFresh(
  freshnessExpiresAt: Date | null | undefined,
): boolean {
  if (!freshnessExpiresAt) return false;
  return freshnessExpiresAt.getTime() > Date.now();
}

export type IngestSourceInput =
  | {
      type: "URL";
      url: string;
      displayName?: string;
      forceRefresh?: boolean;
    }
  | {
      type: "PASTED_TEXT";
      text: string;
      displayName?: string;
    }
  | {
      type: "USER_NOTE";
      text: string;
      displayName?: string;
    }
  | {
      type: "UPLOADED_DOCUMENT";
      filename: string;
      mimeType: string;
      bytes: Uint8Array;
      displayName?: string;
    };

export type AcquireResult = {
  correlationId: string;
  evidenceBundleId: string;
  version: number;
  sourceIds: string[];
  excerpts: EvidenceExcerpt[];
  urlResearchPerformed: boolean;
  webSearchQueriesUsed: number;
  partial: boolean;
  errors: string[];
};

async function requireProduct(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }
  return product;
}

/**
 * Ingest sources and build a new evidence bundle version.
 * Fresh URL sources are reused (not re-fetched) unless forceRefresh.
 */
export async function acquireProductEvidence(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  sources: IngestSourceInput[];
  correlationId?: string;
  /** Explicit user action to refresh stale/fresh URL research. */
  forceUrlRefresh?: boolean;
}): Promise<AcquireResult> {
  const product = await requireProduct(input.organizationId, input.productId);
  const policy = await getResearchPolicy(input.organizationId);
  const correlationId = input.correlationId ?? createCorrelationId();
  const errors: string[] = [];
  let sourceIds: string[] = [];
  let excerpts: EvidenceExcerpt[] = [];
  let urlResearchPerformed = false;

  await prisma.product.update({
    where: { id: product.id },
    data: { setupStatus: "ACQUIRING" },
  });

  // Carry forward still-valid prior sources into the new bundle.
  const priorSources = await prisma.productSource.findMany({
    where: {
      organizationId: input.organizationId,
      productId: input.productId,
      status: { in: ["ACQUIRED", "EXTRACTED"] },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const prior of priorSources) {
    if (prior.sourceType === "URL") {
      const fresh = isUrlSourceFresh(prior.freshnessExpiresAt);
      if (!fresh && !input.forceUrlRefresh) {
        // Keep prior text in bundle but mark that refresh may be offered later.
        if (
          prior.extractedText &&
          isUsableProductUrlExtraction(prior.extractedText)
        ) {
          sourceIds.push(prior.id);
          excerpts.push({
            sourceId: prior.id,
            sourceType: prior.sourceType,
            displayName: prior.displayName,
            text: prior.extractedText,
            url: prior.originalUrl,
          });
        }
        continue;
      }
      if (fresh && !input.forceUrlRefresh) {
        if (
          prior.extractedText &&
          isUsableProductUrlExtraction(prior.extractedText)
        ) {
          sourceIds.push(prior.id);
          excerpts.push({
            sourceId: prior.id,
            sourceType: prior.sourceType,
            displayName: prior.displayName,
            text: prior.extractedText,
            url: prior.originalUrl,
          });
        }
        continue;
      }
    } else if (prior.extractedText) {
      sourceIds.push(prior.id);
      excerpts.push({
        sourceId: prior.id,
        sourceType: prior.sourceType,
        displayName: prior.displayName,
        text: prior.extractedText,
        url: prior.originalUrl,
      });
    }
  }

  for (const src of input.sources) {
    if (src.type === "URL") {
      const normalized = normalizeProductSourceUrl(src.url);
      if (!normalized) {
        errors.push("Invalid URL.");
        continue;
      }
      if (isLinkedInProfileUrl(normalized)) {
        errors.push(LINKEDIN_PROFILE_BLOCKED_MESSAGE);
        continue;
      }

      const existing = await prisma.productSource.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
          normalizedUrlKey: normalized,
          status: { in: ["ACQUIRED", "EXTRACTED"] },
        },
        orderBy: { retrievedAt: "desc" },
      });

      const fresh = existing ? isUrlSourceFresh(existing.freshnessExpiresAt) : false;
      if (existing && fresh && !src.forceRefresh && !input.forceUrlRefresh) {
        if (!sourceIds.includes(existing.id)) {
          if (
            existing.extractedText &&
            isUsableProductUrlExtraction(existing.extractedText)
          ) {
            sourceIds.push(existing.id);
            excerpts.push({
              sourceId: existing.id,
              sourceType: "URL",
              displayName: existing.displayName,
              text: existing.extractedText,
              url: existing.originalUrl,
            });
          }
        }
        continue;
      }

      const fetched = await fetchProductPageUrl(normalized);
      urlResearchPerformed = true;
      const hash = await sha256Hex(
        `url:${normalized}:${fetched.text || `failed:${fetched.extractedCharCount ?? 0}`}`,
      );

      const dup = await prisma.productSource.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
          contentHash: hash,
        },
      });
      if (dup) {
        if (!sourceIds.includes(dup.id)) sourceIds.push(dup.id);
        continue;
      }

      const row = await prisma.productSource.create({
        data: {
          organizationId: input.organizationId,
          productId: input.productId,
          sourceType: "URL",
          displayName: src.displayName || fetched.title || normalized,
          originalUrl: fetched.url || normalized,
          normalizedUrlKey: normalized,
          acquisitionMethod: "HTTP_GET",
          createdByUserId: input.userId,
          retrievedAt: new Date(),
          contentHash: hash,
          status: fetched.ok ? "ACQUIRED" : "FAILED",
          errorSafe: fetched.errorSafe ?? null,
          extractedText: fetched.ok ? fetched.text : null,
          freshnessExpiresAt: daysFromNow(
            policy.productSourceResearchFreshnessDays,
          ),
        },
      });

      await recordUsageEvent({
        organizationId: input.organizationId,
        userId: input.userId,
        category: "PRODUCT_RESEARCH",
        operation: "PRODUCT_URL_RETRIEVAL",
        status: fetched.ok ? "SUCCESS" : "FAILED",
        metadata: {
          correlationId,
          productId: input.productId,
          sourceId: row.id,
          extractedCharCount: fetched.extractedCharCount ?? 0,
          urlReadable: fetched.ok,
        },
      });

      if (fetched.ok && fetched.text && isUsableProductUrlExtraction(fetched.text)) {
        sourceIds.push(row.id);
        excerpts.push({
          sourceId: row.id,
          sourceType: "URL",
          displayName: row.displayName,
          text: fetched.text,
          url: row.originalUrl,
        });
      } else if (fetched.errorSafe) {
        errors.push(fetched.errorSafe);
      }
      continue;
    }

    if (src.type === "PASTED_TEXT" || src.type === "USER_NOTE") {
      const text = src.text.trim();
      if (!text) continue;
      const hash = await sha256Hex(`${src.type}:${text}`);
      const existing = await prisma.productSource.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
          contentHash: hash,
        },
      });
      if (existing) {
        if (!sourceIds.includes(existing.id)) {
          sourceIds.push(existing.id);
          if (existing.extractedText) {
            excerpts.push({
              sourceId: existing.id,
              sourceType: existing.sourceType,
              displayName: existing.displayName,
              text: existing.extractedText,
            });
          }
        }
        continue;
      }

      const row = await prisma.productSource.create({
        data: {
          organizationId: input.organizationId,
          productId: input.productId,
          sourceType: src.type,
          displayName:
            src.displayName ||
            (src.type === "USER_NOTE" ? `${vocab.product.Singular} notes` : "Pasted content"),
          acquisitionMethod: "USER_PROVIDED",
          createdByUserId: input.userId,
          retrievedAt: new Date(),
          contentHash: hash,
          status: "EXTRACTED",
          extractedText: text.slice(0, 200_000),
        },
      });
      await recordUsageEvent({
        organizationId: input.organizationId,
        userId: input.userId,
        category: "PRODUCT_RESEARCH",
        operation: "PRODUCT_SOURCE_INGEST",
        status: "SUCCESS",
        metadata: {
          correlationId,
          productId: input.productId,
          sourceId: row.id,
          sourceType: src.type,
        },
      });
      sourceIds.push(row.id);
      excerpts.push({
        sourceId: row.id,
        sourceType: src.type,
        displayName: row.displayName,
        text: row.extractedText || text,
      });
      continue;
    }

    if (src.type === "UPLOADED_DOCUMENT") {
      const extracted = await extractDocumentText({
        filename: src.filename,
        mimeType: src.mimeType,
        bytes: src.bytes,
      });
      const hash = await sha256Hex(src.bytes);

      const existing = await prisma.productSource.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
          contentHash: hash,
        },
      });
      if (existing) {
        if (!sourceIds.includes(existing.id)) sourceIds.push(existing.id);
        continue;
      }

      const row = await prisma.productSource.create({
        data: {
          organizationId: input.organizationId,
          productId: input.productId,
          sourceType: "UPLOADED_DOCUMENT",
          displayName: src.displayName || src.filename,
          filename: src.filename,
          mimeType: src.mimeType,
          byteSize: src.bytes.byteLength,
          acquisitionMethod: "USER_UPLOAD",
          createdByUserId: input.userId,
          retrievedAt: new Date(),
          contentHash: hash,
          status: extracted.ok ? "EXTRACTED" : "FAILED",
          errorSafe: extracted.ok ? null : extracted.errorSafe,
          extractedText: extracted.ok ? extracted.text : null,
        },
      });

      if (extracted.ok) {
        await prisma.productSourceBlob.create({
          data: {
            organizationId: input.organizationId,
            sourceId: row.id,
            bytes: Buffer.from(src.bytes),
          },
        });
      }

      await recordUsageEvent({
        organizationId: input.organizationId,
        userId: input.userId,
        category: "PRODUCT_RESEARCH",
        operation: "PRODUCT_DOCUMENT_EXTRACTION",
        status: extracted.ok ? "SUCCESS" : "FAILED",
        metadata: {
          correlationId,
          productId: input.productId,
          sourceId: row.id,
          filename: src.filename,
        },
      });

      if (extracted.ok) {
        sourceIds.push(row.id);
        excerpts.push({
          sourceId: row.id,
          sourceType: "UPLOADED_DOCUMENT",
          displayName: row.displayName,
          text: extracted.text,
        });
      } else {
        errors.push(`${src.filename}: ${extracted.errorSafe}`);
      }
    }
  }

  // Product path does not web-search for the customer's own product.
  // Unreadable URLs ask the user for materials; uploads/paste are the primary evidence.

  const capped = excerpts.slice(0, policy.maxSourcesPerProduct);
  const cappedIds = [...new Set(capped.map((e) => e.sourceId))];

  const latest = await prisma.productEvidenceBundle.findFirst({
    where: {
      organizationId: input.organizationId,
      productId: input.productId,
    },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;

  const bundle = await prisma.productEvidenceBundle.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      version,
      parentBundleId: latest?.id ?? null,
      correlationId,
      status: errors.length > 0 && capped.length > 0 ? "PARTIAL" : "ACQUIRING",
      createdByUserId: input.userId,
      normalizedEvidenceJson: {
        excerpts: capped,
      } as unknown as Prisma.InputJsonValue,
      sourceIdsJson: cappedIds as unknown as Prisma.InputJsonValue,
      urlResearchPerformed,
      webSearchQueriesUsed: 0,
    },
  });

  return {
    correlationId,
    evidenceBundleId: bundle.id,
    version,
    sourceIds: cappedIds,
    excerpts: capped,
    urlResearchPerformed,
    webSearchQueriesUsed: 0,
    partial: errors.length > 0 && capped.length > 0,
    errors,
  };
}

/** Whether any URL source for this product is stale per DB policy. */
export async function productUrlResearchIsStale(input: {
  organizationId: string;
  productId: string;
}): Promise<boolean> {
  const urls = await prisma.productSource.findMany({
    where: {
      organizationId: input.organizationId,
      productId: input.productId,
      sourceType: "URL",
      status: { in: ["ACQUIRED", "EXTRACTED"] },
    },
  });
  if (urls.length === 0) return false;
  return urls.some((u) => !isUrlSourceFresh(u.freshnessExpiresAt));
}

export function excerptsFromBundleJson(raw: unknown): EvidenceExcerpt[] {
  if (Array.isArray(raw)) return raw as EvidenceExcerpt[];
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { excerpts?: unknown }).excerpts)
  ) {
    return (raw as { excerpts: EvidenceExcerpt[] }).excerpts;
  }
  return [];
}

function mergeExcerptsBySourceId(
  prior: EvidenceExcerpt[],
  incoming: EvidenceExcerpt[],
): EvidenceExcerpt[] {
  const byId = new Map<string, EvidenceExcerpt>();
  for (const excerpt of prior) byId.set(excerpt.sourceId, excerpt);
  for (const excerpt of incoming) byId.set(excerpt.sourceId, excerpt);
  return [...byId.values()];
}

/**
 * Append-only evidence for an approved product: ingest new paste/notes/uploads,
 * union prior bundle excerpts with new excerpts (dedupe by sourceId).
 * Does not change product setupStatus — caller owns approval restoration.
 */
export async function appendProductSourcesToBundle(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  sources: IngestSourceInput[];
  /** Bundle to extend; defaults to latest bundle for the product. */
  parentBundleId?: string | null;
  correlationId?: string;
}): Promise<AcquireResult> {
  await requireProduct(input.organizationId, input.productId);

  const disallowed = input.sources.filter((s) => s.type === "URL");
  if (disallowed.length > 0) {
    throw new TenantError(
      `Adding material to an approved ${vocab.product.singular} supports paste, notes, and uploads only.`,
    );
  }
  if (input.sources.length === 0) {
    throw new TenantError("Add at least one new note, paste, or upload.");
  }

  const policy = await getResearchPolicy(input.organizationId);
  const correlationId = input.correlationId ?? createCorrelationId();
  const errors: string[] = [];
  let sourceIds: string[] = [];
  const newExcerpts: EvidenceExcerpt[] = [];

  const parentBundle = input.parentBundleId
    ? await prisma.productEvidenceBundle.findFirst({
        where: {
          id: input.parentBundleId,
          organizationId: input.organizationId,
          productId: input.productId,
        },
      })
    : await prisma.productEvidenceBundle.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
        },
        orderBy: { version: "desc" },
      });

  const priorExcerpts = excerptsFromBundleJson(
    parentBundle?.normalizedEvidenceJson ?? null,
  );
  const priorSourceIds = new Set(priorExcerpts.map((e) => e.sourceId));

  for (const src of input.sources) {
    if (src.type === "PASTED_TEXT" || src.type === "USER_NOTE") {
      const text = src.text.trim();
      if (!text) continue;
      const hash = await sha256Hex(`${src.type}:${text}`);
      const existing = await prisma.productSource.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
          contentHash: hash,
        },
      });
      if (existing) {
        if (!sourceIds.includes(existing.id)) {
          sourceIds.push(existing.id);
          if (existing.extractedText) {
            newExcerpts.push({
              sourceId: existing.id,
              sourceType: existing.sourceType,
              displayName: existing.displayName,
              text: existing.extractedText,
            });
          }
        }
        continue;
      }

      const row = await prisma.productSource.create({
        data: {
          organizationId: input.organizationId,
          productId: input.productId,
          sourceType: src.type,
          displayName:
            src.displayName ||
            (src.type === "USER_NOTE" ? `${vocab.product.Singular} notes` : "Pasted content"),
          acquisitionMethod: "USER_PROVIDED",
          createdByUserId: input.userId,
          retrievedAt: new Date(),
          contentHash: hash,
          status: "EXTRACTED",
          extractedText: text.slice(0, 200_000),
        },
      });
      await recordUsageEvent({
        organizationId: input.organizationId,
        userId: input.userId,
        category: "PRODUCT_RESEARCH",
        operation: "PRODUCT_SOURCE_INGEST",
        status: "SUCCESS",
        metadata: {
          correlationId,
          productId: input.productId,
          sourceId: row.id,
          sourceType: src.type,
        },
      });
      sourceIds.push(row.id);
      newExcerpts.push({
        sourceId: row.id,
        sourceType: src.type,
        displayName: row.displayName,
        text: row.extractedText || text,
      });
      continue;
    }

    if (src.type === "UPLOADED_DOCUMENT") {
      const extracted = await extractDocumentText({
        filename: src.filename,
        mimeType: src.mimeType,
        bytes: src.bytes,
      });
      const hash = await sha256Hex(src.bytes);

      const existing = await prisma.productSource.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
          contentHash: hash,
        },
      });
      if (existing) {
        if (!sourceIds.includes(existing.id)) {
          sourceIds.push(existing.id);
          if (existing.extractedText) {
            newExcerpts.push({
              sourceId: existing.id,
              sourceType: existing.sourceType,
              displayName: existing.displayName,
              text: existing.extractedText,
            });
          }
        }
        continue;
      }

      const row = await prisma.productSource.create({
        data: {
          organizationId: input.organizationId,
          productId: input.productId,
          sourceType: "UPLOADED_DOCUMENT",
          displayName: src.displayName || src.filename,
          filename: src.filename,
          mimeType: src.mimeType,
          byteSize: src.bytes.byteLength,
          acquisitionMethod: "USER_UPLOAD",
          createdByUserId: input.userId,
          retrievedAt: new Date(),
          contentHash: hash,
          status: extracted.ok ? "EXTRACTED" : "FAILED",
          errorSafe: extracted.ok ? null : extracted.errorSafe,
          extractedText: extracted.ok ? extracted.text : null,
        },
      });

      if (extracted.ok) {
        await prisma.productSourceBlob.create({
          data: {
            organizationId: input.organizationId,
            sourceId: row.id,
            bytes: Buffer.from(src.bytes),
          },
        });
      }

      await recordUsageEvent({
        organizationId: input.organizationId,
        userId: input.userId,
        category: "PRODUCT_RESEARCH",
        operation: "PRODUCT_DOCUMENT_EXTRACTION",
        status: extracted.ok ? "SUCCESS" : "FAILED",
        metadata: {
          correlationId,
          productId: input.productId,
          sourceId: row.id,
          filename: src.filename,
        },
      });

      if (extracted.ok) {
        sourceIds.push(row.id);
        newExcerpts.push({
          sourceId: row.id,
          sourceType: "UPLOADED_DOCUMENT",
          displayName: row.displayName,
          text: extracted.text,
        });
      } else {
        errors.push(`${src.filename}: ${extracted.errorSafe}`);
      }
    }
  }

  const merged = mergeExcerptsBySourceId(priorExcerpts, newExcerpts);
  const addedSourceIds = merged
    .map((e) => e.sourceId)
    .filter((id) => !priorSourceIds.has(id));
  if (addedSourceIds.length === 0) {
    throw new TenantError(
      `No new material was added. Paste or upload content that is not already in this ${vocab.product.singular}'s evidence.`,
    );
  }

  const capped = merged.slice(0, policy.maxSourcesPerProduct);
  const cappedIds = [...new Set(capped.map((e) => e.sourceId))];
  const version = (parentBundle?.version ?? 0) + 1;

  const bundle = await prisma.productEvidenceBundle.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      version,
      parentBundleId: parentBundle?.id ?? null,
      correlationId,
      status: errors.length > 0 && capped.length > 0 ? "PARTIAL" : "ACQUIRING",
      createdByUserId: input.userId,
      normalizedEvidenceJson: {
        excerpts: capped,
      } as unknown as Prisma.InputJsonValue,
      sourceIdsJson: cappedIds as unknown as Prisma.InputJsonValue,
      urlResearchPerformed: parentBundle?.urlResearchPerformed ?? false,
      webSearchQueriesUsed: 0,
    },
  });

  return {
    correlationId,
    evidenceBundleId: bundle.id,
    version,
    sourceIds: cappedIds,
    excerpts: capped,
    urlResearchPerformed: parentBundle?.urlResearchPerformed ?? false,
    webSearchQueriesUsed: 0,
    partial: errors.length > 0 && capped.length > 0,
    errors,
  };
}
