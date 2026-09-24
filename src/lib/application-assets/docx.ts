import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { applicationAssetConfig } from "@/lib/product-config";
import type {
  ApplicationAssetContent,
  ResumeAssetContent,
} from "./contract";
import { formatResumeRoleMeta } from "./dates";

const style = applicationAssetConfig.docx;

function bodyParagraph(
  text: string,
  options?: { bullet?: boolean; bold?: boolean; after?: number },
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        font: style.font,
        size: style.bodySizeHalfPoints,
      }),
    ],
    bullet: options?.bullet ? { level: 0 } : undefined,
    spacing: {
      after: options?.after ?? style.paragraphAfterTwips,
      line: style.lineSpacingTwips,
    },
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: {
      before: style.sectionBeforeTwips,
      after: style.paragraphAfterTwips,
    },
  });
}

function resumeChildren(content: ResumeAssetContent): Paragraph[] {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: content.header.name.text,
          bold: true,
          font: style.font,
          size: style.nameSizeHalfPoints,
        }),
      ],
      spacing: { after: style.paragraphAfterTwips },
    }),
  ];
  if (content.header.contactDetails.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: content.header.contactDetails.flatMap((claim, index) => [
          ...(index > 0
            ? [
                new TextRun({
                  text: " | ",
                  font: style.font,
                  size: style.bodySizeHalfPoints,
                }),
              ]
            : []),
          new TextRun({
            text: claim.text,
            font: style.font,
            size: style.bodySizeHalfPoints,
          }),
        ]),
        spacing: { after: style.paragraphAfterTwips },
      }),
    );
  }
  children.push(
    heading(applicationAssetConfig.resumeHeadings.summary),
    ...content.summary.map((claim) => bodyParagraph(claim.text)),
    heading(applicationAssetConfig.resumeHeadings.experience),
  );
  for (const role of content.experience.filter((item) => !item.hidden)) {
    children.push(
      bodyParagraph(
        [role.title, role.employer].filter(Boolean).join(", "),
        { bold: true, after: 0 },
      ),
      bodyParagraph(formatResumeRoleMeta(role)),
      ...role.bullets.map((claim) =>
        bodyParagraph(claim.text, { bullet: true }),
      ),
    );
  }
  if (content.skills.length > 0) {
    children.push(
      heading(applicationAssetConfig.resumeHeadings.skills),
      ...content.skills.map((claim) => bodyParagraph(claim.text)),
    );
  }
  if (content.education.length > 0) {
    children.push(
      heading(applicationAssetConfig.resumeHeadings.education),
      ...content.education.map((claim) => bodyParagraph(claim.text)),
    );
  }
  if (content.credentials.length > 0) {
    children.push(
      heading(applicationAssetConfig.resumeHeadings.credentials),
      ...content.credentials.map((claim) => bodyParagraph(claim.text)),
    );
  }
  return children;
}

function coverLetterChildren(
  content: Extract<ApplicationAssetContent, { type: "COVER_LETTER" }>,
): Paragraph[] {
  return [
    bodyParagraph(content.salutation),
    ...content.paragraphs.map((claim) =>
      bodyParagraph(claim.text, {
        after: style.paragraphAfterTwips * 2,
      }),
    ),
    bodyParagraph(content.signoff, { after: 0 }),
    bodyParagraph(content.signerName),
  ];
}

export async function renderApplicationAssetDocx(
  content: ApplicationAssetContent,
): Promise<Buffer> {
  const document = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: style.font,
            size: style.bodySizeHalfPoints,
          },
          paragraph: {
            spacing: {
              after: style.paragraphAfterTwips,
              line: style.lineSpacingTwips,
            },
          },
        },
        heading1: {
          run: {
            font: style.font,
            size: style.headingSizeHalfPoints,
            bold: true,
          },
          paragraph: {
            spacing: {
              before: style.sectionBeforeTwips,
              after: style.paragraphAfterTwips,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: style.marginTwips,
              right: style.marginTwips,
              bottom: style.marginTwips,
              left: style.marginTwips,
            },
          },
        },
        children:
          content.type === "RESUME"
            ? resumeChildren(content)
            : content.type === "COVER_LETTER"
              ? coverLetterChildren(content)
              : [],
      },
    ],
  });
  return Packer.toBuffer(document);
}
