import { Skeleton } from "@/components/design";
import { polishCopy } from "@/lib/product-config";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-busy="true" aria-label={polishCopy.loading}>
      <Skeleton lines={2} />
      <Skeleton lines={5} />
    </div>
  );
}
