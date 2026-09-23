import { PRIMARY_BUTTON_CLASS } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { requirePlatformSuperAdmin } from "@/lib/auth/authz";
import { prisma } from "@/lib/prisma";
import { TEMPLATE_VARIABLE_ALLOWLIST } from "@/lib/transactional-email/templates";
import {
  saveTransactionalTemplateAction,
  testSendTransactionalTemplateAction,
} from "@/app/actions/platform-templates";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import type { TransactionalEmailTemplateKey } from "@prisma/client";
import { vocab } from "@/lib/product-config";

export default async function PlatformEmailTemplatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ key?: string }>;
}) {
  await requirePlatformSuperAdmin();
  const params = searchParams ? await searchParams : {};
  const keys = Object.keys(
    TEMPLATE_VARIABLE_ALLOWLIST,
  ) as TransactionalEmailTemplateKey[];
  const selected =
    (params.key as TransactionalEmailTemplateKey | undefined) &&
    keys.includes(params.key as TransactionalEmailTemplateKey)
      ? (params.key as TransactionalEmailTemplateKey)
      : keys[0]!;

  const [template, baseline] = await Promise.all([
    prisma.transactionalEmailTemplate.findUnique({
      where: { templateKey: selected },
    }),
    prisma.transactionalEmailTemplateBaseline.findUnique({
      where: { templateKey: selected },
    }),
  ]);

  const allowlist = TEMPLATE_VARIABLE_ALLOWLIST[selected];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/platform" className="underline">
            Platform
          </Link>
          {" · "}
          <Link href="/platform/costs" className="underline">
            Costs
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Transactional email templates
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Platform account emails only — not customer {vocab.outbound.singular} {vocab.sales.singular} email.
          SUPER_ADMIN only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {keys.map((key) => (
          <Link
            key={key}
            href={`/platform/email-templates?key=${key}`}
            className={
              key === selected
                ? "font-medium text-slate-900 underline"
                : "text-slate-600 hover:text-slate-900"
            }
          >
            {key}
          </Link>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Allowed variables: {allowlist.map((v) => `{{${v}}}`).join(", ")}
      </p>

      <ActionFeedbackForm
        action={saveTransactionalTemplateAction}
        className="space-y-3"
        testId="save-template-form"
      >
        <input type="hidden" name="templateKey" value={selected} />
        <label className="block text-sm">
          Display name
          <input
            name="displayName"
            defaultValue={
              template?.displayName || baseline?.displayName || selected
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Subject
          <input
            name="subjectTemplate"
            defaultValue={
              template?.subjectTemplate || baseline?.subjectTemplate || ""
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          HTML body
          <textarea
            name="htmlTemplate"
            rows={10}
            defaultValue={
              template?.htmlTemplate || baseline?.htmlTemplate || ""
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block text-sm">
          Plain text
          <textarea
            name="textTemplate"
            rows={6}
            defaultValue={
              template?.textTemplate || baseline?.textTemplate || ""
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={template?.enabled ?? true}
            value="true"
          />
          Enabled (falls back to baseline if disabled)
        </label>
        <button
          type="submit"
          className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
        >
          Save template
        </button>
      </ActionFeedbackForm>

      <ActionFeedbackForm
        action={testSendTransactionalTemplateAction}
        className="space-y-3 border-t border-slate-200 pt-6"
        testId="test-send-template-form"
      >
        <h2 className="text-lg font-medium">Test send</h2>
        <p className="text-xs text-slate-500">
          Does not mutate verification/reset account state. Uses placeholder
          URLs.
        </p>
        <input type="hidden" name="templateKey" value={selected} />
        <label className="block text-sm">
          Recipient email
          <input
            name="to"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          Send test
        </button>
      </ActionFeedbackForm>
    </div>
  );
}
