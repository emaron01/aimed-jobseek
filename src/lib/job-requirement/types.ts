export const JOB_REQUIREMENT_PROMPT_VERSION = "3";

export type NamedJobContact = {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
};

export type ScorecardItem = {
  id: string;
  text: string;
  inferred: boolean;
};

export type JobScorecard = {
  mission: ScorecardItem | null;
  outcomes: ScorecardItem[];
  competencies: ScorecardItem[];
};

export type ParsedJobRequirement = {
  title: string | null;
  companyName: string | null;
  location: string | null;
  workArrangement: string | null;
  employmentType: string | null;
  seniority: string | null;
  compensationRange: string | null;
  reportingLine: string | null;
  responsibilities: string[];
  requiredItems: string[];
  preferredItems: string[];
  scorecard: JobScorecard;
  namedContacts: NamedJobContact[];
};

export type JobRequirementModelOutput = {
  title?: string | null;
  companyName?: string | null;
  location?: string | null;
  workArrangement?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
  compensationRange?: string | null;
  reportingLine?: string | null;
  responsibilities?: string[] | null;
  requiredItems?: string[] | null;
  preferredItems?: string[] | null;
  scorecard?: {
    mission?: { text?: string | null; inferred?: boolean | null } | null;
    outcomes?: Array<{ text?: string | null; inferred?: boolean | null }> | null;
    competencies?: Array<{ text?: string | null; inferred?: boolean | null }> | null;
  } | null;
  namedContacts?: Array<{
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
  }> | null;
};
