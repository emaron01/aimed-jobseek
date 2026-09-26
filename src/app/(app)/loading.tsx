import { Skeleton } from "@/components/design";
import { polishCopy } from "@/lib/product-config";

export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4" aria-busy="true" aria-label={polishCopy.loading}>
      <Skeleton lines={2} />
      <Skeleton lines={6} />
    </div>
  );
}
