/** Live extract quality: coaching must address the seeker as "you", not speak as "I". */
export function coachingSpeaksAsSeekerI(text: string): boolean {
  return /\b((did|do|have|has|am|was|were|would|can|could) I|that I |which \w+ I |what I )\b/i.test(
    text,
  );
}
