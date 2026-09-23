/**
 * Default Hiring Team templates. Created as editable rows per organization.
 */
export const HIRING_TEAM_TEMPLATE_DEFAULTS = Object.freeze([
  {
    templateKey: "recruiter",
    name: "Recruiter",
    likelyTitles: ["Recruiter", "Talent Partner", "Technical Recruiter"],
    department: "Talent",
    whyThisRoleMatters:
      "Runs the first screen and decides who moves forward for this role.",
    notes: "Recruiter screen.",
  },
  {
    templateKey: "hr_people_partner",
    name: "HR / People Partner",
    likelyTitles: ["HR Business Partner", "People Partner"],
    department: "People",
    whyThisRoleMatters:
      "Owns the hiring process, level, and how this role is offered.",
    notes: "",
  },
  {
    templateKey: "hiring_manager",
    name: "Hiring Manager",
    likelyTitles: ["Hiring Manager"],
    department: "",
    whyThisRoleMatters:
      "Owns this role and the day-to-day work the hire will do.",
    notes: "Chronological walk-through interview.",
  },
  {
    templateKey: "hiring_manager_executive",
    name: "Hiring Manager's Executive",
    likelyTitles: ["Director", "Vice President"],
    department: "",
    whyThisRoleMatters:
      "The hiring manager's manager. Judges scope, judgment, and fit with the wider organization.",
    notes: "Executive interview.",
  },
  {
    templateKey: "cross_functional_lead",
    name: "Cross-functional Team Lead",
    likelyTitles: ["Team Lead", "Partner Team Lead"],
    department: "",
    whyThisRoleMatters:
      "Leads a team this role works with and judges collaboration on shared outcomes.",
    notes: "Panel competency interview.",
  },
] as const);

export type HiringTeamTemplateKey =
  (typeof HIRING_TEAM_TEMPLATE_DEFAULTS)[number]["templateKey"];

export const HIRING_MANAGER_TEMPLATE_KEY: HiringTeamTemplateKey = "hiring_manager";
