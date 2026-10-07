import {
  getConsultationReplyAiProvider,
  isConsultationReplyAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { runPaidStructuredCall } from "@/lib/ai/paid-call-gate";
import { RESUME_WRITER_TEMPERATURE } from "@/lib/application-assets/ai";
import {
  resumeBulletCandidatesSchema,
  type ResumeBulletCandidates,
} from "@/lib/application-assets/contract";
import { acceptedPresentationPlan } from "@/lib/application-assets/plan-service";
import {
  assignCandidateBullets,
  buildResumeBulletCandidateMessages,
  bulletCandidateRoles,
  resumeBulletCandidateFingerprint,
  selectableBulletEvidence,
  storedCandidatesMatch,
  type BulletCandidateRole,
  type BulletEvidence,
} from "@/lib/application-assets/resume-bullet-candidates";
import {
  pickerProfileFromCandidate,
  type PickerBullet,
  type PickerProfile,
} from "@/lib/application-assets/resume-statement-picks";
import { getHarperDraftSettings } from "@/lib/consultation/harper-draft-settings";
import { prisma } from "@/lib/prisma-client";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { aiCallTracking } from "@/lib/usage/ai-call";

export const RESUME_BULLET_CANDIDATES_OPERATION = "RESUME_BULLET_CANDIDATES" as const;

const UNCONFIGURED = "Resume bullet preparation is not configured.";

export type BulletCandidatePacket = {
  profile: PickerProfile;
  roles: BulletCandidateRole[];
  evidence: BulletEvidence[];
  job: { title: string; employer: string; posting: string };
  primaryRoleId: string | null;
  directRoleIds: string[];
};

async function loadBulletCandidatePacket(input: {
  organizationId: string;
  campaignId: string;
}): Promise<BulletCandidatePacket | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      product: { select: { profileJson: true } },
      jobRequirement: {
        select: { title: true, companyName: true, rawText: true },
      },
      consultationSession: {
        select: {
          statements: {
            where: {
              status: "APPROVED",
              kind: { in: ["INTERVIEW_ANSWER", "RESUME_BULLET"] },
            },
            select: {
              id: true,
              content: true,
              kind: true,
              turn: { select: { targetKey: true } },
            },
          },
          turns: {
            where: { speaker: "SEEKER", skipped: false },
            select: { id: true, body: true },
          },
        },
      },
    },
  });
  if (!campaign) return null;
  const parsed = parseCandidateProfileSafe(campaign.product.profileJson);
  const profile = pickerProfileFromCandidate(
    parsed.ok
      ? parsed.profile
      : { experience: [], education: [], problemsSolved: [] },
  );
  const achievements = parsed.ok
    ? parsed.profile.experience.flatMap((role) =>
        role.achievements.map((item) => ({ id: item.id, text: item.text, roleId: role.id })),
      )
    : [];
  const [settings, plan] = await Promise.all([
    getHarperDraftSettings(),
    acceptedPresentationPlan({ ...input, type: "RESUME" }),
  ]);
  const resumePlan = plan?.type === "RESUME" ? plan : null;
  const primaryRoleId = resumePlan?.primaryRoleId ?? null;
  const directRoleIds = resumePlan?.directRoleIds ?? [];
  return {
    profile,
    roles: bulletCandidateRoles({
      profile,
      settings,
      primaryRoleId,
      directRoleIds,
    }),
    evidence: selectableBulletEvidence({
      campaignId: input.campaignId,
      achievements,
      statements: (campaign.consultationSession?.statements ?? []).map((statement) => ({
        id: statement.id,
        content: statement.content,
        kind: statement.kind,
        campaignId: input.campaignId,
        targetKey: statement.turn?.targetKey ?? null,
      })),
      replies: (campaign.consultationSession?.turns ?? []).map((turn) => ({
        id: turn.id,
        body: turn.body,
        campaignId: input.campaignId,
      })),
    }),
    job: {
      title: campaign.jobRequirement?.title ?? "",
      employer: campaign.jobRequirement?.companyName ?? "",
      posting: campaign.jobRequirement?.rawText ?? "",
    },
    primaryRoleId,
    directRoleIds,
  };
}

