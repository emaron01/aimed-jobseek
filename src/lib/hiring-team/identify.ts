import {
  hiringTeamEvidenceExcerpts,
  jobRequirementEvidenceText,
  type HiringTeamJobEvidence,
  type HiringTeamResearchEvidence,
} from "@/lib/hiring-team/evidence";
import { hiringTeamConfig } from "@/lib/product-config";

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

export type ModelIdentifiedRole = {
  name: string;
  likelyTitles: string[];
  department: string | null;
  involvement: Involvement;
  whyInvolved: string;
  evidence: Array<{ claim: string; kind: ClaimKind }>;
};

export type IdentificationCorrection = {
  roleKey: string;
  reason: string;
};

export type DroppedIdentification = {
  name: string;
  reason: string;
};

export type IdentificationGuardrailResult = {
  roles: IdentifiedHiringRole[];
  corrections: IdentificationCorrection[];
  dropped: DroppedIdentification[];
};

const JOB_SOURCE = "job-requirement";
const HIRING_MANAGER_KEY = "hiring_manager";

function slug(value: string): string {
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return key.slice(0, 80) || "role";
}

function claim(text: string, kind: ClaimKind, sourceId = JOB_SOURCE): RoleEvidence {
  return { claim: text.trim(), kind, sourceId };
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
    return HIRING_MANAGER_KEY;
  }
  return slug(input.name);
}

export function groundedInEvidence(claimText: string, evidenceText: string): boolean {
  const needle = claimText.trim().toLowerCase();
  if (needle.length >= 12 && evidenceText.toLowerCase().includes(needle)) return true;
  const tokens = contentTokens(needle);
  if (tokens.length === 0) return false;
  const evidence = new Set(contentTokens(evidenceText.toLowerCase()));
  const shared = tokens.filter((token) => evidence.has(token));
  return shared.length >= 2;
}

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function tokenSet(values: string[]): Set<string> {
  return new Set(values.flatMap((value) => contentTokens(value)));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return shared / new Set([...left, ...right]).size;
}

export function rolesDescribeSamePerson(
  left: Pick<IdentifiedHiringRole, "name" | "likelyTitles" | "whyInvolved" | "roleKey">,
  right: Pick<IdentifiedHiringRole, "name" | "likelyTitles" | "whyInvolved" | "roleKey">,
): boolean {
  if (left.roleKey === HIRING_MANAGER_KEY || right.roleKey === HIRING_MANAGER_KEY) {
    return left.roleKey === right.roleKey;
  }
  if (left.name.trim().toLowerCase() === right.name.trim().toLowerCase()) return true;
  const leftTitles = new Set(left.likelyTitles.map((title) => title.trim().toLowerCase()));
  const rightTitles = new Set(right.likelyTitles.map((title) => title.trim().toLowerCase()));
  for (const title of leftTitles) {
    if (title && rightTitles.has(title)) return true;
  }
  const leftMeaning = tokenSet([left.name, ...left.likelyTitles, left.whyInvolved]);
  const rightMeaning = tokenSet([right.name, ...right.likelyTitles, right.whyInvolved]);
  return jaccard(leftMeaning, rightMeaning) >= 0.45;
}

function hiringManagerFromReportingLine(reportingLine: string): IdentifiedHiringRole {
  return {
    roleKey: HIRING_MANAGER_KEY,
    name: "Hiring Manager",
    likelyTitles: [reportingLine],
    department: null,
    involvement: "DIRECT",
    whyInvolved: `Reports to: ${reportingLine}`,
    evidence: [claim(`Reports to: ${reportingLine}`, "FACT")],
  };
}

function toIdentifiedRole(
  role: ModelIdentifiedRole,
  reportingLine: string | null,
): IdentifiedHiringRole | null {
  const name = role.name.trim();
  const why = role.whyInvolved.trim();
  if (!name || !why) return null;
  const roleKey = roleKeyFromModel({
    name,
    likelyTitles: role.likelyTitles,
    reportingLine,
  });
  const likelyTitles =
    roleKey === HIRING_MANAGER_KEY
      ? hiringManagerTitles({
          likelyTitles: role.likelyTitles,
          reportingLine,
        })
      : role.likelyTitles.map((title) => title.trim()).filter(Boolean);
  return {
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
  };
}

function mergePair(
  kept: IdentifiedHiringRole,
  extra: IdentifiedHiringRole,
): IdentifiedHiringRole {
  const titles = [...kept.likelyTitles];
  for (const title of extra.likelyTitles) {
    if (!titles.some((item) => item.toLowerCase() === title.toLowerCase())) {
      titles.push(title);
    }
  }
  return {
    ...kept,
    likelyTitles: titles,
    department: kept.department ?? extra.department,
    whyInvolved: kept.whyInvolved.length >= extra.whyInvolved.length
      ? kept.whyInvolved
      : extra.whyInvolved,
    evidence: [...kept.evidence, ...extra.evidence],
  };
}

