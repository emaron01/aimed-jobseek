import {
  hiringTeamEvidenceExcerpts,
  jobRequirementEvidenceText,
  type HiringTeamJobEvidence,
  type HiringTeamResearchEvidence,
} from "@/lib/hiring-team/evidence";

export type Involvement = "DIRECT" | "INDIRECT";
export type ClaimKind = "FACT" | "INFERENCE";

export type RoleEvidence = {
  claim: string;
  kind: ClaimKind;
  sourceId: string;
};

export type IdentifiedHiringRole = {
  roleKey: string;
  name: string;
  likelyTitles: string[];
  department: string | null;
  involvement: Involvement;
  whyInvolved: string;
  evidence: RoleEvidence[];
};

const JOB_SOURCE = "job-requirement";

function slug(value: string): string {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return key.slice(0, 80) || "role";
}

function departmentFromReportingLine(title: string): string | null {
  const match = title.match(/\bof\s+([A-Za-z][A-Za-z /-]*)$/);
  const department = match?.[1]?.trim() ?? "";
  return department || null;
}

export function hiringManagerTitles(input: {
  likelyTitles: string[];
  reportingLine: string | null;
}): string[] {
  const reportingLine = input.reportingLine?.trim() ?? "";
  if (!reportingLine) {
    return input.likelyTitles.map((title) => title.trim()).filter(Boolean);
  }
  const rest = input.likelyTitles
    .map((title) => title.trim())
    .filter((title) => title && title.toLowerCase() !== reportingLine.toLowerCase());
  return [reportingLine, ...rest];
}

function sentenceMatching(text: string, pattern: RegExp): string | null {
  const parts = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => pattern.test(part));
  if (parts.length === 0) return null;
  return parts.sort((a, b) => b.length - a.length)[0] ?? null;
}

function claim(text: string, kind: ClaimKind, sourceId = JOB_SOURCE): RoleEvidence {
  return { claim: text.trim(), kind, sourceId };
}

type Signal = {
  roleKey: string;
  name: string;
  likelyTitles: string[];
  department: string;
  pattern: RegExp;
  why: (snippet: string) => string;
};

const INDIRECT_SIGNALS: Signal[] = [
  {
    roleKey: "product_manager",
    name: "Product Manager",
    likelyTitles: ["Product Manager"],
    department: "Product",
    pattern: /\bproduct\b/i,
    why: (snippet) =>
      `This job is product work (${snippet}), so the person who owns the product outcome depends on the hire.`,
  },
  {
    roleKey: "reliability_lead",
    name: "Reliability Lead",
    likelyTitles: ["Reliability Lead", "QA Lead"],
    department: "Engineering",
    pattern: /\b(reliab\w*|incident response|\bqa\b|quality assurance)/i,
    why: (snippet) =>
      `The job is accountable for reliability (${snippet}), so a reliability or QA lead is affected by who is hired.`,
  },
  {
    roleKey: "robotics_lead",
    name: "Robotics Lead",
    likelyTitles: ["Robotics Lead", "Hardware Lead"],
    department: "Robotics",
    pattern: /\b(robot\w*|ros\s*2|ros2|hardware|motion[- ]planning)/i,
    why: (snippet) =>
      `The job depends on robotics or hardware work (${snippet}), so that lead is involved even if they are not the hiring manager.`,
  },
];

function panelRoles(text: string): IdentifiedHiringRole[] {
  const roles: IdentifiedHiringRole[] = [];
  const pattern = /review\w*[^\n.]{0,80}?\bwith the ([a-z0-9][a-z0-9 /-]{0,40}?) team/gi;
  for (const match of text.matchAll(pattern)) {
    const team = match[1]?.trim() ?? "";
    if (!team) continue;
    const label = team.replace(/\b\w/g, (letter) => letter.toUpperCase());
    const snippet = match[0].trim();
    roles.push({
      roleKey: `panel_${slug(team)}`,
      name: `${label} interview panel`,
      likelyTitles: [`${label} Engineer`, `${label} Lead`],
      department: label,
      involvement: "DIRECT",
      whyInvolved: `The posting says the hire will ${snippet}. That team is a likely interview panel.`,
      evidence: [claim(snippet, "INFERENCE")],
    });
  }
  return roles;
}

