import { Prisma } from "@prisma/client";
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
  bulletEditEvidence,
  evidenceNotCovered,
  questionTextForAnswer,
  readBulletRoleChoices,
  readBulletTextEdits,
  profileWithSeekerBullet,
  readSeekerBullets,
  replaceUnpickedCandidates,
  resumeBulletCandidateFingerprint,
  sameBulletResult,
  seekerBulletEvidence,
  selectableBulletEvidence,
  splitEvidenceByEmployer,
  storedCandidatesMatch,
  type BulletCandidateRole,
  type BulletEvidence,
  type BulletQuestionTurn,
  type SeekerBulletRecord,
} from "@/lib/application-assets/resume-bullet-candidates";
import {
  GENERAL_BACKGROUND_ID,
  pickerProfileFromCandidate,
  resumeStatementPicksFromCampaign,
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
  productId: string;
  profileJson: unknown;
  profile: PickerProfile;
  roles: BulletCandidateRole[];
  evidence: BulletEvidence[];
  job: { title: string; employer: string; posting: string };
  primaryRoleId: string | null;
  directRoleIds: string[];
  choices: Record<string, string>;
  textEdits: Record<string, string>;
  seekerBullets: SeekerBulletRecord[];
  pickedIds: string[];
  profileRoles: Array<{ roleId: string; employer: string }>;
};

