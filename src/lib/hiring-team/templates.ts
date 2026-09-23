import { Prisma, type PrismaClient } from "@prisma/client";
import { HIRING_TEAM_TEMPLATE_DEFAULTS } from "@/lib/product-config/hiring-team-templates";
import { prisma } from "@/lib/prisma-client";
import { vocab } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

type TemplateDb = PrismaClient | Prisma.TransactionClient;

export async function ensureDefaultPersonaTemplates(
  db: TemplateDb,
  organizationId: string,
): Promise<void> {
  const existing = await db.personaTemplate.count({
    where: { organizationId },
  });
  if (existing > 0) return;
  try {
    await db.personaTemplate.createMany({
      data: HIRING_TEAM_TEMPLATE_DEFAULTS.map((template) => ({
        organizationId,
        templateKey: template.templateKey,
        name: template.name,
        likelyTitles: [...template.likelyTitles],
        department: template.department.trim() || null,
        whyThisRoleMatters: template.whyThisRoleMatters,
        notes: template.notes.trim() || null,
      })),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
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
