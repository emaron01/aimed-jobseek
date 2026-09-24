import { Prisma, type ApplicationAssetType } from "@prisma/client";
import {
  bannedPhraseHits,
  mentionsInternalSystemState,
  validateRepetitionAndMetaLanguage,
} from "@/lib/consultation/output-quality";
import {
  loadApplicationGenerationContext,
  type ReadyApplicationGenerationContext,
} from "@/lib/generation/context";
import { prisma } from "@/lib/prisma";
import { applicationAssetConfig, consultationConfig, vocab } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import {
  generateCoverLetterWithModel,
  generateResumeWithModel,
  validateAssetClaimsWithModel,
} from "./ai";
import {
  COVER_LETTER_ASSET_PROMPT_VERSION,
  RESUME_ASSET_PROMPT_VERSION,
  applicationAssetContentSchema,
  assetClaims,
  type ApplicationAssetContent,
  type AssetClaim,
  type CoverLetterAssetContent,
  type ResumeAssetContent,
} from "./contract";
import type { AssetGenerationResult } from "./outreach-types";

export type { AssetGenerationResult } from "./outreach-types";

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function promptVersion(type: ApplicationAssetType): string {
  return type === "RESUME"
    ? RESUME_ASSET_PROMPT_VERSION
    : COVER_LETTER_ASSET_PROMPT_VERSION;
}

export function normalizeAssetSupportSourceIds(
  content: ApplicationAssetContent,
  context: ReadyApplicationGenerationContext,
): ApplicationAssetContent {
  const sourceById = new Map(context.sources.map((source) => [source.id, source]));
  const normalize = (claim: AssetClaim): AssetClaim => ({
    ...claim,
    supports: claim.supports.map((support) => {
      if (sourceById.has(support.sourceId)) return support;
      const quote = support.quote.trim().toLowerCase();
      const quoteMatches = context.sources.filter((source) =>
        source.text.toLowerCase().includes(quote),
      );
      if (quoteMatches.length === 1) {
        return { ...support, sourceId: quoteMatches[0]!.id };
      }
      const proposedSuffix = support.sourceId
        .toLowerCase()
        .replace(/^profile:/, "")
        .replace(/^id_/, "");
      const suffixMatches = quoteMatches.filter((source) => {
        const suffix = source.id
          .toLowerCase()
          .replace(/^profile:/, "")
          .replace(/^id_/, "");
        return suffix === proposedSuffix;
      });
      return suffixMatches.length === 1
        ? { ...support, sourceId: suffixMatches[0]!.id }
        : support;
    }),
  });
  if (
    content.type === "COVER_LETTER" ||
    content.type === "EMAIL" ||
    content.type === "LINKEDIN_INMAIL"
  ) {
    return { ...content, paragraphs: content.paragraphs.map(normalize) };
  }
  if (content.type === "LINKEDIN_CONNECTION_NOTE") {
    return { ...content, body: normalize(content.body) };
  }
  return {
    ...content,
    header: {
      name: normalize(content.header.name),
      contactDetails: content.header.contactDetails.map(normalize),
    },
    summary: content.summary.map(normalize),
    experience: content.experience.map((role) => ({
      ...role,
      bullets: role.bullets.map(normalize),
    })),
    skills: content.skills.map(normalize),
    education: content.education.map(normalize),
    credentials: content.credentials.map(normalize),
  };
}

function claimTrace(
  content: ApplicationAssetContent,
  context: ReadyApplicationGenerationContext,
) {
  const claims = assetClaims(content).map((claim) => ({
    claimId: claim.id,
    text: claim.text,
    supports: claim.supports,
  }));
  if (content.type !== "RESUME") return claims;
  const roles = new Map(context.profile.experience.map((role) => [role.id, role]));
  return [
    ...claims,
    ...content.experience.flatMap((role) => {
      const profileRole = roles.get(role.roleId);
      if (!profileRole) return [];
      const sourceId = `profile:${role.roleId}`;
      return [
        ["employer", role.employer],
        ["title", role.title],
        ["startDate", role.startDate],
        ["endDate", role.endDate],
        ["location", role.location],
      ].flatMap(([field, value]) =>
        typeof value === "string" && value.trim()
          ? [
              {
                claimId: `role:${role.roleId}:${field}`,
                text: value,
                supports: [{ sourceId, quote: value }],
              },
            ]
          : [],
      );
    }),
  ];
}

