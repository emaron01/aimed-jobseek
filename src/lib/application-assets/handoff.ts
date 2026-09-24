import {
  buildEmailClientLaunch,
  buildMailtoHref,
} from "@/lib/email-generation/email-body";

export function outreachEmailHandoff(input: {
  to: string;
  subject: string;
  body: string;
  maxUrlLength?: number;
}) {
  const maxUrlLength = input.maxUrlLength ?? 1800;
  return {
    outlookWeb: buildEmailClientLaunch({
      client: "OUTLOOK_WEB",
      to: input.to,
      subject: input.subject,
      body: input.body,
      maxUrlLength,
    }),
    gmailWeb: buildEmailClientLaunch({
      client: "GMAIL_WEB",
      to: input.to,
      subject: input.subject,
      body: input.body,
      maxUrlLength,
    }),
    outlookDesktop: {
      href: buildMailtoHref({
        to: input.to,
        subject: input.subject,
        body: input.body,
      }),
    },
  };
}
