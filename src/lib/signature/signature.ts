import "server-only";

import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_SIGNATURE_HTML_MAX_CHARS,
  EMAIL_SIGNATURE_MAX_CHARS,
  type EmailSignatureForSend,
  type EmailSignatureView,
} from "@/lib/signature/types";
import { TenantError } from "@/lib/tenant/errors";

export type { EmailSignatureForSend, EmailSignatureView } from "@/lib/signature/types";
export {
  EMAIL_SIGNATURE_HTML_MAX_CHARS,
  EMAIL_SIGNATURE_MAX_CHARS,
} from "@/lib/signature/types";

export function sanitizeEmailSignatureHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "span",
      "div",
      "font",
      "center",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "style"],
      table: ["cellpadding", "cellspacing", "border", "width", "style", "role"],
      td: ["width", "height", "align", "valign", "style", "colspan", "rowspan"],
      th: ["width", "height", "align", "valign", "style", "colspan", "rowspan"],
      tr: ["style"],
      span: ["style"],
      div: ["style"],
      p: ["style"],
      font: ["color", "face", "size", "style"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        color: [/^.*$/],
        "background-color": [/^.*$/],
        "font-size": [/^\d+(?:px|pt|em|rem|%)$/],
        "font-family": [/^.*$/],
        "font-weight": [/^\d+$/, /^(?:normal|bold|bolder|lighter)$/],
        "text-align": [/^(?:left|right|center|justify)$/],
        "line-height": [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)?$/],
        width: [/^\d+(?:px|pt|em|rem|%)$/],
        height: [/^\d+(?:px|pt|em|rem|%)$/],
        "max-width": [/^\d+(?:px|pt|em|rem|%)$/],
        padding: [/^.*$/],
        margin: [/^.*$/],
        border: [/^.*$/],
        "border-collapse": [/^(?:collapse|separate)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
    allowProtocolRelative: false,
  }).trim();
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when HTML would add nothing meaningful beyond an absent signature. */
export function isBlankSignatureHtml(html: string | null | undefined): boolean {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return true;
  const sanitized = sanitizeEmailSignatureHtml(trimmed);
  if (!sanitized) return true;
  if (/<img\b/i.test(sanitized)) return false;
  if (/<a\b[^>]*\bhref\s*=/i.test(sanitized)) return false;
  return !stripHtmlToText(sanitized);
}

export async function getEmailSignatureForUser(input: {
  organizationId: string;
  userId: string;
}): Promise<EmailSignatureView | null> {
  const row = await prisma.emailSignature.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
  });
  if (!row) return null;
  return {
    body: row.body,
    htmlBody: row.htmlBody,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Plain text only — for deeplink handoff. */
export async function getActiveEmailSignatureBody(input: {
  organizationId: string;
  userId: string;
}): Promise<string | null> {
  const forSend = await getEmailSignatureForSend(input);
  return forSend.text;
}

export async function getEmailSignatureForSend(input: {
  organizationId: string;
  userId: string;
}): Promise<EmailSignatureForSend> {
  const row = await prisma.emailSignature.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    select: { body: true, htmlBody: true, active: true },
  });
  if (!row || !row.active) {
    return { text: null, html: null };
  }
  const text = row.body.trim() || null;
  return {
    text,
    html: null,
  };
}

export async function upsertEmailSignatureForUser(input: {
  organizationId: string;
  userId: string;
  body: string;
  htmlBody?: string;
}): Promise<EmailSignatureView> {
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  const updateHtml = input.htmlBody !== undefined;
  const rawHtml = updateHtml ? (input.htmlBody ?? "").trim() : "";
  if (body.length > EMAIL_SIGNATURE_MAX_CHARS) {
    throw new TenantError(
      `Plain-text signature must be ${EMAIL_SIGNATURE_MAX_CHARS} characters or fewer.`,
    );
  }
  if (updateHtml && rawHtml.length > EMAIL_SIGNATURE_HTML_MAX_CHARS) {
    throw new TenantError(
      `HTML signature must be ${EMAIL_SIGNATURE_HTML_MAX_CHARS} characters or fewer.`,
    );
  }

  let htmlBody: string | null = null;
  if (updateHtml && rawHtml && !isBlankSignatureHtml(rawHtml)) {
    htmlBody = sanitizeEmailSignatureHtml(rawHtml);
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new TenantError("You are not a member of this organization.");
  }

  // The plain-text block is the signature. A missing htmlBody leaves stored HTML in place.
  const active = body.length > 0;
  const row = await prisma.emailSignature.upsert({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      body,
      htmlBody: updateHtml ? htmlBody : null,
      active,
    },
    update: {
      body,
      active,
      ...(updateHtml ? { htmlBody } : {}),
    },
  });

  return {
    body: row.body,
    htmlBody: row.htmlBody,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}