async function loadBulletCandidatePacket(input: {
  organizationId: string;
  campaignId: string;
}): Promise<BulletCandidatePacket | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      resumeStatementPicksJson: true,
      workspaceSeenJson: true,
      product: { select: { id: true, profileJson: true } },
      jobRequirement: {
        select: { title: true, companyName: true, rawText: true },
      },
      consultationSession: {
        select: {
          turns: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              speaker: true,
              body: true,
              sequence: true,
              targetKey: true,
              analysisJson: true,
              skipped: true,
            },
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
  const profileEmployers = profile.experience
    .map((role) => role.employer?.trim() ?? "")
    .filter((employer) => employer.length >= 2);
  const [settings, plan, libraryRows] = await Promise.all([
    getHarperDraftSettings(),
    acceptedPresentationPlan({ ...input, type: "RESUME" }),
    prisma.consultationStatement.findMany({
      where: {
        organizationId: input.organizationId,
        status: "APPROVED",
        approvedAt: { not: null },
        kind: { in: ["INTERVIEW_ANSWER", "RESUME_BULLET"] },
        session: { productId: campaign.product.id },
      },
      orderBy: [{ approvedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        content: true,
        kind: true,
        turnId: true,
        turn: { select: { targetKey: true } },
        session: {
          select: {
            campaignId: true,
            campaign: {
              select: {
                whyThisCompany: true,
                jobRequirement: { select: { companyName: true } },
              },
            },
            turns: {
              orderBy: { sequence: "asc" },
              select: {
                id: true,
                speaker: true,
                body: true,
                sequence: true,
                targetKey: true,
                analysisJson: true,
              },
            },
          },
        },
      },
    }),
  ]);
  const resumePlan = plan?.type === "RESUME" ? plan : null;
  const primaryRoleId = resumePlan?.primaryRoleId ?? null;
  const directRoleIds = resumePlan?.directRoleIds ?? [];
  const turns: BulletQuestionTurn[] = (campaign.consultationSession?.turns ?? []).map(
    (turn) => ({
      id: turn.id,
      speaker: turn.speaker,
      body: turn.body,
      sequence: turn.sequence,
      targetKey: turn.targetKey,
      analysisJson: turn.analysisJson,
    }),
  );
  const profileRoles = (parsed.ok ? parsed.profile.experience : []).map((role) => ({
    roleId: role.id,
    employer: role.employer?.trim() ?? "",
  }));
  const textEdits = readBulletTextEdits(campaign.product.profileJson);
  const seekerBullets = readSeekerBullets(campaign.product.profileJson);
  const picked = resumeStatementPicksFromCampaign({
    resumeStatementPicksJson: campaign.resumeStatementPicksJson,
    workspaceSeenJson: campaign.workspaceSeenJson,
  });
  return {
    productId: campaign.product.id,
    profileJson: campaign.product.profileJson,
    profile,
    roles: bulletCandidateRoles({
      profile,
      settings,
      primaryRoleId,
      directRoleIds,
    }),
    evidence: [
      ...splitEvidenceByEmployer(
        selectableBulletEvidence({
          campaignId: input.campaignId,
          achievements,
          profileEmployers,
          statements: libraryRows.map((statement) => {
            const sessionTurns: BulletQuestionTurn[] = statement.session.turns.map((turn) => ({
              id: turn.id,
              speaker: turn.speaker,
              body: turn.body,
              sequence: turn.sequence,
              targetKey: turn.targetKey,
              analysisJson: turn.analysisJson,
            }));
            return {
              id: statement.id,
              content: statement.content,
              kind: statement.kind,
              campaignId: statement.session.campaignId,
              targetKey: statement.turn.targetKey,
              question: questionTextForAnswer({ turns: sessionTurns, turnId: statement.turnId }),
              sourceEmployer: statement.session.campaign.jobRequirement?.companyName ?? null,
              whyThisCompany: statement.session.campaign.whyThisCompany,
            };
          }),
          replies: (campaign.consultationSession?.turns ?? [])
            .filter((turn) => turn.speaker === "SEEKER" && !turn.skipped)
            .map((turn) => ({
              id: turn.id,
              body: turn.body,
              campaignId: input.campaignId,
              question: questionTextForAnswer({ turns, turnId: turn.id }),
            })),
        }),
        profileRoles,
      ),
      ...bulletEditEvidence(textEdits),
      ...seekerBulletEvidence(seekerBullets),
    ],
    job: {
      title: campaign.jobRequirement?.title ?? "",
      employer: campaign.jobRequirement?.companyName ?? "",
      posting: campaign.jobRequirement?.rawText ?? "",
    },
    primaryRoleId,
    directRoleIds,
    choices: readBulletRoleChoices(campaign.product.profileJson),
    textEdits,
    seekerBullets,
    pickedIds: picked.picks ?? [],
    profileRoles,
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
  const assigned = parsed.success
    ? assignCandidateBullets({
        bullets: parsed.data.bullets,
        bands: packet.roles,
        evidence: packet.evidence,
        choices: packet.choices,
        roles: packet.profileRoles,
        pickedIds: new Set(packet.pickedIds),
        textEdits: packet.textEdits,
      })
    : [];
  return mergeStoredSeekerBullets(assigned, packet.seekerBullets);
}

function mergeStoredSeekerBullets(
  candidates: readonly PickerBullet[],
  seekers: readonly SeekerBulletRecord[],
): PickerBullet[] {
  if (seekers.length === 0) return [...candidates];
  const used = new Set<string>();
  const merged = candidates.flatMap((candidate) => {
    const seeker = seekers.find(
      (item) =>
        !used.has(item.id) &&
        (item.id === candidate.id ||
          sameBulletResult(item.text, candidate.text)),
    );
    if (!seeker) return [candidate];
    used.add(seeker.id);
    return [
      {
        ...candidate,
        id: seeker.id,
        roleId: seeker.roleId ?? GENERAL_BACKGROUND_ID,
        text: seeker.text,
        seekerOwned: true,
        needsJobCheck: false,
        seekerChosen: true,
      },
    ];
  });
  return [
    ...merged,
    ...seekers
      .filter((seeker) => !used.has(seeker.id))
      .map((seeker) => ({
        id: seeker.id,
        roleId: seeker.roleId ?? GENERAL_BACKGROUND_ID,
        text: seeker.text,
        evidenceIds: [`seeker-bullet:${seeker.id}`],
        seekerOwned: true,
        needsJobCheck: false,
        seekerChosen: true,
      })),
  ];
}

/** Stored General background lines. Reads the receipt and does not call the model. */
export async function readGeneralBackgroundTexts(input: {
  organizationId: string;
  campaignId: string;
}): Promise<string[]> {
  const stored = await readResumeBulletCandidates(input);
  if (!stored) return [];
  return stored.bullets
    .filter((bullet) => bullet.roleId === GENERAL_BACKGROUND_ID)
    .map((bullet) => bullet.text);
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

async function keepPickedBullets(packet: BulletCandidatePacket, json: unknown): Promise<void> {
  const shown = bulletsFromStored(packet, json);
  const keep = shown.filter(
    (bullet) => bullet.seekerOwned || packet.pickedIds.includes(bullet.id),
  );
  if (keep.length === 0) return;
  let profileJson = packet.profileJson;
  let changed = false;
  for (const bullet of keep) {
    const existing = readSeekerBullets(profileJson);
    const roleId = bullet.roleId === GENERAL_BACKGROUND_ID ? null : bullet.roleId;
    if (existing.some((item) => item.id === bullet.id && item.text === bullet.text && item.roleId === roleId)) {
      continue;
    }
    profileJson = profileWithSeekerBullet(profileJson, {
      id: bullet.id,
      text: bullet.text,
      roleId,
    });
    changed = true;
  }
  if (!changed) return;
  await prisma.product.update({
    where: { id: packet.productId },
    data: { profileJson: profileJson as Prisma.InputJsonValue },
  });
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
  if (receipt) await keepPickedBullets(packet, receipt.resultJson);
  if (
    storedCandidatesMatch(receipt?.inputHash ?? null, fingerprint) &&
    resumeBulletCandidatesSchema.safeParse(receipt?.resultJson).success
  ) {
    return { ok: true, skipped: true };
  }
  if (!isConsultationReplyAiConfigured()) {
    return { ok: false, message: UNCONFIGURED };
  }
  const previous = resumeBulletCandidatesSchema.safeParse(receipt?.resultJson);
  const previousBullets = previous.success ? previous.data.bullets : [];
  const shown = previous.success ? bulletsFromStored(packet, receipt?.resultJson) : [];
  const covered = [
    ...packet.seekerBullets.map((bullet) => ({ text: bullet.text, evidenceIds: [] as string[] })),
    ...shown
      .filter((bullet) => bullet.seekerOwned || packet.pickedIds.includes(bullet.id))
      .map((bullet) => ({ text: bullet.text, evidenceIds: bullet.evidenceIds })),
  ];
  const employers = packet.profileRoles.map((role) => role.employer);
  const evidence = evidenceNotCovered({
    evidence: packet.evidence,
    bullets: covered,
    employers,
  });
  if (previous.success && evidence.length === 0) return { ok: true, skipped: true };
  const messages = buildResumeBulletCandidateMessages({
    roles: packet.roles,
    evidence,
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
        const kept = shown.filter(
          (bullet) => bullet.seekerOwned || packet.pickedIds.includes(bullet.id),
        );
        return {
          bullets: replaceUnpickedCandidates({
            previous: previousBullets,
            next: response.data.bullets,
            kept,
            employers,
          }),
        };
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
