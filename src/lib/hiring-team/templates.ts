import { prisma } from "@/lib/prisma-client";
import { vocab } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

/** Keys of the retired product defaults. Seeker-created templates have a null key. */
export const RETIRED_DEFAULT_TEMPLATE_KEYS = [
  "recruiter",
  "hr_people_partner",
  "hiring_manager",
  "hiring_manager_executive",
  "cross_functional_lead",
] as const;

const UNEDITED_WINDOW_MS = 2_000;

/** True only for an untouched default row. An edited or seeker-created template is kept. */
export function isUneditedDefaultTemplate(row: {
  templateKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}): boolean {
  if (
    !row.templateKey ||
    !RETIRED_DEFAULT_TEMPLATE_KEYS.includes(
      row.templateKey as (typeof RETIRED_DEFAULT_TEMPLATE_KEYS)[number],
    )
  ) {
    return false;
  }
  return row.updatedAt.getTime() - row.createdAt.getTime() <= UNEDITED_WINDOW_MS;
}

function titles(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

export async function createPersonaTemplate(input: {
  organizationId: string;
  name: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  notes: string | null;
}): Promise<{ templateId: string }> {
  const name = input.name.trim();
  if (!name) throw new TenantError(`${vocab.persona.Singular} template name is required.`);
  const created = await prisma.personaTemplate.create({
    data: {
      organizationId: input.organizationId,
      name,
      likelyTitles: titles(input.likelyTitles),
      department: input.department,
      whyThisRoleMatters: input.whyThisRoleMatters,
      notes: input.notes,
    },
    select: { id: true },
  });
  return { templateId: created.id };
}

export async function updatePersonaTemplate(input: {
  organizationId: string;
  templateId: string;
  name: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  notes: string | null;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new TenantError(`${vocab.persona.Singular} template name is required.`);
  const existing = await prisma.personaTemplate.findFirst({
    where: { id: input.templateId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!existing) throw new TenantError("That template was not found.");
  await prisma.personaTemplate.update({
    where: { id: existing.id },
    data: {
      name,
      likelyTitles: titles(input.likelyTitles),
      department: input.department,
      whyThisRoleMatters: input.whyThisRoleMatters,
      notes: input.notes,
    },
  });
}

export async function deletePersonaTemplate(input: {
  organizationId: string;
  templateId: string;
}): Promise<void> {
  const existing = await prisma.personaTemplate.findFirst({
    where: { id: input.templateId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!existing) throw new TenantError("That template was not found.");
  await prisma.personaTemplate.delete({ where: { id: existing.id } });
}
