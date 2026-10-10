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
import {
  orderRolesMostRecentFirst,
  type RequiredResumeStatement,
  type RoleBulletPlan,
} from "./resume-statement-picks";

function seekerSources(context: ApplicationGenerationContext) {
  return context.sources.filter((source) =>
    [
      "PROFILE_FACT",
      "APPROVED_STATEMENT",
      "APPROVED_STORY",
      "SEEKER_REPLY",
    ].includes(source.category),
  );
}

/** Caps from the outreach input-size report. Selection is by relevance, not source. */
export const OUTREACH_INPUT_LIMITS = {
  facts: 8,
  factChars: 400,
  statements: 8,
  statementChars: 500,
  stories: 4,
  storyChars: 400,
  personaChars: 2_000,
  jobChars: 2_000,
  companyFactChars: 500,
  voiceChars: 1_200,
  messageCharCap: 20_000,
} as const;

const STORY_FIELDS = [
  "situation",
  "task",
  "action",
  "result",
  "verbatimAnswer",
  "interviewAnswer",
  "resumeBullet",
] as const;

const RELEVANCE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
]);

type SeekerKind = "fact" | "statement" | "story";

export type OutreachCitableSource = {
  id: string;
  category: string;
  text: string;
};

function capText(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const space = slice.lastIndexOf(" ");
  return (space > max * 0.6 ? slice.slice(0, space) : slice).trim();
}

const FIGURE_PATTERNS = [
  /\$\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:mm|bn|k|m|b)\b)?/gi,
  /\b\d[\d,]*(?:\.\d+)?\s*(?:mm|bn|k)\b/gi,
  /\b\d+(?:\.\d+)?\s+of\s+\d+(?:\.\d+)?\b/gi,
  /\d+(?:\.\d+)?\s*(?:%|percent\b)/gi,
  /\b\d[\d,]*(?:\.\d+)?\b/g,
];

/** Percentages, money (including K/MM), ratios, counts, and plain numbers. */
function figuresIn(text: string): string[] {
  const spans: Array<{ start: number; end: number; key: string }> = [];
  for (const pattern of FIGURE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (spans.some((span) => start < span.end && end > span.start)) continue;
      const key = match[0].replace(/[$,]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      if (key) spans.push({ start, end, key });
    }
  }
  return [...new Set(spans.map((span) => span.key))];
}

/** A before-and-after fact keeps every figure, inside the same character cap. */
function capTextKeepingFigures(text: string, max: number): string {
  const needed = figuresIn(text);
  const capped = capText(text, max);
  if (needed.length < 2) return capped;
  if (needed.every((figure) => figuresIn(capped).includes(figure))) return capped;
  const sentences = text
    .trim()
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const figures = figuresIn(sentence);
    if (!figures.some((figure) => !seen.has(figure))) continue;
    kept.push(sentence);
    for (const figure of figures) seen.add(figure);
    if (needed.every((figure) => seen.has(figure))) break;
  }
  const excerpt = kept.join(" ");
  if (!excerpt) return capped;
  if (excerpt.length <= max && needed.every((figure) => figuresIn(excerpt).includes(figure))) {
    return excerpt;
  }
  return capText(excerpt, max);
}

function plainTexts(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(plainTexts);
  if (value && typeof value === "object" && "text" in value) {
    return plainTexts((value as { text?: unknown }).text);
  }
  return [];
}

function relevanceTerms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return [
    ...new Set(
      words.filter((word) => word.length > 2 && !RELEVANCE_STOP_WORDS.has(word)),
    ),
  ];
}

