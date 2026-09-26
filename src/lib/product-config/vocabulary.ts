/**
 * User-facing vocabulary. Every product concept a screen, action message,
 * notification, or billing surface names comes from here. Keys are typed, so
 * a missing or misspelled key fails type checking.
 *
 * Client-safe: no environment reads.
 */

export type NounForms = Readonly<{
  /** "campaign" */
  singular: string;
  /** "campaigns" */
  plural: string;
  /** "Campaign" (sentence start or standalone label) */
  Singular: string;
  /** "Campaigns" */
  Plural: string;
  /** "Pain Point" — Title Case for multi-word terms in Title Case labels */
  TitleSingular: string;
  /** "Pain Points" */
  TitlePlural: string;
  /** "a campaign" / "an ICP" */
  aSingular: string;
  /** "A campaign" / "An ICP" */
  ASingular: string;
  /** Sidebar / tab label when it is not the plural form. */
  nav: string;
}>;

type NounSpec = {
  singular: string;
  plural: string;
  article: "a" | "an";
  nav?: string;
};

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => capitalizeFirst(word))
    .join(" ");
}

function noun(spec: NounSpec): NounForms {
  return Object.freeze({
    singular: spec.singular,
    plural: spec.plural,
    Singular: capitalizeFirst(spec.singular),
    Plural: capitalizeFirst(spec.plural),
    TitleSingular: titleCase(spec.singular),
    TitlePlural: titleCase(spec.plural),
    aSingular: `${spec.article} ${spec.singular}`,
    ASingular: `${capitalizeFirst(spec.article)} ${spec.singular}`,
    nav: spec.nav ?? capitalizeFirst(spec.plural),
  });
}

export const vocab = Object.freeze({
  product: noun({
    singular: "Personal Profile",
    plural: "Personal Profiles",
    article: "a",
    nav: "Personal Profile",
  }),
  icp: noun({
    singular: "Target Employer profile",
    plural: "Target Employer profiles",
    article: "a",
    nav: "Target Employers",
  }),
  idealCustomer: noun({
    singular: "target employer",
    plural: "target employers",
    article: "a",
  }),
  persona: noun({
    singular: "Hiring Team role",
    plural: "Hiring Team roles",
    article: "a",
    nav: "Hiring Team",
  }),
  campaign: noun({
    singular: "application",
    plural: "applications",
    article: "an",
  }),
  list: noun({ singular: "list", plural: "lists", article: "a" }),
  contact: noun({ singular: "contact", plural: "contacts", article: "a" }),
  sequence: noun({ singular: "sequence", plural: "sequences", article: "a" }),
  prospect: noun({ singular: "contact", plural: "contacts", article: "a" }),
  buyer: noun({
    singular: "Hiring Team role",
    plural: "Hiring Team roles",
    article: "a",
    nav: "Hiring Team",
  }),
  customer: noun({ singular: "customer", plural: "customers", article: "a" }),
  valueProposition: noun({
    singular: "value proposition",
    plural: "value propositions",
    article: "a",
  }),
  painPoint: noun({
    singular: "pain point",
    plural: "pain points",
    article: "a",
  }),
  buyingSignal: noun({
    singular: "buying signal",
    plural: "buying signals",
    article: "a",
  }),
  employerSignal: noun({
    singular: "employer signal",
    plural: "employer signals",
    article: "an",
  }),
  solution: noun({ singular: "solution", plural: "solutions", article: "a" }),
  deal: noun({ singular: "deal", plural: "deals", article: "a" }),
  demo: noun({ singular: "demo", plural: "demos", article: "a" }),
  outbound: noun({ singular: "outbound", plural: "outbound", article: "an" }),
  outreach: noun({ singular: "outreach", plural: "outreach", article: "an" }),
  /** A company the user is pursuing (not a login account). */
  account: noun({ singular: "employer", plural: "employers", article: "an" }),
  rep: noun({ singular: "rep", plural: "reps", article: "a" }),
  sales: noun({ singular: "sales", plural: "sales", article: "a" }),
  salesperson: noun({
    singular: "salesperson",
    plural: "salespeople",
    article: "a",
  }),
  seeker: noun({
    singular: "job seeker",
    plural: "job seekers",
    article: "a",
  }),
  client: noun({ singular: "client", plural: "clients", article: "a" }),
  quota: noun({ singular: "quota", plural: "quotas", article: "a" }),
  lead: noun({ singular: "lead", plural: "leads", article: "a" }),
});

/**
 * Criterion flag labels. Stored meanings of isRequired / isDisqualifier
 * are unchanged; these strings are display only.
 */
export const criterionFlags = Object.freeze({
  required: "Must-have",
  disqualifier: "Deal-breaker",
  fact: "Stated",
  inference: "Inferred",
  limitedPublicEvidence:
    "Assessed from limited public evidence. Never presented as verified.",
});

