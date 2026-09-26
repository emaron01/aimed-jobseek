export const LINKEDIN_SUBSTANCE_WORD_MIN = 80;

export function linkedInWordCount(text: string | null | undefined): number {
  return text?.trim().split(/\s+/).filter(Boolean).length ?? 0;
}

export function linkedInProfileHasSubstance(
  text: string | null | undefined,
): boolean {
  return linkedInWordCount(text) >= LINKEDIN_SUBSTANCE_WORD_MIN;
}
