import Link from "next/link";
import {
  deletePersonaTemplateAction,
  savePersonaTemplateAction,
} from "@/app/actions/hiring-team";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";
import { parseStringArray } from "@/lib/research";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";

const fieldClass = "mt-1 w-full rounded-md border border-edge-strong px-3 py-2 text-sm";

export default async function HiringTeamTemplatesPage() {
  const organization = await requireOrganization();
  const templates = await prisma.personaTemplate.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-ink">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          {vocab.persona.nav} templates
        </h1>
        <p className="mt-1 text-sm text-muted">
          Save a {vocab.persona.singular} you built, then add it to an {vocab.campaign.singular} yourself. Templates are not added automatically. Editing a template does not change roles already on an {vocab.campaign.singular}.
        </p>
      </div>

      <ul className="space-y-6">
        {templates.map((template) => (
          <li key={template.id} className="space-y-3 rounded-md border border-edge p-4">
            <ApplicationActionForm
              action={savePersonaTemplateAction}
              submitLabel="Save template"
              testId={`save-template-${template.id}`}
            >
              <input type="hidden" name="templateId" value={template.id} />
              <label className="block text-sm">
                <span className="font-medium text-ink">Name</span>
                <input name="name" required defaultValue={template.name} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Likely titles</span>
                <textarea
                  name="likelyTitles"
                  rows={3}
                  defaultValue={parseStringArray(template.likelyTitles).join("\n")}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Department</span>
                <input name="department" defaultValue={template.department ?? ""} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Why this role matters</span>
                <textarea
                  name="whyThisRoleMatters"
                  rows={2}
                  defaultValue={template.whyThisRoleMatters ?? ""}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Notes</span>
                <textarea name="notes" rows={2} defaultValue={template.notes ?? ""} className={fieldClass} />
              </label>
            </ApplicationActionForm>
            <ApplicationActionForm
              action={deletePersonaTemplateAction}
              submitLabel="Delete template"
              testId={`delete-template-${template.id}`}
            >
              <input type="hidden" name="templateId" value={template.id} />
            </ApplicationActionForm>
          </li>
        ))}
      </ul>

      <section className="space-y-3 border-t border-edge pt-6">
        <h2 className="text-base font-semibold text-ink">Add a template</h2>
        <ApplicationActionForm
          action={savePersonaTemplateAction}
          submitLabel="Add template"
          testId="add-template"
        >
          <label className="block text-sm">
            <span className="font-medium text-ink">Name</span>
            <input name="name" required className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Likely titles</span>
            <textarea name="likelyTitles" rows={3} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Department</span>
            <input name="department" className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Why this role matters</span>
            <textarea name="whyThisRoleMatters" rows={2} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Notes</span>
            <textarea name="notes" rows={2} className={fieldClass} />
          </label>
        </ApplicationActionForm>
      </section>
    </div>
  );
}
