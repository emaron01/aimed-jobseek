import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SupportTicketNoteForm,
  SupportTicketStatusForm,
} from "@/components/platform/SupportTicketControls";
import { Panel } from "@/components/ui";
import { requirePlatformOperator } from "@/lib/auth/authz";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function authorName(note: {
  author: {
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    email: string;
  } | null;
}): string {
  if (!note.author) return "Former platform operator";
  const parts = [note.author.firstName, note.author.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return parts || note.author.name?.trim() || note.author.email;
}

export default async function PlatformSupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformOperator();
  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      notes: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              firstName: true,
              lastName: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/support" className="text-sm underline">
          Back to support tickets
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {ticket.subject}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Submitted {formatDate(ticket.createdAt)}
            </p>
          </div>
          <SupportTicketStatusForm
            ticketId={ticket.id}
            status={ticket.status}
          />
        </div>
      </div>

      <Panel title="Message">
        <p className="whitespace-pre-wrap text-sm text-ink">
          {ticket.description}
        </p>
      </Panel>

      <Panel title="Captured context">
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
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
            <dd className="text-ink">
              {ticket.submittedByName || "Name unavailable"}
              <span className="block break-all text-xs text-muted">
                {ticket.submittedByEmail}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Source page</dt>
            <dd className="break-all font-mono text-xs text-ink">
              {ticket.sourcePath}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Plan / billing at submission</dt>
            <dd className="text-ink">
              {ticket.planCode ?? "Unknown"} /{" "}
              {ticket.billingStatus ?? "Unknown"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-subtle">Browser user agent</dt>
            <dd className="break-all font-mono text-xs text-ink">
              {ticket.userAgent ?? "Unavailable"}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel
        title="Internal notes"
        description="These notes are available only in the platform console."
      >
        <div className="space-y-4">
          {ticket.notes.length > 0 ? (
            <ol className="space-y-3">
              {ticket.notes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-md border border-edge bg-canvas px-4 py-3"
                >
                  <p className="whitespace-pre-wrap text-sm text-ink">
                    {note.body}
                  </p>
                  <p className="mt-2 text-xs text-subtle">
                    {authorName(note)} · {formatDate(note.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-subtle">No internal notes yet.</p>
          )}
          <SupportTicketNoteForm ticketId={ticket.id} />
        </div>
      </Panel>
    </div>
  );
}