function isSeekerSource(
  category: ReadyApplicationGenerationContext["sources"][number]["category"],
): boolean {
  return (
    applicationAssetConfig.seekerSourceCategories as readonly string[]
  ).includes(category);
}

function supportErrors(
  content: ApplicationAssetContent,
  context: ReadyApplicationGenerationContext,
): string[] {
  const sourceById = new Map(context.sources.map((source) => [source.id, source]));
  const errors: string[] = [];
  const ids = new Set<string>();
  const claims = assetClaims(content);
  for (const [index, claim] of claims.entries()) {
    if (ids.has(claim.id)) {
      errors.push(`Claim id ${claim.id} was duplicated.`);
    }
    ids.add(claim.id);
    const isCoverLetterClose =
      content.type === "COVER_LETTER" && index === claims.length - 1;
    const requiresSeekerSupport =
      content.type === "RESUME" ||
      content.type === "EMAIL" ||
      content.type === "LINKEDIN_CONNECTION_NOTE" ||
      content.type === "LINKEDIN_INMAIL" ||
      (content.type === "COVER_LETTER" && index > 0 && !isCoverLetterClose);
    let hasSeekerSupport = false;
    for (const support of claim.supports) {
      const source = sourceById.get(support.sourceId);
      if (!source) {
        errors.push(`Claim ${claim.id} cites an unknown source.`);
        continue;
      }
      if (
        !source.text.toLowerCase().includes(support.quote.trim().toLowerCase())
      ) {
        errors.push(`Claim ${claim.id} cites words that are absent from its source.`);
      }
      if (content.type === "RESUME" && !isSeekerSource(source.category)) {
        errors.push(
          `Claim ${claim.id} must cite a Personal Profile FACT or an approved consultation statement.`,
        );
      }
      if (isSeekerSource(source.category)) hasSeekerSupport = true;
    }
    if (requiresSeekerSupport && !hasSeekerSupport) {
      errors.push(
        `Claim ${claim.id} must cite a Personal Profile FACT or an approved consultation statement.`,
      );
    }
  }
  return errors;
}

function resumeStructureErrors(
  content: ResumeAssetContent,
  context: ReadyApplicationGenerationContext,
  hiddenRoleIds: string[],
): string[] {
  const errors: string[] = [];
  const expected = context.profile.experience;
  if (content.experience.length !== expected.length) {
    errors.push("The resume must include every profile role.");
  }
  const byId = new Map(content.experience.map((role) => [role.roleId, role]));
  for (const profileRole of expected) {
    const role = byId.get(profileRole.id);
    if (!role) {
      errors.push(`Profile role ${profileRole.id} is missing.`);
      continue;
    }
    if (
      role.employer !== (profileRole.employer ?? "") ||
      role.title !== (profileRole.title ?? "") ||
      role.startDate !== (profileRole.startDate ?? null) ||
      role.endDate !== (profileRole.endDate ?? null) ||
      role.location !== (profileRole.location ?? null)
    ) {
      errors.push(
        `Role ${profileRole.id} changed an employer, title, date, or location.`,
      );
    }
    if (role.hidden !== hiddenRoleIds.includes(profileRole.id)) {
      errors.push(`Role ${profileRole.id} did not preserve the seeker's hide choice.`);
    }
  }
  const allowedContactIds = new Set(
    [
      context.profile.identity.name,
      context.profile.identity.location,
      context.profile.identity.email,
      context.profile.identity.phone,
      context.profile.identity.cityState,
      context.profile.identity.linkedinUrl,
      context.profile.identity.personalSite,
    ]
      .filter(Boolean)
      .map((item) => `profile:${item!.id}`),
  );
  for (const claim of [
    content.header.name,
    ...content.header.contactDetails,
  ]) {
    if (claim.supports.some((support) => !allowedContactIds.has(support.sourceId))) {
      errors.push("The resume header used a source outside confirmed contact details.");
    }
  }
  return errors;
}

