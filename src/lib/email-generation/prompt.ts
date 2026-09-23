import type { AiMessage } from "@/lib/ai/types";
import type { ReplyClassification } from "@prisma/client";
import type { EmailGenerationContext } from "@/lib/email-generation/context";
import {
  buildRuntimeReasoningSketch,
  COMPANY_RESEARCH_USE_INSTRUCTIONS,
} from "@/lib/email-generation/company-research-use";
import {
  REQUIRED_MOTION_SPECIFICS_INSTRUCTIONS,
  type RequiredMotionSpecific,
} from "@/lib/email-generation/motion-specifics";
import {
  PERSONALIZATION_TIER_INSTRUCTIONS,
  contactResearchForPrompt,
  resolvePersonalizationForGeneration,
  type PersonalizationDecision,
} from "@/lib/email-generation/personalization";

export const EMAIL_GENERATION_PROMPT_VERSION = "18";
export const ADDITIONAL_GUIDANCE_MAX_CHARS = 200;

/** Pure length gate — call before any auth, Prisma, or model work. */
export function additionalGuidanceRejection(
  additionalGuidance?: string | null,
): { ok: false; message: string } | null {
  const normalized = additionalGuidance?.trim() || null;
  if (normalized && normalized.length > ADDITIONAL_GUIDANCE_MAX_CHARS) {
    return {
      ok: false,
      message: `What should change must be ${ADDITIONAL_GUIDANCE_MAX_CHARS} characters or fewer.`,
    };
  }
  return null;
}

export type EmailPromptOptions = {
  personalization: PersonalizationDecision;
  requiredMotionSpecifics: RequiredMotionSpecific[];
};

const SYSTEM_PROMPT = `You write concise, credible one-to-one outbound emails.

Use the supplied context in this strict priority order:
1. Per-contact regeneration instructions, when supplied. They override campaign guidance and writing defaults.
2. Additional campaign instructions, when supplied. They override writing defaults.
3. The campaign offer and call to action.
4. Opening problem framing (hard): establish the executive or business problem from openingProblemFraming before naming the product or any product capability. PainPoints lead; messagingNotes inform tone and emphasis only.
5. Required company specifics, when requiredMotionSpecifics is non-empty: Reason FROM at least one listed specific to the executive problem (mandatory and checkable). The specific must do causal work, but it need not occupy a fixed sentence or paragraph position.
6. Company research, when personalization.companyResearchUsable is true: infer selling motion and connect it to this product's problem in that motion. Do not restate what the company does.
7. Persona as angle only: which value prop leads, what this role cares about, what objections to preempt, what vocabulary to use. Persona is not personalization.
8. Contact role research, when personalization.contactResearchUsable is true: roleSummary, responsibilities, ownershipAreas only.
9. Supported product claims and terminology constraints.
10. The first writing sample, when supplied, as the authoritative style reference.

Never invent customer names, metrics, case studies, product capabilities, offer terms, or facts about the recipient. Product claimsNotToMake, terminologyToAvoid, and persona messaging notes are hard constraints regardless of the priority list. Campaign offer terms are authoritative only when they appear in the supplied offer. If optional context is empty, continue without it.
Per-contact regeneration instructions override additional campaign instructions and writing defaults, but they cannot override factual constraints, the selected emailStructure, JSON-only output, the sign-off prohibition, or the em dash prohibition.
Additional campaign instructions may override writing and template defaults, including the default prohibition on bullets, but they cannot override factual constraints, the selected emailStructure, JSON-only output, the sign-off prohibition, or the em dash prohibition.

Writing and structure rules:
- Follow the selected emailStructure exactly. It is authoritative for content-block count, sentence count, and word range. A content block is a prose paragraph, or a requested bullet list replacing one prose paragraph.
- FIXED_THIN is an exact fallback. FLEXIBLE_RESEARCH varies the rhetorical approach and where supported facts, product context, and the next step appear, but it never changes the selected length.
- The first sentence must not name the product, lead with a product mechanism, or assert a company situation without support from requiredMotionSpecifics.
- For COMPANY and BEST, choose the opening approach that best fits the selected fact. Do not rotate approaches randomly and do not force every email into problem paragraph → product paragraph → ask.
- Product context may enter after the opening sentence in the same paragraph. The offer or next step may be integrated into another paragraph. Do not create dedicated product and CTA paragraphs by default.
- When a writing sample is supplied, match its sentence length, approximate total length, conversational cadence, paragraph pacing, and closing style. Do not merely borrow its terminology.
- The writing sample may influence flexible structure but cannot override emailStructure bounds or factual rules.
- Use the sample only as a style reference. Do not copy its recipient, claims, offer, or other facts.
- Do not use bullet points or structured headers unless the additional campaign instructions explicitly request them.
- Put the greeting on its own line, followed by exactly one blank line before the first content paragraph. The greeting does not count as a paragraph or sentence in emailStructure.
- No paragraph may exceed three sentences. Do not write run-on sentences.
- Use no more than one question. A question is optional, but an actionable close is required in every cold outbound email.
- The final sentence must give the reader a clear next action: ask a direct, answerable question; make a direct request; or use an imperative that tells them what to do. The form may vary, but the ask may not disappear.
- Do not end with a statement about what the sender could do, intends to do, or is available to do, such as "I can walk through it," "We can show you," or "Happy to discuss." Those are not closes unless the same sentence explicitly asks or directs the reader to act.
- Do not include a sign-off, sender name, sender placeholder, signature, or signature block of any kind. Never write "Best," or "[Your Name]". End the generated body immediately after the actionable close.
- Never use an em dash character in the subject, body, or reasoning. No exceptions. Use a period, comma, or rewrite the sentence instead.

${PERSONALIZATION_TIER_INSTRUCTIONS}

${COMPANY_RESEARCH_USE_INSTRUCTIONS}

${REQUIRED_MOTION_SPECIFICS_INSTRUCTIONS}

Return exactly one JSON object matching:
{"subject":"string","body":"string","reasoning":"string"}

Return JSON only. No markdown fences, no preamble, and no text after the JSON object. The body must be ready to send as plain text.`;

