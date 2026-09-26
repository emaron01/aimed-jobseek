import { cn } from "@/lib/utils";

export function AppCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-edge bg-surface p-5 shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}
