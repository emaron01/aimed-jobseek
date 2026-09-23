import type { ModelIdentifiedRole } from "@/lib/hiring-team/identify";

/** Fixture of model output for the normal robotics posting. Not product-code detection. */
export const NORMAL_JOB_IDENTIFICATION_FIXTURE: ModelIdentifiedRole[] = [
  {
    name: "Hiring Manager",
    likelyTitles: ["VP of Hardware"],
    department: "Engineering",
    involvement: "DIRECT",
    whyInvolved: "The Senior Product Engineer reports to the Director of Engineering.",
    evidence: [
      { claim: "The position reports to the Director of Engineering.", kind: "FACT" },
    ],
  },
  {
    name: "Recruiter",
    likelyTitles: ["Technical Recruiter", "Talent Partner"],
    department: "Talent",
    involvement: "DIRECT",
    whyInvolved: "A posted Senior Product Engineer role is screened before it reaches the hiring manager.",
    evidence: [
      { claim: "The opening is a full-time Senior Product Engineer position.", kind: "FACT" },
    ],
  },
  {
    name: "Reliability Lead",
    likelyTitles: ["Reliability Lead"],
    department: "Engineering",
    involvement: "INDIRECT",
    whyInvolved: "The mission is to make warehouse robots reliable, so a reliability lead is affected by the hire.",
    evidence: [
      { claim: "The mission of this role is to make warehouse robots reliable.", kind: "FACT" },
    ],
  },
  {
    name: "Reliability lead",
    likelyTitles: ["QA Lead"],
    department: "Engineering",
    involvement: "INDIRECT",
    whyInvolved: "The hire must lead incident response on warehouse robots, which is the reliability function.",
    evidence: [
      { claim: "Leads incident response", kind: "FACT" },
    ],
  },
  {
    name: "Robotics Lead",
    likelyTitles: ["Robotics Lead"],
    department: "Robotics",
    involvement: "INDIRECT",
    whyInvolved: "The hire builds a motion-planning service used by warehouse robots and reviews designs with the robotics team.",
    evidence: [
      { claim: "Review designs with the robotics team", kind: "FACT" },
    ],
  },
  {
    name: "Motion Planning Technical Lead",
    likelyTitles: ["Motion Planning Lead"],
    department: "Autonomy",
    involvement: "INDIRECT",
    whyInvolved: "The hire builds the motion-planning service used by warehouse robots, so the motion-planning technical lead depends on this person.",
    evidence: [
      { claim: "Build the motion-planning service", kind: "FACT" },
    ],
  },
  {
    name: "Chief Marketing Officer",
    likelyTitles: ["CMO"],
    department: "Marketing",
    involvement: "INDIRECT",
    whyInvolved: "They own the global brand campaign for consumer social ads.",
    evidence: [
      { claim: "They own the global brand campaign for consumer social ads.", kind: "INFERENCE" },
    ],
  },
];

export const NURSE_MANAGER_IDENTIFICATION_FIXTURE: ModelIdentifiedRole[] = [
  {
    name: "Hiring Manager",
    likelyTitles: ["Chief Medical Officer"],
    department: "Nursing",
    involvement: "DIRECT",
    whyInvolved: "The Clinical Nurse Manager reports to the Director of Nursing.",
    evidence: [
      { claim: "Reports to: Director of Nursing", kind: "FACT" },
    ],
  },
  {
    name: "Recruiter",
    likelyTitles: ["Nurse Recruiter"],
    department: "Talent",
    involvement: "DIRECT",
    whyInvolved: "A posted Clinical Nurse Manager role is screened before it reaches the Director of Nursing.",
    evidence: [
      { claim: "The posting is for Clinical Nurse Manager", kind: "FACT" },
    ],
  },
  {
    name: "Charge Nurse",
    likelyTitles: ["Charge Nurse"],
    department: "Nursing",
    involvement: "DIRECT",
    whyInvolved: "The hire reviews incident reports with the charge nurses, so they are a likely interview panel.",
    evidence: [
      { claim: "Review incident reports with the charge nurses", kind: "FACT" },
    ],
  },
];

export const FINANCIAL_CONTROLLER_IDENTIFICATION_FIXTURE: ModelIdentifiedRole[] = [
  {
    name: "Hiring Manager",
    likelyTitles: ["Controller"],
    department: "Finance",
    involvement: "DIRECT",
    whyInvolved: "The Financial Controller reports to the Chief Financial Officer.",
    evidence: [
      { claim: "Reports to: Chief Financial Officer", kind: "FACT" },
    ],
  },
  {
    name: "Recruiter",
    likelyTitles: ["Finance Recruiter"],
    department: "Talent",
    involvement: "DIRECT",
    whyInvolved: "A posted Financial Controller role is screened before it reaches the Chief Financial Officer.",
    evidence: [
      { claim: "The posting is for Financial Controller", kind: "FACT" },
    ],
  },
  {
    name: "Accounting interview panel",
    likelyTitles: ["Accounting Manager", "Senior Accountant"],
    department: "Accounting",
    involvement: "DIRECT",
    whyInvolved: "The hire reviews audit workpapers with the accounting team.",
    evidence: [
      { claim: "Review audit workpapers with the accounting team", kind: "FACT" },
    ],
  },
];
