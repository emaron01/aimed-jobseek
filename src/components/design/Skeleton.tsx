import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div
      className={cn("animate-pulse space-y-2", className)}
      role="status"
      aria-live="polite"
    >
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={index === 0 ? "h-4 w-2/3 rounded-md bg-edge" : "h-4 w-full rounded-md bg-edge"}
        />
      ))}
    </div>
  );
}