function relevanceScore(text: string, terms: readonly string[]): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function normalizedFact(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function personaExcerpt(
  context: ReadyApplicationGenerationContext,
): string | null {
  const persona = context.persona;
  if (!persona) return null;
  const parts = [persona.name, persona.likelyTitles.filter(Boolean).join(", ")];
  const source = context.sources.find((item) => item.id === `persona:${persona.id}`);
  if (source) {
    const jsonAt = source.text.indexOf("{");
    const prefix = (jsonAt >= 0 ? source.text.slice(0, jsonAt) : source.text).trim();
    const withoutName = prefix
      .replace(persona.name, "")
      .replace(/^[.\s]+/, "")
      .replace(/[.\s]+$/, "");
    if (withoutName) parts.push(withoutName);
  }
  const profile = persona.profileJson;
  const narrative =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? (profile as { narrative?: unknown }).narrative
      : null;
  if (narrative && typeof narrative === "object" && !Array.isArray(narrative)) {
    const fields = narrative as Record<string, unknown>;
    for (const key of ["overview", "pressures", "impact"]) {
      parts.push(...plainTexts(fields[key]));
    }
  }
  const text = capText(parts.filter(Boolean).join("\n"), OUTREACH_INPUT_LIMITS.personaChars);
  return text || null;
}

function jobExcerpt(context: ReadyApplicationGenerationContext): string | null {
  const requirement = context.requirement;
  if (!requirement) return null;
  const parts = [
    requirement.title,
    requirement.companyName,
    requirement.location,
    ...requirement.requiredItems,
    ...requirement.responsibilities,
  ].filter((part): part is string => Boolean(part?.trim()));
  const text = capText(parts.join("\n"), OUTREACH_INPUT_LIMITS.jobChars);
  return text || null;
}

function seekerKind(source: { id: string; category: string }): SeekerKind | null {
  if (source.category === "PROFILE_FACT") return "fact";
  if (source.id.startsWith("seeker-bullet:") || source.id.startsWith("bullet-edit:")) {
    return "fact";
  }
  if (source.category === "APPROVED_STATEMENT" || source.category === "SEEKER_REPLY") {
    return "statement";
  }
  return null;
}

/**
 * Highest-scoring seeker material, capped per kind. Equal scores keep source order.
 * The same text is kept once, in the higher-scoring copy.
 */
export function selectOutreachSeekerMaterial(input: {
  context: ReadyApplicationGenerationContext;
  personaText: string | null;
  jobText: string | null;
}): {
  facts: OutreachCitableSource[];
  statements: OutreachCitableSource[];
  stories: OutreachCitableSource[];
} {
  const terms = relevanceTerms(
    [input.personaText, input.jobText].filter(Boolean).join("\n"),
  );
  const ranked: Array<{
    id: string;
    category: string;
    text: string;
    kind: SeekerKind;
    score: number;
    index: number;
    maxChars: number;
  }> = [];
  let index = 0;
  for (const source of input.context.sources) {
    const kind = seekerKind(source);
    if (!kind || !source.text.trim()) continue;
    ranked.push({
      id: source.id,
      category: source.category,
      text: source.text,
      kind,
      score: relevanceScore(source.text, terms),
      index,
      maxChars:
        kind === "fact"
          ? OUTREACH_INPUT_LIMITS.factChars
          : OUTREACH_INPUT_LIMITS.statementChars,
    });
    index += 1;
  }
  for (const story of input.context.stories ?? []) {
    const fields = STORY_FIELDS.map((field, fieldIndex) => {
      const text = story[field]?.trim() ?? "";
      return {
        fieldIndex,
        text,
        score: text ? relevanceScore(text, terms) : -1,
      };
    }).filter((field) => field.text);
    if (fields.length === 0) continue;
    fields.sort((a, b) => b.score - a.score || a.fieldIndex - b.fieldIndex);
    const best = fields[0]!;
    const situation = story.situation?.trim() ?? "";
    const result = story.result?.trim() ?? "";
    const starting = figuresIn(situation);
    const ending = figuresIn(result);
    const statesChange =
      starting.some((figure) => !ending.includes(figure)) &&
      ending.some((figure) => !starting.includes(figure));
    const text = statesChange ? `${situation} ${result}` : best.text;
    ranked.push({
      id: `story:${story.id}`,
      category: "SEEKER_STORY",
      text,
      kind: "story",
      score: statesChange ? Math.max(best.score, relevanceScore(text, terms)) : best.score,
      index,
      maxChars: OUTREACH_INPUT_LIMITS.storyChars,
    });
    index += 1;
  }
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const limits: Record<SeekerKind, number> = {
    fact: OUTREACH_INPUT_LIMITS.facts,
    statement: OUTREACH_INPUT_LIMITS.statements,
    story: OUTREACH_INPUT_LIMITS.stories,
  };
  const counts: Record<SeekerKind, number> = { fact: 0, statement: 0, story: 0 };
  const seen = new Set<string>();
  const chosen: Record<SeekerKind, OutreachCitableSource[]> = {
    fact: [],
    statement: [],
    story: [],
  };
  for (const item of ranked) {
    const key = normalizedFact(item.text);
    if (!key || seen.has(key) || counts[item.kind] >= limits[item.kind]) continue;
    seen.add(key);
    counts[item.kind] += 1;
    chosen[item.kind].push({
      id: item.id,
      category: item.category,
      text: capTextKeepingFigures(item.text, item.maxChars),
    });
  }
  return {
    facts: chosen.fact,
    statements: chosen.statement,
    stories: chosen.story,
  };
}

function jobRequirementPrefix(context: ReadyApplicationGenerationContext) {
  const requirement = context.requirement;
  if (!requirement) return null;
  return {
    title: requirement.title,
    companyName: requirement.companyName,
    location: requirement.location,
    workArrangement: requirement.workArrangement,
    seniority: requirement.seniority,
    reportingLine: requirement.reportingLine,
    compensationRange: requirement.compensationRange,
    responsibilities: requirement.responsibilities,
    requiredItems: requirement.requiredItems,
    preferredItems: requirement.preferredItems,
    scorecard: requirement.scorecard,
  };
}

function companyResearchPrefix(context: ReadyApplicationGenerationContext) {
  const research = context.companyResearch;
  if (!research) return null;
  return {
    companySummary: research.companySummary,
    whatTheySell: research.whatTheySell,
    customerTypes: research.customerTypes,
    primaryMarkets: research.primaryMarkets,
    businessModel: research.businessModel,
    companySizeContext: research.companySizeContext,
    hiringSignals: research.hiringSignals,
    riskSignals: research.riskSignals,
    jobFocus: research.jobFocus ?? null,
    jobFocusDetail: research.jobFocusDetail ?? null,
  };
}

function personalProfilePrefix(context: ReadyApplicationGenerationContext) {
  const profile = context.profile;
  if (!profile) return null;
  return {
    identity: profile.identity,
    experience: profile.experience,
    education: profile.education,
    skills: profile.skills,
    credentials: profile.credentials,
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
  condensedRoleIds: string[];
  regenerationInstruction: string | null;
  qualityFeedback: string[];
  requiredStatements?: RequiredResumeStatement[];
  roleBulletPlans?: RoleBulletPlan[];
  backgroundEvidence?: string[];
}): AiMessage[] {
  const contact = input.context.profile.identity;
  const profilePrefix = personalProfilePrefix(input.context);
  return [
    {
      role: "system",
      content: `Prompt version: ${RESUME_ASSET_PROMPT_VERSION}\n\n${RESUME_ASSET_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        personalProfile: profilePrefix
          ? {
              ...profilePrefix,
              experience: orderRolesMostRecentFirst(profilePrefix.experience),
            }
          : profilePrefix,
        jobRequirement: jobRequirementPrefix(input.context),
        companyResearch: companyResearchPrefix(input.context),
        approvedStatements: input.context.approvedStatements,
        approvedStories: input.context.stories,
        voiceSamples: input.context.voiceSamples,
        seekerSources: seekerSources(input.context),
        sources: input.context.sources.filter((source) =>
          [
            "PROFILE_FACT",
            "APPROVED_STATEMENT",
            "APPROVED_STORY",
            "SEEKER_REPLY",
            "JOB_REQUIREMENT",
            "COMPANY_RESEARCH",
          ].includes(source.category),
        ),
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        applicationGuidance: input.context.campaign.applicationGuidance,
        regenerationInstruction: input.regenerationInstruction,
        qualityFeedback: input.qualityFeedback,
        seekerVoiceInstruction: applicationAssetConfig.seekerVoiceInstruction,
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
        hiddenRoleIds: input.hiddenRoleIds,
        condensedRoleIds: input.condensedRoleIds,
        pickedBullets: input.requiredStatements ?? [],
        requiredStatements: input.requiredStatements ?? [],
        roleBulletPlans: input.roleBulletPlans ?? [],
        backgroundEvidence: input.backgroundEvidence ?? [],
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
              condensed: "boolean from condensedRoleIds only",
              bullets: [],
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
  backgroundEvidence?: string[];
}): AiMessage[] {
  return [
    {
      role: "system",
      content: `Prompt version: ${COVER_LETTER_ASSET_PROMPT_VERSION}\n\n${COVER_LETTER_ASSET_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        personalProfile: personalProfilePrefix(input.context),
        jobRequirement: jobRequirementPrefix(input.context),
        companyResearch: companyResearchPrefix(input.context),
        approvedStatements: input.context.approvedStatements,
        approvedStories: input.context.stories,
        voiceSamples: input.context.voiceSamples,
        seekerSources: seekerSources(input.context),
        sources: input.context.sources.filter((source) =>
          [
            "PROFILE_FACT",
            "APPROVED_STATEMENT",
            "APPROVED_STORY",
            "JOB_REQUIREMENT",
            "COMPANY_RESEARCH",
          ].includes(source.category),
        ),
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        applicationGuidance: input.context.campaign.applicationGuidance,
        regenerationInstruction: input.regenerationInstruction,
        qualityFeedback: input.qualityFeedback,
        seekerVoiceInstruction: applicationAssetConfig.seekerVoiceInstruction,
        salutation: input.salutation,
        signerName: input.context.profile.identity.name?.text ?? "",
        backgroundEvidence: input.backgroundEvidence ?? [],
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

export type OutreachFactCandidate = {
  candidateId: string;
  text: string;
};

export function outreachFactCandidates(
  context: ReadyApplicationGenerationContext,
): OutreachFactCandidate[] {
  const candidates: OutreachFactCandidate[] = [];
  const research = companyResearchPrefix(context);
  if (research) {
    const fields: Array<[string, string | string[] | null]> = [
      ["summary", research.companySummary],
      ["whatTheySell", research.whatTheySell],
      ["businessModel", research.businessModel],
      ["companySize", research.companySizeContext],
      ["customers", research.customerTypes],
      ["markets", research.primaryMarkets],
      ["hiringSignals", research.hiringSignals],
    ];
    for (const [key, value] of fields) {
      const text = Array.isArray(value)
        ? value.filter(Boolean).join("; ")
        : value?.trim() ?? "";
      if (text) candidates.push({ candidateId: `research:${key}`, text });
    }
  }
  if (context.persona) {
    candidates.push({
      candidateId: `persona:${context.persona.id}`,
      text: [context.persona.name, context.persona.likelyTitles.join(", ")]
        .filter(Boolean)
        .join(" — "),
    });
  }
  return candidates;
}

export function buildOutreachFactSelectionMessages(input: {
  context: ReadyApplicationGenerationContext;
  purpose: OutreachGenerationInput["purpose"];
  candidates: OutreachFactCandidate[];
}): AiMessage[] {
  return [
    {
      role: "system",
      content:
        "Select up to three company or role facts that should shape this outreach. Prefer concrete, current facts. If none are relevant, set noneRelevant true.",
    },
    {
      role: "user",
      content: JSON.stringify({
        purpose: input.purpose,
        jobTitle: input.context.requirement?.title ?? null,
        companyName: input.context.requirement?.companyName ?? null,
        candidates: input.candidates,
      }),
    },
  ];
}

export function buildOutreachAssetMessages(
  input: OutreachGenerationInput & {
    selectedFacts: OutreachFactCandidate[];
  },
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
  const personaText = personaExcerpt(input.context);
  const jobText = jobExcerpt(input.context);
  const seeker = selectOutreachSeekerMaterial({
    context: input.context,
    personaText,
    jobText,
  });
  const seen = new Set(
    [...seeker.facts, ...seeker.statements, ...seeker.stories].map((source) =>
      normalizedFact(source.text),
    ),
  );
  const companyFacts = input.selectedFacts.slice(0, 3).flatMap((fact) => {
    const text = capText(fact.text, OUTREACH_INPUT_LIMITS.companyFactChars);
    const key = normalizedFact(text);
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [{ id: fact.candidateId, category: "COMPANY_RESEARCH", text }];
  });
  const applied = input.mentionApplied
    ? input.context.sources.find((source) => source.id === "application:status")
    : undefined;
  const status = applied?.text.trim() ? applied : undefined;
  const voice = (input.context.voiceSamples ?? [])[0];
  const voiceSample = voice
    ? {
        id: voice.id,
        text: capText(voice.sampleText, OUTREACH_INPUT_LIMITS.voiceChars),
      }
    : null;
  const usesThread =
    input.purpose === "FOLLOW_UP" ||
    input.purpose === "THANK_YOU" ||
    input.purpose === "CHECK_IN";
  const priorMessages = usesThread
    ? input.priorMessages?.length
      ? input.priorMessages
      : input.priorMessage
        ? [input.priorMessage]
        : []
    : [];
  const citableSources = [
    ...(personaText
      ? [
          {
            id: `persona:${input.context.persona!.id}`,
            category: "PERSONA",
            text: personaText,
          },
        ]
      : []),
    ...(jobText ? [{ id: "job:posting", category: "JOB_REQUIREMENT", text: jobText }] : []),
    ...(status
      ? [{ id: status.id, category: status.category, text: capText(status.text, 500) }]
      : []),
    ...companyFacts,
    ...seeker.facts,
    ...seeker.statements,
    ...seeker.stories,
  ];
  return [
    {
      role: "system",
      content: `Prompt version: ${version}\n\n${instructions}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        citableSources,
        ...(voiceSample ? { voiceSample } : {}),
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        greeting: input.greeting,
        signerName: input.signerName,
        confirmedHiringManagerRole: input.confirmedHiringManagerRole,
        includeRedirect: input.includeRedirect,
        redirectAsk: input.includeRedirect ? outreachConfig.redirectAsk : null,
        purpose: input.purpose,
        mentionApplied: input.mentionApplied,
        ...(priorMessages.length ? { priorMessages } : {}),
        ...(usesThread && input.interviewStageNotes
          ? { interviewStageNotes: input.interviewStageNotes }
          : {}),
        emailLength: input.emailLength,
        wordTarget,
        characterLimits: {
          connectionNote: outreachConfig.linkedinLimits.connectionNoteChars,
          bodyMaxChars:
            input.type === "LINKEDIN_CONNECTION_NOTE"
              ? connectionNoteBodyBudget(input.greeting)
              : outreachConfig.linkedinLimits.inMailBodyChars,
          inMailSubject: outreachConfig.linkedinLimits.inMailSubjectChars,
          inMailBody: outreachConfig.linkedinLimits.inMailBodyChars,
        },
        regenerationInstruction: input.regenerationInstruction,
        ...(input.qualityFeedback.length
          ? { qualityFeedback: input.qualityFeedback }
          : {}),
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
        sources: input.sources,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        claims: input.claims,
        responseShape: {
          violations: [{ claimId: "string", reason: "string" }],
        },
      }),
    },
  ];
}
