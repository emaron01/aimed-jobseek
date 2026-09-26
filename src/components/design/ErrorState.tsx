import { AppButton } from "@/components/AppButton";
import { AppIcon } from "@/components/design/AppIcon";
import { polishCopy } from "@/lib/product-config/polish";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = polishCopy.errorTitle,
  description = polishCopy.errorBody,
  onRetry,
  retryLabel = polishCopy.errorRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-danger/30 bg-danger-tint px-5 py-6",
        className,
      )}
      role="alert"
      data-testid="error-state"
    >
      <div className="flex items-start gap-3">
        <AppIcon name="alert" className="mt-0.5 text-danger" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-danger">{title}</h3>
          <p className="mt-1 text-sm text-ink">{description}</p>
          {onRetry ? (
            <div className="mt-3">
              <AppButton type="button" variant="secondary" onClick={onRetry}>
                {retryLabel}
              </AppButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