export function emailPromptOptionsForContext(
  context: EmailGenerationContext,
  requiredMotionSpecifics: RequiredMotionSpecific[] = [],
): EmailPromptOptions {
  return {
    personalization: resolvePersonalizationForGeneration({
      companyResearch: context.companyResearch,
      contactResearch: contactResearchForPrompt(context.contactResearch),
      hasRelevantCompanyFacts: requiredMotionSpecifics.length > 0,
    }),
    requiredMotionSpecifics,
  };
}

export function buildEmailPrompt(
  context: EmailGenerationContext,
  options: EmailPromptOptions,
  additionalGuidance: string | null = null,
): [AiMessage, AiMessage] {
  const firstVoiceSample = context.voiceSamples[0] ?? null;
  const regenerationGuidance = additionalGuidance?.trim() || null;
  const { personalization, requiredMotionSpecifics } = options;
  const emailLength = context.emailLength ?? context.campaign.emailLength;
  const thinFallback = personalization.tier === "THIN";
  const emailStructure = thinFallback
    ? emailLength === "SHORT"
      ? {
          emailLength: "SHORT" as const,
          mode: "FIXED_THIN" as const,
          instruction:
            "Put the greeting on its own line, then one blank line, then exactly 1 content paragraph. Write 2-3 content sentences total with no paragraph breaks inside that content paragraph. Sentence 1 frames the executive or business problem from openingProblemFraming (no product name or capability yet). End with one clear, low-friction action for the reader. Target 40-60 words excluding the greeting.",
        }
      : emailLength === "LONG"
        ? {
            emailLength: "LONG" as const,
            mode: "FIXED_THIN" as const,
            instruction:
              "Put the greeting on its own line, then one blank line, then exactly 3 short content paragraphs separated by one blank line. Content paragraph 1: executive or business problem from openingProblemFraming only, 2 sentences max. Do not name the product or any capability here. Content paragraph 2: how the product solves it, 2-3 sentences max. Content paragraph 3: offer and a clear action for the reader, 2 sentences max. Target 120-150 words excluding the greeting.",
          }
        : {
            emailLength: "MEDIUM" as const,
            mode: "FIXED_THIN" as const,
            instruction:
              "Put the greeting on its own line, then one blank line, then exactly 2 short content paragraphs separated by one blank line. Content paragraph 1: executive or business problem from openingProblemFraming, 2 sentences max. Do not lead with product name or capability. Content paragraph 2: offer and a clear action for the reader, 2 sentences max. Target 80-100 words excluding the greeting.",
          }
    : emailLength === "SHORT"
      ? {
          emailLength: "SHORT" as const,
          mode: "FLEXIBLE_RESEARCH" as const,
          instruction:
            "SHORT is compact. After the greeting, use exactly 1 content block, 2-3 content sentences, and 45-65 words excluding the greeting. Keep the chosen opening approach, supported fact, product connection, and next step in that single block. If explicit guidance requests bullets, the bullet list is the one content block.",
        }
      : emailLength === "LONG"
        ? {
            emailLength: "LONG" as const,
            mode: "FLEXIBLE_RESEARCH" as const,
            instruction:
              "LONG provides room to develop the reasoning. After the greeting, use exactly 3 content blocks, 5-8 content sentences, and 110-160 words excluding the greeting. Develop the supported opening, its business consequence, and the product connection or next step without padding or repeating the same claim. If explicit guidance requests bullets, one bullet list may replace one content block.",
          }
        : {
            emailLength: "MEDIUM" as const,
            mode: "FLEXIBLE_RESEARCH" as const,
            instruction:
              "MEDIUM balances context and brevity. After the greeting, use exactly 2 content blocks, 3-5 content sentences, and 80-110 words excluding the greeting. Let the chosen opening approach determine the rhetorical flow inside those blocks. If explicit guidance requests bullets, one bullet list may replace one content block.",
          };
  const problemSpace = {
    problemsSolved: context.product.problemsSolved,
    painPoints: context.persona.painPoints,
  };
  const userPayload = {
    regenerationInstructions: regenerationGuidance
      ? `Per-contact regeneration instruction that overrides campaign guidance: ${regenerationGuidance}`
      : null,
    offer: {
      name: context.campaign.offerName,
      description: context.campaign.offerDescription,
      callToAction: context.campaign.offerCta,
      notes: context.campaign.offerNotes,
    },
    closingRequirement: {
      required: true,
      instruction:
        "End with a clear action for the reader. Use a direct answerable question, direct request, or imperative. Do not merely state what the sender could do.",
      supportedCallToAction: context.campaign.offerCta,
      acceptableForms: [
        "Question: Would you be open to a 20-minute review?",
        "Imperative: Book a free estimate today.",
        "Direct request: Reply with the best person to speak with.",
      ],
      invalidForm:
        "I can walk through how this would fit into a 20-minute demo.",
    },
    additionalInstructions: context.campaign.emailGuidance
      ? `Additional instructions that override defaults: ${context.campaign.emailGuidance}`
      : null,
    emailStructure,
    openingApproach: thinFallback
      ? {
          mode: "FIXED_FALLBACK",
          instruction:
            "Use the fixed problem-led fallback in emailStructure. Do not invent company specificity.",
        }
      : {
          mode: "MODEL_CHOOSES_FROM_SUPPORT",
          instruction:
            "Choose the one approach best supported by requiredMotionSpecifics and the persona pain. The selected fact must do causal work. The approach controls rhetorical flow, not length: obey emailStructure's exact content-block, sentence, and word requirements. Do not choose randomly or mention the approach label in the email. In reasoning, name the chosen approach and explain why the selected fact supports it.",
          options: [
            {
              approach: "supported observation about the selling motion",
              naturalShape:
                "Move from the supported observation to its implication, then connect the product and next step without treating each as a mandatory section.",
            },
            {
              approach: "operational consequence",
              naturalShape:
                "Let the consequence and its business impact lead; integrate the supported response and next step naturally rather than reserving a mandatory CTA section.",
            },
            {
              approach: "decision or approval moment",
              naturalShape:
                "Move from the supported decision moment to what would make that decision easier, then a concise next step.",
            },
            {
              approach: "role-specific tradeoff",
              naturalShape:
                "Frame both sides of the tradeoff, connect the supported product response, and end with an actionable question, direct request, or imperative.",
            },
            {
              approach: "direct problem framing",
              naturalShape:
                "Keep the direct problem concise, then connect product and next step without restating the problem.",
            },
          ],
        },
    personalization: {
      tier: personalization.tier,
      companyResearchUsable: personalization.companyResearchUsable,
      contactResearchUsable: personalization.contactResearchUsable,
      instruction: personalization.detail,
    },
    companyResearch: personalization.companyResearch,
    companyResearchReasoningSketch: buildRuntimeReasoningSketch({
      research: personalization.companyResearch,
      problemSpace,
    }),
    requiredMotionSpecifics,
    requiredMotionSpecificsInstruction:
      requiredMotionSpecifics.length > 0
        ? "Reason FROM at least one requiredMotionSpecifics[].text to the executive problem. Use whyItMatters as the intended connection. The specific must do causal work, but it need not occupy a fixed sentence or paragraph position. Do not decorate a generic sentence or quote headcount/location/LinkedIn."
        : null,
    openingProblemFraming: {
      instruction:
        "Establish the executive or business problem from painPoints before introducing the product. Use messagingNotes only for tone, emphasis, and what to avoid. Do not open with product name, mechanism, capability, or productProblemSpace.problemsSolved. When requiredMotionSpecifics is present, reason FROM one listed fact to the persona's pain without forcing it into a fixed sentence or paragraph position. Never quote headcount, location, or directory research.",
      painPoints: context.persona.painPoints,
      messagingNotes: context.persona.messagingNotes,
    },
    personaNeeds: {
      persona: context.persona.name,
      painPoints: context.persona.painPoints,
      desiredOutcomes: context.persona.desiredOutcomes,
    },
    personaMessaging: {
      positioning: context.persona.messaging.positioning,
      proofPoints: context.persona.messaging.proofPoints,
      likelyObjections: context.persona.messaging.objections,
      terminology: context.persona.profile.terminology,
      messagingNotes: context.persona.messagingNotes,
    },
    contactContext: {
      recipient: {
        firstName: context.contact.firstName,
        lastName: context.contact.lastName,
        title: context.contact.title,
        company: context.contact.company,
        industry: context.contact.industry,
        location: context.contact.location,
      },
      freshRoleResearch: personalization.contactResearch
        ? {
            roleSummary: personalization.contactResearch.roleSummary,
            responsibilities: personalization.contactResearch.responsibilities,
            ownershipAreas: personalization.contactResearch.ownershipAreas,
          }
        : null,
    },
    productMessaging: {
      product: context.product.name,
      description: context.product.description,
      valueProposition: context.product.valueProposition,
      primaryPositioning: context.product.messaging.primaryPositioning,
      coreValueThemes: context.product.messaging.coreValueThemes,
      strongestDifferentiators:
        context.product.messaging.strongestDifferentiators,
      proofPoints: context.product.messaging.proofPoints,
      supportedClaims: context.product.messaging.supportedClaims,
      terminologyToUse: context.product.messaging.terminologyToUse,
      doNotUse: {
        claims: context.product.messaging.claimsNotToMake,
        terms: context.product.messaging.terminologyToAvoid,
      },
    },
    productProblemSpace: {
      problemsSolved: context.product.problemsSolved,
      personaPainPoints: context.persona.painPoints,
    },
    voiceStyle: firstVoiceSample
      ? {
          label: firstVoiceSample.label,
          sampleText: firstVoiceSample.sampleText,
        }
      : null,
    audienceFit: {
      icpName: context.icp.name,
      icpDefinition: context.icp.definition ?? context.icp.description,
      personaBuyingRole: context.persona.profile.buyingRole,
      personaDecisionInfluence: context.persona.profile.decisionInfluence,
    },
  };
  const voiceReference = firstVoiceSample
    ? `\n\nWRITING SAMPLE TO MATCH FOR STYLE AND STRUCTURE:\n---\n${firstVoiceSample.sampleText}\n---`
    : "";

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate the first outbound email for this campaign contact.\n\n${JSON.stringify(userPayload, null, 2)}${voiceReference}`,
    },
  ];
}

export function followUpGuidance(sequenceNumber: number): string {
  if (sequenceNumber === 2) {
    return "Use a genuinely different opening approach and a different supported product feature, positioning theme, proof point, or offer emphasis from Email 1. Use an unused selected company fact when available. Do not repeat its framing or ask.";
  }
  if (sequenceNumber === 3) {
    return "Be shorter and more direct than Email 2. Use an opening approach, supported product angle, and ask not used earlier. Introduce a new concrete reason to respond, using an unused selected company fact when available.";
  }
  return "Write a brief close-out with its own useful reason to exist. Use a supported product angle and next step not used earlier. Do not make “following up on my last email” the entire content, and do not repeat a prior opener or ask.";
}

export function replyStrategy(
  classification: ReplyClassification,
): string {
  switch (classification) {
    case "INTERESTED":
      return "Answer their interest directly, reinforce the most relevant value, and propose one concrete next step.";
    case "OBJECTION":
      return "Acknowledge the specific objection without defensiveness, answer it with supported evidence, and ask one low-pressure question.";
    case "REFERRAL":
      return "Thank the original contact, respond to them directly, and ask for an introduction or permission to contact the referred person. Do not pretend the referred person is already a contact.";
    case "NOT_NOW":
      return "Respect the timing, avoid continuing the pitch, and ask for a specific acceptable window to revisit.";
    case "NOT_INTERESTED":
      return "Respect the decline, stop selling, and close politely without manufacturing urgency or another pitch.";
  }
}
