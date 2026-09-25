import type { HiringTeamJobEvidence } from "@/lib/hiring-team/evidence";
import type { Involvement } from "@/lib/hiring-team/identify";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";

export type AnnotatedText = {
  text: string;
  kind: "FACT" | "INFERENCE";
};

/** Model text only. Product code does not write these sentences. */
export type HiringTeamNarrative = {
  overview: AnnotatedText;
  pressures: AnnotatedText[];
  impact: AnnotatedText;
  needs: AnnotatedText[];
  concerns: AnnotatedText[];
  interviewStage: AnnotatedText | null;
  evaluates: AnnotatedText[];
  talkingPoints: AnnotatedText[];
  communication: AnnotatedText[];
};

export type HiringTeamDraftFields = {
  overview: string;
  pressures: string[];
  impact: string;
  needs: string[];
  concerns: string[];
  interviewStage: string | null;
  evaluates: string[];
  talkingPoints: string[];
  communication: string[];
};

const CLAIM_PREFIX = /^\s*(FACT|INFERENCE)\s*:\s*/i;
const SYSTEM_STATE =
  /\b(research status|identity ambiguous|identityambiguous|confidence\s*(is|=|score)|missing (company )?research|research is (incomplete|missing|absent|unavailable)|company research (is )?(incomplete|missing|absent)|incomplete company research|prompt version|not configured)\b/i;

export function stripClaimPrefix(text: string): string {
  return text.replace(CLAIM_PREFIX, "").trim();
}

export function mentionsInternalSystemState(text: string): boolean {
  return SYSTEM_STATE.test(text);
}

function clean(values: Array<string | null | undefined> | null | undefined): string[] {
  return (values ?? [])
    .map((value) => stripClaimPrefix(value ?? ""))
    .filter(Boolean);
}