function coverLetterStructureErrors(
  content: CoverLetterAssetContent,
  context: ReadyApplicationGenerationContext,
  salutation: string,
): string[] {
  const errors: string[] = [];
  if (content.salutation !== salutation) {
    errors.push("The cover letter changed the required salutation.");
  }
  if (content.signerName !== (context.profile.identity.name?.text ?? "")) {
    errors.push("The cover letter changed the seeker's name.");
  }
  const sourceById = new Map(context.sources.map((source) => [source.id, source]));
  const opening = content.paragraphs[0];
  const openingSupports = (opening?.supports ?? [])
    .map((support) => ({
      support,
      source: sourceById.get(support.sourceId),
    }))
    .filter((item) => item.source);
  const openingHasCitedResearch = openingSupports.some(
    (item) => item.source?.category === "COMPANY_RESEARCH" && Boolean(item.source.url),
  );
  const openingHasJobRequirement = openingSupports.some(
    (item) => item.source?.category === "JOB_REQUIREMENT",
  );
  const openingHasSeekerFact = openingSupports.some(
    (item) => item.source && isSeekerSource(item.source.category),
  );
  const hasResearchSources = context.sources.some(
    (source) => source.category === "COMPANY_RESEARCH" && Boolean(source.url),
  );
  if (hasResearchSources && !openingHasCitedResearch) {
    errors.push("The opening needs a cited company-research source.");
  }
  if (!hasResearchSources && !openingHasJobRequirement) {
    errors.push(
      "The opening needs a cited job-requirement source when company research is not confirmed.",
    );
  }
  if (!openingHasSeekerFact) {
    errors.push(
      "The opening needs a cited Personal Profile FACT or approved consultation statement.",
    );
  }
  const closing = content.paragraphs.at(-1);
  if (closing) {
    const claim = closingParagraphMakesClaim(closing.text);
    if (claim && closing.supports.length === 0) {
      errors.push("The closing paragraph makes a claim and needs a citation.");
    }
    for (const paragraph of content.paragraphs.slice(0, -1)) {
      if (paragraph.supports.length === 0) {
        errors.push(`Paragraph ${paragraph.id} needs a citation.`);
      }
    }
  }
  return errors;
}

