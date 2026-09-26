import { parseCheatSheetNotes } from "@/lib/application-summary/notes";
import type {
  CoachGeneralPersona,
  CoachHiringTeamPerson,
  CoachHiringTeamRole,
  CoachPersonInterviewStage,
  CoachPersonLinkedIn,
  CoachPersonPersona,
} from "@/lib/consultation/contract";
import {
  individualProfileRecordSchema,
  linkedInExtractedSchema,
} from "@/lib/contact-profile/contract";
import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";
import { parsePersonPrepAnswers } from "@/lib/interview/person-prep";
import { prisma } from "@/lib/prisma-client";
import { parseStringArray } from "@/lib/research";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function annotatedText(value: unknown): string | null {
  const row = record(value);
  const text = typeof row?.text === "string" ? row.text.trim() : "";
  return text || null;
}

function annotatedTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = annotatedText(item);
    return text ? [text] : [];
  });
}

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text || null;
}

function generalPersona(role: {
  definition: string | null;
  department: string | null;
  seniority: string | null;
  responsibilities: string | null;
  painPoints: string | null;
  desiredOutcomes: string | null;
  messagingNotes: string | null;
  additionalContext: string | null;
  profileJson: unknown;
}): CoachGeneralPersona {
  const narrative = record(record(role.profileJson)?.narrative);
  return {
    definition: trimmed(role.definition),
    department: trimmed(role.department),
    seniority: trimmed(role.seniority),
    responsibilities: trimmed(role.responsibilities),
    painPoints: trimmed(role.painPoints),
    desiredOutcomes: trimmed(role.desiredOutcomes),
    messagingNotes: trimmed(role.messagingNotes),
    additionalContext: trimmed(role.additionalContext),
    overview: annotatedText(narrative?.overview),
    impact: annotatedText(narrative?.impact),
    pressures: annotatedTexts(narrative?.pressures),
    needs: annotatedTexts(narrative?.needs),
    concerns: annotatedTexts(narrative?.concerns),
    evaluates: annotatedTexts(narrative?.evaluates),
    talkingPoints: annotatedTexts(narrative?.talkingPoints),
    communication: annotatedTexts(narrative?.communication),
    interviewStage: annotatedText(narrative?.interviewStage),
  };
}

function personPersona(value: unknown): CoachPersonPersona | null {
  const parsed = individualProfileRecordSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    caresAbout: parsed.data.caresAbout.map((item) => item.text),
    talkingPoints: parsed.data.talkingPoints.map((item) => item.text),
    likelyToValue: parsed.data.likelyToValue.map((item) => item.text),
    commonGround: parsed.data.commonGround.map((item) => ({
      text: item.text,
      seekerSource: item.seekerSource,
      contactSource: item.contactSource,
    })),
  };
}

function personLinkedIn(input: {
  profileText: string | null;
  extracted: unknown;
}): CoachPersonLinkedIn | null {
  const profileText = trimmed(input.profileText);
  const parsed = linkedInExtractedSchema.safeParse(input.extracted);
  if (!profileText && !parsed.success) return null;
  const extracted = parsed.success ? parsed.data : null;
  return {
    headline: extracted?.headline?.text ?? null,
    about: extracted?.about?.text ?? null,
    currentTitle: extracted?.currentTitle?.text ?? null,
    currentEmployer: extracted?.currentEmployer?.text ?? null,
    currentTenure: extracted?.currentTenure?.text ?? null,
    priorRoles:
      extracted?.priorRoles.map((item) => ({
        employer: item.employer.text,
        title: item.title?.text ?? null,
        dates: item.dates?.text ?? null,
      })) ?? [],
    education: extracted?.education.map((item) => item.text) ?? [],
    certifications: extracted?.certifications.map((item) => item.text) ?? [],
    skills: extracted?.skills.map((item) => item.text) ?? [],
    statedFocus: extracted?.statedFocus.map((item) => item.text) ?? [],
    profileText,
  };
}

function personName(contact: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const name = [contact.firstName, contact.lastName]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return name || trimmed(contact.email) || "This interviewer";
}

