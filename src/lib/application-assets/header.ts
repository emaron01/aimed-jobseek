import type { AssetClaim } from "@/lib/application-assets/contract";
import type { ReadyApplicationGenerationContext } from "@/lib/generation/context";
import {
  RESUME_HEADER_CONTACT_KEYS,
  missingResumeHeaderContacts,
  type SuggestedResumeContactKey,
} from "@/lib/product-research/contact-extract";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";
import { applicationAssetConfig } from "@/lib/product-config";

export type ResumeHeaderContactClaim = AssetClaim;

const CONTACT_LABELS: Record<SuggestedResumeContactKey, string> = {
  phone: applicationAssetConfig.missingContact.phone,
  email: applicationAssetConfig.missingContact.email,
};

export function resumeContactClaimsFromProfile(
  profile: ReadyApplicationGenerationContext["profile"],
): AssetClaim[] {
  return RESUME_HEADER_CONTACT_KEYS.flatMap((key) => {
    const item = profile.identity[key];
    const text = item?.text.trim() ?? "";
    if (!text || !item) return [];
    return [
      {
        id: `header_${key}`,
        text,
        supports: [{ sourceId: `profile:${item.id}`, quote: text }],
      },
    ];
  });
}

export function applyProfileContactHeader<T extends { type: string }>(
  content: T,
  profile: ReadyApplicationGenerationContext["profile"],
): T {
  if (content.type !== "RESUME") return content;
  const resume = content as T & {
    header: { name: AssetClaim; contactDetails: AssetClaim[] };
  };
  if (!resume.header) return content;
  const fromProfile = resumeContactClaimsFromProfile(profile);
  if (fromProfile.length === 0) return content;
  return {
    ...resume,
    header: {
      ...resume.header,
      contactDetails: fromProfile,
    },
  };
}

export function missingResumeContactLabels(profile: CandidateProfile): string[] {
  return missingResumeHeaderContacts(profile).map((key) => CONTACT_LABELS[key]);
}
