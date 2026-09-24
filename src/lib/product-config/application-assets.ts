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
  },
  bannedPhrases: [
    "I'm excited to apply",
    "I am excited to apply",
    "I am writing to",
    "I'm writing to",
    "draws me to",
    "I would welcome the opportunity",
    "I believe I would be a great fit",
    "Thank you for your consideration",
    "perfect fit",
  ],
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
