import type { AiMessage } from "@/lib/ai/types";
import type {
  ApplicationGenerationContext,
  ReadyApplicationGenerationContext,
} from "@/lib/generation/context";
import {
  ASSET_CLAIM_VALIDATION_INSTRUCTIONS,
  COVER_LETTER_ASSET_INSTRUCTIONS,
  OUTREACH_EMAIL_INSTRUCTIONS,
  OUTREACH_LINKEDIN_INMAIL_INSTRUCTIONS,
  OUTREACH_LINKEDIN_NOTE_INSTRUCTIONS,
  RESUME_ASSET_INSTRUCTIONS,
} from "@/lib/prompt-content";
import {
  applicationAssetConfig,
  connectionNoteBodyBudget,
  consultationConfig,
  outreachConfig,
} from "@/lib/product-config";
import {
  ASSET_CLAIM_VALIDATION_PROMPT_VERSION,
  COVER_LETTER_ASSET_PROMPT_VERSION,
  OUTREACH_EMAIL_PROMPT_VERSION,
  OUTREACH_LINKEDIN_INMAIL_PROMPT_VERSION,
  OUTREACH_LINKEDIN_NOTE_PROMPT_VERSION,
  RESUME_ASSET_PROMPT_VERSION,
  type AssetClaim,
} from "./contract";
import type { OutreachGenerationInput } from "./outreach-types";

function seekerSources(context: ApplicationGenerationContext) {
  return context.sources.filter((source) =>
    [
      "PROFILE_FACT",
      "APPROVED_STATEMENT",
      "APPROVED_STORY",
    ].includes(source.category),
  );
}

function outreachCitableSources(context: ApplicationGenerationContext) {
  return context.sources
    .filter((source) =>
      [
        "PROFILE_FACT",
        "APPROVED_STATEMENT",
        "APPROVED_STORY",
        "APPLICATION",
        "JOB_REQUIREMENT",
        "PERSONA",
      ].includes(source.category),
    )
    .map((source) => ({
      id: source.id,
      category: source.category,
      text: source.text,
    }));
}

function commonPayload(context: ReadyApplicationGenerationContext) {
  return {
    application: context.campaign,
    jobRequirement: context.requirement,
    companyResearch: context.companyResearch,
    persona: context.persona,
    assessments: context.assessments,
    approvedStatements: context.approvedStatements,
    approvedStories: context.stories,
    voiceSamples: context.voiceSamples,
    sources: context.sources,
  };
}

function resumeTargetLength(context: ReadyApplicationGenerationContext) {
  const seniority = context.requirement?.seniority?.toLowerCase() ?? "";
  if (
    applicationAssetConfig.seniorityBandTerms.executive.some((term) =>
      seniority.includes(term),
    )
  ) {
    return applicationAssetConfig.resumeTargetWordsBySeniority.executive;
  }
  if (
    applicationAssetConfig.seniorityBandTerms.senior.some((term) =>
      seniority.includes(term),
    )
  ) {
    return applicationAssetConfig.resumeTargetWordsBySeniority.senior;
  }
  return applicationAssetConfig.resumeTargetWordsBySeniority.default;
}