/**
 * Hiring Team context for the Coach call: every role's built general persona, plus
 * each matched person's own persona and evidence as a separate entry. A person's
 * information is never merged into or replaced by the general persona.
 */
export async function loadCoachHiringTeam(
  organizationId: string,
  campaignId: string,
): Promise<CoachHiringTeamRole[]> {
  const [roles, memberships, stages] = await Promise.all([
    prisma.persona.findMany({
      where: { organizationId, campaignId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        targetTitles: true,
        whyThisPersonaMatters: true,
        definition: true,
        department: true,
        seniority: true,
        responsibilities: true,
        painPoints: true,
        desiredOutcomes: true,
        messagingNotes: true,
        additionalContext: true,
        setupStatus: true,
        profileJson: true,
      },
    }),
    prisma.campaignContact.findMany({
      where: { organizationId, campaignId, chosenPersonaId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: {
        contactId: true,
        chosenPersonaId: true,
        roleConfirmed: true,
        linkedInProfileText: true,
        linkedInExtractedJson: true,
        individualProfileJson: true,
        cheatSheetNotesJson: true,
        personPrepOpening: true,
        personPrepAnswersJson: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            title: true,
            company: true,
            linkedinUrl: true,
          },
        },
      },
    }),
    prisma.interviewStage.findMany({
      where: { organizationId, campaignId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        type: true,
        format: true,
        scheduledAt: true,
        expectedDecisionAt: true,
        outcome: true,
        notesBefore: true,
        notesAfter: true,
        interviewers: { select: { contactId: true } },
      },
    }),
  ]);
  const stagesByContactId = new Map<string, CoachPersonInterviewStage[]>();
  for (const stage of stages) {
    for (const interviewer of stage.interviewers) {
      const list = stagesByContactId.get(interviewer.contactId) ?? [];
      list.push({
        id: stage.id,
        type: stage.type,
        format: stage.format,
        scheduledAt: stage.scheduledAt.toISOString(),
        expectedDecisionAt: stage.expectedDecisionAt?.toISOString() ?? null,
        outcome: stage.outcome,
        notesBefore: trimmed(stage.notesBefore),
        notesAfter: trimmed(stage.notesAfter),
      });
      stagesByContactId.set(interviewer.contactId, list);
    }
  }
  const peopleByRoleId = new Map<string, CoachHiringTeamPerson[]>();
  for (const membership of memberships) {
    const roleId = membership.chosenPersonaId;
    if (!roleId) continue;
    const person: CoachHiringTeamPerson = {
      contactId: membership.contactId,
      name: personName(membership.contact),
      title: trimmed(membership.contact.title),
      employer: trimmed(membership.contact.company),
      linkedInUrl: trimmed(membership.contact.linkedinUrl),
      roleConfirmed: membership.roleConfirmed,
      persona: personPersona(membership.individualProfileJson),
      linkedIn: personLinkedIn({
        profileText: membership.linkedInProfileText,
        extracted: membership.linkedInExtractedJson,
      }),
      recordedNotes: parseCheatSheetNotes(membership.cheatSheetNotesJson).map(
        (note) => ({
          id: note.id,
          text: note.text,
          stageId: note.stageId,
          recordedAt: note.createdAt,
        }),
      ),
      interviewStages: stagesByContactId.get(membership.contactId) ?? [],
      prepOpening: trimmed(membership.personPrepOpening),
      interviewLearnings: parsePersonPrepAnswers(
        membership.personPrepAnswersJson,
      ).map((answer) => answer.text),
    };
    const list = peopleByRoleId.get(roleId) ?? [];
    list.push(person);
    peopleByRoleId.set(roleId, list);
  }
  return roles.map((role) => {
    const built = isHiringTeamPersonaBuilt(role);
    return {
      id: role.id,
      name: role.name,
      likelyTitles: parseStringArray(role.targetTitles),
      whyThisRoleMatters: role.whyThisPersonaMatters,
      personaBuilt: built,
      persona: built ? generalPersona(role) : null,
      people: peopleByRoleId.get(role.id) ?? [],
    };
  });
}
