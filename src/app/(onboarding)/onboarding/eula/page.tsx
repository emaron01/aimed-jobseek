import { AcceptEulaForm } from "@/components/AcceptEulaForm";
import { getPublishedEulaVersion } from "@/lib/legal/eula";

export const dynamic = "force-dynamic";

export default async function OnboardingEulaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const updated =
    typeof params.updated === "string" ? params.updated === "1" : false;

  const version = await getPublishedEulaVersion();

  return (
    <div className="space-y-6" data-testid="onboarding-eula-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-1 text-sm text-muted">
          {updated
            ? "Our terms have been updated. Please review and accept to continue."
            : "Please review and accept the terms to continue."}
        </p>
        {version ? (
          <p className="mt-1 text-xs text-subtle">
            Version {version.versionNumber}
            {version.publishedAt
              ? ` · Published ${version.publishedAt.toLocaleDateString()}`
              : ""}
          </p>
        ) : null}
      </div>

      {version ? (
        <>
          <div
            className="max-h-[50vh] overflow-y-auto rounded-lg border border-edge bg-surface p-4 text-sm leading-relaxed text-ink"
            data-testid="eula-content"
          >
            <pre className="whitespace-pre-wrap font-sans">{version.content}</pre>
          </div>
          <AcceptEulaForm versionNumber={version.versionNumber} />
        </>
      ) : (
        <p className="text-sm text-muted">
          No published terms are available. Please contact support.
        </p>
      )}
    </div>
  );
}
