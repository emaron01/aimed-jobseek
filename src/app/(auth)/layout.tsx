import Link from "next/link";
import { brand } from "@/lib/product-config";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-canvas to-surface">
      <header className="border-b border-edge/80 px-6 py-4">
        <Link href="/login" className="text-sm font-semibold tracking-tight text-ink">
          {brand.appName}
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        {/* Wide enough for plan picker + body copy; forms keep their own max-w-md */}
        <div className="w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
