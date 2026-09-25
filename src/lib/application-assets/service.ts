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
import {
  acceptedPresentationPlan,
  condensedRoleIdsFromPlan,
} from "./plan-service";
import type { AssetGenerationResult } from "./outreach-types";

export type { AssetGenerationResult } from "./outreach-types";

export function logCoverLetterValidationAttempt(input: {
  campaignId: string;
  attempt: number;
  reasons: string[];
  passed: boolean;
}): void {
  console.info(
    JSON.stringify({
      event: "cover_letter_validation",
      campaignId: input.campaignId,
      attempt: input.attempt,
      passed: input.passed,
      reasons: input.reasons,
    }),
  );
}

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
    const acknowledgeIds = new Set(
      context.assessments
        .filter((assessment) => assessment.strategy === "ACKNOWLEDGE")
        .map((assessment) => `assessment:${assessment.targetKey}`),
    );
    const citesAcknowledgedGap = claim.supports.some((support) =>
      acknowledgeIds.has(support.sourceId),
    );
    const requiresSeekerSupport =
      content.type === "RESUME" ||
      content.type === "EMAIL" ||
      content.type === "LINKEDIN_CONNECTION_NOTE" ||
      content.type === "LINKEDIN_INMAIL" ||
      (content.type === "COVER_LETTER" &&
        index > 0 &&
        !isCoverLetterClose &&
        !citesAcknowledgedGap);
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
  condensedRoleIds: string[],
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
    const shouldCondense =
      condensedRoleIds.includes(profileRole.id) && !role.hidden;
    if (Boolean(role.condensed) !== shouldCondense) {
      errors.push(`Role ${profileRole.id} did not preserve the accepted plan's condensation.`);
    }
    if (role.condensed && role.bullets.length > 0) {
      errors.push(`Condensed role ${profileRole.id} must keep title and employer only.`);
    }
    if (role.condensed && role.hidden) {
      errors.push(`Role ${profileRole.id} cannot be hidden and condensed.`);
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

function identityProfileSourceIds(
  profile: ReadyApplicationGenerationContext["profile"],
): Set<string> {
  return new Set(
    [
      profile.identity.name,
      profile.identity.headline,
      profile.identity.location,
      profile.identity.email,
      profile.identity.phone,
      profile.identity.cityState,
      profile.identity.linkedinUrl,
      profile.identity.personalSite,
      profile.identity.workArrangementPreference,
      profile.identity.relocationOpenness,
    ]
      .filter(Boolean)
      .map((item) => `profile:${item!.id}`),
  );
}

function experienceRoleIdForSource(
  sourceId: string,
  profile: ReadyApplicationGenerationContext["profile"],
): string | null {
  if (!sourceId.startsWith("profile:")) return null;
  const factId = sourceId.slice("profile:".length);
  const role = profile.experience.find((item) => item.id === factId);
  if (role) return role.id;
  for (const item of profile.experience) {
    if (item.achievements.some((achievement) => achievement.id === factId)) {
      return item.id;
    }
  }
  return null;
}

function isNonIdentityExperienceSource(
  sourceId: string,
  category: ReadyApplicationGenerationContext["sources"][number]["category"],
  profile: ReadyApplicationGenerationContext["profile"],
  identityIds: Set<string>,
): boolean {
  if (identityIds.has(sourceId)) return false;
  if (category === "APPROVED_STATEMENT" || category === "APPROVED_STORY") {
    return true;
  }
  return category === "PROFILE_FACT" && experienceRoleIdForSource(sourceId, profile) !== null;
}

export function coverLetterMixedTopicErrors(
  content: CoverLetterAssetContent,
  context: ReadyApplicationGenerationContext,
): string[] {
  const sourceById = new Map(context.sources.map((source) => [source.id, source]));
  const acknowledgeIds = new Set(
    context.assessments
      .filter((assessment) => assessment.strategy === "ACKNOWLEDGE")
      .map((assessment) => `assessment:${assessment.targetKey}`),
  );
  const identityIds = identityProfileSourceIds(context.profile);
  const errors: string[] = [];
  for (const paragraph of content.paragraphs) {
    const cited = paragraph.supports
      .map((support) => ({
        sourceId: support.sourceId,
        source: sourceById.get(support.sourceId),
      }))
      .filter((item): item is { sourceId: string; source: NonNullable<typeof item.source> } =>
        Boolean(item.source),
      );
    const hasAcknowledgedGap = cited.some((item) => acknowledgeIds.has(item.sourceId));
    const experienceCitations = cited.filter((item) =>
      isNonIdentityExperienceSource(
        item.sourceId,
        item.source.category,
        context.profile,
        identityIds,
      ),
    );
    if (hasAcknowledgedGap && experienceCitations.length > 0) {
      errors.push(applicationAssetConfig.coverLetter.mixedTopic);
      continue;
    }
    const roleIds = new Set(
      cited
        .map((item) => experienceRoleIdForSource(item.sourceId, context.profile))
        .filter((roleId): roleId is string => Boolean(roleId)),
    );
    if (roleIds.size > 1) {
      errors.push(applicationAssetConfig.coverLetter.mixedTopic);
    }
  }
  return errors;
}

const STORY_ACTION =
  /\b(?:I|I've|I'd)\b[\s\S]{0,80}\b(?:led|built|shipped|rewrote|wrote|owned|cut|reduced|increased|designed|managed|reviewed|ran|launched|rewrote)\b|\b(?:led|built|shipped|rewrote|owned|cut)\b/i;
const STORY_RESULT =
  /\d|\b(?:cut|reduced|increased|from\b[\s\S]{0,40}\bto\b|used by|under \d|to under)\b/i;

function storyHasActionAndResult(text: string): boolean {
  return STORY_ACTION.test(text) && STORY_RESULT.test(text);
}

function scorecardOutcomeTexts(scorecard: unknown): string[] {
  if (!scorecard || typeof scorecard !== "object") return [];
  const row = scorecard as {
    mission?: { text?: string | null } | null;
    outcomes?: Array<{ text?: string | null } | null>;
  };
  const texts: string[] = [];
  if (row.mission?.text?.trim()) texts.push(row.mission.text.trim());
  for (const item of row.outcomes ?? []) {
    if (item?.text?.trim()) texts.push(item.text.trim());
  }
  return texts;
}

function topOutcomeTexts(context: ReadyApplicationGenerationContext): string[] {
  return [
    ...scorecardOutcomeTexts(context.requirement.scorecard),
    ...context.requirement.requiredItems.filter(
      (item) => !/^\d+\s+years?\b/i.test(item) && !/\blicen[cs]e\b/i.test(item),
    ),
  ];
}

function overlapTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 5),
  );
}

