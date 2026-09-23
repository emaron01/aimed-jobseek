import Link from "next/link";
import {
  deletePersonaTemplateAction,
  savePersonaTemplateAction,
} from "@/app/actions/hiring-team";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { ensureDefaultPersonaTemplates } from "@/lib/hiring-team/templates";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";
import { parseStringArray } from "@/lib/research";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";

const fieldClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

export default async function HiringTeamTemplatesPage() {
  const organization = await requireOrganization();
  await ensureDefaultPersonaTemplates(prisma, organization.id);
  const templates = await prisma.personaTemplate.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/settings" className="text-sm text-slate-600 hover:text-slate-900">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {vocab.persona.nav} templates
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          These starting points are copied onto each {vocab.campaign.singular} when its job requirement is parsed. Editing a template does not change roles already on an {vocab.campaign.singular}.
        </p>
      </div>

      <ul className="space-y-6">
        {templates.map((template) => (
          <li key={template.id} className="space-y-3 rounded-md border border-slate-200 p-4">
            <ApplicationActionForm
              action={savePersonaTemplateAction}
              submitLabel="Save template"
              testId={`save-template-${template.id}`}
            >
              <input type="hidden" name="templateId" value={template.id} />
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Name</span>
                <input name="name" required defaultValue={template.name} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Likely titles</span>
                <textarea
                  name="likelyTitles"
                  rows={3}
                  defaultValue={parseStringArray(template.likelyTitles).join("\n")}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Department</span>
                <input name="department" defaultValue={template.department ?? ""} className={fieldClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Why this role matters</span>
                <textarea
                  name="whyThisRoleMatters"
                  rows={2}
                  defaultValue={template.whyThisRoleMatters ?? ""}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Notes</span>
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

      <section className="space-y-3 border-t border-slate-200 pt-6">
        <h2 className="text-base font-semibold text-slate-900">Add a template</h2>
        <ApplicationActionForm
          action={savePersonaTemplateAction}
          submitLabel="Add template"
          testId="add-template"
        >
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Name</span>
            <input name="name" required className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Likely titles</span>
            <textarea name="likelyTitles" rows={3} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Department</span>
            <input name="department" className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Why this role matters</span>
            <textarea name="whyThisRoleMatters" rows={2} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Notes</span>
            <textarea name="notes" rows={2} className={fieldClass} />
          </label>
        </ApplicationActionForm>
      </section>
    </div>
  );
}
