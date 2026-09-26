"use client";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveEmailSignatureAction,
  type SignatureActionResult,
} from "@/app/actions/signature";
import {
  EMAIL_SIGNATURE_HTML_MAX_CHARS,
  EMAIL_SIGNATURE_MAX_CHARS,
  type EmailSignatureView,
} from "@/lib/signature/types";

const initial: SignatureActionResult | null = null;

export function EmailSignatureForm({
  signature,
}: {
  signature: EmailSignatureView | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    saveEmailSignatureAction,
    initial,
  );
  const [body, setBody] = useState(signature?.body ?? "");
  const [htmlBody, setHtmlBody] = useState(signature?.htmlBody ?? "");
  const [appliedSignature, setAppliedSignature] = useState<string | null>(null);
  const savedSignature =
    state?.ok && state.signature ? state.signature : null;
  const savedSignatureKey = savedSignature
    ? `${savedSignature.body}\0${savedSignature.htmlBody ?? ""}`
    : null;
  if (savedSignature && savedSignatureKey !== appliedSignature) {
    setAppliedSignature(savedSignatureKey);
    setBody(savedSignature.body);
    setHtmlBody(savedSignature.htmlBody ?? "");
  }

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <section className="space-y-4" data-testid="email-signature">
      <div>
        <h2 className="text-lg font-medium text-ink">Email signature</h2>
        <p className="mt-1 text-sm text-muted">
          Appended when you open a draft in Outlook or Gmail. The draft editor
          stays unsigned so you do not edit the signature by accident.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {state ? (
          <p
            role="status"
            data-testid="signature-action-status"
            className={
              state.ok ? "text-sm text-success" : "text-sm text-danger"
            }
          >
            {state.message}
          </p>
        ) : null}
        <label className="block text-sm">
          <span className="font-medium text-ink">
            Plain text (required for Outlook / Gmail open)
          </span>
          <textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={EMAIL_SIGNATURE_MAX_CHARS}
            rows={5}
            placeholder={"Best,\nAlex Rivera\nhttps://www.linkedin.com/in/alex-rivera"}
            className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 text-sm outline-none ring-focus focus:ring-2"
          />
          <span className="mt-1 block text-xs text-subtle">
            {body.trim().length} / {EMAIL_SIGNATURE_MAX_CHARS} — mailto and
            desktop compose cannot carry HTML.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">
            HTML (optional)
          </span>
          <textarea
            name="htmlBody"
            value={htmlBody}
            onChange={(event) => setHtmlBody(event.target.value)}
            maxLength={EMAIL_SIGNATURE_HTML_MAX_CHARS}
            rows={8}
            placeholder={
              '<p>Best,<br>Alex Rivera</p>\n<p><img src="https://example.com/logo.png" alt="Logo" width="120"></p>'
            }
            className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-3 py-2 font-mono text-xs outline-none ring-focus focus:ring-2"
          />
          <span className="mt-1 block text-xs text-subtle">
            {htmlBody.trim().length} / {EMAIL_SIGNATURE_HTML_MAX_CHARS} — logos
            and styled blocks go here. Used when you open a draft in a client
            that supports HTML.
          </span>
        </label>
        <div>
          <p className="text-sm font-medium text-ink">Plain preview</p>
          <pre
            data-testid="email-signature-preview"
            className="mt-1 whitespace-pre-wrap rounded-md border border-edge bg-canvas px-3 py-2 font-sans text-sm text-ink"
          >
            {body.trim() ||
              "Nothing will be appended to Outlook/Gmail opens until you save plain text."}
          </pre>
        </div>
        {htmlBody.trim() ? (
          <div>
            <p className="text-sm font-medium text-ink">
              HTML preview
            </p>
            <div
              data-testid="email-signature-html-preview"
              className="mt-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink"
              // Preview only — saved HTML is sanitized on the server before send.
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          </div>
        ) : null}
        <AppButton
          type="submit"
          disabled={pending}
          className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
        >
          {pending ? "Saving…" : "Save signature"}
        </AppButton>
      </form>
    </section>
  );
}
