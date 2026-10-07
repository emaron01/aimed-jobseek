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
  applyBulletTextEdits,
  assignCandidateBullets,
  buildResumeBulletCandidateMessages,
  bulletCandidateRoles,
  bulletEditEvidence,
  employerNameRetryMessage,
  employerRetryDecision,
  mergeEmployerNameRetry,
  mergeFollowUpBullets,
  questionTextForAnswer,
  readBulletRoleChoices,
  readBulletTextEdits,
  resumeBulletCandidateFingerprint,
  selectableBulletEvidence,
  splitEvidenceByEmployer,
  storedCandidatesMatch,
  uncitedStatedResults,
  uncoveredResultFollowUpMessage,
  type BulletCandidateRole,
  type BulletEvidence,
  type BulletQuestionTurn,
} from "@/lib/application-assets/resume-bullet-candidates";
import {
  GENERAL_BACKGROUND_ID,
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
  choices: Record<string, string>;
  textEdits: Record<string, string>;
  profileRoles: Array<{ roleId: string; employer: string }>;
};

async function loadBulletCandidatePacket(input: {
  organizationId: string;
  campaignId: string;
}): Promise<BulletCandidatePacket | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
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
  return {
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
  if (!parsed.success) return [];
  return applyBulletTextEdits(
    assignCandidateBullets({
      bullets: parsed.data.bullets,
      bands: packet.roles,
      evidence: packet.evidence,
      choices: packet.choices,
      roles: packet.profileRoles,
    }),
    packet.textEdits,
  );
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
        const employers = packet.profileRoles.map((role) => role.employer);
        const generate = async (
          nextMessages: Array<{ role: "system" | "user"; content: string }>,
          step: string,
        ) => {
          const response = await getConsultationReplyAiProvider({
            temperature: RESUME_WRITER_TEMPERATURE,
          }).generateStructured({
            ...structuredOutputRequest("resumeBulletCandidates"),
            ...aiCallTracking({
              organizationId: input.organizationId,
              campaignId: input.campaignId,
              category: "ASSET_GENERATION",
              operation: "APPLICATION_ASSET_GENERATION",
              metadata: { step },
            }),
            messages: nextMessages,
            parseOutput: (raw) => ({
              data: resumeBulletCandidatesSchema.parse(raw),
              coercedFields: [],
            }),
          });
          return response.data;
        };
        const first = await generate(messages, "resume_bullet_candidates");
        let kept = first;
        if (
          employerRetryDecision({
            bullets: first.bullets,
            employers,
            alreadyRetried: false,
          }) === "retry"
        ) {
          const retry = await generate(
            [...messages, { role: "user", content: employerNameRetryMessage() }],
            "resume_bullet_candidates_retry",
          );
          kept = mergeEmployerNameRetry({ first, retry, employers });
        }
        const uncovered = uncitedStatedResults({
          evidence: packet.evidence,
          bullets: kept.bullets,
          employers,
        });
        const system = messages[0];
        if (uncovered.length === 0 || !system) return kept;
        const followUp = await generate(
          [
            system,
            {
              role: "user",
              content: uncoveredResultFollowUpMessage({
                roles: packet.roles,
                evidence: uncovered,
                job: packet.job,
              }),
            },
          ],
          "resume_bullet_candidates_follow_up",
        );
        return mergeFollowUpBullets({
          kept,
          followUp,
          uncoveredIds: new Set(uncovered.map((item) => item.id)),
        });
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
