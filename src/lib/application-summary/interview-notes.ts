import type { CheatSheetNote } from "@/lib/application-summary/notes";
import { interviewConfig } from "@/lib/product-config/interview";

export type InterviewNoteKind = "gained" | "before" | "after";

export type NotesFromInterviewEntry = {
  /** Stable unique key for render once / React. */
  id: string;
  /** ISO timestamp used for ordering. */
  sortAt: string;
  /** Interview type + date label, or newly-gained source label. */
  interviewLabel: string;
  kind: InterviewNoteKind;
  kindLabel: string;
  text: string;
};

function stageTypeLabel(type: string): string {
  return type in interviewConfig.types
    ? interviewConfig.types[type as keyof typeof interviewConfig.types]
    : type;
}

function formatInterviewDate(value: Date | string | null | undefined): string {
  if (!value) return "Date not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function interviewLabelForStage(input: {
  type: string;
  scheduledAt: Date | string | null;
}): string {
  return `${stageTypeLabel(input.type)} · ${formatInterviewDate(input.scheduledAt)}`;
}

/**
 * Compile seeker-recorded notes about interviews with one person:
 * newly gained information (cheatSheetNotesJson) plus notes before/after
 * from every stage where they were an interviewer. Ordered by date; each
 * note appears once in the list.
 */
export function compileNotesFromInterviewsWithPerson(input: {
  contactId: string;
  gainedNotes: CheatSheetNote[];
  stages: Array<{
    id: string;
    type: string;
    scheduledAt: Date | string | null;
    notesBefore: string | null;
    notesAfter: string | null;
    interviewerContactIds: readonly string[];
  }>;
}): NotesFromInterviewEntry[] {
  const contactId = input.contactId.trim();
  if (!contactId) return [];

  const entries: NotesFromInterviewEntry[] = [];
  const seen = new Set<string>();

  function push(entry: NotesFromInterviewEntry) {
    if (!entry.text.trim()) return;
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    entries.push(entry);
  }

  for (const note of input.gainedNotes) {
    push({
      id: `gained:${note.id}`,
      sortAt: note.createdAt,
      interviewLabel: interviewConfig.labels.gainedInformation,
      kind: "gained",
      kindLabel: interviewConfig.labels.gainedInformation,
      text: note.text.trim(),
    });
  }

  for (const stage of input.stages) {
    if (!stage.interviewerContactIds.includes(contactId)) continue;
    const interviewLabel = interviewLabelForStage({
      type: stage.type,
      scheduledAt: stage.scheduledAt,
    });
    const sortAt =
      stage.scheduledAt instanceof Date
        ? stage.scheduledAt.toISOString()
        : typeof stage.scheduledAt === "string" && stage.scheduledAt.trim()
          ? stage.scheduledAt
          : "1970-01-01T00:00:00.000Z";
    const before = stage.notesBefore?.trim() ?? "";
    if (before) {
      push({
        id: `interview:${stage.id}:notesBefore`,
        sortAt,
        interviewLabel,
        kind: "before",
        kindLabel: interviewConfig.labels.notesBefore,
        text: before,
      });
    }
    const after = stage.notesAfter?.trim() ?? "";
    if (after) {
      push({
        id: `interview:${stage.id}:notesAfter`,
        sortAt,
        interviewLabel,
        kind: "after",
        kindLabel: interviewConfig.labels.notesAfter,
        text: after,
      });
    }
  }

  return entries.sort((left, right) => {
    if (left.sortAt !== right.sortAt) {
      return left.sortAt.localeCompare(right.sortAt);
    }
    const kindOrder = { gained: 0, before: 1, after: 2 } as const;
    if (kindOrder[left.kind] !== kindOrder[right.kind]) {
      return kindOrder[left.kind] - kindOrder[right.kind];
    }
    return left.id.localeCompare(right.id);
  });
}

/** Exact heading for the read-only Cheat Sheet notes block. */
export function notesFromInterviewsWithHeading(personName: string): string {
  const name = personName.trim() || "this person";
  return `Notes From Interviews With ${name}`;
}
