/**
 * Job-seeker outreach limits, greetings, and reminder defaults.
 * LinkedIn InMail limits: official Help article a411986
 * (https://www.linkedin.com/help/linkedin/answer/a411986/inmail-character-limits)
 * documents 200-character subjects and 1,900-character bodies. Article a546814
 * mentions a 2,000-character body; this product uses the stricter 1,900 limit.
 */
import { applicationWorkspaceCopy } from "./vocabulary";

export const outreachConfig = Object.freeze({
  labels: {
    sectionTitle: "Outreach",
    sectionHelp:
      "Generate a message for a Hiring Team role. A named contact is optional. Open email in your own client, or copy LinkedIn text. Nothing is sent from this product.",
    contactsTitle: applicationWorkspaceCopy.contactsTitle,
    contactsHelp:
      "Add one person at a time. The product matches a Hiring Team role from their title. You can change it.",
    appliedTitle: applicationWorkspaceCopy.appliedTitle,
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
    pasteLinkedIn: "Paste LinkedIn profile text",
    pasteLinkedInHelp:
      "Paste the text of this person's LinkedIn profile. Nothing is fetched or scraped.",
    saveLinkedIn: "Save pasted profile",
    buildIndividual: "Build individual profile",
    rebuildIndividual: "Rebuild individual profile",
    commonGround: "Common ground",
    individualProfile: "Individual profile",
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
  askPhrases: [
    "would you",
    "are you open",
    "would a brief",
    "open to a",
    "happy to chat",
    "let me know if",
    "could we",
  ],
  seekerUnderstandingPhrases: [
    "my understanding",
    "i understand",
    "from what i've read",
    "from the posting",
    "it looks like",
    "it sounds like",
    "i read that",
  ],
  recipientTeamAssertionPhrases: [
    "would be felt by",
    "is felt by",
    "felt by the",
    "the team every week",
    "your team always",
    "the team always",
  ],
  genericGratitudePhrases: [
    "thank you for your time",
    "thanks for your time",
    "thank you for the opportunity to interview",
    "it was a pleasure speaking with you",
  ],
  conversationThankPhrases: [
    "thank you for the conversation",
    "thanks for the conversation",
    "thank you for our conversation",
    "thanks for our conversation",
    "thank you for the discussion",
    "thanks for the discussion",
    "thank you for speaking",
    "thanks for speaking",
    "thank you for talking",
  ],
  thanksForInformationPhrases: [
    "thank you for the information",
    "thanks for the information",
    "thank you for the update",
    "thanks for the update",
    "thank you for letting me know",
    "thanks for letting me know",
    "thank you for sharing that",
  ],
  genericThankYouSubjects: [
    "thank you for the update",
    "thanks for the update",
    "thank you",
    "thanks",
    "follow up",
    "following up",
    "quick update",
  ],
  appliedMentionPhrases: [
    "i applied",
    "i've applied",
    "i have applied",
    "already applied",
    "submitted my application",
    "submitted the application",
    "through the employer portal",
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
  purpose: "PROACTIVE" | "FOLLOW_UP" | "THANK_YOU" | "CHECK_IN";
  interviewStageId?: string | null;
}): string {
  const parts = [
    input.type,
    input.personaId ?? "none",
    input.contactId ?? "none",
    input.purpose,
  ];
  if (input.interviewStageId) parts.push(input.interviewStageId);
  return parts.join(":");
}
