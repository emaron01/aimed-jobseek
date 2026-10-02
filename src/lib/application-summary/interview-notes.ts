import type { CheatSheetNote } from "@/lib/application-summary/notes";
import { formatSavedInterviewNoteAt } from "@/lib/interview/saved-note-label";
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

export type ApplicationInterviewNote = {
  /** Stable unique key. Each stored note appears once. */
  id: string;
  /** ISO timestamp used for newest-first ordering. */
  sortAt: string;
  /** Date and time shown on the entry. */
  atLabel: string;
  personName: string;
  /** Interview type and date when the note belongs to an interview. */
  interviewLabel: string | null;
  text: string;
};

/**
 * Every interview note on the application, once: cheat-sheet notes from every
 * person, plus each stage's notes before and notes after. Newest first.
 * A shared interview's stage notes are one entry, not one per person.
 */
export function compileApplicationInterviewNotes(input: {
  people: Array<{ contactId: string; name: string; notes: CheatSheetNote[] }>;
  stages: Array<{
    id: string;
    type: string;
    scheduledAt: Date | string | null;
    notesBefore: string | null;
    notesAfter: string | null;
    interviewerNames: readonly string[];
  }>;
}): ApplicationInterviewNote[] {
  const stagesById = new Map(input.stages.map((stage) => [stage.id, stage]));
  const entries: ApplicationInterviewNote[] = [];
  const seen = new Set<string>();

  function push(entry: ApplicationInterviewNote) {
    if (!entry.text.trim() || seen.has(entry.id)) return;
    seen.add(entry.id);
    entries.push(entry);
  }

  function personLine(names: readonly string[]): string {
    const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    return unique.length > 0
      ? unique.join(", ")
      : interviewConfig.labels.notLinkedToAnyone;
  }

  function noteTime(value: Date | string | null | undefined): string {
    if (!value) return "1970-01-01T00:00:00.000Z";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "1970-01-01T00:00:00.000Z";
    return date.toISOString();
  }

  for (const person of input.people) {
    const name = person.name.trim() || interviewConfig.labels.interviewer;
    for (const note of person.notes) {
      const stage = note.stageId ? stagesById.get(note.stageId) : undefined;
      push({
        id: `gained:${note.id}`,
        sortAt: note.createdAt,
        atLabel: formatSavedInterviewNoteAt(note.createdAt),
        personName: name,
        interviewLabel: stage
          ? interviewLabelForStage({ type: stage.type, scheduledAt: stage.scheduledAt })
          : null,
        text: note.text.trim(),
      });
    }
  }

  for (const stage of input.stages) {
    const sortAt = noteTime(stage.scheduledAt);
    const atLabel = formatSavedInterviewNoteAt(sortAt);
    const interviewLabel = interviewLabelForStage({
      type: stage.type,
      scheduledAt: stage.scheduledAt,
    });
    const personName = personLine(stage.interviewerNames);
    const before = stage.notesBefore?.trim() ?? "";
    if (before) {
      push({
        id: `interview:${stage.id}:notesBefore`,
        sortAt,
        atLabel,
        personName,
        interviewLabel,
        text: before,
      });
    }
    const after = stage.notesAfter?.trim() ?? "";
    if (after) {
      push({
        id: `interview:${stage.id}:notesAfter`,
        sortAt,
        atLabel,
        personName,
        interviewLabel,
        text: after,
      });
    }
  }

  return entries.sort((left, right) => {
    if (left.sortAt !== right.sortAt) return right.sortAt.localeCompare(left.sortAt);
    return right.id.localeCompare(left.id);
  });
}

/** Exact heading for the read-only Cheat Sheet notes block. */
export function notesFromInterviewsWithHeading(personName: string): string {
  const name = personName.trim() || "this person";
  return `Notes From Interviews With ${name}`;
}
