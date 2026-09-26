"use client";

import Link from "next/link";

export function ShowArchivedToggle({
  href,
  includeArchived,
  label,
}: {
  href: string;
  includeArchived: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-ink underline-offset-2 hover:underline"
      data-testid="show-archived-toggle"
    >
      {includeArchived ? `Hide archived ${label}` : `Show archived ${label}`}
    </Link>
  );
}
