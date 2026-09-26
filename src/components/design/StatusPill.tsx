import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "current" | "done" | "attention" | "progress";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-canvas text-muted",
  current: "bg-primary text-on-primary",
  done: "bg-success-tint text-success",
  attention: "bg-danger-tint text-danger",
  progress: "bg-warning-tint text-warning",
};

export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
