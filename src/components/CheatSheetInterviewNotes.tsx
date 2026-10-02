import type { ApplicationInterviewNote } from "@/lib/application-summary/interview-notes";
import { applicationSummaryConfig } from "@/lib/product-config";

/** Plain-text list. Print uses the same cheat-sheet section body as General Questions. */
export function CheatSheetInterviewNotes({
  notes,
}: {
  notes: readonly ApplicationInterviewNote[];
}) {
  if (notes.length === 0) {
    return (
      <p className="text-sm text-subtle" data-testid="interview-notes-empty">
        {applicationSummaryConfig.sections.interviewNotesEmpty}
      </p>
    );
  }
  return (
    <ul className="space-y-4 text-sm text-ink" data-testid="interview-notes-list">
      {notes.map((note) => (
        <li key={note.id} data-testid={`interview-note-${note.id}`}>
          <p className="font-medium">{note.atLabel}</p>
          <p>{note.personName}</p>
          {note.interviewLabel ? <p>{note.interviewLabel}</p> : null}
          <p className="whitespace-pre-wrap">{note.text}</p>
        </li>
      ))}
    </ul>
  );
}
