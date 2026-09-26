import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-edge-strong bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
