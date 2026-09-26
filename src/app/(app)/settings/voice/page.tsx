import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { polishCopy } from "@/lib/product-config";
import { VoiceSamplesForm } from "@/components/VoiceSamplesForm";
import { requireCurrentUser } from "@/lib/auth/authz";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { listVoiceSamplesForUser } from "@/lib/voice/samples";

export const metadata = { title: polishCopy.voiceTitle };

export default async function VoiceSettingsPage() {
  const user = await requireCurrentUser();
  const organization = await requireOrganization();
  const voiceSamples = await listVoiceSamplesForUser({
    organizationId: organization.id,
    userId: user.id,
  });

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <Link
          href="/settings"
          className="text-sm text-muted hover:text-ink"
        >
          ← Settings
        </Link>
        <PageHeader
          title={polishCopy.voiceTitle}
          description={polishCopy.voiceHelp}
        />
        <p className="mt-1 text-sm text-muted">
          Writing samples are used for email generation. The more samples you
          provide, the more the application incorporates your voice into emails
          so they feel genuine while staying professionally written. Set the
          signature appended on send under{" "}
          <Link
            href="/settings/email"
            className="font-medium text-ink underline underline-offset-2"
          >
            Email signature
          </Link>
          .
        </p>
      </div>

      <VoiceSamplesForm samples={voiceSamples} />
    </div>
  );
}
