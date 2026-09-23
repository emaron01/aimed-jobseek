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
  inference: "INFERENCE",
  limitedPublicEvidence:
    "Assessed from limited public evidence. Never presented as verified.",
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
    "Total annual compensation, including on-target earnings (OTE) for sales roles.",
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