function textsOverlap(left: string, right: string): boolean {
  const a = overlapTokens(left);
  const b = overlapTokens(right);
  return [...a].some((token) => b.has(token));
}

export function relevantApprovedStatementIds(
  context: ReadyApplicationGenerationContext,
): string[] {
  const statements = context.approvedStatements.filter((item) => item.content.trim());
  if (statements.length === 0) return [];
  const targeted = statements.filter((item) => {
    const key = item.targetKey ?? "";
    return (
      key.startsWith("outcome:") ||
      key.startsWith("mission:") ||
      key.startsWith("required:")
    );
  });
  if (targeted.length > 0) {
    return targeted.map((item) => `statement:${item.id}`);
  }
  const outcomes = topOutcomeTexts(context);
  return statements
    .filter((item) => outcomes.some((outcome) => textsOverlap(item.content, outcome)))
    .map((item) => `statement:${item.id}`);
}

export function coverLetterEvidenceIsThin(input: {
  approvedStatementCount: number;
  approvedStoryCount: number;
  achievementTexts: string[];
}): boolean {
  if (input.approvedStatementCount > 0 || input.approvedStoryCount > 0) {
    return false;
  }
  return !input.achievementTexts.some((text) => storyHasActionAndResult(text));
}

export function coverLetterThinEvidenceCopy(): string {
  return applicationAssetConfig.coverLetter.thinEvidence
    .replace("{product}", vocab.product.singular)
    .replace("{consultant}", consultationConfig.displayName);
}

