import type {
  SendTransactionalMessageInput,
  SendTransactionalMessageResult,
  TransactionalEmailProvider,
} from "@/lib/transactional-email/providers/types";

export class ConsoleTransactionalEmailProvider
  implements TransactionalEmailProvider
{
  readonly name = "console" as const;

  async send(
    input: SendTransactionalMessageInput,
  ): Promise<SendTransactionalMessageResult> {
    // Never log full bodies containing live tokens.
    console.info("[transactional-email:console]", {
      to: input.to,
      subject: input.subject,
      textLength: input.text.length,
      htmlLength: input.html.length,
    });
    if (process.env.NODE_ENV === "development") {
      const verificationUrl = extractLocalVerificationUrl(input.text, input.html);
      if (verificationUrl) {
        console.info("[transactional-email:console] verificationUrl", verificationUrl);
      }
    }
    return { providerMessageId: `console_${Date.now()}` };
  }

  async verify(): Promise<void> {
    // Always healthy for local zero-delivery mode.
  }
}

function extractLocalVerificationUrl(text: string, html: string): string | null {
  const fromText = text.match(/https?:\/\/\S+/);
  if (fromText?.[0]) return fromText[0].replace(/[).,]+$/, "");
  const fromHtml = html.match(/href=["'](https?:\/\/[^"']+)["']/i);
  return fromHtml?.[1] ?? null;
}
