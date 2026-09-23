import type { AiRole } from "@/lib/ai/config";
import {
  getContactResearchAiConfig,
  getEmailAiConfig,
  getConsultationAiConfig,
  getEmailFactsAiConfig,
  getInterpretationAiConfig,
  getPersonaAiConfig,
  getProductAiConfig,
  getResearchAiConfig,
  getScoringAiConfig,
} from "@/lib/ai/config";
import { AiConfigError } from "@/lib/ai/errors";
import { vocab } from "@/lib/product-config";

export type AiRoleCatalogEntry = {
  role: AiRole;
  label: string;
  requiredEnv: readonly string[];
  operations: readonly string[];
  requiredForScoring: boolean;
};

/**
 * Which AI role is required for which paid operation.
 * Required env is provider/model/url/key only — timeouts and temperature are optional.
 */
export const AI_ROLE_CATALOG: readonly AiRoleCatalogEntry[] = [
  {
    role: "research",
    label: "Company research",
    requiredEnv: [
      "RESEARCH_AI_PROVIDER",
      "RESEARCH_AI_MODEL",
      "RESEARCH_AI_MODEL_URL",
      "RESEARCH_AI_API_KEY",
    ],
    operations: [
      "Company research (RESEARCH_SYNTHESIS)",
      "Company web search",
    ],
    requiredForScoring: false,
  },
  {
    role: "scoring",
    label: `${vocab.contact.Singular} scoring`,
    requiredEnv: [
      "SCORING_AI_PROVIDER",
      "SCORING_AI_MODEL",
      "SCORING_AI_MODEL_URL",
      "SCORING_AI_API_KEY",
    ],
    operations: ["Contact scoring (CONTACT_SCORING)", "Title suggestions"],
    requiredForScoring: true,
  },
  {
    role: "contact_research",
    label: `${vocab.contact.Singular} research`,
    requiredEnv: [
      "CONTACT_RESEARCH_AI_PROVIDER",
      "CONTACT_RESEARCH_AI_MODEL",
      "CONTACT_RESEARCH_AI_MODEL_URL",
      "CONTACT_RESEARCH_AI_API_KEY",
    ],
    operations: ["Contact role research (CONTACT_RESEARCH_SYNTHESIS)"],
    requiredForScoring: true,
  },
  {
    role: "interpretation",
    label: `${vocab.icp.singular} and ${vocab.persona.singular} interpretation`,
    requiredEnv: [
      "INTERPRETATION_AI_PROVIDER",
      "INTERPRETATION_AI_MODEL",
      "INTERPRETATION_AI_MODEL_URL",
      "INTERPRETATION_AI_API_KEY",
    ],
    operations: ["ICP interpretation", "Persona interpretation"],
    requiredForScoring: false,
  },
  {
    role: "product",
    label: `${vocab.product.Singular} research`,
    requiredEnv: [
      "PRODUCT_AI_PROVIDER",
      "PRODUCT_AI_MODEL",
      "PRODUCT_AI_MODEL_URL",
      "PRODUCT_AI_API_KEY",
    ],
    operations: [
      "Product synthesis",
      "Product web search",
      "Product document extraction",
    ],
    requiredForScoring: false,
  },
  {
    role: "persona",
    label: `${vocab.persona.Singular} research`,
    requiredEnv: [
      "PERSONA_AI_PROVIDER",
      "PERSONA_AI_MODEL",
      "PERSONA_AI_MODEL_URL",
      "PERSONA_AI_API_KEY",
    ],
    operations: ["Persona synthesis", "Persona web search"],
    requiredForScoring: false,
  },
  {
    role: "email",
    label: "Email generation",
    requiredEnv: [
      "EMAIL_AI_PROVIDER",
      "EMAIL_AI_MODEL",
      "EMAIL_AI_MODEL_URL",
      "EMAIL_AI_API_KEY",
    ],
    operations: [
      "Email drafts",
      "Offer validation",
      "Reply classification",
    ],
    requiredForScoring: false,
  },
  {
    role: "email_facts",
    label: "Email company-fact selection",
    requiredEnv: [
      "EMAIL_FACTS_AI_PROVIDER",
      "EMAIL_FACTS_AI_MODEL",
      "EMAIL_FACTS_AI_MODEL_URL",
      "EMAIL_FACTS_AI_API_KEY",
    ],
    operations: ["Email company-fact selection (EMAIL_COMPANY_FACT_SELECTION)"],
    requiredForScoring: false,
  },
  {
    role: "consultation",
    label: "Consultation",
    requiredEnv: [
      "CONSULTATION_AI_PROVIDER",
      "CONSULTATION_AI_MODEL",
      "CONSULTATION_AI_MODEL_URL",
      "CONSULTATION_AI_API_KEY",
    ],
    operations: ["Consultation coaching", "Consultation fact extraction"],
    requiredForScoring: false,
  },
] as const;

/** Same loaders the runtime uses — panel status matches call-time config. */
const LOADERS: Record<AiRole, () => unknown> = {
  research: getResearchAiConfig,
  scoring: getScoringAiConfig,
  contact_research: getContactResearchAiConfig,
  interpretation: getInterpretationAiConfig,
  product: getProductAiConfig,
  persona: getPersonaAiConfig,
  email: getEmailAiConfig,
  email_facts: getEmailFactsAiConfig,
  consultation: getConsultationAiConfig,
};

export type AiRoleStatus = AiRoleCatalogEntry & {
  configured: boolean;
  missingEnv: string[];
  /** When required vars are set but config still fails (e.g. unsupported provider). */
  configError: string | null;
};

function missingRequiredEnv(keys: readonly string[]): string[] {
  return keys.filter((key) => !process.env[key]?.trim());
}

export function listAiRoleStatuses(): AiRoleStatus[] {
  return AI_ROLE_CATALOG.map((entry) => {
    const missingEnv = missingRequiredEnv(entry.requiredEnv);
    try {
      LOADERS[entry.role]();
      return {
        ...entry,
        configured: true,
        missingEnv: [],
        configError: null,
      };
    } catch (error) {
      return {
        ...entry,
        configured: false,
        missingEnv,
        configError:
          missingEnv.length > 0
            ? null
            : error instanceof Error
              ? error.message
              : "Configuration failed.",
      };
    }
  });
}

export function listUnconfiguredScoringRoles(options?: {
  contactResearchEnabled?: boolean;
}): AiRoleStatus[] {
  const contactResearchEnabled = options?.contactResearchEnabled ?? true;
  return listAiRoleStatuses().filter(
    (entry) =>
      entry.requiredForScoring &&
      (contactResearchEnabled || entry.role !== "contact_research") &&
      !entry.configured,
  );
}

export function scoringAiReady(options?: {
  contactResearchEnabled?: boolean;
}): boolean {
  return listUnconfiguredScoringRoles(options).length === 0;
}

export function assertAiRolesConfigured(roles: readonly AiRole[]): void {
  const statuses = listAiRoleStatuses();
  const missing = roles
    .map((role) => statuses.find((entry) => entry.role === role))
    .filter((entry): entry is AiRoleStatus => Boolean(entry && !entry.configured));
  if (missing.length === 0) return;
  const detail = missing
    .map((entry) => {
      if (entry.configError) {
        return `${entry.label}: ${entry.configError}`;
      }
      return `${entry.label} is not configured. Set ${entry.missingEnv.join(", ") || entry.requiredEnv.join(", ")}.`;
    })
    .join(" ");
  throw new AiConfigError(detail);
}

export function assertScoringAiRolesConfigured(): void {
  assertAiRolesConfigured(["scoring", "contact_research"]);
}