function seekerHasStoryEvidence(context: ReadyApplicationGenerationContext): boolean {
  if (context.approvedStatements.some((item) => item.content.trim())) return true;
  if (
    context.stories.some(
      (story) => story.action.trim() && story.result.trim(),
    )
  ) {
    return true;
  }
  return context.profile.experience.some((role) =>
    role.achievements.some((item) => storyHasActionAndResult(item.text)),
  );
}

function isAcknowledgeOnlyParagraph(
  paragraph: CoverLetterAssetContent["paragraphs"][number],
  acknowledgeIds: Set<string>,
): boolean {
  const cited = paragraph.supports.map((support) => support.sourceId);
  return cited.some((id) => acknowledgeIds.has(id)) &&
    cited.every((id) => acknowledgeIds.has(id) || id === "job:posting");
}

export function coverLetterSubstanceErrors(
  content: CoverLetterAssetContent,
  context: ReadyApplicationGenerationContext,
): string[] {
  const errors: string[] = [];
  const acknowledgeIds = new Set(
    context.assessments
      .filter((assessment) => assessment.strategy === "ACKNOWLEDGE")
      .map((assessment) => `assessment:${assessment.targetKey}`),
  );
  const relevantStatements = relevantApprovedStatementIds(context);
  if (relevantStatements.length > 0) {
    const cited = new Set(
      content.paragraphs.flatMap((paragraph) =>
        paragraph.supports.map((support) => support.sourceId),
      ),
    );
    if (!relevantStatements.some((id) => cited.has(id))) {
      errors.push(applicationAssetConfig.coverLetter.omittedApprovedStatement);
    }
  }
  if (!seekerHasStoryEvidence(context)) return errors;
  const bodyStories = content.paragraphs
    .slice(1, -1)
    .filter((paragraph) => !isAcknowledgeOnlyParagraph(paragraph, acknowledgeIds));
  if (!bodyStories.some((paragraph) => storyHasActionAndResult(paragraph.text))) {
    errors.push(applicationAssetConfig.coverLetter.missingStorySubstance);
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
  errors.push(...coverLetterMixedTopicErrors(content, context));
  errors.push(...coverLetterSubstanceErrors(content, context));
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
  condensedRoleIds?: string[];
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
          ignoreRepeatedNumbers: input.content.type === "COVER_LETTER",
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
        input.condensedRoleIds ?? [],
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
  const acceptedPlan = await acceptedPresentationPlan({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: input.type,
  });
  if (!acceptedPlan) {
    return {
      ok: false,
      message: applicationAssetConfig.labels.acceptPlanFirst,
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
  const condensedRoleIds = condensedRoleIdsFromPlan(acceptedPlan).filter(
    (id) => !hiddenRoleIds.includes(id),
  );
  if (hiddenRoleIds.some((id) => !allowedRoleIds.has(id))) {
    return {
      ok: false,
      message: "A hidden role does not belong to the Personal Profile.",
      violations: ["Unknown hidden role."],
    };
  }
  if (condensedRoleIds.some((id) => !allowedRoleIds.has(id))) {
    return {
      ok: false,
      message: "A condensed role does not belong to the Personal Profile.",
      violations: ["Unknown condensed role."],
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
            condensedRoleIds,
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
      if (input.type === "COVER_LETTER") {
        logCoverLetterValidationAttempt({
          campaignId: context.campaign.id,
          attempt: attempt + 1,
          reasons: feedback,
          passed: false,
        });
      }
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
      condensedRoleIds,
      salutation,
    });
    if (input.type === "COVER_LETTER") {
      logCoverLetterValidationAttempt({
        campaignId: context.campaign.id,
        attempt: attempt + 1,
        reasons: violations,
        passed: violations.length === 0,
      });
    }
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
  const condensedRoleIds =
    parsed.data.type === "RESUME"
      ? parsed.data.experience
          .filter((role) => role.condensed)
          .map((role) => role.roleId)
      : [];
  const violations = await validateAssetContent({
    content: parsed.data,
    context: readyContext,
    hiddenRoleIds,
    condensedRoleIds,
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
