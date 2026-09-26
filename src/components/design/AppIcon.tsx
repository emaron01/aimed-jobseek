import { cn } from "@/lib/utils";

export const APP_ICON_NAMES = [
  "check",
  "alert",
  "dot",
  "spinner",
  "chevron",
  "generate",
  "retry",
  "close",
] as const;

export type AppIconName = (typeof APP_ICON_NAMES)[number];

const PATHS: Record<AppIconName, string> = {
  check: "M5 13l4 4L19 7",
  alert:
    "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  dot: "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  spinner: "M12 3a9 9 0 1 0 9 9",
  chevron: "M6 9l6 6 6-6",
  generate: "M12 5v14M5 12h14",
  retry: "M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0 0 19 8M19 5A9 9 0 0 0 5 16",
  close: "M6 6l12 12M18 6L6 18",
};

export function AppIcon({
  name,
  className,
  label,
}: {
  name: AppIconName;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "h-4 w-4 shrink-0",
        name === "spinner" && "animate-spin motion-reduce:animate-none",
        className,
      )}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
