import "server-only";

import type { TransactionalEmailTemplateKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BASELINE_TEMPLATES } from "@/lib/transactional-email/templates";

const PREVIOUS_CADENCE_DIGEST_HTML =
  "<p>Hi {{firstName}},</p><p>On this {{weekdayLabel}} morning you have <strong>{{dueCount}}</strong> follow-up reminder{{dueCountPlural}} on Home in {{workspaceName}}.</p><p><a href=\"{{dashboardUrl}}\">Review on Home</a></p><p>— {{appName}}</p>";
const PREVIOUS_CADENCE_DIGEST_TEXT =
  "Hi {{firstName}},\n\nOn this {{weekdayLabel}} morning you have {{dueCount}} follow-up reminder(s) on Home in {{workspaceName}}.\n\nReview: {{dashboardUrl}}\n\n— {{appName}}";

/** Seed editable + baseline templates (idempotent). */
export async function ensureTransactionalTemplatesSeeded(): Promise<void> {
  const keys = Object.keys(BASELINE_TEMPLATES) as TransactionalEmailTemplateKey[];
  for (const templateKey of keys) {
    const baseline = BASELINE_TEMPLATES[templateKey];
    await prisma.transactionalEmailTemplateBaseline.upsert({
      where: { templateKey },
      update: {},
      create: {
        templateKey,
        displayName: baseline.displayName,
        subjectTemplate: baseline.subjectTemplate,
        htmlTemplate: baseline.htmlTemplate,
        textTemplate: baseline.textTemplate,
      },
    });
    await prisma.transactionalEmailTemplate.upsert({
      where: { templateKey },
      update: {},
      create: {
        templateKey,
        displayName: baseline.displayName,
        subjectTemplate: baseline.subjectTemplate,
        htmlTemplate: baseline.htmlTemplate,
        textTemplate: baseline.textTemplate,
        enabled: true,
        version: 1,
      },
    });
    if (templateKey === "CADENCE_DAILY_DIGEST") {
      const shipped = {
        htmlTemplate: baseline.htmlTemplate,
        textTemplate: baseline.textTemplate,
      };
      await prisma.transactionalEmailTemplate.updateMany({
        where: {
          templateKey,
          htmlTemplate: PREVIOUS_CADENCE_DIGEST_HTML,
          textTemplate: PREVIOUS_CADENCE_DIGEST_TEXT,
        },
        data: shipped,
      });
      await prisma.transactionalEmailTemplateBaseline.updateMany({
        where: {
          templateKey,
          htmlTemplate: PREVIOUS_CADENCE_DIGEST_HTML,
          textTemplate: PREVIOUS_CADENCE_DIGEST_TEXT,
        },
        data: shipped,
      });
    }
  }
}
