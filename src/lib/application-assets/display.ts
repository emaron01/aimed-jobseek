import type { ApplicationAssetContent, AssetClaim } from "@/lib/application-assets/contract";
import { hasVisibleText } from "@/lib/grounding/fact-tokens";
import {
  applicationAssetConfig,
  consultationConfig,
  vocab,
} from "@/lib/product-config";

export { hasVisibleText };

export function visibleItems<T>(
  items: T[],
  text: (item: T) => string | null | undefined,
): T[] {
  return items.filter((item) => hasVisibleText(text(item)));
}

export function sanitizeAssetContent<T extends ApplicationAssetContent>(
  content: T,
): T {
  const keep = (claim: AssetClaim) => hasVisibleText(claim.text);
  if (content.type === "COVER_LETTER") {
    return {
      ...content,
      paragraphs: content.paragraphs.filter(keep),
    };
  }
  if (content.type !== "RESUME") return content;
  return {
    ...content,
    header: {
      ...content.header,
      contactDetails: content.header.contactDetails.filter(keep),
    },
    summary: content.summary.filter(keep),
    skills: content.skills.filter(keep),
    education: content.education.filter(keep),
    credentials: content.credentials.filter(keep),
    experience: content.experience.map((role) => ({
      ...role,
      bullets: role.bullets.filter(keep),
    })),
  };
}

export function formatAssetStatusLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "Approved";
    case "DRAFT":
      return "Draft";
    default:
      return "Draft";
  }
}

export function formatClaimEditorLabel(text: string): string {
  const compact = (typeof text === "string" ? text : "").replace(/\s+/g, " ").trim();
  if (compact.length <= 72) return compact;
  return `${compact.slice(0, 69).trimEnd()}…`;
}

export function formatAssetSourceKind(sourceId: string): string {
  const prefix = sourceId.split(":")[0] ?? "";
  switch (prefix) {
    case "profile":
      return vocab.product.singular;
    case "statement":
    case "story":
    case "assessment":
      return consultationConfig.displayName;
    case "job":
      return "Job posting";
    case "application":
      return vocab.campaign.singular;
    case "research":
      return "Company research";
    case "persona":
      return vocab.persona.singular;
    case "interview":
      return "Interview notes";
    default:
      return applicationAssetConfig.labels.sourceSupport;
  }
}

export function formatClaimSupportLabel(
  sourceId: string,
  quote: string,
): string {
  return `${formatAssetSourceKind(sourceId)}: “${quote}”`;
}

export function formatOutreachTypeLabel(type: string): string {
  switch (type) {
    case "EMAIL":
      return "Email";
    case "LINKEDIN_CONNECTION_NOTE":
      return "LinkedIn connection note";
    case "LINKEDIN_INMAIL":
      return "LinkedIn InMail";
    default:
      return "Outreach";
  }
}
