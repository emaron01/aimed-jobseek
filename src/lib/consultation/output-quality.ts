export type GroundingSource = {
  id: string;
  text: string;
};

export type StatementClaim = {
  text: string;
  supports: Array<{ sourceId: string; quote: string }>;
};

export type GroundedStatement = {
  text: string;
  claims: StatementClaim[];
};

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

const INTERNAL_SYSTEM_STATE =
  /\b(?:research (?:status|is|isn't|has|hasn't|not|pending|incomplete|unavailable)|confidence(?: score)?|ambiguit(?:y|ies)|ambiguous|missing (?:data|information|context)|internal (?:state|system)|prompt|model (?:output|behavior|generation)|not configured)\b/i;

export function mentionsInternalSystemState(text: string): boolean {
  return INTERNAL_SYSTEM_STATE.test(text);
}

export function bannedPhraseHits(
  texts: readonly string[],
  bannedPhrases: readonly string[],
): string[] {
  const haystack = normalized(texts.join("\n"));
  return bannedPhrases.filter((phrase) =>
    haystack.includes(normalized(phrase)),
  );
}

function numericTokens(text: string): string[] {
  return text.match(/(?:[$£€]\s*)?\d[\d,.]*(?:\s*%|\s*[kKmMbB])?/g) ?? [];
}

function sentenceParts(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const GROUNDING_STOPWORDS = new Set([
  "about",
  "after",
  "because",
  "before",
  "from",
  "have",
  "into",
  "that",
  "their",
  "they",
  "this",
  "through",
  "with",
  "would",
  "your",
]);

function groundingTokens(text: string): Set<string> {
  return new Set(
    normalized(text)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (token) => token.length >= 4 && !GROUNDING_STOPWORDS.has(token),
      ),
  );
}

function repetitionTokens(text: string): Set<string> {
  const stem = (token: string) => {
    if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
    return token;
  };
  return new Set(
    normalized(text)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map(stem)
      .filter(
        (token) => token.length >= 4 && !GROUNDING_STOPWORDS.has(token),
      ),
  );
}

export function validateRepetitionAndMetaLanguage(input: {
  text: string;
  bannedPhrases: readonly string[];
}): string[] {
  const errors: string[] = [];
  const text = input.text.trim();
  if (!text) return errors;
  const metaHits = bannedPhraseHits([text], input.bannedPhrases);
  if (metaHits.length > 0) {
    errors.push(
      `The writing described its structure instead of making a point: ${metaHits.join(", ")}.`,
    );
  }
  const numberCounts = new Map<string, number>();
  for (const token of numericTokens(text).map(normalized)) {
    numberCounts.set(token, (numberCounts.get(token) ?? 0) + 1);
  }
  const repeatedNumbers = [...numberCounts]
    .filter(([, count]) => count > 1)
    .map(([token]) => token);
  if (repeatedNumbers.length > 0) {
    errors.push(
      `The writing repeated the same number without adding information: ${repeatedNumbers.join(", ")}.`,
    );
  }
  const sentences = sentenceParts(text).map((sentence) => ({
    sentence,
    tokens: repetitionTokens(sentence),
  }));
  for (let left = 0; left < sentences.length; left += 1) {
    for (let right = left + 1; right < sentences.length; right += 1) {
      const a = sentences[left]!;
      const b = sentences[right]!;
      if (a.tokens.size < 3 || b.tokens.size < 3) continue;
      const overlap = [...a.tokens].filter((token) => b.tokens.has(token)).length;
      const union = new Set([...a.tokens, ...b.tokens]).size;
      if (union > 0 && overlap / union >= 0.6) {
        errors.push(
          `The writing restated the same fact in multiple sentences: "${a.sentence}" / "${b.sentence}".`,
        );
      }
    }
  }
  return [...new Set(errors)];
}

export function validateInterviewAnswerQuality(input: {
  text: string;
  maxWords: number;
  bannedPhrases: readonly string[];
}): string[] {
  const errors: string[] = [];
  const text = input.text.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > input.maxWords) {
    errors.push(`The interview answer exceeded ${input.maxWords} words.`);
  }
  if (!/\b(?:I|I'm|I've|I'd|I'll|my|mine|we|we're|we've|our|ours)\b/i.test(text)) {
    errors.push("The interview answer was not written as natural first-person speech.");
  }
  errors.push(
    ...validateRepetitionAndMetaLanguage({
      text,
      bannedPhrases: input.bannedPhrases,
    }),
  );
  return [...new Set(errors)];
}

export function validateGroundedStatement(input: {
  statement: GroundedStatement;
  sources: GroundingSource[];
  bannedPhrases: readonly string[];
  requireSentenceClaims: boolean;
}): string[] {
  const errors: string[] = [];
  const text = input.statement.text.trim();
  if (!text) return ["The statement was empty."];
  const banned = bannedPhraseHits([text], input.bannedPhrases);
  if (banned.length > 0) {
    errors.push(`The statement used banned language: ${banned.join(", ")}.`);
  }
  if (mentionsInternalSystemState(text)) {
    errors.push("The statement referenced internal system state.");
  }
  const byId = new Map(input.sources.map((source) => [source.id, source.text]));
  const claims = input.statement.claims;
  if (claims.length === 0) {
    errors.push("The statement did not provide claim-level grounding.");
  }
  for (const claim of claims) {
    const claimText = claim.text.trim();
    if (!claimText || !normalized(text).includes(normalized(claimText))) {
      errors.push("A grounded claim was not present in the statement.");
    }
    if (claim.supports.length === 0) {
      errors.push(`The claim "${claimText}" had no supporting source.`);
    }
    let hasContentConnection = false;
    const claimTokens = groundingTokens(claimText);
    for (const support of claim.supports) {
      const source = byId.get(support.sourceId);
      if (
        !source ||
        !support.quote.trim() ||
        !normalized(source).includes(normalized(support.quote))
      ) {
        errors.push(`The claim "${claimText}" cited unsupported source text.`);
      } else {
        const quoteTokens = groundingTokens(support.quote);
        hasContentConnection ||= [...claimTokens].some((token) =>
          quoteTokens.has(token),
        );
      }
    }
    if (claimTokens.size > 0 && !hasContentConnection) {
      errors.push(`The claim "${claimText}" was not connected to its cited text.`);
    }
  }
  if (input.requireSentenceClaims) {
    const claimTexts = new Set(claims.map((claim) => normalized(claim.text)));
    for (const sentence of sentenceParts(text)) {
      if (!claimTexts.has(normalized(sentence))) {
        errors.push(`The sentence "${sentence}" lacked claim-level grounding.`);
      }
    }
  }
  const sourceCorpus = input.sources.map((source) => source.text).join("\n");
  for (const token of numericTokens(text)) {
    if (!normalized(sourceCorpus).includes(normalized(token))) {
      errors.push(`The number "${token}" was absent from the source material.`);
    }
  }
  return [...new Set(errors)];
}

export function questionRestatesTarget(question: string, target: string): boolean {
  const normalizedTarget = normalized(target).replace(/[^a-z0-9 ]/g, "");
  if (normalizedTarget.length < 24) return false;
  const normalizedQuestion = normalized(question).replace(/[^a-z0-9 ]/g, "");
  return normalizedQuestion.includes(normalizedTarget);
}