function sameStableIdentity(
  left: Pick<IdentifiedHiringRole, "name" | "likelyTitles" | "whyInvolved" | "roleKey">,
  right: Pick<IdentifiedHiringRole, "name" | "likelyTitles" | "whyInvolved" | "roleKey">,
): boolean {
  if (rolesDescribeSamePerson(left, right)) return true;
  const leftTokens = tokenSet([left.name, ...left.likelyTitles]);
  const rightTokens = tokenSet([right.name, ...right.likelyTitles]);
  return leftTokens.size > 0 && [...leftTokens].filter((token) => rightTokens.has(token)).length >= 2;
}

export function stabilizeRoleKeys(
  roles: IdentifiedHiringRole[],
  existing: Array<{ suggestionKey: string | null; name: string; titles: string[] }>,
): IdentifiedHiringRole[] {
  const used = new Set<string>();
  return roles.map((role) => {
    if (role.roleKey === HIRING_MANAGER_KEY) {
      used.add(HIRING_MANAGER_KEY);
      return role;
    }
    const match = existing.find((row) => {
      const key = row.suggestionKey?.trim() ?? "";
      if (!key || key === HIRING_MANAGER_KEY || used.has(key)) return false;
      return sameStableIdentity(role, {
        roleKey: key,
        name: row.name,
        likelyTitles: row.titles,
        whyInvolved: "",
      });
    });
    const roleKey = match?.suggestionKey?.trim() || role.roleKey;
    used.add(roleKey);
    return { ...role, roleKey };
  });
}

/** Guardrails only. Role names and titles come from the model, except the reporting line. */
export function applyHiringTeamIdentificationGuardrails(input: {
  roles: ModelIdentifiedRole[];
  job: HiringTeamJobEvidence;
  evidenceText: string;
  existing?: Array<{ suggestionKey: string | null; name: string; titles: string[] }>;
}): IdentificationGuardrailResult {
  const reportingLine = input.job.reportingLine?.trim() ?? "";
  const corrections: IdentificationCorrection[] = [];
  const dropped: DroppedIdentification[] = [];
  const accepted: IdentifiedHiringRole[] = [];

  for (const role of input.roles) {
    const rawFirstTitle = role.likelyTitles[0]?.trim() ?? "";
    const identified = toIdentifiedRole(role, reportingLine || null);
    if (!identified) {
      dropped.push({ name: role.name.trim() || "Role", reason: "Name or why-involved was empty." });
      continue;
    }
    if (
      identified.roleKey === HIRING_MANAGER_KEY &&
      reportingLine &&
      rawFirstTitle !== reportingLine
    ) {
      corrections.push({
        roleKey: HIRING_MANAGER_KEY,
        reason: "Set the first likely title to the stated reporting line.",
      });
    }
    const grounded =
      groundedInEvidence(identified.whyInvolved, input.evidenceText) ||
      identified.evidence.some((item) => groundedInEvidence(item.claim, input.evidenceText));
    if (!grounded) {
      dropped.push({
        name: identified.name,
        reason: "why-involved was not supported by the job requirement or company research.",
      });
      continue;
    }
    const duplicate = accepted.findIndex((item) => rolesDescribeSamePerson(item, identified));
    if (duplicate >= 0) {
      accepted[duplicate] = mergePair(accepted[duplicate]!, identified);
      corrections.push({
        roleKey: accepted[duplicate]!.roleKey,
        reason: `Merged with ${identified.name}.`,
      });
      continue;
    }
    accepted.push(identified);
  }

  if (reportingLine) {
    const managers = accepted.filter((role) => role.roleKey === HIRING_MANAGER_KEY);
    const others = accepted.filter((role) => role.roleKey !== HIRING_MANAGER_KEY);
    let manager = managers[0] ?? hiringManagerFromReportingLine(reportingLine);
    if (!managers[0]) {
      corrections.push({
        roleKey: HIRING_MANAGER_KEY,
        reason: "Added the Hiring Manager from the stated reporting line.",
      });
    }
    if (manager.likelyTitles[0] !== reportingLine) {
      corrections.push({
        roleKey: HIRING_MANAGER_KEY,
        reason: `Set the first likely title to the stated reporting line.`,
      });
      manager = {
        ...manager,
        likelyTitles: hiringManagerTitles({
          likelyTitles: manager.likelyTitles,
          reportingLine,
        }),
      };
    }
    accepted.splice(0, accepted.length, manager, ...others);
  }

  const limited = accepted.slice(0, hiringTeamConfig.maxIdentifiedRoles);
  for (const extra of accepted.slice(hiringTeamConfig.maxIdentifiedRoles)) {
    dropped.push({
      name: extra.name,
      reason: `Exceeded the configured maximum of ${hiringTeamConfig.maxIdentifiedRoles} roles.`,
    });
  }

  return {
    roles: stabilizeRoleKeys(limited, input.existing ?? []),
    corrections,
    dropped,
  };
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