export function buildResumeAssetMessages(input: {
  context: ReadyApplicationGenerationContext;
  hiddenRoleIds: string[];
  regenerationInstruction: string | null;
  qualityFeedback: string[];
}): AiMessage[] {
  const contact = input.context.profile.identity;
  return [
    {
      role: "system",
      content: `Prompt version: ${RESUME_ASSET_PROMPT_VERSION}\n\n${RESUME_ASSET_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        ...commonPayload(input.context),
        applicationGuidance: input.context.campaign.applicationGuidance,
        regenerationInstruction: input.regenerationInstruction,
        qualityFeedback: input.qualityFeedback,
        bannedPhrases: [
          ...consultationConfig.bannedPhrases,
          ...applicationAssetConfig.bannedPhrases,
        ],
        targetLength: resumeTargetLength(input.context),
        headerFacts: [
          contact.name,
          contact.email,
          contact.phone,
          contact.cityState,
          contact.linkedinUrl,
          contact.personalSite,
        ]
          .filter(Boolean)
          .map((item) => ({
            sourceId: `profile:${item!.id}`,
            text: item!.text,
          })),
        experience: input.context.profile.experience,
        hiddenRoleIds: input.hiddenRoleIds,
        seekerSources: seekerSources(input.context),
        responseShape: {
          type: "RESUME",
          header: {
            name: "claim",
            contactDetails: ["claim"],
          },
          summary: ["claim"],
          experience: [
            {
              roleId: "exact supplied role id",
              employer: "exact supplied employer",
              title: "exact supplied title",
              startDate: "exact supplied date|null",
              endDate: "exact supplied date|null",
              location: "exact supplied location|null",
              hidden: "boolean from hiddenRoleIds only",
              bullets: ["claim"],
            },
          ],
          skills: ["claim"],
          education: ["claim"],
          credentials: ["claim"],
          claim: {
            id: "unique string",
            text: "string",
            supports: [{ sourceId: "supplied source id", quote: "exact quote" }],
          },
        },
      }),
    },
  ];
}

export function buildCoverLetterAssetMessages(input: {
  context: ReadyApplicationGenerationContext;
  salutation: string;
  regenerationInstruction: string | null;
  qualityFeedback: string[];
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${COVER_LETTER_ASSET_PROMPT_VERSION}\n\n${COVER_LETTER_ASSET_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        ...commonPayload(input.context),
        applicationGuidance: input.context.campaign.applicationGuidance,
        regenerationInstruction: input.regenerationInstruction,
        qualityFeedback: input.qualityFeedback,
        bannedPhrases: [
          ...consultationConfig.bannedPhrases,
          ...applicationAssetConfig.bannedPhrases,
        ],
        salutation: input.salutation,
        signerName: input.context.profile.identity.name?.text ?? "",
        responseShape: {
          type: "COVER_LETTER",
          salutation: "exact supplied salutation",
          paragraphs: ["claim"],
          signoff: "professional signoff",
          signerName: "exact supplied signer name",
          claim: {
            id: "unique string",
            text: "string",
            supports: [{ sourceId: "supplied source id", quote: "exact quote" }],
          },
        },
      }),
    },
  ];
}

function outreachClaimShape() {
  return {
    id: "unique string",
    text: "string",
    supports: [{ sourceId: "supplied source id", quote: "exact quote" }],
  };
}

export function buildOutreachAssetMessages(
  input: OutreachGenerationInput,
): AiMessage[] {
  const instructions =
    input.type === "EMAIL"
      ? OUTREACH_EMAIL_INSTRUCTIONS
      : input.type === "LINKEDIN_CONNECTION_NOTE"
        ? OUTREACH_LINKEDIN_NOTE_INSTRUCTIONS
        : OUTREACH_LINKEDIN_INMAIL_INSTRUCTIONS;
  const version =
    input.type === "EMAIL"
      ? OUTREACH_EMAIL_PROMPT_VERSION
      : input.type === "LINKEDIN_CONNECTION_NOTE"
        ? OUTREACH_LINKEDIN_NOTE_PROMPT_VERSION
        : OUTREACH_LINKEDIN_INMAIL_PROMPT_VERSION;
  const wordTarget =
    input.type === "EMAIL" && input.emailLength
      ? outreachConfig.emailWordTargets[input.emailLength]
      : null;
  const responseShape =
    input.type === "EMAIL"
      ? {
          type: "EMAIL",
          subject: "string",
          greeting: "exact supplied greeting",
          paragraphs: ["claim"],
          signoff: "professional signoff",
          signerName: "exact supplied signer name",
          claim: outreachClaimShape(),
        }
      : input.type === "LINKEDIN_CONNECTION_NOTE"
        ? {
            type: "LINKEDIN_CONNECTION_NOTE",
            greeting: "exact supplied greeting",
            body: "claim",
            claim: outreachClaimShape(),
          }
        : {
            type: "LINKEDIN_INMAIL",
            subject: "string",
            greeting: "exact supplied greeting",
            paragraphs: ["claim"],
            claim: outreachClaimShape(),
          };
  return [
    {
      role: "system",
      content: `Prompt version: ${version}\n\n${instructions}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        ...commonPayload(input.context),
        applicationGuidance: input.context.campaign.applicationGuidance,
        appliedAt: input.context.campaign.appliedAt,
        voiceSamples: input.context.voiceSamples,
        seekerAnswers: input.context.seekerAnswers,
        greeting: input.greeting,
        signerName: input.signerName,
        confirmedHiringManagerRole: input.confirmedHiringManagerRole,
        includeRedirect: input.includeRedirect,
        redirectAsk: input.includeRedirect ? outreachConfig.redirectAsk : null,
        purpose: input.purpose,
        priorMessage: input.priorMessage,
        interviewStageNotes: input.interviewStageNotes,
        emailLength: input.emailLength,
        wordTarget,
        citableSources: outreachCitableSources(input.context),
        characterLimits: {
          connectionNote: outreachConfig.linkedinLimits.connectionNoteChars,
          bodyMaxChars:
            input.type === "LINKEDIN_CONNECTION_NOTE"
              ? connectionNoteBodyBudget(input.greeting)
              : outreachConfig.linkedinLimits.inMailBodyChars,
          inMailSubject: outreachConfig.linkedinLimits.inMailSubjectChars,
          inMailBody: outreachConfig.linkedinLimits.inMailBodyChars,
        },
        bannedPhrases: [
          ...consultationConfig.bannedPhrases,
          ...applicationAssetConfig.bannedPhrases,
        ],
        regenerationInstruction: input.regenerationInstruction,
        qualityFeedback: input.qualityFeedback,
        responseShape,
      }),
    },
  ];
}

export function buildAssetClaimValidationMessages(input: {
  claims: AssetClaim[];
  sources: ApplicationGenerationContext["sources"];
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${ASSET_CLAIM_VALIDATION_PROMPT_VERSION}\n\n${ASSET_CLAIM_VALIDATION_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        claims: input.claims,
        sources: input.sources,
        responseShape: {
          violations: [{ claimId: "string", reason: "string" }],
        },
      }),
    },
  ];
}
