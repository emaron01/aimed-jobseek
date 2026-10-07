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
  kind: "ACHIEVEMENT" | "INTERVIEW_ANSWER" | "RESUME_BULLET" | "SEEKER_REPLY";
  text: string;
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
  achievements: ReadonlyArray<{ id: string; text: string }>;
  statements: ReadonlyArray<{
    content: string;
    kind: string;
    campaignId: string;
    targetKey: string | null;
  }>;
  replies: ReadonlyArray<{ body: string; campaignId: string }>;
}): BulletEvidence[] {
  const evidence: BulletEvidence[] = [];
  for (const item of input.achievements) {
    if (item.id.startsWith("why-this-company:")) continue;
    const text = oneLineBullet(item.text);
    if (!text) continue;
    evidence.push({ kind: "ACHIEVEMENT", text });
  }
  for (const statement of input.statements) {
    if (statement.campaignId !== input.campaignId) continue;
    if (statement.kind !== "INTERVIEW_ANSWER" && statement.kind !== "RESUME_BULLET") continue;
    if ((statement.targetKey ?? "").trim() === WHY_THIS_COMPANY_TARGET_KEY) continue;
    const text = oneLineBullet(statement.content);
    if (!text) continue;
    evidence.push({
      kind: statement.kind,
      text,
    });
  }
  for (const reply of input.replies) {
    if (reply.campaignId !== input.campaignId) continue;
    const text = oneLineBullet(reply.body);
    if (!text) continue;
    evidence.push({ kind: "SEEKER_REPLY", text });
  }
  return evidence;
}

export function assignCandidateBullets(input: {
  bullets: ResumeBulletCandidates["bullets"];
  bands: ReadonlyArray<{ roleId: string; candidateCount: number }>;
}): PickerBullet[] {
  const allowed = new Set(input.bands.map((band) => band.roleId));
  const grouped = new Map<string, PickerBullet[]>();
  for (const bullet of input.bullets) {
    const roleId = bullet.roleId.trim();
    if (!allowed.has(roleId)) continue;
    const text = oneLineBullet(bullet.text);
    if (!text) continue;
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
