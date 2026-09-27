const SYSTEM_VOICE =
  /\b(?:he|she) also reports\b|\bthe seeker\b|\bharper (?:prepares|notes|reports|writes)\b|\bthird[- ]person\b/i;

export function seekerReplyHasSystemVoice(text: string): boolean {
  return SYSTEM_VOICE.test(text);
}

export function seekerWrittenReply(text: string): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !seekerReplyHasSystemVoice(part));
  return parts.join(" ").trim();
}

export function looksLikeWorkStory(text: string): boolean {
  return /\b(?:i (?:re)?built|i led|i scaled|i installed|gtm|pipeline|quota|retool)\b/i.test(
    text,
  );
}

export function looksLikeCompanyMotivation(text: string): boolean {
  if (looksLikeWorkStory(text) && !/\b(?:want to work|drawn to|culture|employer)\b/i.test(text)) {
    return false;
  }
  return /\b(?:want to work|drawn to|culture|employer|compete|leadership|values|outstanding)\b/i.test(
    text,
  );
}
