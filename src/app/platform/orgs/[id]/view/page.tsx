import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformOperator } from "@/lib/auth/authz";
import {
  getOrganizationScopedView,
  recordPlatformOrgView,
} from "@/lib/platform/orgs";
import { vocab } from "@/lib/product-config";

/**
 * Scoped read-only customer view for platform operators.
 * Not impersonation — names/status only, audited on load.
 */
export default async function PlatformOrgScopedViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePlatformOperator();
  const { id } = await params;
  const view = await getOrganizationScopedView(id);
  if (!view) notFound();

  await recordPlatformOrgView({
    actorUserId: user.id,
    organizationId: id,
    surface: "scoped_view",
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <p className="text-sm text-subtle">
          <Link href={`/platform/orgs/${id}`} className="underline">
            Back to org detail
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {view.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Scoped read-only view · {view.status} · not impersonation
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium">{vocab.product.Plural}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {view.products.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
          {view.products.length === 0 ? (
            <li className="list-none text-subtle">None</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium">{vocab.icp.plural}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {view.icps.map((i) => (
            <li key={i.id}>{i.name}</li>
          ))}
          {view.icps.length === 0 ? (
            <li className="list-none text-subtle">None</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium">{vocab.persona.Plural}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {view.personas.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
          {view.personas.length === 0 ? (
            <li className="list-none text-subtle">None</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium">{vocab.campaign.Plural}</h2>
        <ul className="mt-2 space-y-3 text-sm">
          {view.campaigns.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-edge bg-surface px-3 py-2"
            >
              <p className="font-medium">
                {c.name} · {c.status}
              </p>
              {c.subjects.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-muted">
                  {c.subjects.map((s, idx) => (
                    <li key={`${c.id}-${idx}`}>
                      Subject: {s.subject} ({s.status})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-subtle">No draft subjects yet.</p>
              )}
            </li>
          ))}
          {view.campaigns.length === 0 ? (
            <li className="text-subtle">None</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
