import type { EmailLength } from "@prisma/client";
import type { ReadyApplicationGenerationContext } from "@/lib/generation/context";
import type { OutreachAssetType } from "@/lib/product-config";

export type AssetGenerationResult =
  | { ok: true; assetId: string; version: number }
  | { ok: false; message: string; violations: string[] };

export type OutreachGenerationResult =
  | AssetGenerationResult
  | {
      ok: true;
      needsClarification: true;
      questions: Array<{ id: string; text: string }>;
    };

export type OutreachGenerationInput = {
  context: ReadyApplicationGenerationContext;
  type: OutreachAssetType;
  greeting: string;
  signerName: string;
  confirmedHiringManagerRole: boolean;
  includeRedirect: boolean;
  purpose: "PROACTIVE" | "FOLLOW_UP" | "THANK_YOU" | "CHECK_IN";
  emailLength: EmailLength | null;
  priorMessage: { subject: string | null; body: string } | null;
  interviewStageNotes: string | null;
  mentionApplied: boolean;
  regenerationInstruction: string | null;
  qualityFeedback: string[];
};