export function jobRequirementLines(job: HiringTeamJobEvidence): string[] {
  return [
    job.title,
    job.companyName,
    job.reportingLine,
    job.reportingLine ? `Reports to: ${job.reportingLine}` : "",
    ...job.responsibilities,
    ...job.requiredItems,
    ...job.preferredItems,
    job.scorecard.mission?.text ?? "",
    ...job.scorecard.outcomes.map((item) => item.text),
    ...job.scorecard.competencies.map((item) => item.text),
  ]
    .map((line) => (line ?? "").trim())
    .filter(Boolean);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the field is a job line plus only a short wrapper. */
export function fieldRestatesJobRequirement(field: string, jobLines: string[]): boolean {
  const normalized = normalize(field);
  if (!normalized) return false;
  for (const line of jobLines) {
    const jobLine = normalize(line);
    if (jobLine.length < 12 || !normalized.includes(jobLine)) continue;
    const extra = normalized.replace(jobLine, " ").replace(/[^a-z0-9]/g, "");
    if (extra.length < 40) return true;
  }
  return false;
}

function list(values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(". ");
}

export const HIRING_MANAGER_WALKTHROUGH = "hiring manager chronological walk-through";

export function applyHiringManagerInterviewStage(
  stage: string | null,
  evidenceText: string,
): string {
  const fallback = HIRING_MANAGER_WALKTHROUGH;
  const cleaned = stripClaimPrefix(stage ?? "");
  if (!cleaned) return fallback;
  if (cleaned.toLowerCase() === fallback) return fallback;
  if (evidenceText.toLowerCase().includes(cleaned.toLowerCase())) return cleaned;
  return fallback;
}

export function fieldsFromPersonaDraft(draft: PersonaAiDraft): HiringTeamDraftFields {
  const responsibilities = clean(draft.primaryResponsibilities);
  const ownership = clean(draft.ownershipAreas);
  const overview =
    stripClaimPrefix(draft.roleSummary ?? "") ||
    [...responsibilities, ...ownership].filter(Boolean).join(". ");
  const pressures = clean(draft.organizationalPressures);
  return {
    overview,
    pressures: pressures.length > 0 ? pressures : clean(draft.painPoints),
    impact: stripClaimPrefix(draft.impact ?? ""),
    needs:
      clean(draft.needsFromHire).length > 0
        ? clean(draft.needsFromHire)
        : clean(draft.desiredOutcomesFromSolution),
    concerns:
      clean(draft.candidateConcerns).length > 0
        ? clean(draft.candidateConcerns)
        : clean(draft.likelyObjections),
    interviewStage: stripClaimPrefix(draft.interviewStage ?? "") || null,
    evaluates: clean(draft.evaluates),
    talkingPoints: clean(draft.talkingPoints),
    communication: clean(draft.communicationApproach),
  };
}

const RECRUITER_CRAFT =
  /\b(target maps?|source(?:d|ing)? candidates|build(?:ing)? a slate|write (?:a |the )?job descriptions?|run the (?:req|search|requisition)|screen(?:ing)? (?:candidates|applicants)|requisitions?|pipeline of candidates|boolean search)\b/i;
const PERSONA_JOB_IMPERATIVE =
  /\b(describe how you would|walk (?:me|them) through how you would|explain how you would)\b/i;
const RECRUITER_ROLE =
  /\b(talent acquisition|recruiter|sourcer|staffing|people partner|ta partner)\b/i;

/** Talking points are what the seeker says to this person, not how to do this person's job. */
export function talkingPointWrittenFromPersonaJob(
  text: string,
  roleName = "",
  titles: string[] = [],
): boolean {
  const value = text.trim();
  if (!value) return false;
  if (RECRUITER_CRAFT.test(value)) return true;
  const persona = [roleName, ...titles].join(" ");
  return RECRUITER_ROLE.test(persona) && PERSONA_JOB_IMPERATIVE.test(value);
}

export function assessHiringTeamDraft(input: {
  fields: HiringTeamDraftFields;
  jobLines: string[];
  involvement: Involvement;
  roleName?: string;
  likelyTitles?: string[];
}): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const requireText = (label: string, text: string) => {
    if (!text.trim()) {
      reasons.push(`${label} is missing.`);
      return;
    }
    if (fieldRestatesJobRequirement(text, input.jobLines)) {
      reasons.push(`${label} restates the job requirement instead of describing this person.`);
    }
  };
  const requireList = (label: string, values: string[], minimum: number) => {
    if (values.length < minimum) {
      reasons.push(`${label} needs at least ${minimum} specific item${minimum === 1 ? "" : "s"}.`);
    }
    values.forEach((value, index) => {
      if (fieldRestatesJobRequirement(value, input.jobLines)) {
        reasons.push(
          `${label} item ${index + 1} restates the job requirement instead of describing this person.`,
        );
      }
    });
  };
  requireText("Overview", input.fields.overview);
  requireText("Impact", input.fields.impact);
  requireList("Pressures", input.fields.pressures, 1);
  requireList("Needs", input.fields.needs, 2);
  requireList("Concerns", input.fields.concerns, 1);
  requireList("Talking points", input.fields.talkingPoints, 1);
  input.fields.talkingPoints.forEach((point, index) => {
    if (
      talkingPointWrittenFromPersonaJob(
        point,
        input.roleName ?? "",
        input.likelyTitles ?? [],
      )
    ) {
      reasons.push(
        `Talking points item ${index + 1} is written from this person's own job instead of what the seeker should say to them.`,
      );
    }
  });
  requireList("How to communicate", input.fields.communication, 1);
  if (input.involvement === "DIRECT") {
    requireText("Interview stage", input.fields.interviewStage ?? "");
  }
  const systemStateFields = [
    input.fields.overview,
    input.fields.impact,
    input.fields.interviewStage ?? "",
    ...input.fields.pressures,
    ...input.fields.needs,
    ...input.fields.concerns,
    ...input.fields.talkingPoints,
    ...input.fields.communication,
    ...input.fields.evaluates,
  ];
  if (systemStateFields.some((field) => mentionsInternalSystemState(field))) {
    reasons.push(
      "A field mentions internal system state such as research status, ambiguity, confidence, or missing data.",
    );
  }
  if (list(input.fields.needs) && fieldRestatesJobRequirement(list(input.fields.needs), input.jobLines)) {
    reasons.push("Needs restate the job requirement as a list.");
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function kindFor(
  text: string,
  draft: PersonaAiDraft,
  evidenceText: string,
): "FACT" | "INFERENCE" {
  const normalized = text.trim().toLowerCase();
  const match = (draft.evidenceRefs ?? []).find((ref) => {
    const claim = ref.claim?.trim().toLowerCase() ?? "";
    return claim.length >= 12 && (normalized.includes(claim) || claim.includes(normalized));
  });
  const claim = match?.claim?.trim().toLowerCase() ?? "";
  if (
    match?.kind === "FACT" &&
    claim.length >= 12 &&
    evidenceText.toLowerCase().includes(claim)
  ) {
    return "FACT";
  }
  return "INFERENCE";
}

function annotate(
  text: string,
  draft: PersonaAiDraft,
  evidenceText: string,
): AnnotatedText {
  return { text, kind: kindFor(text, draft, evidenceText) };
}

export function narrativeFromDraft(input: {
  draft: PersonaAiDraft;
  fields: HiringTeamDraftFields;
  evidenceText: string;
  involvement: Involvement;
}): HiringTeamNarrative {
  const mark = (text: string) => annotate(text, input.draft, input.evidenceText);
  return {
    overview: mark(input.fields.overview),
    pressures: input.fields.pressures.map(mark),
    impact: mark(input.fields.impact),
    needs: input.fields.needs.map(mark),
    concerns: input.fields.concerns.map(mark),
    interviewStage:
      input.involvement === "DIRECT" && input.fields.interviewStage
        ? mark(stripClaimPrefix(input.fields.interviewStage))
        : null,
    evaluates: input.fields.evaluates.map(mark),
    talkingPoints: input.fields.talkingPoints.map(mark),
    communication: input.fields.communication.map(mark),
  };
}
