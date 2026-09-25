import { consultationConfig } from "./consultation";

export const applicationAssetConfig = Object.freeze({
  labels: {
    resume: "Resume",
    coverLetter: "Cover Letter",
    sectionTitle: "Resume and Cover Letter",
    sectionHelp: "Generate, review, approve, and download every version.",
    generate: "Generate",
    regenerate: "Regenerate",
    approve: "Approve",
    downloadDocx: "Download DOCX",
    changeInstruction: "What should change?",
    sourceSupport: "Source",
    hideRolesLegend: "Roles to hide",
    acceptPlan: "Accept this plan",
    writePlan: `Ask ${consultationConfig.displayName} for a plan`,
    writingPlan: `${consultationConfig.displayName} is writing a plan…`,
    readyPlan: "The plan is ready.",
    adjustPlan: `Adjust with ${consultationConfig.displayName}`,
    adjustPlanPrompt: "What should change?",
    adjustManually: "Adjust manually",
    acceptPlanFirst: `Accept ${consultationConfig.displayName}'s plan before generating this version.`,
    planFailed: `${consultationConfig.displayName} could not write this plan. Retry when the consultation model is available.`,
    emptyHistory: "No versions generated yet.",
    saveNewVersion: "Save as new version",
    seekerEditedGuidance: "Seeker-edited version",
  },
  seekerSourceCategories: [
    "PROFILE_FACT",
    "APPROVED_STATEMENT",
    "APPROVED_STORY",
  ],
  resumeHeadings: {
    summary: "Professional Summary",
    experience: "Experience",
    skills: "Skills",
    education: "Education",
    credentials: "Credentials",
  },
  coverLetter: {
    defaultSalutation: "Dear Hiring Manager,",
    paragraphs: { min: 3, max: 4 },
    mixedTopic:
      "Each paragraph must have one purpose. Do not combine an acknowledged gap with unrelated experience, or two unrelated experiences.",
    missingStorySubstance:
      "A body paragraph must include what the seeker personally did and the result, using the strongest story for this role's outcomes.",
    omittedApprovedStatement:
      "The letter omitted approved consultation statements that already cover this role's most important outcomes.",
    thinEvidence:
      "This letter is short because the {product} does not yet have a consulted story for this role's outcomes. Run a {consultant} round to add what you did and what changed.",
  },
  seekerVoiceInstruction:
    "Write the way the seeker writes, in plain professional language. Use the seeker's voice samples and their own words from consultation answers whenever those are supplied. Avoid phrasing that reads as AI-generated.",
  dateDisplay: {
    currentRoleLabel: "Present",
    rangeSeparator: "\u2013",
    monthNames: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
  },
  resumeTargetWordsBySeniority: {
    default: { min: 450, max: 850 },
    senior: { min: 600, max: 1_050 },
    executive: { min: 750, max: 1_250 },
  },
  seniorityBandTerms: {
    executive: ["executive", "vice president", "vp", "chief", "c-suite"],
    senior: ["senior", "staff", "principal", "lead", "director", "manager"],
  },
  unsupportedTemporalPhrasesWithoutExplicitDates: [
    "current role",
    "currently",
  ],
  presentation: {
    earlierExperienceYears: 10,
    earlierExperienceHeading: "Earlier experience",
  },
  generation: {
    qualityRegenerationAttempts: 4,
    writingTemperatureDefault: 0.5,
    validationTemperature: 0,
  },
  contactDetailsSourceLabel: "Confirmed profile contact details",
  docx: {
    font: "Arial",
    bodySizeHalfPoints: 20,
    nameSizeHalfPoints: 30,
    headingSizeHalfPoints: 23,
    marginTwips: 720,
    paragraphAfterTwips: 100,
    sectionBeforeTwips: 180,
    lineSpacingTwips: 240,
  },
} as const);

export type ApplicationAssetTypeValue =
  | "RESUME"
  | "COVER_LETTER"
  | "EMAIL"
  | "LINKEDIN_CONNECTION_NOTE"
  | "LINKEDIN_INMAIL";
