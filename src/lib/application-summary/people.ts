import { createHash } from "node:crypto";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  type CheatSheetSectionKind,
} from "@/lib/application-summary/contract";
import type { CareerStage } from "@/lib/consultation/career-stage";

export type CheatSheetPersonInput = {
  sectionKey: string;
  roleId: string;
  contactId: string | null;
  heading: string;
  roleName: string;
  titles: string[];
  involvement: "DIRECT" | "INDIRECT";
  suggestionKey: string | null;
};

export function cheatSheetPersonSectionInputHash(input: {
  person: {
    sectionKey: string;
    roleId: string;
    contactId: string | null;
    heading: string;
    roleName: string;
    titles: string[];
    sectionKind: string;
  };
  sources: Array<{ id: string; text: string }>;
  careerStage: CareerStage;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
        careerStage: input.careerStage,
        person: input.person,
        sources: input.sources.map((source) => ({
          id: source.id,
          text: source.text,
        })),
      }),
    )
    .digest("hex");
}

export function cheatSheetSectionKind(
  person: Pick<
    CheatSheetPersonInput,
    "roleName" | "titles" | "involvement" | "suggestionKey"
  >,
): CheatSheetSectionKind {
  const haystack = [person.roleName, person.suggestionKey ?? "", ...person.titles].join(" ");
  if (
    person.suggestionKey === "hiring_manager" ||
    /\bhiring manager\b/i.test(person.roleName)
  ) {
    return "HIRING_MANAGER";
  }
  if (/\b(talent acquisition|recruiter|sourcer|ta partner|staffing)\b/i.test(haystack)) {
    return "RECRUITER";
  }
  if (
    /\b(executive sponsor|chief |ceo|cro|cfo|president|svp |evp )\b/i.test(
      haystack,
    )
  ) {
    return "EXECUTIVE";
  }
  return "CROSS_FUNCTIONAL";
}

export function interviewerContactIdsFrom(input: {
  stageInterviewerIds: string[];
  contacts: Array<{ contactId: string; personPrepOfferedAt?: Date | null }>;
}): string[] {
  const ids = new Set(input.stageInterviewerIds);
  for (const contact of input.contacts) {
    if (contact.personPrepOfferedAt) ids.add(contact.contactId);
  }
  return [...ids];
}

export function personSectionNeedsGeneration(section: {
  positioningStatements?: Array<unknown>;
  keyStatements?: Array<unknown>;
  caresAbout?: Array<unknown>;
  likelyQuestions?: Array<unknown>;
  questionsToAsk?: Array<unknown>;
} | null): boolean {
  if (!section) return true;
  return (
    !section.positioningStatements?.length ||
    !section.keyStatements?.length ||
    !section.caresAbout?.length ||
    !section.likelyQuestions?.length ||
    !section.questionsToAsk?.length
  );
}

export function buildCheatSheetPeople(input: {
  roles: Array<{
    id: string;
    name: string;
    titles: string[];
    involvement: "DIRECT" | "INDIRECT";
    suggestionKey: string | null;
  }>;
  contacts: Array<{
    contactId: string;
    personaId: string | null;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
  }>;
  interviewerContactIds: string[];
}): CheatSheetPersonInput[] {
  const interviewerIds = new Set(input.interviewerContactIds);
  const people: CheatSheetPersonInput[] = [];
  for (const contact of input.contacts) {
    if (!interviewerIds.has(contact.contactId)) continue;
    const role = input.roles.find((item) => item.id === contact.personaId);
    if (!role) continue;
    const heading = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    people.push({
      sectionKey: `contact:${contact.contactId}`,
      roleId: role.id,
      contactId: contact.contactId,
      heading: heading || role.name,
      roleName: role.name,
      titles: contact.title ? [contact.title, ...role.titles] : role.titles,
      involvement: role.involvement,
      suggestionKey: role.suggestionKey,
    });
  }
  return people;
}
