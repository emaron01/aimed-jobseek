import { Skeleton } from "@/components/design";
import { polishCopy } from "@/lib/product-config";

export default function ApplicationLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={polishCopy.loading}>
      <Skeleton lines={2} />
      <Skeleton lines={5} />
    </div>
  );
}
