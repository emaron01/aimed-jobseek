import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";
import { HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION } from "@/lib/hiring-team/contract";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import { parseStringArray } from "@/lib/research";

export type HiringTeamPeerIdentity = {
  id: string;
  name: string;
  likelyTitles: string[];
  involvement: "DIRECT" | "INDIRECT";
};

function evidenceForFingerprint(
  excerpts: Array<{ sourceId: string; displayName: string; text: string }>,
) {
  return excerpts.map((excerpt) => ({
    sourceId: excerpt.sourceId,
    displayName: excerpt.displayName,
    text: excerpt.text,
  }));
}

function involvementFromProfile(profileJson: unknown): "DIRECT" | "INDIRECT" {
  if (!profileJson || typeof profileJson !== "object") return "DIRECT";
  return (profileJson as { involvement?: unknown }).involvement === "INDIRECT"
    ? "INDIRECT"
    : "DIRECT";
}

export function hiringTeamIdentifyFingerprint(input: {
  evidence: Array<{ sourceId: string; displayName: string; text: string }>;
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION,
    schemaName: "hiring_team_identification",
    evidence: evidenceForFingerprint(input.evidence),
  });
}

export function hiringTeamSynthesizeFingerprint(input: {
  roleName: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  involvement: "DIRECT" | "INDIRECT";
  notes: string | null;
  rejection: string[];
  excerpts: Array<{ sourceId: string; displayName: string; text: string }>;
  peers: HiringTeamPeerIdentity[];
}): string {
  const peers = [...input.peers]
    .map((peer) => ({
      id: peer.id,
      name: peer.name,
      likelyTitles: [...peer.likelyTitles].map((t) => t.trim()).filter(Boolean),
      involvement: peer.involvement,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return fingerprintPaidCallInputs({
    promptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
    schemaName: "persona_setup_synthesis",
    roleName: input.roleName,
    likelyTitles: input.likelyTitles,
    department: input.department,
    whyThisRoleMatters: input.whyThisRoleMatters,
    involvement: input.involvement,
    notes: input.notes,
    rejection: input.rejection.map((item) => item.trim()).filter(Boolean),
    excerpts: evidenceForFingerprint(input.excerpts),
    peers,
  });
}

export function peerIdentityFromPersona(row: {
  id: string;
  name: string;
  targetTitles: unknown;
  profileJson: unknown;
}): HiringTeamPeerIdentity {
  return {
    id: row.id,
    name: row.name,
    likelyTitles: parseStringArray(row.targetTitles),
    involvement: involvementFromProfile(row.profileJson),
  };
}

export function excerptsForFingerprint(
  excerpts: EvidenceExcerpt[],
): Array<{ sourceId: string; displayName: string; text: string }> {
  return excerpts.map((excerpt) => ({
    sourceId: excerpt.sourceId,
    displayName: excerpt.displayName,
    text: excerpt.text,
  }));
}
