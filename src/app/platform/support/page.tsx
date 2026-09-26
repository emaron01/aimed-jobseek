import Link from "next/link";
import { requirePlatformOperator } from "@/lib/auth/authz";
import { prisma } from "@/lib/prisma";

function statusLabel(status: string): string {
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "CLOSED") return "Closed";
  return "Open";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function PlatformSupportPage() {
  await requirePlatformOperator();
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { notes: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Support tickets
        </h1>
        <p className="mt-1 text-sm text-muted">
          Newest first. Notes in this console are internal.
        </p>
      </div>

      <div className="space-y-4">
        {tickets.map((ticket) => (
          <article
            key={ticket.id}
            className="rounded-lg border border-edge bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/platform/support/${ticket.id}`}
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  {ticket.subject}
                </Link>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                  {ticket.description}
                </p>
              </div>
              <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink">
                {statusLabel(ticket.status)}
              </span>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-edge pt-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-subtle">Organization</dt>
                <dd className="font-medium text-ink">
                  {ticket.organizationId ? (
                    <Link
                      href={`/platform/orgs/${ticket.organizationId}`}
                      className="underline"
                    >
                      {ticket.organizationName}
                    </Link>
                  ) : (
                    ticket.organizationName
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">User</dt>
                <dd className="break-all text-ink">
                  {ticket.submittedByName
                    ? `${ticket.submittedByName} · `
                    : ""}
                  {ticket.submittedByEmail}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Submitted</dt>
                <dd className="text-ink">{formatDate(ticket.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-subtle">Page</dt>
                <dd className="break-all font-mono text-ink">
                  {ticket.sourcePath}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Plan / billing</dt>
                <dd className="text-ink">
                  {ticket.planCode ?? "Unknown"} /{" "}
                  {ticket.billingStatus ?? "Unknown"}
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Internal notes</dt>
                <dd className="text-ink">{ticket._count.notes}</dd>
              </div>
              {ticket.userAgent ? (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-subtle">Browser user agent</dt>
                  <dd className="break-all font-mono text-ink">
                    {ticket.userAgent}
                  </dd>
                </div>
              ) : null}
            </dl>
          </article>
        ))}
        {tickets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-edge-strong bg-surface px-6 py-12 text-center text-sm text-muted">
            No support tickets yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
