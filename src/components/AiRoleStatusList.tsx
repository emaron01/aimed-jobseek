import type { AiRole } from "@/lib/ai/config";
import type { AiRoleStatus } from "@/lib/ai/roles";

export function AiRoleStatusList({
  roles,
  heading,
  orgDisabledNotes,
}: {
  roles: AiRoleStatus[];
  heading?: string;
  orgDisabledNotes?: Partial<Record<AiRole, string>>;
}) {
  if (roles.length === 0) return null;
  return (
    <div className="space-y-3">
      {heading ? (
        <p className="text-sm font-medium text-ink">{heading}</p>
      ) : null}
      <ul className="space-y-2">
        {roles.map((role) => {
          const orgDisabled = orgDisabledNotes?.[role.role];
          const tone = orgDisabled
            ? "border-edge bg-canvas text-ink"
            : role.configured
              ? "border-edge bg-canvas text-ink"
              : "border-warning bg-warning-tint text-warning";
          const statusLabel = orgDisabled
            ? " — not enabled for this workspace"
            : role.configured
              ? " — configured"
              : " — not configured";
          return (
            <li
              key={role.role}
              className={`rounded-md border px-3 py-2 text-sm ${tone}`}
            >
              <p className="font-medium">
                {role.label}
                {statusLabel}
              </p>
              <p className="mt-0.5 text-xs">
                Used for {role.operations.join(", ")}.
              </p>
              {orgDisabled ? (
                <p className="mt-1 text-xs">{orgDisabled}</p>
              ) : role.configured ? null : role.missingEnv.length > 0 ? (
                <p className="mt-1 text-xs">
                  Set {role.missingEnv.join(", ")} in the environment and
                  restart.
                </p>
              ) : role.configError ? (
                <p className="mt-1 text-xs">{role.configError}</p>
              ) : (
                <p className="mt-1 text-xs">
                  Set {role.requiredEnv.join(", ")} in the environment and
                  restart.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