/** Seeker-facing Target Employer labels. Stored scoring names are unchanged. */
export const icpLabels = Object.freeze({
  scoringCriteria: "What you're looking for",
  fromCompanyResearch: "Checked against company research",
  updateFromDescription: "Update from my description",
});

export const signupCopy = Object.freeze({
  emailLabel: "Email",
  organizationNameTemplate: "{name}'s workspace",
});

export function organizationNameFromSeeker(input: {
  firstName: string;
  lastName: string;
}): string {
  const name = [input.firstName.trim(), input.lastName.trim()]
    .filter(Boolean)
    .join(" ");
  if (!name) {
    throw new Error("A first or last name is required to name the workspace.");
  }
  return signupCopy.organizationNameTemplate.replace("{name}", name);
}

export const applicationResearchCopy = Object.freeze({
  title: "Employer research",
  queued: "Starting research…",
  researching: "Researching",
  done: "Done",
  failed: "Failed",
  notStarted: "Research has not started",
  notStartedDetail:
    "Research has not started yet. Retry, or contact support if this continues.",
  queuedDetail: "Research is starting. This usually takes a minute or two.",
  researchingDetail: "Research is in progress.",
  doneDetail: "Research finished.",
  failedDetail: "Research failed. You can retry.",
  idle: "Not requested",
  idleDetail: "Research has not been requested for this employer.",
  saveEmployer: "Save employer and research",
  savedQueued: "Researching this employer…",
  retriedQueued: "Researching this employer again…",
});

export const applicationWorkspaceCopy = Object.freeze({
  nextStepTitle: "Let's walk through this application",
  jobRequirementTitle: "Review and edit the job requirements",
  hiringTeamTitle: "Review the hiring team",
  appliedTitle: "Update application date and status",
  contactsTitle: "Add and review interview contacts",
  companyTitle: "Company",
  whatTheyDoTitle: "What they do",
  whoTheyServeTitle: "Who they serve",
  howTheyOperateTitle: "How they operate",
  companyNotesTitle: "Add what you know",
  companyNotesHelp:
    "Paste information research could not find, or an area you want to understand.",
  companyNotesSave: "Save notes",
  companyNotesSaved: "Notes saved.",
  companyNotesFailed: "The notes could not be saved.",
  companyNotesTooLong: "These notes are too long. Shorten them and save again.",
  companyNotesSourceTitle: "Your notes",
  companyBriefingEmpty:
    "No employer research is recorded yet. Add what you know below, then regenerate.",
  companyUpdateTitle: "Update company information",
  companyUpdateHelp:
    "Edit what research found, or add what you know about this employer.",
  companyUpdateSave: "Save company information",
  companyUpdateFailed: "The company information could not be saved.",
  jobEditTitle: "Edit the job requirements",
  jobEditHelp: "Correct or add anything the posting missed.",
  jobEditSave: "Save job requirements",
  jobEditFailed: "The job requirements could not be saved.",
  fieldCompanySummary: "Company summary",
  fieldProducts: "What they sell",
  fieldBusinessModel: "Business model",
  fieldHiringGrowth: "Hiring and growth",
  fieldEmployerRisk: "Employer risk",
  fieldCustomerTypes: "Customer types",
  fieldPrimaryMarkets: "Primary markets",
  fieldCompanySize: "Company size",
  fieldEstimatedAov: "Estimated AOV",
  fieldAovReasoning: "AOV reasoning",
  fieldTechnologies: "Relevant technologies",
  fieldBuyingSignals: "Buying signals",
  employerFitTitle: "Employer fit",
  interviewsTitle: "Interviews",
  jobPostingHelp:
    "Taken from the pasted posting. Empty fields were not in the posting.",
  fieldTitle: "Title",
  fieldEmployer: "Employer as stated",
  fieldLocation: "Location",
  fieldWorkArrangement: "Work arrangement",
  fieldEmploymentType: "Employment type",
  fieldSeniority: "Seniority",
  fieldCompensation: "Compensation",
  fieldReportsTo: "Reports to",
  responsibilitiesTitle: "Responsibilities",
  requiredTitle: "Required",
  preferredTitle: "Preferred",
  scorecardTitle: "Scorecard",
  outcomesTitle: "Outcomes",
  competenciesTitle: "Competencies",
  noMission: "No mission was stated.",
  fitHelp:
    "Scored against {name}. A mismatch is a signal. It does not block contacts or outreach.",
  fitMissing: "Fit has not been scored.",
  keepWorking:
    "This usually takes a minute or two. You can keep working; it will appear here when it's ready.",
  readyNotice: "Ready",
  readyLink: "View it",
  typing: "{consultant} is thinking…",
});

