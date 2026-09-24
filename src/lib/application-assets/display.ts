import {
  applicationAssetConfig,
  consultationConfig,
  vocab,
} from "@/lib/product-config";

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
  const compact = text.replace(/\s+/g, " ").trim();
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
