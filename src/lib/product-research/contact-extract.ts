import type { CandidateProfile, ProfileFactItem } from "@/lib/product-research/candidate-profile";

export type ExtractedProfileContact = {
  email: string | null;
  phone: string | null;
  cityState: string | null;
  linkedinUrl: string | null;
  sourceId: string | null;
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN =
  /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;
const LINKEDIN_PATTERN =
  /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i;
const CITY_STATE_PATTERN =
  /\b([A-Z][A-Za-z.]+(?:[ \t]+[A-Z][A-Za-z.]+)*),\s*([A-Z]{2})\b/;
const STREET_ADDRESS_PATTERN =
  /\b\d{1,6}\s+\S+(?:\s+\S+){0,4}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|place|pl)\b/i;

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  const value = match?.[0]?.trim() ?? "";
  return value || null;
}

export function extractContactDetailsFromText(
  text: string,
): Omit<ExtractedProfileContact, "sourceId"> {
  const email = firstMatch(text, EMAIL_PATTERN);
  const phone = firstMatch(text, PHONE_PATTERN);
  const linkedinUrl = firstMatch(text, LINKEDIN_PATTERN);
  const cityStateMatch = text.match(CITY_STATE_PATTERN);
  const cityStateRaw = cityStateMatch
    ? `${cityStateMatch[1]}, ${cityStateMatch[2]}`
    : null;
  const cityState =
    cityStateRaw &&
    !STREET_ADDRESS_PATTERN.test(cityStateRaw) &&
    !/\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/i.test(
      cityStateRaw,
    )
      ? cityStateRaw
      : null;
  return { email, phone, cityState, linkedinUrl };
}

function factFromText(
  existing: ProfileFactItem | null | undefined,
  text: string,
  sourceId: string,
  id: string,
): ProfileFactItem {
  if (existing?.text.trim()) return existing;
  return {
    id,
    kind: "FACT",
    text: text.trim(),
    provenance: [{ sourceId }],
  };
}

export function fillMissingContactDetails(
  profile: CandidateProfile,
  sources: Array<{ sourceId: string; text: string }>,
): {
  profile: CandidateProfile;
  filled: Array<"email" | "phone" | "cityState" | "linkedinUrl">;
} {
  const filled: Array<"email" | "phone" | "cityState" | "linkedinUrl"> = [];
  const identity = { ...profile.identity };
  const locationLooksLikeCityState =
    identity.cityState?.text.trim() ||
    (identity.location?.text.trim() &&
      CITY_STATE_PATTERN.test(identity.location.text) &&
      !STREET_ADDRESS_PATTERN.test(identity.location.text)
      ? identity.location.text.trim()
      : null);

  for (const source of sources) {
    const extracted = extractContactDetailsFromText(source.text);
    if (!identity.email?.text.trim() && extracted.email) {
      identity.email = factFromText(
        identity.email,
        extracted.email,
        source.sourceId,
        identity.email?.id ?? "identity_email",
      );
      filled.push("email");
    }
    if (!identity.phone?.text.trim() && extracted.phone) {
      identity.phone = factFromText(
        identity.phone,
        extracted.phone,
        source.sourceId,
        identity.phone?.id ?? "identity_phone",
      );
      filled.push("phone");
    }
    if (!identity.cityState?.text.trim()) {
      const cityState = extracted.cityState ?? locationLooksLikeCityState;
      if (cityState) {
        identity.cityState = factFromText(
          identity.cityState,
          cityState,
          source.sourceId,
          identity.cityState?.id ?? "identity_city_state",
        );
        filled.push("cityState");
      }
    }
    if (!identity.linkedinUrl?.text.trim() && extracted.linkedinUrl) {
      identity.linkedinUrl = factFromText(
        identity.linkedinUrl,
        extracted.linkedinUrl,
        source.sourceId,
        identity.linkedinUrl?.id ?? "identity_linkedin",
      );
      filled.push("linkedinUrl");
    }
  }

  if (filled.length === 0) {
    return { profile, filled };
  }
  return { profile: { ...profile, identity }, filled: [...new Set(filled)] };
}

export const RESUME_HEADER_CONTACT_KEYS = [
  "cityState",
  "phone",
  "email",
  "linkedinUrl",
] as const;

export const SUGGESTED_RESUME_CONTACT_KEYS = ["phone", "email"] as const;

export type ResumeHeaderContactKey = (typeof RESUME_HEADER_CONTACT_KEYS)[number];
export type SuggestedResumeContactKey =
  (typeof SUGGESTED_RESUME_CONTACT_KEYS)[number];

export function missingResumeHeaderContacts(
  profile: CandidateProfile,
): SuggestedResumeContactKey[] {
  return SUGGESTED_RESUME_CONTACT_KEYS.filter(
    (key) => !profile.identity[key]?.text.trim(),
  );
}
