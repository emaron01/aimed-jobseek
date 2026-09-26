import Link from "next/link";
import type {
  HomeSetupStep,
  HomeSetupStepKey,
} from "@/lib/workflow/home-setup-rail";

export function HomeSetupRail({
  steps,
  focusKey,
}: {
  steps: HomeSetupStep[];
  focusKey: HomeSetupStepKey;
}) {
  return (
    <nav
      aria-label="Setup"
      className="overflow-x-auto rounded-xl border border-edge bg-surface p-2"
    >
      <ol className="flex min-w-max items-center gap-1">
        {steps.map((step) => {
          const focused = focusKey === step.key;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                aria-current={focused ? "step" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  focused
                    ? "bg-canvas text-ink"
                    : step.completed
                      ? "text-ink hover:bg-canvas"
                      : "text-subtle hover:bg-canvas hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.completed
                      ? "bg-success text-on-ink"
                      : focused
                        ? "bg-ink text-on-ink"
                        : "bg-edge text-muted"
                  }`}
                >
                  {step.completed ? "✓" : step.number}
                </span>
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span>{step.label}</span>
                  <span
                    className={`text-xs font-normal ${
                      focused ? "text-muted" : "text-subtle"
                    }`}
                  >
                    {step.detail}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