export const employerIdentityCopy = Object.freeze({
  title: "Employer identity",
  confirm: "This is the company",
  reject: "This is not the company",
  retry: "Retry research",
  supplyName: "Correct company name",
  supplyWebsite: "Company website",
  rerun: "Research this company",
  unmatched:
    "Research found a company that does not match this posting. Confirm it, reject it, or supply the correct name or website.",
  confirmed: "You confirmed this employer identity.",
  rejected: "You rejected this employer identity. Research will not be used.",
  staleDependents:
    "Employer identity could not be confirmed against the posting. Fit and anything that used this research are stale.",
  checkLabels: Object.freeze({
    industry: "Industry",
    location: "Location",
    sizeOrStage: "Size or stage",
    website: "Website",
  }),
  candidateLabels: Object.freeze({
    whatTheyDo: "What they do",
    location: "Location",
    sizeOrStage: "Size or stage",
    website: "Website",
  }),
  status: Object.freeze({
    MATCH: "Match",
    MISMATCH: "Mismatch",
    NOT_STATED: "Not stated",
  }),
  unknownCompany: "Unknown company",
  postingEvidence: "Posting",
  researchEvidence: "Research",
  notStatedInPosting: "Not stated in the posting",
  notStatedInResearch: "Not stated in the research",
  kinds: Object.freeze({
    commercialCompany: "a commercial {industry} company",
    studentTeam: "a student robotics team",
    highSchoolTeam: "a high school robotics team",
  }),
  reasonTemplates: Object.freeze({
    industryCompare:
      "The posting describes {posting}; the research found {research}.",
    locationCompare:
      "The posting locates the employer in {posting}; the research found {research}.",
    sizeCompare: "The posting describes {posting}; the research found {research}.",
    websiteCompare: "The posting names {posting}; the research found {research}.",
    industryMatch:
      "The posting and the research describe the same kind of company ({shared}).",
    locationMatch: "The posting and the research agree on {shared}.",
    sizeMatch: "The posting and the research agree on {shared}.",
    websiteMatch: "The posting and the research name {shared}.",
  }),
});

export type CriterionFlagKey = keyof typeof criterionFlags;

export function criterionFlagLabels(flags: {
  isRequired?: boolean | null;
  isDisqualifier?: boolean | null;
}): string[] {
  const labels: string[] = [];
  if (flags.isRequired) labels.push(criterionFlags.required);
  if (flags.isDisqualifier) labels.push(criterionFlags.disqualifier);
  return labels;
}

export type VocabKey = keyof typeof vocab;
export type NounForm = keyof NounForms;

const SCORING_DIMENSION_LABELS: Record<string, string> = {
  "Positive Buying Signals": `Positive ${vocab.employerSignal.plural}`,
};

/** Seeker-facing label for a stored scoring dimension. The stored name is unchanged. */
export function scoringDimensionLabel(storedName: string): string {
  return SCORING_DIMENSION_LABELS[storedName] ?? storedName;
}

/** Lowercase noun agreeing with `count`: 1 → singular, otherwise plural. */
export function nounForCount(count: number, forms: NounForms): string {
  return count === 1 ? forms.singular : forms.plural;
}

/** "3 contacts" / "1 contact" */
export function countedNoun(count: number, forms: NounForms): string {
  return `${count} ${nounForCount(count, forms)}`;
}

/**
 * Example values shown in placeholders and sample rows. They describe the
 * user's domain, so they change with the vocabulary.
 */
export const vocabExamples = Object.freeze({
  contactImportPastePlaceholder:
    "First Name\tLast Name\tEmail\tTitle\tCompany\nJohn\tSmith\tjohn@acme.com\tVP Sales\tAcme",
  personaLikelyTitlesPlaceholder: "Recruiter, Hiring Manager, Head of Engineering",
  personaLikelyTitlesHint:
    "Literal job titles only — not generic labels like “Hiring Leader”.",
  personaDepartmentPlaceholder: "Engineering",
  personaDepartmentHint:
    "Organizational function (e.g. Engineering, People) — not “Hiring Leader”.",
  personaOwnershipAreaPlaceholder: "e.g. Engineering hiring process",
  organizationNamePlaceholder: "Acme Sales",
  offerCallToActionPlaceholder: "Request a conversation",
});

export type VocabExampleKey = keyof typeof vocabExamples;

/**
 * Compensation and employment-type copy for the Target Employer profile
 * and employer-fit comparison. Display only.
 */
export const compensationCopy = Object.freeze({
  annualEarningsLabel: "Target annual earnings",
  annualEarningsHint:
    "Total annual compensation you are targeting.",
  annualMinimumLabel: "Annual minimum",
  annualTargetLabel: "Annual target",
  hourlyRateLabel: "Target hourly rate",
  hourlyMinimumLabel: "Hourly minimum",
  hourlyTargetLabel: "Hourly target",
  currencyLabel: "Currency",
  employmentTypeLabel: "Employment type",
  fullTime: "Full-time",
  partTime: "Part-time",
  compensationSignal: "Compensation",
  notStated: "Not stated",
  estimate: "Estimate",
  unitUnrecognized:
    "Compensation is stated, but the pay period could not be compared.",
});