function fingerprintFor(packet: BulletCandidatePacket): string {
  return resumeBulletCandidateFingerprint({
    roles: packet.roles,
    evidence: packet.evidence,
    job: packet.job,
  });
}

function bulletsFromStored(
  packet: BulletCandidatePacket,
  json: unknown,
): PickerBullet[] {
  const parsed = resumeBulletCandidatesSchema.safeParse(json);
  if (!parsed.success) return [];
  return assignCandidateBullets({
    bullets: parsed.data.bullets,
    bands: packet.roles,
    evidence: packet.evidence,
  });
}

/** Page view reads the stored candidates. It does not call the model. */
export async function readResumeBulletCandidates(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{
  packet: BulletCandidatePacket;
  bullets: PickerBullet[];
  needsPrepare: boolean;
} | null> {
  const packet = await loadBulletCandidatePacket(input);
  if (!packet) return null;
  const fingerprint = fingerprintFor(packet);
  const receipt = await prisma.paidCallReceipt.findUnique({
    where: {
      organizationId_operation_subjectKey: {
        organizationId: input.organizationId,
        operation: RESUME_BULLET_CANDIDATES_OPERATION,
        subjectKey: input.campaignId,
      },
    },
    select: { inputHash: true, resultJson: true },
  });
  return {
    packet,
    bullets: receipt ? bulletsFromStored(packet, receipt.resultJson) : [],
    needsPrepare: !storedCandidatesMatch(receipt?.inputHash ?? null, fingerprint),
  };
}

/** Seeker action. A matching fingerprint returns the stored bullets and does not call the model. */
export async function prepareResumeBulletCandidates(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{ ok: true; skipped: boolean } | { ok: false; message: string }> {
  const packet = await loadBulletCandidatePacket(input);
  if (!packet) return { ok: false, message: "Application was not found." };
  const fingerprint = fingerprintFor(packet);
  const receipt = await prisma.paidCallReceipt.findUnique({
    where: {
      organizationId_operation_subjectKey: {
        organizationId: input.organizationId,
        operation: RESUME_BULLET_CANDIDATES_OPERATION,
        subjectKey: input.campaignId,
      },
    },
    select: { inputHash: true, resultJson: true },
  });
  if (
    storedCandidatesMatch(receipt?.inputHash ?? null, fingerprint) &&
    resumeBulletCandidatesSchema.safeParse(receipt?.resultJson).success
  ) {
    return { ok: true, skipped: true };
  }
  if (!isConsultationReplyAiConfigured()) {
    return { ok: false, message: UNCONFIGURED };
  }
  const messages = buildResumeBulletCandidateMessages({
    roles: packet.roles,
    evidence: packet.evidence,
    job: packet.job,
  });
  try {
    await runPaidStructuredCall<ResumeBulletCandidates>({
      organizationId: input.organizationId,
      operation: RESUME_BULLET_CANDIDATES_OPERATION,
      subjectKey: input.campaignId,
      inputFingerprint: fingerprint,
      parseStored: (json) => resumeBulletCandidatesSchema.parse(json),
      isResultUsable: (stored) => Array.isArray(stored.bullets),
      callProvider: async () => {
        const response = await getConsultationReplyAiProvider({
          temperature: RESUME_WRITER_TEMPERATURE,
        }).generateStructured({
          ...structuredOutputRequest("resumeBulletCandidates"),
          ...aiCallTracking({
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            category: "ASSET_GENERATION",
            operation: "APPLICATION_ASSET_GENERATION",
            metadata: { step: "resume_bullet_candidates" },
          }),
          messages,
          parseOutput: (raw) => ({
            data: resumeBulletCandidatesSchema.parse(raw),
            coercedFields: [],
          }),
        });
        return response.data;
      },
    });
    return { ok: true, skipped: false };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Resume bullets could not be prepared.",
    };
  }
}
