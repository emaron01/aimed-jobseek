import { listAiRoleStatuses } from "@/lib/ai/roles";
import { AiRoleStatusList } from "@/components/AiRoleStatusList";
import { requirePlatformOperator } from "@/lib/auth/authz";
import { vocab } from "@/lib/product-config";

export default async function PlatformAiConfigPage() {
  await requirePlatformOperator();
  const aiRoles = listAiRoleStatuses();
  const unconfigured = aiRoles.filter((role) => !role.configured);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          AI configuration
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Platform-wide role status from environment variables. {vocab.rep.Plural} cannot change
          these — fix them in the host environment and redeploy/restart.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white px-5 py-4">
        {unconfigured.length > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {unconfigured.length} role
            {unconfigured.length === 1 ? " is" : "s are"} not configured:{" "}
            {unconfigured.map((role) => role.label).join(", ")}.
          </p>
        ) : (
          <p className="text-sm text-slate-700">All AI roles are configured.</p>
        )}
        <AiRoleStatusList roles={aiRoles} />
      </section>
    </div>
  );
}
