import {
  Prisma,
  type ApplicationAssetType,
  type ApplicationOutreachPurpose,
  type EmailLength,
} from "@prisma/client";
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
import {
  applicationAssetConfig,
  consultationConfig,
  isOutreachAssetType,
  interviewConfig,
  outreachConfig,
  outreachGreeting,
  outreachGroupKey,
  shouldIncludeRedirect,
  vocab,
} from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import { generateOutreachWithModel, validateAssetClaimsWithModel } from "./ai";
import {
  applicationAssetContentSchema,
  assetClaims,
  composeOutreachText,
  OUTREACH_EMAIL_PROMPT_VERSION,
  OUTREACH_LINKEDIN_INMAIL_PROMPT_VERSION,
  OUTREACH_LINKEDIN_NOTE_PROMPT_VERSION,
  type ApplicationAssetContent,
  type AssetClaim,
} from "./contract";
import type { AssetGenerationResult } from "./outreach-types";

function outreachPromptVersion(type: ApplicationAssetType): string {
  if (type === "EMAIL") return OUTREACH_EMAIL_PROMPT_VERSION;
  if (type === "LINKEDIN_CONNECTION_NOTE") {
    return OUTREACH_LINKEDIN_NOTE_PROMPT_VERSION;
  }
  return OUTREACH_LINKEDIN_INMAIL_PROMPT_VERSION;
}

function contactFirstName(contact: {
  firstName: string | null;
}): string | null {
  const first = contact.firstName?.trim() ?? "";
  return first || null;
}

function outreachSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeOutreachSentence(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function sentenceTokens(text: string): Set<string> {
  return new Set(
    normalizeOutreachSentence(text)
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function sentencesOverlap(left: string, right: string): boolean {
  const leftTokens = sentenceTokens(left);
  const rightTokens = sentenceTokens(right);
  if (leftTokens.size < 3 || rightTokens.size < 3) return false;
  const a = normalizeOutreachSentence(left);
  const b = normalizeOutreachSentence(right);
  if (a === b) return true;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 && overlap / union >= outreachConfig.threadRepetitionOverlap;
}

function isSeekerSource(category: string): boolean {
  return (applicationAssetConfig.seekerSourceCategories as readonly string[]).includes(
    category,
  );
}

function isAllowedOutreachSource(category: string): boolean {
  return (
    isSeekerSource(category) ||
    category === "APPLICATION" ||
    category === "JOB_REQUIREMENT" ||
    category === "PERSONA"
  );
}

function citableSourceIds(
  context: ReadyApplicationGenerationContext,
): string[] {
  return context.sources
    .filter((source) => isAllowedOutreachSource(source.category))
    .map((source) => source.id);
}

export function outreachLimitErrors(content: ApplicationAssetContent): string[] {
  const composed = composeOutreachText(content);
  const errors: string[] = [];
  if (content.type === "LINKEDIN_CONNECTION_NOTE") {
    if (composed.body.length > outreachConfig.linkedinLimits.connectionNoteChars) {
      errors.push(
        `The connection note is ${composed.body.length} characters. Rewrite it at or under ${outreachConfig.linkedinLimits.connectionNoteChars} characters. Do not truncate mid-sentence.`,
      );
    }
  }
  if (content.type === "LINKEDIN_INMAIL") {
    if (
      (composed.subject ?? "").length >
      outreachConfig.linkedinLimits.inMailSubjectChars
    ) {
      errors.push(
        `The InMail subject is ${(composed.subject ?? "").length} characters. Rewrite it at or under ${outreachConfig.linkedinLimits.inMailSubjectChars} characters.`,
      );
    }
    if (composed.body.length > outreachConfig.linkedinLimits.inMailBodyChars) {
      errors.push(
        `The InMail body is ${composed.body.length} characters. Rewrite it at or under ${outreachConfig.linkedinLimits.inMailBodyChars} characters. Do not truncate mid-sentence.`,
      );
    }
  }
  return errors;
}

export function hiringManagerClaimErrors(input: {
  text: string;
  confirmedHiringManagerRole: boolean;
  channel: "email" | "linkedin";
}): string[] {
  const lowered = input.text.toLowerCase();
  const errors: string[] = [];
  if (input.channel === "linkedin") {
    for (const phrase of outreachConfig.bannedLinkedInGreetings) {
      if (lowered.includes(phrase)) {
        errors.push(
          `LinkedIn messages must not use "${phrase}". Use the supplied greeting.`,
        );
      }
    }
  }
  if (input.confirmedHiringManagerRole) return errors;
  for (const phrase of outreachConfig.hiringManagerClaimPhrases) {
    if (lowered.includes(phrase)) {
      errors.push(
        "Do not state or imply that the recipient is the hiring manager unless that role is confirmed for this contact.",
      );
      break;
    }
  }
  return errors;
}

export function redirectLineErrors(input: {
  text: string;
  includeRedirect: boolean;
}): string[] {
  const lowered = input.text.toLowerCase();
  const hit = outreachConfig.redirectPhrases.some((phrase) =>
    lowered.includes(phrase),
  );
  if (input.includeRedirect && !hit) {
    return [
      `Add the configured redirect: ${outreachConfig.redirectAsk}.`,
    ];
  }
  if (!input.includeRedirect && hit) {
    return [
      "Do not add a redirect line when this person's role is confirmed.",
    ];
  }
  return [];
}

export function genericRelevanceErrors(text: string): string[] {
  const lowered = text.toLowerCase();
  for (const phrase of outreachConfig.genericRelevancePhrases) {
    if (lowered.includes(phrase)) {
      return [
        "Explain why this Hiring Team role is relevant from that role's persona: their pressures, what the hire changes for them, or how the seeker's work would connect to theirs. Do not use a generic collaboration line.",
      ];
    }
  }
  return [];
}

function isRedirectSentence(text: string): boolean {
  const lowered = text.toLowerCase();
  return outreachConfig.redirectPhrases.some((phrase) => lowered.includes(phrase));
}

function isAskSentence(text: string): boolean {
  if (isRedirectSentence(text)) return false;
  if (text.includes("?")) return true;
  const lowered = text.toLowerCase();
  return outreachConfig.askPhrases.some((phrase) => lowered.includes(phrase));
}

function outreachBodyForQuality(content: ApplicationAssetContent): string {
  if (content.type === "EMAIL" || content.type === "LINKEDIN_INMAIL") {
    return content.paragraphs.map((claim) => claim.text).join("\n");
  }
  if (content.type === "LINKEDIN_CONNECTION_NOTE") return content.body.text;
  return "";
}

export function askAndRedirectCountErrors(text: string): string[] {
  const sentences = outreachSentences(text);
  const askCount = sentences.filter(isAskSentence).length;
  const redirectCount = sentences.filter(isRedirectSentence).length;
  const errors: string[] = [];
  if (askCount > 1) {
    errors.push("Use only one ask. Remove the extra request.");
  }
  if (redirectCount > 1) {
    errors.push("Use only one redirect line.");
  }
  return errors;
}

export function finalSentencePunctuationErrors(text: string): string[] {
  const sentences = outreachSentences(text);
  const last = sentences[sentences.length - 1];
  if (!last) return ["The message body was empty."];
  if (!/[.!?]"?$/.test(last.trim())) {
    return [
      "The final sentence must end with a period, question mark, or exclamation point.",
    ];
  }
  return [];
}

function isHedgedUnderstanding(text: string): boolean {
  const lowered = text.toLowerCase();
  return outreachConfig.seekerUnderstandingPhrases.some((phrase) =>
    lowered.includes(phrase),
  );
}

export function unsupportedRecipientFactErrors(input: {
  text: string;
  factTexts: string[];
}): string[] {
  const factHaystack = input.factTexts.join("\n").toLowerCase();
  for (const sentence of outreachSentences(input.text)) {
    const lowered = sentence.toLowerCase();
    const aboutRecipientTeam =
      /\b(?:your team|their team|the \w+ team)\b/.test(lowered);
    if (!aboutRecipientTeam) continue;
    const assertion = outreachConfig.recipientTeamAssertionPhrases.find(
      (phrase) => lowered.includes(phrase),
    );
    if (!assertion) continue;
    if (isHedgedUnderstanding(lowered)) continue;
    if (factHaystack.includes(assertion)) continue;
    return [
      "Do not state inferences about the recipient's team or work as fact. Phrase them as the seeker's understanding, or cite a persona or research FACT.",
    ];
  }
  return [];
}

export function thankYouNotesErrors(input: {
  text: string;
  notes: string;
}): string[] {
  const notes = input.notes.trim();
  if (!notes) {
    return ["Record post-stage notes before generating a thank-you or check-in."];
  }
  const lowered = input.text.toLowerCase();
  for (const phrase of outreachConfig.genericGratitudePhrases) {
    if (lowered.includes(phrase)) {
      return [
        "Reference a specific point from the seeker's post-stage notes. Do not use generic gratitude.",
      ];
    }
  }
  const noteTokens = sentenceTokens(notes);
  const textTokens = sentenceTokens(input.text);
  const overlap = [...noteTokens].filter((token) => textTokens.has(token)).length;
  if (noteTokens.size > 0 && overlap < 2) {
    return [
      "The message must reference a specific point from the seeker's post-stage notes.",
    ];
  }
  return [];
}

export function threadRepetitionErrors(input: {
  current: string;
  priorBodies: string[];
}): string[] {
  if (input.priorBodies.length === 0) return [];
  const currentSentences = outreachSentences(input.current);
  const errors: string[] = [];
  for (const prior of input.priorBodies) {
    for (const priorSentence of outreachSentences(prior)) {
      for (const current of currentSentences) {
        if (sentencesOverlap(current, priorSentence)) {
          errors.push(
            "This follow-up repeats a sentence or proof point from an earlier message in the thread. Add something new or write a brief check-in.",
          );
        }
      }
    }
  }
  return [...new Set(errors)];
}

export function followUpLengthErrors(input: {
  current: string;
  original: string;
}): string[] {
  const currentWords = input.current.split(/\s+/).filter(Boolean).length;
  const originalWords = input.original.split(/\s+/).filter(Boolean).length;
  if (originalWords > 0 && currentWords >= originalWords) {
    return [
      "The follow-up must be shorter than the earlier message and add something new rather than repeating it.",
    ];
  }
  return [];
}

function outreachSupportErrors(
  content: ApplicationAssetContent,
  context: ReadyApplicationGenerationContext,
): string[] {
  const sourceById = new Map(context.sources.map((source) => [source.id, source]));
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const claim of assetClaims(content)) {
    if (ids.has(claim.id)) errors.push(`Claim id ${claim.id} was duplicated.`);
    ids.add(claim.id);
    if (claim.supports.length === 0) continue;
    let hasAllowedSupport = false;
    for (const support of claim.supports) {
      const source = sourceById.get(support.sourceId);
      if (!source) {
        const allowed = citableSourceIds(context).join(", ");
        errors.push(
          `Claim ${claim.id} cites unknown source "${support.sourceId}". Use one of these source ids: ${allowed}.`,
        );
        continue;
      }
      if (!source.text.toLowerCase().includes(support.quote.trim().toLowerCase())) {
        errors.push(`Claim ${claim.id} cites words that are absent from its source.`);
      }
      if (isAllowedOutreachSource(source.category)) hasAllowedSupport = true;
    }
    if (!hasAllowedSupport) {
      errors.push(
        `Claim ${claim.id} must cite a supplied application, job, persona, Personal Profile FACT, or approved consultation source.`,
      );
    }
  }
  return errors;
}

export async function validateOutreachContent(input: {
  content: ApplicationAssetContent;
  context: ReadyApplicationGenerationContext;
  greeting: string;
  signerName: string;
  confirmedHiringManagerRole: boolean;
  purpose: "PROACTIVE" | "FOLLOW_UP" | "THANK_YOU" | "CHECK_IN";
  includeRedirect: boolean;
  priorMessages?: Array<{ subject: string | null; body: string }>;
  stageNotes?: string | null;
}): Promise<string[]> {
  if (
    input.content.type !== "EMAIL" &&
    input.content.type !== "LINKEDIN_CONNECTION_NOTE" &&
    input.content.type !== "LINKEDIN_INMAIL"
  ) {
    return ["The generated asset is not an outreach message."];
  }
  const claims = assetClaims(input.content);
  const texts = claims.map((claim) => claim.text);
  const composed = composeOutreachText(input.content);
  const bodyForQuality = outreachBodyForQuality(input.content);
  const qualityTexts = [
    ...texts,
    ...(composed.subject ? [composed.subject] : []),
  ];
  const factTexts = input.context.sources
    .filter(
      (source) =>
        source.category === "PERSONA" ||
        source.category === "COMPANY_RESEARCH" ||
        source.category === "JOB_REQUIREMENT",
    )
    .map((source) => source.text);
  const channel =
    input.content.type === "EMAIL" ? "email" : "linkedin";
  const errors = [
    ...outreachSupportErrors(input.content, input.context),
    ...outreachLimitErrors(input.content),
    ...hiringManagerClaimErrors({
      text: `${composed.subject ?? ""} ${composed.body}`,
      confirmedHiringManagerRole: input.confirmedHiringManagerRole,
      channel,
    }),
    ...bannedPhraseHits(qualityTexts, [
      ...consultationConfig.bannedPhrases,
      ...applicationAssetConfig.bannedPhrases,
    ]).map((phrase) => `Remove configured banned language: ${phrase}.`),
    ...qualityTexts.flatMap((text) =>
      validateRepetitionAndMetaLanguage({
        text,
        bannedPhrases: consultationConfig.interviewAnswerBannedPhrases,
      }),
    ),
    ...redirectLineErrors({
      text: composed.body,
      includeRedirect: input.includeRedirect,
    }),
    ...askAndRedirectCountErrors(bodyForQuality),
    ...finalSentencePunctuationErrors(bodyForQuality),
    ...unsupportedRecipientFactErrors({
      text: bodyForQuality,
      factTexts,
    }),
    ...(input.purpose === "PROACTIVE"
      ? genericRelevanceErrors(composed.body)
      : []),
    ...(input.purpose === "THANK_YOU" || input.purpose === "CHECK_IN"
      ? thankYouNotesErrors({
          text: bodyForQuality,
          notes: input.stageNotes ?? "",
        })
      : []),
  ];
  const priorBodies = (input.priorMessages ?? []).map((message) => message.body);
  if (input.purpose === "FOLLOW_UP" && priorBodies[0]) {
    errors.push(
      ...followUpLengthErrors({
        current: composed.body,
        original: priorBodies[0],
      }),
      ...threadRepetitionErrors({
        current: composed.body,
        priorBodies,
      }),
    );
  }
  if (input.content.greeting !== input.greeting) {
    errors.push("The message changed the required greeting.");
  }
  if (input.content.type === "EMAIL" && input.content.signerName !== input.signerName) {
    errors.push("The email changed the seeker's name.");
  }
  if (texts.some(mentionsInternalSystemState) || mentionsInternalSystemState(composed.body)) {
    errors.push("Remove references to internal system state.");
  }
  if (errors.length > 0) return [...new Set(errors)];
  const citedClaims = claims.filter((claim) => claim.supports.length > 0);
  if (citedClaims.length === 0) return [];
  const modelValidation = await validateAssetClaimsWithModel({
    claims: citedClaims,
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

function claimTrace(
  content: ApplicationAssetContent,
  context: ReadyApplicationGenerationContext,
) {
  return assetClaims(content).map((claim: AssetClaim) => ({
    claimId: claim.id,
    text: claim.text,
    supports: claim.supports,
  }));
}

async function saveOutreachVersion(input: {
  context: ReadyApplicationGenerationContext;
  type: ApplicationAssetType;
  personaId: string;
  contactId: string | null;
  purpose: ApplicationOutreachPurpose;
  followUpToAssetId: string | null;
  interviewStageId: string | null;
  emailLength: EmailLength | null;
  content: ApplicationAssetContent;
  guidance: string | null;
}): Promise<{ id: string; version: number }> {
  const groupKey = outreachGroupKey({
    type: input.type as "EMAIL" | "LINKEDIN_CONNECTION_NOTE" | "LINKEDIN_INMAIL",
    personaId: input.personaId,
    contactId: input.contactId,
    purpose: input.purpose,
    interviewStageId: input.interviewStageId,
  });
  return prisma.$transaction(
    async (tx) => {
      const latest = await tx.applicationAsset.aggregate({
        where: {
          campaignId: input.context.campaign.id,
          groupKey,
        },
        _max: { version: true },
      });
      const version = (latest._max.version ?? 0) + 1;
      return tx.applicationAsset.create({
        data: {
          organizationId: input.context.organizationId,
          campaignId: input.context.campaign.id,
          type: input.type,
          personaId: input.personaId,
          contactId: input.contactId,
          purpose: input.purpose,
          followUpToAssetId: input.followUpToAssetId,
          interviewStageId: input.interviewStageId,
          emailLength: input.emailLength,
          groupKey,
          version,
          contentJson: input.content as unknown as Prisma.InputJsonValue,
          claimTraceJson: claimTrace(
            input.content,
            input.context,
          ) as unknown as Prisma.InputJsonValue,
          guidance: input.guidance,
          promptVersion: outreachPromptVersion(input.type),
          status: "DRAFT",
        },
        select: { id: true, version: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function generateOutreachAsset(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  type: ApplicationAssetType;
  personaId: string;
  contactId?: string | null;
  purpose: ApplicationOutreachPurpose;
  followUpToAssetId?: string | null;
  interviewStageId?: string | null;
  emailLength?: EmailLength | null;
  regenerationInstruction?: string | null;
}): Promise<AssetGenerationResult> {
  if (!isOutreachAssetType(input.type)) {
    return {
      ok: false,
      message: "Outreach type is invalid.",
      violations: [],
    };
  }
  const personaId = input.personaId.trim();
  if (!personaId) {
    return {
      ok: false,
      message: `${vocab.persona.Singular} is required.`,
      violations: [],
    };
  }
  const base = await loadApplicationGenerationContext(
    input.campaignId,
    input.userId,
    { personaId },
  );
  if (base.organizationId !== input.organizationId) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  if (!base.requirement || !base.profile || !base.persona) {
    return {
      ok: false,
      message: `This ${vocab.campaign.singular} needs an approved ${vocab.product.singular}, job requirement, and ${vocab.persona.singular}.`,
      violations: [],
    };
  }
  const context = base as ReadyApplicationGenerationContext;
  const contactId = input.contactId?.trim() || null;
  let contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    linkedinUrl: string | null;
  } | null = null;
  let confirmedHiringManagerRole = false;
  let roleConfirmed = false;
  if (contactId) {
    const membership = await prisma.campaignContact.findFirst({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        contactId,
      },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            linkedinUrl: true,
          },
        },
        chosenPersona: { select: { suggestionKey: true } },
      },
    });
    if (!membership) {
      return {
        ok: false,
        message: `${vocab.contact.Singular} was not found on this ${vocab.campaign.singular}.`,
        violations: [],
      };
    }
    contact = membership.contact;
    roleConfirmed = membership.roleConfirmed;
    confirmedHiringManagerRole =
      membership.chosenPersona?.suggestionKey === "hiring_manager" ||
      (membership.chosenPersonaId === personaId &&
        context.persona?.suggestionKey === "hiring_manager");
  }
  const interviewPurpose =
    input.purpose === "THANK_YOU" || input.purpose === "CHECK_IN";
  let interviewStageNotes: string | null = null;
  const interviewStageId = input.interviewStageId?.trim() || null;
  if (interviewPurpose) {
    if (!interviewStageId || !contactId) {
      return {
        ok: false,
        message: "A thank-you or check-in needs a stage and an interviewer.",
        violations: [],
      };
    }
    const stage = await prisma.interviewStage.findFirst({
      where: {
        id: interviewStageId,
        campaignId: input.campaignId,
        organizationId: input.organizationId,
      },
      select: { notesAfter: true, outcome: true },
    });
    if (!stage) {
      return { ok: false, message: "Interview stage was not found.", violations: [] };
    }
    interviewStageNotes = stage.notesAfter?.trim() || null;
    if (!interviewStageNotes) {
      return {
        ok: false,
        message: interviewConfig.labels.recordNotesFirst,
        violations: [],
      };
    }
  }
  const includeRedirect = interviewPurpose
    ? false
    : shouldIncludeRedirect({
        hasContact: Boolean(contact),
        roleConfirmed,
      });
  if (
    input.purpose === "FOLLOW_UP" &&
    !input.followUpToAssetId?.trim()
  ) {
    return {
      ok: false,
      message: "A follow-up needs a sent message to reference.",
      violations: [],
    };
  }
  let priorMessage: { subject: string | null; body: string } | null = null;
  const priorMessages: Array<{ subject: string | null; body: string }> = [];
  let followUpToAssetId: string | null = null;
  if (input.purpose === "FOLLOW_UP") {
    const prior = await prisma.applicationAsset.findFirst({
      where: {
        id: input.followUpToAssetId!,
        campaignId: input.campaignId,
        organizationId: input.organizationId,
        sentAt: { not: null },
      },
    });
    if (!prior) {
      return {
        ok: false,
        message: "The earlier message was not found or has not been marked sent.",
        violations: [],
      };
    }
    const parsed = applicationAssetContentSchema.safeParse(prior.contentJson);
    if (!parsed.success) {
      return {
        ok: false,
        message: "The earlier message could not be read.",
        violations: parsed.error.issues.map((issue) => issue.message),
      };
    }
    priorMessage = composeOutreachText(parsed.data);
    priorMessages.push(priorMessage);
    let ancestorId = prior.followUpToAssetId;
    while (ancestorId) {
      const ancestor = await prisma.applicationAsset.findFirst({
        where: {
          id: ancestorId,
          campaignId: input.campaignId,
          organizationId: input.organizationId,
        },
      });
      if (!ancestor) break;
      const ancestorParsed = applicationAssetContentSchema.safeParse(
        ancestor.contentJson,
      );
      if (ancestorParsed.success) {
        priorMessages.push(composeOutreachText(ancestorParsed.data));
      }
      ancestorId = ancestor.followUpToAssetId;
    }
    followUpToAssetId = prior.id;
  }
  const channel = input.type === "EMAIL" ? "email" : "linkedin";
  const greeting = outreachGreeting({
    channel,
    firstName: contact ? contactFirstName(contact) : null,
  });
  const signerName = context.profile.identity.name?.text ?? "";
  if (input.type === "EMAIL" && !signerName) {
    return {
      ok: false,
      message: "The Personal Profile needs a confirmed name before email can be generated.",
      violations: [],
    };
  }
  const emailLength =
    input.type === "EMAIL" ? input.emailLength ?? "MEDIUM" : null;
  let feedback: string[] = [];
  const attempts =
    applicationAssetConfig.generation.qualityRegenerationAttempts +
    outreachConfig.generation.limitRegenerationAttempts;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const generated = await generateOutreachWithModel({
      context,
      type: input.type,
      greeting,
      signerName,
      confirmedHiringManagerRole,
      includeRedirect,
      purpose: input.purpose,
      emailLength,
      priorMessage,
      interviewStageNotes,
      regenerationInstruction: input.regenerationInstruction ?? null,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      feedback = [generated.message];
      if (attempt === attempts) {
        return { ok: false, message: generated.message, violations: feedback };
      }
      continue;
    }
    const content = generated.data;
    const violations = await validateOutreachContent({
      content,
      context,
      greeting,
      signerName,
      confirmedHiringManagerRole,
      purpose: input.purpose,
      includeRedirect,
      priorMessages,
      stageNotes: interviewStageNotes,
    });
    if (violations.length === 0) {
      const saved = await saveOutreachVersion({
        context,
        type: input.type,
        personaId,
        contactId,
        purpose: input.purpose,
        followUpToAssetId,
        interviewStageId,
        emailLength,
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
      "The message was not saved because it did not pass verification. Retry after reviewing the violations.",
    violations: feedback,
  };
}

export async function markOutreachSent(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  assetId: string;
  sentAt: Date;
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
    select: { id: true, type: true },
  });
  if (!asset || !isOutreachAssetType(asset.type)) {
    throw new TenantError("Outreach message was not found.");
  }
  if (Number.isNaN(input.sentAt.getTime())) {
    throw new TenantError("Sent date is invalid.");
  }
  await prisma.applicationAsset.update({
    where: { id: asset.id },
    data: { sentAt: input.sentAt, status: "APPROVED" },
  });
}

export async function markApplicationApplied(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  appliedAt: Date;
}): Promise<void> {
  if (Number.isNaN(input.appliedAt.getTime())) {
    throw new TenantError("Applied date is invalid.");
  }
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      ownerUserId: input.userId,
    },
    select: { id: true, applicationProgress: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  const updated = await prisma.campaign.updateMany({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      ownerUserId: input.userId,
    },
    data: {
      appliedAt: input.appliedAt,
      applicationProgress: campaign.applicationProgress ?? "APPLIED",
    },
  });
  if (updated.count === 0) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
}