export function identifyHiringTeamRoles(input: {
  job: HiringTeamJobEvidence;
  research: HiringTeamResearchEvidence | null;
  includeResearch: boolean;
}): IdentifiedHiringRole[] {
  const excerpts = hiringTeamEvidenceExcerpts(input);
  const text = excerpts.map((excerpt) => excerpt.text).join("\n");
  const roles: IdentifiedHiringRole[] = [];
  const reportingLine = input.job.reportingLine?.trim() ?? "";
  const title = input.job.title?.trim() ?? "";

  if (reportingLine) {
    const department = departmentFromReportingLine(reportingLine);
    roles.push({
      roleKey: "hiring_manager",
      name: "Hiring Manager",
      likelyTitles: hiringManagerTitles({
        likelyTitles: [],
        reportingLine,
      }),
      department,
      involvement: "DIRECT",
      whyInvolved: `The posting says this job reports to ${reportingLine}. That person owns the hire and the day-to-day work.`,
      evidence: [claim(`Reports to: ${reportingLine}`, "FACT")],
    });
    roles.push({
      roleKey: "hiring_manager_executive",
      name: "Hiring Manager's Executive",
      likelyTitles: department
        ? [`Vice President of ${department}`]
        : ["Vice President"],
      department,
      involvement: "DIRECT",
      whyInvolved: `They manage ${reportingLine}, so they judge scope and fit beyond the hiring manager's team.`,
      evidence: [
        claim(
          `The reporting line is ${reportingLine}, so their manager is likely in the process.`,
          "INFERENCE",
        ),
      ],
    });
  }

  if (title) {
    roles.push({
      roleKey: "recruiter",
      name: "Recruiter",
      likelyTitles: ["Recruiter", "Talent Partner"],
      department: "Talent",
      involvement: "DIRECT",
      whyInvolved: `A posted ${title} role is screened before it reaches the hiring manager.`,
      evidence: [
        claim(
          `The posting is for ${title}, which implies a recruiter screen.`,
          "INFERENCE",
        ),
      ],
    });
  }

  roles.push(...panelRoles(text));

  const jobTitle = title.toLowerCase();
  for (const signal of INDIRECT_SIGNALS) {
    if (signal.roleKey === "product_manager" && /\bproduct manager\b/i.test(jobTitle)) {
      continue;
    }
    const snippet = sentenceMatching(text, signal.pattern);
    if (!snippet) continue;
    roles.push({
      roleKey: signal.roleKey,
      name: signal.name,
      likelyTitles: signal.likelyTitles,
      department: signal.department,
      involvement: "INDIRECT",
      whyInvolved: signal.why(snippet),
      evidence: [claim(snippet, "INFERENCE")],
    });
  }

  const seen = new Set<string>();
  return roles.filter((role) => {
    if (seen.has(role.roleKey)) return false;
    seen.add(role.roleKey);
    return true;
  });
}


export function roleKeyFromModel(input: {
  name: string;
  likelyTitles: string[];
  reportingLine: string | null;
}): string {
  const reportingLine = input.reportingLine?.trim() ?? "";
  const titles = input.likelyTitles.map((title) => title.trim()).filter(Boolean);
  if (
    reportingLine &&
    (/\bhiring manager\b/i.test(input.name) ||
      titles.some((title) => title.toLowerCase() === reportingLine.toLowerCase()))
  ) {
    return "hiring_manager";
  }
  return slug(input.name);
}

export function groundedInEvidence(claimText: string, evidenceText: string): boolean {
  const needle = claimText.trim().toLowerCase();
  if (needle.length >= 12 && evidenceText.toLowerCase().includes(needle)) return true;
  const tokens = needle
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  const evidence = new Set(
    evidenceText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
  const shared = tokens.filter((token) => evidence.has(token));
  return shared.length >= 2;
}

export function acceptModelRoles(input: {
  roles: Array<{
    name: string;
    likelyTitles: string[];
    department: string | null;
    involvement: Involvement;
    whyInvolved: string;
    evidence: Array<{ claim: string; kind: ClaimKind }>;
  }>;
  evidenceText: string;
  reportingLine: string | null;
}): IdentifiedHiringRole[] {
  const accepted: IdentifiedHiringRole[] = [];
  for (const role of input.roles) {
    const name = role.name.trim();
    const why = role.whyInvolved.trim();
    if (!name || !why) continue;
    const claims = role.evidence
      .map((item) => item.claim.trim())
      .filter(Boolean);
    const grounded =
      groundedInEvidence(why, input.evidenceText) ||
      claims.some((item) => groundedInEvidence(item, input.evidenceText));
    if (!grounded) continue;
    const roleKey = roleKeyFromModel({
      name,
      likelyTitles: role.likelyTitles,
      reportingLine: input.reportingLine,
    });
    const likelyTitles =
      roleKey === "hiring_manager"
        ? hiringManagerTitles({
            likelyTitles: role.likelyTitles,
            reportingLine: input.reportingLine,
          })
        : role.likelyTitles.map((title) => title.trim()).filter(Boolean);
    accepted.push({
      roleKey,
      name,
      likelyTitles,
      department: role.department?.trim() || null,
      involvement: role.involvement,
      whyInvolved: why,
      evidence: (role.evidence.length > 0
        ? role.evidence
        : [{ claim: why, kind: "INFERENCE" as const }]
      ).map((item) => claim(item.claim, item.kind)),
    });
  }
  return accepted;
}

export function mergeIdentifiedRoles(
  fromEvidence: IdentifiedHiringRole[],
  fromModel: IdentifiedHiringRole[],
): IdentifiedHiringRole[] {
  const byKey = new Map(fromEvidence.map((role) => [role.roleKey, role]));
  for (const role of fromModel) {
    if (role.roleKey === "hiring_manager" && byKey.has("hiring_manager")) {
      continue;
    }
    if (!byKey.has(role.roleKey)) byKey.set(role.roleKey, role);
  }
  return [...byKey.values()];
}

export function evidenceTextFor(input: {
  job: HiringTeamJobEvidence;
  research: HiringTeamResearchEvidence | null;
  includeResearch: boolean;
}): string {
  return [
    jobRequirementEvidenceText(input.job),
    input.includeResearch && input.research
      ? hiringTeamEvidenceExcerpts(input)
          .slice(1)
          .map((excerpt) => excerpt.text)
          .join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
