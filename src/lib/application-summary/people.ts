import type { CheatSheetSectionKind } from "@/lib/application-summary/contract";

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
    /\b(executive sponsor|executive sales sponsor|chief |ceo|cro|cfo|president|svp |evp )\b/i.test(
      haystack,
    )
  ) {
    return "EXECUTIVE";
  }
  return "CROSS_FUNCTIONAL";
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
}): CheatSheetPersonInput[] {
  const people: CheatSheetPersonInput[] = [];
  const usedRoles = new Set<string>();
  for (const contact of input.contacts) {
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
    usedRoles.add(role.id);
  }
  for (const role of input.roles) {
    if (role.involvement !== "DIRECT" && usedRoles.has(role.id)) continue;
    if (usedRoles.has(role.id) && role.involvement === "DIRECT") continue;
    people.push({
      sectionKey: `role:${role.id}`,
      roleId: role.id,
      contactId: null,
      heading: role.name,
      roleName: role.name,
      titles: role.titles,
      involvement: role.involvement,
      suggestionKey: role.suggestionKey,
    });
  }
  return people.filter(
    (person) =>
      person.involvement === "DIRECT" ||
      person.contactId != null ||
      person.involvement === "INDIRECT",
  );
}
