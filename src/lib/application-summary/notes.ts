import { randomUUID } from "node:crypto";
import { TenantError } from "@/lib/tenant/errors";

export type CheatSheetNote = {
  id: string;
  text: string;
  stageId: string | null;
  createdAt: string;
};

export function parseCheatSheetNotes(value: unknown): CheatSheetNote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    const createdAt =
      typeof row.createdAt === "string" ? row.createdAt.trim() : "";
    if (!id || !text || !createdAt) return [];
    return [
      {
        id,
        text,
        stageId:
          typeof row.stageId === "string" && row.stageId.trim()
            ? row.stageId.trim()
            : null,
        createdAt,
      },
    ];
  });
}

export function appendCheatSheetNote(input: {
  existing: unknown;
  text: string;
  stageId?: string | null;
}): CheatSheetNote[] {
  const text = input.text.trim();
  if (!text) {
    throw new TenantError("Write the information to add to this cheat sheet section.");
  }
  return [
    ...parseCheatSheetNotes(input.existing),
    {
      id: randomUUID(),
      text,
      stageId: input.stageId?.trim() || null,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function peopleRequestedForGeneration(input: {
  people: Array<{ sectionKey: string }>;
  sectionKey?: string | null;
}): Array<{ sectionKey: string }> {
  const requested = input.sectionKey?.trim() || null;
  if (!requested) return [];
  const match = input.people.find((person) => person.sectionKey === requested);
  if (!match) {
    throw new TenantError("That Interview cheat sheet section is not on this application.");
  }
  return [match];
}

export function unusedPersonaSectionCount(input: {
  personaCount: number;
  generatedSectionCount: number;
}): number {
  if (input.personaCount < 0 || input.generatedSectionCount < 0) {
    throw new TenantError("Section counts cannot be negative.");
  }
  return Math.max(0, input.personaCount - input.generatedSectionCount);
}
