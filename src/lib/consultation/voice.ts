export function seekerFirstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  return first || null;
}

function escapedName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function seekerThirdPersonViolations(input: {
  text: string;
  firstName: string | null;
}): string[] {
  const text = input.text.trim();
  if (!text) return [];
  const errors: string[] = [];
  if (/\b(the seeker|the candidate)\b/i.test(text)) {
    errors.push("Never refer to the seeker in third person.");
  }
  const firstName = input.firstName?.trim();
  if (firstName && firstName.length > 1) {
    const name = escapedName(firstName);
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
      errors.push("Never refer to the seeker in third person.");
    }
  }
  return [...new Set(errors)];
}

export function harperCoachingVoiceViolations(input: {
  text: string;
  firstName: string | null;
}): string[] {
  return seekerThirdPersonViolations(input);
}

export function talkTrackVoiceViolations(input: {
  text: string;
  firstName: string | null;
}): string[] {
  const text = input.text.trim();
  if (!text) return [];
  const errors = seekerThirdPersonViolations(input);
  if (!/\b(?:I|I'm|I've|I'd|I'll|my|mine|we|we're|we've|our|ours)\b/i.test(text)) {
    errors.push("Write talk tracks in first person as I.");
  }
  return [...new Set(errors)];
}

const SEEKER_PREP_INSTRUCTION =
  /\b(close the\b.{0,40}\bgap|prepare a|prepare to|prepare your|find an example|bring a concrete|be ready to|be ready for|expect questions|expect to (?:discuss|be asked))\b/i;

export function seekerPrepInstructionViolations(text: string): string[] {
  if (!text.trim()) return [];
  return SEEKER_PREP_INSTRUCTION.test(text)
    ? ["Harper asks about gaps instead of telling the seeker to go close them."]
    : [];
}

