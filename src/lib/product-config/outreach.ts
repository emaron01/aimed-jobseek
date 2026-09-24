/**
 * Job-seeker outreach limits, greetings, and reminder defaults.
 * LinkedIn InMail limits: official Help article a411986
 * (https://www.linkedin.com/help/linkedin/answer/a411986/inmail-character-limits)
 * documents 200-character subjects and 1,900-character bodies. Article a546814
 * mentions a 2,000-character body; this product uses the stricter 1,900 limit.
 */

export const outreachConfig = Object.freeze({
  labels: {
    sectionTitle: "Outreach",
    sectionHelp:
      "Generate a message for a Hiring Team role. A named contact is optional. Open email in your own client, or copy LinkedIn text. Nothing is sent from this product.",
    contactsTitle: "Contacts",
    contactsHelp:
      "Add one person at a time. The product matches a Hiring Team role from their title. You can change it.",
    appliedTitle: "Applied",
    appliedHelp: "Mark the date you submitted this application through the employer portal.",
    appliedStatus: "Applied",
    notAppliedStatus: "Not marked applied",
    generate: "Generate",
    regenerate: "Regenerate",
    markSent: "Mark as sent",
    sentStatus: "Sent",
    openOutlookWeb: "Open in Outlook web",
    openOutlookDesktop: "Open in Outlook desktop",
    openGmail: "Open in Gmail",
    attachResumeReminder: "Attach the approved resume before you send.",
    downloadResume: "Download approved resume",
    copySubject: "Copy subject",
    copyBody: "Copy message",
    openLinkedIn: "Open LinkedIn profile",
    changeInstruction: "What should change?",
    purposeProactive: "Proactive outreach",
    purposeFollowUp: "Follow-up",
    noContact: "No named contact",
    roleConfirmed: "Role confirmed",
    roleUnconfirmed: "Matched from title. Save a role to confirm it.",
    remindersTitle: "Follow-up reminders",
    remindersHelp:
      "Alerts only. Nothing is sent or blocked. Blank means no reminder for that slot.",
  },
  greetings: {
    withNamePrefix: "Hi ",
    withNameSuffix: ",",
    emailNeutral: "Hello,",
    linkedinNeutral: "Hi there,",
  },
  linkedinLimits: {
    connectionNoteChars: 300,
    inMailSubjectChars: 200,
    inMailBodyChars: 1900,
    sourceUrl:
      "https://www.linkedin.com/help/linkedin/answer/a411986/inmail-character-limits",
    sourceNote:
      "LinkedIn Help a411986: InMail subject 200 characters, body 1,900 characters. Connection notes use the 300-character invitation limit.",
  },
  emailWordTargets: {
    SHORT: { min: 60, max: 110 },
    MEDIUM: { min: 110, max: 180 },
    LONG: { min: 180, max: 260 },
  },
  hiringManagerClaimPhrases: [
    "you are the hiring manager",
    "you're the hiring manager",
    "you are hiring manager",
    "as the hiring manager",
    "the hiring manager for this",
    "dear hiring manager",
  ],
  bannedLinkedInGreetings: ["dear hiring manager"],
  redirectAsk:
    "if you're not the right person, I'd appreciate a pointer to who is",
  redirectPhrases: [
    "if you're not the right person",
    "if you are not the right person",
    "if you're not the right contact",
    "pointer to who is",
    "pointer to whoever is",
    "point me to the right person",
  ],
  genericRelevancePhrases: [
    "given the role's collaboration with the team",
    "given the role’s collaboration with the team",
    "given the role's collaboration",
    "collaboration with the team",
  ],
  threadRepetitionOverlap: 0.6,
  reminders: {
    defaultDay3: 3,
    defaultDay7: 7,
    defaultEmail4: null,
    defaultRepeat: null,
  },
  generation: {
    qualityRegenerationAttempts: 4,
    limitRegenerationAttempts: 4,
  },
} as const);

export type OutreachAssetType =
  | "EMAIL"
  | "LINKEDIN_CONNECTION_NOTE"
  | "LINKEDIN_INMAIL";

export function isOutreachAssetType(
  type: string,
): type is OutreachAssetType {
  return (
    type === "EMAIL" ||
    type === "LINKEDIN_CONNECTION_NOTE" ||
    type === "LINKEDIN_INMAIL"
  );
}

export function connectionNoteBodyBudget(greeting: string): number {
  const composedLimit = outreachConfig.linkedinLimits.connectionNoteChars;
  const prefixLength = `${greeting.trim()} `.length;
  return Math.max(0, composedLimit - prefixLength);
}

export function outreachGreeting(input: {
  channel: "email" | "linkedin";
  firstName: string | null;
}): string {
  const first = (input.firstName?.trim().split(/\s+/)[0] ?? "");
  if (!first) {
    return input.channel === "email"
      ? outreachConfig.greetings.emailNeutral
      : outreachConfig.greetings.linkedinNeutral;
  }
  return `${outreachConfig.greetings.withNamePrefix}${first}${outreachConfig.greetings.withNameSuffix}`;
}

export function shouldIncludeRedirect(input: {
  hasContact: boolean;
  roleConfirmed: boolean;
}): boolean {
  if (!input.hasContact) return true;
  return !input.roleConfirmed;
}

export function outreachGroupKey(input: {
  type: OutreachAssetType;
  personaId: string | null;
  contactId: string | null;
  purpose: "PROACTIVE" | "FOLLOW_UP";
}): string {
  return [
    input.type,
    input.personaId ?? "none",
    input.contactId ?? "none",
    input.purpose,
  ].join(":");
}
