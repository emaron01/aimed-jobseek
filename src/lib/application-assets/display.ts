import type { ApplicationAssetContent, AssetClaim } from "@/lib/application-assets/contract";
import { hasVisibleText } from "@/lib/grounding/fact-tokens";
import {
  applicationAssetConfig,
  consultationConfig,
  outreachConfig,
  vocab,
} from "@/lib/product-config";
import type { OutreachAssetType } from "@/lib/product-config";

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
      return outreachConfig.labels.kindEmail;
    case "LINKEDIN_CONNECTION_NOTE":
      return outreachConfig.labels.kindLinkedInNote;
    case "LINKEDIN_INMAIL":
      return outreachConfig.labels.kindLinkedInInMail;
    default:
      return vocab.outreach.Singular;
  }
}

export function formatOutreachSentStamp(sentAt: string): string {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Outreach sent date is invalid.");
  }
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${outreachConfig.labels.sentStatus} ${formatted}`;
}

export function formatOutreachHistoryLine(
  type: string,
  sentAt: string,
): string {
  return `${formatOutreachTypeLabel(type)} · ${formatOutreachSentStamp(sentAt)}`;
}

export type OutreachGeneratorKind =
  | OutreachAssetType
  | "INTERVIEW_THANK_YOU";

export function isOutreachGeneratorKind(
  value: string,
): value is OutreachGeneratorKind {
  return (
    value === "EMAIL" ||
    value === "LINKEDIN_CONNECTION_NOTE" ||
    value === "LINKEDIN_INMAIL" ||
    value === "INTERVIEW_THANK_YOU"
  );
}

export function formatOutreachGeneratorKindLabel(
  kind: OutreachGeneratorKind,
): string {
  if (kind === "INTERVIEW_THANK_YOU") {
    return outreachConfig.labels.kindThankYou;
  }
  return formatOutreachTypeLabel(kind);
}

export function resolveOutreachGeneratorKind(kind: string): {
  type: OutreachAssetType;
  purpose: "THANK_YOU" | null;
} {
  if (!isOutreachGeneratorKind(kind)) {
    throw new Error("Outreach message type is invalid.");
  }
  if (kind === "INTERVIEW_THANK_YOU") {
    return { type: "EMAIL", purpose: "THANK_YOU" };
  }
  return { type: kind, purpose: null };
}

export function resolveInterviewThankYouNotes(input: {
  notesAfter: string | null | undefined;
  regenerationInstruction: string | null | undefined;
}): { notes: string | null; usedInstruction: boolean } {
  const notes = input.notesAfter?.trim() || null;
  const instruction = input.regenerationInstruction?.trim() || "";
  if (notes) return { notes, usedInstruction: false };
  if (instruction) return { notes: instruction, usedInstruction: true };
  return { notes: null, usedInstruction: false };
}