export function closingParagraphMakesClaim(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  const hasFactualVerb =
    /\b(led|built|shipped|cut|increased|reduced|managed|designed|wrote|rewrote|owned|years of|I have \d)\b/i.test(
      value,
    );
  const hasMetric = /\d/.test(value) && !/\b(conversation|call|chat|discuss|schedule)\b/i.test(value);
  if (hasFactualVerb || hasMetric) return true;
  const noClaim =
    /\b(thank you|thanks|look forward|schedule a conversation|welcome a conversation|discuss (the role|this opportunity)|please (let me know|reach out)|i('d| would) (welcome|appreciate))\b/i;
  if (noClaim.test(value)) return false;
  return /\bI (led|built|have|shipped)\b/i.test(value);
}

export async function validateAssetContent(input: {
  content: ApplicationAssetContent;
  context: ReadyApplicationGenerationContext;
  hiddenRoleIds?: string[];
  salutation?: string;
}): Promise<string[]> {
  const claims = assetClaims(input.content);
  const texts = claims.map((claim) => claim.text);
  const errors = [
    ...supportErrors(input.content, input.context),
    ...bannedPhraseHits(texts, [
      ...consultationConfig.bannedPhrases,
      ...applicationAssetConfig.bannedPhrases,
    ]).map((phrase) => `Remove configured banned language: ${phrase}.`),
    ...texts.flatMap((text) =>
      validateRepetitionAndMetaLanguage({
        text,
        bannedPhrases: consultationConfig.interviewAnswerBannedPhrases,
      }),
    ),
    ...(input.content.type !== "RESUME"
      ? validateRepetitionAndMetaLanguage({
          text: texts.join(" "),
          bannedPhrases: consultationConfig.interviewAnswerBannedPhrases,
        })
      : []),
  ];
  if (texts.some(mentionsInternalSystemState)) {
    errors.push("Remove references to internal system state.");
  }
  if (input.context.profile.experience.some((role) => !role.endDate)) {
    for (const phrase of applicationAssetConfig.unsupportedTemporalPhrasesWithoutExplicitDates) {
      if (texts.some((text) => text.toLowerCase().includes(phrase))) {
        errors.push(
          `Remove unsupported temporal language "${phrase}" because the profile does not state an end date.`,
        );
      }
    }
  }
  if (input.content.type === "RESUME") {
    errors.push(
      ...resumeStructureErrors(
        input.content,
        input.context,
        input.hiddenRoleIds ?? [],
      ),
    );
  } else if (input.content.type === "COVER_LETTER") {
    errors.push(
      ...coverLetterStructureErrors(
        input.content,
        input.context,
        input.salutation ?? applicationAssetConfig.coverLetter.defaultSalutation,
      ),
    );
  }
  if (errors.length > 0) return [...new Set(errors)];
  const modelValidation = await validateAssetClaimsWithModel({
    claims,
    sources: input.context.sources,
  });
  if (!modelValidation.ok) return [modelValidation.message];
  return [
    ...new Set(
      modelValidation.data.violations.map(
        (violation) =>
          `Claim ${violation.claimId} is unsupported: ${violation.reason}`,
      ),
    ),
  ];
}

function coverLetterSalutation(context: ReadyApplicationGenerationContext): string {
  return context.hiringManagerContactName
    ? `Dear ${context.hiringManagerContactName},`
    : applicationAssetConfig.coverLetter.defaultSalutation;
}

async function saveVersion(input: {
  context: ReadyApplicationGenerationContext;
  type: ApplicationAssetType;
  personaId: string | null;
  content: ApplicationAssetContent;
  guidance: string | null;
}): Promise<{ id: string; version: number }> {
  return prisma.$transaction(
    async (tx) => {
      const latest = await tx.applicationAsset.aggregate({
        where: {
          campaignId: input.context.campaign.id,
          groupKey: input.type,
        },
        _max: { version: true },
      });
      const version = (latest._max.version ?? 0) + 1;
      const row = await tx.applicationAsset.create({
        data: {
          organizationId: input.context.organizationId,
          campaignId: input.context.campaign.id,
          type: input.type,
          personaId: input.personaId,
          groupKey: input.type,
          version,
          contentJson: input.content as unknown as Prisma.InputJsonValue,
          claimTraceJson: claimTrace(
            input.content,
            input.context,
          ) as unknown as Prisma.InputJsonValue,
          guidance: input.guidance,
          promptVersion: promptVersion(input.type),
          status: "DRAFT",
        },
        select: { id: true, version: true },
      });
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function generateApplicationAsset(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  type: ApplicationAssetType;
  hiddenRoleIds?: string[];
  regenerationInstruction?: string | null;
}): Promise<AssetGenerationResult> {
  const base = await loadApplicationGenerationContext(
    input.campaignId,
    input.userId,
  );
  if (base.organizationId !== input.organizationId) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  if (input.type !== "RESUME" && input.type !== "COVER_LETTER") {
    return {
      ok: false,
      message: "Use outreach generation for email and LinkedIn messages.",
      violations: [],
    };
  }
  if (!base.requirement || !base.profile) {
    return {
      ok: false,
      message: `This ${vocab.campaign.singular} needs an approved ${vocab.product.singular} and job requirement.`,
      violations: [],
    };
  }
  const readyBase = base as ReadyApplicationGenerationContext;
  const personaId =
    input.type === "COVER_LETTER" ? readyBase.hiringManagerPersonaId : null;
  const loadedContext = personaId
    ? await loadApplicationGenerationContext(input.campaignId, input.userId, {
        personaId,
      })
    : readyBase;
  if (!loadedContext.profile || !loadedContext.requirement) {
    return {
      ok: false,
      message: `This ${vocab.campaign.singular} needs an approved ${vocab.product.singular} and job requirement.`,
      violations: [],
    };
  }
  const context = loadedContext as ReadyApplicationGenerationContext;
  const hiddenRoleIds = [
    ...new Set((input.hiddenRoleIds ?? []).map((id) => id.trim()).filter(Boolean)),
  ];
  const allowedRoleIds = new Set(context.profile.experience.map((role) => role.id));
  if (hiddenRoleIds.some((id) => !allowedRoleIds.has(id))) {
    return {
      ok: false,
      message: "A hidden role does not belong to the Personal Profile.",
      violations: ["Unknown hidden role."],
    };
  }
  const salutation = coverLetterSalutation(context);
  let feedback: string[] = [];
  for (
    let attempt = 0;
    attempt <= applicationAssetConfig.generation.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const generated =
      input.type === "RESUME"
        ? await generateResumeWithModel({
            context,
            hiddenRoleIds,
            regenerationInstruction: input.regenerationInstruction ?? null,
            qualityFeedback: feedback,
          })
        : await generateCoverLetterWithModel({
            context,
            salutation,
            regenerationInstruction: input.regenerationInstruction ?? null,
            qualityFeedback: feedback,
          });
    if (!generated.ok) {
      feedback = [generated.message];
      if (
        attempt === applicationAssetConfig.generation.qualityRegenerationAttempts
      ) {
        return {
          ok: false,
          message: generated.message,
          violations: feedback,
        };
      }
      continue;
    }
    const content = normalizeAssetSupportSourceIds(generated.data, context);
    const violations = await validateAssetContent({
      content,
      context,
      hiddenRoleIds,
      salutation,
    });
    if (violations.length === 0) {
      const saved = await saveVersion({
        context,
        type: input.type,
        personaId,
        content,
        guidance: input.regenerationInstruction?.trim() || null,
      });
      return { ok: true, assetId: saved.id, version: saved.version };
    }
    feedback = violations;
  }
  return {
    ok: false,
    message:
      "The asset was not saved because its claims did not pass verification. Retry after reviewing the violations.",
    violations: feedback,
  };
}

export async function approveApplicationAsset(input: {
  organizationId: string;
  campaignId: string;
  assetId: string;
  userId: string;
}): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      ownerUserId: input.userId,
    },
    select: { id: true },
  });
  if (!campaign) throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  const asset = await prisma.applicationAsset.findFirst({
    where: {
      id: input.assetId,
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
    select: { id: true, type: true, groupKey: true },
  });
  if (!asset) throw new TenantError("Application asset was not found.");
  await prisma.$transaction([
    prisma.applicationAsset.updateMany({
      where: {
        campaignId: input.campaignId,
        groupKey: asset.groupKey,
        status: "APPROVED",
      },
      data: { status: "DRAFT" },
    }),
    prisma.applicationAsset.update({
      where: { id: asset.id },
      data: { status: "APPROVED" },
    }),
  ]);
}

export async function saveEditedApplicationAsset(input: {
  organizationId: string;
  campaignId: string;
  assetId: string;
  userId: string;
  content: unknown;
}): Promise<AssetGenerationResult> {
  const parsed = applicationAssetContentSchema.safeParse(input.content);
  if (!parsed.success) {
    return {
      ok: false,
      message: "The edited asset has an invalid structure.",
      violations: parsed.error.issues.map((issue) => issue.message),
    };
  }
  const existing = await prisma.applicationAsset.findFirst({
    where: {
      id: input.assetId,
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
  });
  if (!existing) throw new TenantError("Application asset was not found.");
  const context = await loadApplicationGenerationContext(
    input.campaignId,
    input.userId,
    { personaId: existing.personaId },
  );
  if (!context.profile || !context.requirement) {
    return {
      ok: false,
      message: `This ${vocab.campaign.singular} needs an approved ${vocab.product.singular} and job requirement.`,
      violations: [],
    };
  }
  const readyContext = context as ReadyApplicationGenerationContext;
  const hiddenRoleIds =
    parsed.data.type === "RESUME"
      ? parsed.data.experience.filter((role) => role.hidden).map((role) => role.roleId)
      : [];
  const violations = await validateAssetContent({
    content: parsed.data,
    context: readyContext,
    hiddenRoleIds,
    salutation: coverLetterSalutation(readyContext),
  });
  if (violations.length > 0) {
    return {
      ok: false,
      message: "The edit was not saved because a claim could not be verified.",
      violations,
    };
  }
  const saved = await saveVersion({
    context: readyContext,
    type: existing.type,
    personaId: existing.personaId,
    content: parsed.data,
    guidance: applicationAssetConfig.labels.seekerEditedGuidance,
  });
  return { ok: true, assetId: saved.id, version: saved.version };
}

export async function listApplicationAssets(input: {
  organizationId: string;
  campaignId: string;
}) {
  return prisma.applicationAsset.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    orderBy: [{ type: "asc" }, { version: "desc" }],
  });
}

export function assetWordCount(content: ApplicationAssetContent): number {
  return assetClaims(content).reduce(
    (total, claim) => total + words(claim.text).length,
    0,
  );
}
