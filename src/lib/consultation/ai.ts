import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  getConsultationAiProvider,
  isConsultationAiConfigured,
} from "@/lib/ai";
import {
  consultationCoachSchema,
  consultationExtractSchema,
  type ConsultationExtractResult,
} from "@/lib/consultation/contract";
import {
  buildConsultationCoachMessages,
  buildConsultationExtractMessages,
} from "@/lib/consultation/prompt";

export type CoachNoteResult =
  | { ok: true; commentary: string }
  | { ok: false; message: string };

const UNCONFIGURED =
  "Consultation AI is not configured, so this round keeps the planned questions without extra coaching.";

export async function writeCoachNote(input: {
  questions: Array<{ targetKey: string; text: string }>;
  gaps: Array<{ text: string; strength: string; strategy: string | null }>;
  hiringTeam: Array<{ name: string; whyThisRoleMatters: string | null }>;
  stretch: boolean;
}): Promise<CoachNoteResult> {
  if (!isConsultationAiConfigured()) {
    return { ok: false, message: UNCONFIGURED };
  }
  try {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("consultationCoach"),
      messages: buildConsultationCoachMessages(input),
      parseOutput: (raw) => ({
        data: consultationCoachSchema.parse(raw),
        coercedFields: [],
      }),
    });
    const commentary = response.data.commentary.trim();
    if (!commentary) {
      return { ok: false, message: "Consultation AI returned empty coaching." };
    }
    return { ok: true, commentary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "consultation_coach_failed", message }),
    );
    return {
      ok: false,
      message: "Consultation coaching could not be written. The planned questions are still here.",
    };
  }
}

export async function extractWithModel(input: {
  answer: string;
  requirement: string | null;
  competencies: Array<{ id: string; text: string }>;
}): Promise<
  | { ok: true; data: ConsultationExtractResult }
  | { ok: false; message: string }
> {
  if (!isConsultationAiConfigured()) {
    return { ok: false, message: UNCONFIGURED };
  }
  try {
    const response = await getConsultationAiProvider().generateStructured({
      ...structuredOutputRequest("consultationExtract"),
      messages: buildConsultationExtractMessages(input),
      parseOutput: (raw) => ({
        data: consultationExtractSchema.parse(raw),
        coercedFields: [],
      }),
    });
    return { ok: true, data: response.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({ event: "consultation_extract_failed", message }),
    );
    return {
      ok: false,
      message: "Consultation AI could not extract facts. Review the answer text before confirming.",
    };
  }
}
