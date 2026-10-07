import { createHash } from "node:crypto";
import {
  RESUME_BULLET_CANDIDATE_PROMPT_VERSION,
  resumeBulletCandidatesSchema,
  type ResumeBulletCandidates,
} from "@/lib/application-assets/contract";
import {
  orderRoleBullets,
  roleBulletBands,
  type PickerBullet,
  type PickerProfile,
} from "@/lib/application-assets/resume-statement-picks";
import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import type { HarperDraftSettings } from "@/lib/consultation/harper-draft-settings";
import { RESUME_BULLET_CANDIDATE_INSTRUCTIONS } from "@/lib/prompt-content/application-assets";

export type BulletEvidence = {
  id: string;
  kind: "ACHIEVEMENT" | "INTERVIEW_ANSWER" | "RESUME_BULLET" | "SEEKER_REPLY";
  text: string;
  /** Set for a Personal Profile achievement; null for answers, bullets, and replies. */
  roleId: string | null;
};

export type BulletCandidateRole = {
  roleId: string;
  employer: string;
  title: string;
  candidateCount: number;
};

export function oneLineBullet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function selectableBulletEvidence(input: {
  campaignId: string;
  achievements: ReadonlyArray<{ id: string; text: string; roleId: string }>;
  statements: ReadonlyArray<{
    id: string;
    content: string;
    kind: string;
    campaignId: string;
    targetKey: string | null;
  }>;
  replies: ReadonlyArray<{ id: string; body: string; campaignId: string }>;
}): BulletEvidence[] {
  const evidence: BulletEvidence[] = [];
  for (const item of input.achievements) {
    if (item.id.startsWith("why-this-company:")) continue;
    const text = oneLineBullet(item.text);
    const roleId = item.roleId.trim();
    if (!text || !item.id.trim() || !roleId) continue;
    evidence.push({ id: item.id.trim(), kind: "ACHIEVEMENT", text, roleId });
  }
  for (const statement of input.statements) {
    if (statement.campaignId !== input.campaignId) continue;
    if (statement.kind !== "INTERVIEW_ANSWER" && statement.kind !== "RESUME_BULLET") continue;
    if ((statement.targetKey ?? "").trim() === WHY_THIS_COMPANY_TARGET_KEY) continue;
    const text = oneLineBullet(statement.content);
    const id = statement.id.trim();
    if (!text || !id) continue;
    evidence.push({
      id,
      kind: statement.kind,
      text,
      roleId: null,
    });
  }
  for (const reply of input.replies) {
    if (reply.campaignId !== input.campaignId) continue;
    const text = oneLineBullet(reply.body);
    const id = reply.id.trim();
    if (!text || !id) continue;
    evidence.push({ id, kind: "SEEKER_REPLY", text, roleId: null });
  }
  return evidence;
}

/** True when the employer appears as its own name, not as part of a longer word. */
export function textNamesEmployer(text: string, employer: string): boolean {
  const company = employer.trim();
  if (company.length < 2) return false;
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function evidenceSupportsAssignedRole(input: {
  evidence: BulletEvidence;
  roleId: string;
  employer: string;
}): boolean {
  if (input.evidence.kind === "ACHIEVEMENT" && input.evidence.roleId === input.roleId) {
    return true;
  }
  return textNamesEmployer(input.evidence.text, input.employer);
}

function logDroppedBulletCandidate(input: {
  roleId: string;
  text: string;
  evidenceIds: readonly string[];
}): void {
  console.info(
    JSON.stringify({
      event: "resume_bullet_candidate_dropped",
      roleId: input.roleId,
      evidenceIds: input.evidenceIds,
      text: input.text,
    }),
  );
}

export function assignCandidateBullets(input: {
  bullets: ResumeBulletCandidates["bullets"];
  bands: ReadonlyArray<{ roleId: string; employer: string; candidateCount: number }>;
  evidence: readonly BulletEvidence[];
}): PickerBullet[] {
  const bands = new Map(input.bands.map((band) => [band.roleId, band]));
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const grouped = new Map<string, PickerBullet[]>();
  for (const bullet of input.bullets) {
    const roleId = bullet.roleId.trim();
    const band = bands.get(roleId);
    if (!band) continue;
    const text = oneLineBullet(bullet.text);
    if (!text) continue;
    const evidenceIds = [...new Set(bullet.evidenceIds.map((id) => id.trim()).filter(Boolean))];
    const supportsRole =
      evidenceIds.length > 0 &&
      evidenceIds.every((id) => {
        const evidence = evidenceById.get(id);
        return (
          evidence !== undefined &&
          evidenceSupportsAssignedRole({ evidence, roleId, employer: band.employer })
        );
      });
    if (!supportsRole) {
      logDroppedBulletCandidate({ roleId, text, evidenceIds });
      continue;
    }
    const id = `bullet:${createHash("sha256").update(`${roleId}\n${text}`).digest("hex").slice(0, 16)}`;
    const list = grouped.get(roleId) ?? [];
    if (list.some((item) => item.id === id)) continue;
    list.push({ id, roleId, text, jobSpecific: bullet.jobSpecific });
    grouped.set(roleId, list);
  }
  return input.bands.flatMap((band) =>
    orderRoleBullets(grouped.get(band.roleId) ?? [], band.candidateCount),
  );
}

export function bulletCandidateRoles(input: {
  profile: PickerProfile;
  settings: HarperDraftSettings;
  primaryRoleId: string | null;
  directRoleIds: readonly string[];
  asOf?: Date;
}): BulletCandidateRole[] {
  return roleBulletBands(input).map((band) => ({
    roleId: band.roleId,
    employer: band.employer,
    title: band.title,
    candidateCount: band.candidateCount,
  }));
}

export function storedCandidatesMatch(
  storedHash: string | null,
  fingerprint: string,
): boolean {
  return storedHash !== null && storedHash === fingerprint;
}

export function buildResumeBulletCandidateMessages(input: {
  roles: readonly BulletCandidateRole[];
  evidence: readonly BulletEvidence[];
  job: { title: string; employer: string; posting: string };
}): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: `Prompt version: ${RESUME_BULLET_CANDIDATE_PROMPT_VERSION}\n\n${RESUME_BULLET_CANDIDATE_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content: JSON.stringify({
        roles: input.roles,
        evidence: input.evidence,
        job: input.job,
      }),
    },
  ];
}

export function resumeBulletCandidateFingerprint(input: {
  roles: readonly BulletCandidateRole[];
  evidence: readonly BulletEvidence[];
  job: { title: string; employer: string; posting: string };
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: RESUME_BULLET_CANDIDATE_PROMPT_VERSION,
    schemaName: "resume_bullet_candidates",
    messages: buildResumeBulletCandidateMessages(input),
  });
}

export function parseStoredBulletCandidates(json: unknown): ResumeBulletCandidates {
  return resumeBulletCandidatesSchema.parse(json);
}
