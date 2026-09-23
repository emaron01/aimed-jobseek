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
}>;

type NounSpec = {
  singular: string;
  plural: string;
  article: "a" | "an";
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
  });
}

export const vocab = Object.freeze({
  product: noun({ singular: "product", plural: "products", article: "a" }),
  icp: noun({ singular: "ICP", plural: "ICPs", article: "an" }),
  idealCustomer: noun({
    singular: "ideal customer",
    plural: "ideal customers",
    article: "an",
  }),
  persona: noun({ singular: "persona", plural: "personas", article: "a" }),
  campaign: noun({ singular: "campaign", plural: "campaigns", article: "a" }),
  list: noun({ singular: "list", plural: "lists", article: "a" }),
  contact: noun({ singular: "contact", plural: "contacts", article: "a" }),
  sequence: noun({ singular: "sequence", plural: "sequences", article: "a" }),
  prospect: noun({ singular: "prospect", plural: "prospects", article: "a" }),
  buyer: noun({ singular: "buyer", plural: "buyers", article: "a" }),
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
  solution: noun({ singular: "solution", plural: "solutions", article: "a" }),
  deal: noun({ singular: "deal", plural: "deals", article: "a" }),
  demo: noun({ singular: "demo", plural: "demos", article: "a" }),
  outbound: noun({ singular: "outbound", plural: "outbound", article: "an" }),
  outreach: noun({ singular: "outreach", plural: "outreach", article: "an" }),
  /** A company the user sells to (not a login account). */
  account: noun({ singular: "account", plural: "accounts", article: "an" }),
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

export type VocabKey = keyof typeof vocab;
export type NounForm = keyof NounForms;

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
  personaLikelyTitlesPlaceholder: "CRO, VP Sales, Director of Sales",
  personaLikelyTitlesHint:
    "Literal job titles only — not generic labels like “Sales Leader”.",
  personaDepartmentPlaceholder: "Sales",
  personaDepartmentHint:
    "Organizational function (e.g. Sales, Finance) — not “Sales Leader”.",
  personaOwnershipAreaPlaceholder: "e.g. Sales forecasting process",
  organizationNamePlaceholder: "Acme Sales",
  offerCallToActionPlaceholder: "Book a demo",
});

export type VocabExampleKey = keyof typeof vocabExamples;
