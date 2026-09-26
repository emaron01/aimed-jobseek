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
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          AI configuration
        </h1>
        <p className="mt-1 text-sm text-muted">
          Platform-wide role status from environment variables. {vocab.rep.Plural} cannot change
          these — fix them in the host environment and redeploy/restart.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-edge bg-surface px-5 py-4">
        {unconfigured.length > 0 ? (
          <p className="rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning">
            {unconfigured.length} role
            {unconfigured.length === 1 ? " is" : "s are"} not configured:{" "}
            {unconfigured.map((role) => role.label).join(", ")}.
          </p>
        ) : (
          <p className="text-sm text-ink">All AI roles are configured.</p>
        )}
        <AiRoleStatusList roles={aiRoles} />
      </section>
    </div>
  );
}
