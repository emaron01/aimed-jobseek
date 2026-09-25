import { z } from "zod";
import {
  factsSupportedBySources,
  knownNamesFromProfile,
  type KnownNames,
} from "@/lib/grounding/fact-tokens";
import { applicationAssetConfig } from "@/lib/product-config";

export const CLAIM_FLAG_KINDS = [
  "NUMBER",
  "EMPLOYER",
  "TITLE",
  "DATE",
  "CREDENTIAL",
  "OUTCOME",
] as const;

export type ClaimFlagKind = (typeof CLAIM_FLAG_KINDS)[number];
export type ClaimFlagStatus = "OPEN" | "KEPT" | "REMOVED" | "EDITED";

export type ClaimFlag = {
  id: string;
  claimId: string;
  text: string;
  kind: ClaimFlagKind;
  message: string;
  status: ClaimFlagStatus;
};

export type ClaimFlagRecord = {
  flags: ClaimFlag[];
  seekerEditedIds: string[];
};

const flagSchema = z.object({
  id: z.string().trim().min(1),
  claimId: z.string().trim().min(1),
  text: z.string(),
  kind: z.enum(CLAIM_FLAG_KINDS),
  message: z.string().trim().min(1),
  status: z.enum(["OPEN", "KEPT", "REMOVED", "EDITED"]),
});

const recordSchema = z.object({
  flags: z.array(flagSchema),
  seekerEditedIds: z.array(z.string()),
});

const FLAG_COPY: Record<ClaimFlagKind, string> = {
  NUMBER: applicationAssetConfig.labels.claimFlag.number,
  EMPLOYER: applicationAssetConfig.labels.claimFlag.employer,
  TITLE: applicationAssetConfig.labels.claimFlag.title,
  DATE: applicationAssetConfig.labels.claimFlag.date,
  CREDENTIAL: applicationAssetConfig.labels.claimFlag.credential,
  OUTCOME: applicationAssetConfig.labels.claimFlag.outcome,
};

export function emptyClaimFlagRecord(): ClaimFlagRecord {
  return { flags: [], seekerEditedIds: [] };
}

export function claimFlagsFromJson(value: unknown): ClaimFlagRecord {
  const parsed = recordSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return emptyClaimFlagRecord();
}

export function openClaimFlags(record: ClaimFlagRecord): ClaimFlag[] {
  return record.flags.filter((flag) => flag.status === "OPEN");
}

export function seekerSourceTexts(input: {
  sources?: Array<{ category: string; text: string }>;
  profile?: {
    experience: Array<{
      employer?: string | null;
      title?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      summary?: string | null;
      achievements?: Array<{ text?: string | null }>;
    }>;
    identity?: Record<string, { text?: string | null } | null | undefined>;
  } | null;
  notes?: Array<string | null | undefined>;
  requirement?: { title?: string | null; companyName?: string | null } | null;
}): { texts: string[]; names: KnownNames } {
  const texts: string[] = [];
  const add = (value: string | null | undefined) => {
    const text = value?.replace(/\s+/g, " ").trim();
    if (text) texts.push(text);
  };
  for (const source of input.sources ?? []) {
    if (
      source.category === "PROFILE_FACT" ||
      source.category === "APPROVED_STATEMENT" ||
      source.category === "APPROVED_STORY" ||
      source.category === "SEEKER"
    ) {
      add(source.text);
    }
  }
  const profile = input.profile;
  if (profile) {
    for (const item of Object.values(profile.identity ?? {})) {
      add(item?.text);
    }
    for (const role of profile.experience) {
      add(role.employer);
      add(role.title);
      add(role.startDate);
      add(role.endDate);
      add(role.summary);
      for (const achievement of role.achievements ?? []) add(achievement.text);
    }
  }
  for (const note of input.notes ?? []) add(note);
  add(input.requirement?.title);
  add(input.requirement?.companyName);
  return {
    texts,
    names: knownNamesFromProfile(profile ?? { experience: [] }),
  };
}

export function flagInventedLine(input: {
  claimId: string;
  text: string;
  sourceTexts: string[];
  names: KnownNames;
  seekerEdited?: boolean;
  kindHint?: ClaimFlagKind;
}): ClaimFlag | null {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text || input.seekerEdited) return null;
  const support = factsSupportedBySources(text, input.sourceTexts, input.names);
  if (support.ok) return null;
  const kind: ClaimFlagKind = input.kindHint
    ? input.kindHint
    : support.mismatched.numbers.length > 0
      ? "NUMBER"
      : support.mismatched.employers.length > 0
        ? "EMPLOYER"
        : support.mismatched.titles.length > 0
          ? "TITLE"
          : support.mismatched.dates.length > 0
            ? "DATE"
            : "OUTCOME";
  return {
    id: `flag_${input.claimId}`,
    claimId: input.claimId,
    text,
    kind,
    message: FLAG_COPY[kind],
    status: "OPEN",
  };
}

export function flagInventedClaims(input: {
  claims: Array<{ id: string; text: string; section?: string }>;
  sourceTexts: string[];
  names: KnownNames;
  seekerEditedIds?: Iterable<string>;
  previous?: ClaimFlagRecord;
}): ClaimFlagRecord {
  const edited = new Set(input.seekerEditedIds ?? input.previous?.seekerEditedIds ?? []);
  const kept = new Map(
    (input.previous?.flags ?? [])
      .filter((flag) => flag.status === "KEPT" || flag.status === "EDITED")
      .map((flag) => [flag.claimId, flag]),
  );
  const flags: ClaimFlag[] = [];
  for (const claim of input.claims) {
    const prior = kept.get(claim.id);
    if (prior && prior.text === claim.text) {
      flags.push(prior);
      continue;
    }
    const flag = flagInventedLine({
      claimId: claim.id,
      text: claim.text,
      sourceTexts: input.sourceTexts,
      names: input.names,
      seekerEdited: edited.has(claim.id),
      kindHint: claim.section === "credentials" ? "CREDENTIAL" : undefined,
    });
    if (flag) flags.push(flag);
  }
  return { flags, seekerEditedIds: [...edited] };
}

export function markClaimSeekerEdited(
  record: ClaimFlagRecord,
  claimIds: Iterable<string>,
): ClaimFlagRecord {
  const edited = new Set(record.seekerEditedIds);
  for (const id of claimIds) edited.add(id);
  return {
    seekerEditedIds: [...edited],
    flags: record.flags.map((flag) =>
      edited.has(flag.claimId) ? { ...flag, status: "EDITED" as const } : flag,
    ),
  };
}

export function resolveClaimFlag(
  record: ClaimFlagRecord,
  claimId: string,
  status: "KEPT" | "REMOVED",
): ClaimFlagRecord {
  return {
    ...record,
    flags: record.flags.map((flag) =>
      flag.claimId === claimId && flag.status === "OPEN"
        ? { ...flag, status }
        : flag,
    ),
  };
}
