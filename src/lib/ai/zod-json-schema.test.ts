import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { STRUCTURED_OUTPUT_SCHEMAS } from "@/lib/ai/structured-output-schemas";
import {
  assertStrictOpenAiObjectNodes,
  buildOpenAiJsonSchemaFormat,
  collectStrictObjectViolations,
  collectUnsupportedKeywordViolations,
  sanitizeOpenAiStrictJsonSchema,
  zodToOpenAiStrictJsonSchema,
} from "@/lib/ai/zod-json-schema";
import {
  parseProductAiResponse,
  productAiResponseSchema,
} from "@/lib/product-research/contract";
import { companyResearchAiResultSchema } from "@/lib/research/assessment";
import { getProductAiConfig } from "@/lib/ai/config";
import { createOpenAiResponsesProvider } from "@/lib/ai/providers/openai-responses";

function expectStrictObjectNodes(schema: unknown): void {
  const violations = collectStrictObjectViolations(schema);
  expect(violations).toEqual([]);
}

function findFactItemSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const candidateProfile = (schema.properties as Record<string, unknown>)
    .candidateProfile as Record<string, unknown>;
  const skills = (candidateProfile.properties as Record<string, unknown>)
    .skills as Record<string, unknown>;
  return skills.items as Record<string, unknown>;
}

function noteSchemaAcceptsNull(noteSchema: Record<string, unknown>): boolean {
  if (noteSchema.type === "null") return true;
  if (Array.isArray(noteSchema.type) && noteSchema.type.includes("null"))
    return true;
  const branches = noteSchema.anyOf ?? noteSchema.oneOf;
  if (Array.isArray(branches)) {
    return branches.some(
      (branch) =>
        branch &&
        typeof branch === "object" &&
        (branch as Record<string, unknown>).type === "null",
    );
  }
  return false;
}

const GENERATE_STRUCTURED_SCHEMAS = Object.entries(
  STRUCTURED_OUTPUT_SCHEMAS,
).map(([name, entry]) => ({ name, ...entry }));

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}

describe("zodToOpenAiStrictJsonSchema", () => {
  it("produces strict closed object schema without root $schema", () => {
    const schema = zodToOpenAiStrictJsonSchema(
      z.object({
        name: z.string(),
        tags: z.array(z.string()).default([]),
        bio: z.string().nullable().optional(),
      }),
    );
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(new Set(schema.required as string[])).toEqual(
      new Set(["name", "tags", "bio"]),
    );
    expectStrictObjectNodes(schema);
  });

  it("buildOpenAiJsonSchemaFormat sets strict true and name", () => {
    const format = buildOpenAiJsonSchemaFormat(
      "product_setup_synthesis",
      productAiResponseSchema,
    );
    expect(format.type).toBe("json_schema");
    expect(format.name).toBe("product_setup_synthesis");
    expect(format.strict).toBe(true);
    expect(format.schema.type).toBe("object");
    expect(format.schema.additionalProperties).toBe(false);
  });

  it.each(GENERATE_STRUCTURED_SCHEMAS)(
    "$name: every object node has full required key set",
    ({ schema }) => {
      const jsonSchema = zodToOpenAiStrictJsonSchema(schema);
      expectStrictObjectNodes(jsonSchema);
      assertStrictOpenAiObjectNodes(jsonSchema, (condition, message) => {
        expect(condition, message).toBe(true);
      });
    },
  );

  it.each(GENERATE_STRUCTURED_SCHEMAS)(
    "$name: carries no unsupported strict-schema keyword",
    ({ schema }) => {
      expect(
        collectUnsupportedKeywordViolations(
          zodToOpenAiStrictJsonSchema(schema),
        ),
      ).toEqual([]);
    },
  );

  it("company research emits no format keyword at any node", () => {
    const schema = zodToOpenAiStrictJsonSchema(companyResearchAiResultSchema);
    expect(
      collectUnsupportedKeywordViolations(schema).filter((violation) =>
        violation.endsWith(": format"),
      ),
    ).toEqual([]);
  });

  it("keeps URL validation in Zod after request constraints are stripped", () => {
    const schema = z.object({
      url: z.string().url(),
      label: z.string().min(1),
    });
    const raw = z.toJSONSchema(schema, { target: "draft-7" });
    const rawViolations = collectUnsupportedKeywordViolations(raw);

    expect(rawViolations.some((entry) => entry.endsWith(": format"))).toBe(
      true,
    );
    expect(rawViolations.some((entry) => entry.endsWith(": minLength"))).toBe(
      true,
    );
    expect(
      collectUnsupportedKeywordViolations(zodToOpenAiStrictJsonSchema(schema)),
    ).toEqual([]);
    expect(schema.safeParse({ url: "not a URL", label: "ok" }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ url: "https://example.com", label: "" }).success,
    ).toBe(false);
  });

  it("strips unsupported keywords through every schema container", () => {
    const constrained = { type: "string", minLength: 1, format: "uri" };
    const schema = sanitizeOpenAiStrictJsonSchema({
      type: "object",
      properties: {
        object: {
          type: "object",
          properties: { value: constrained },
          required: ["value"],
        },
        array: { type: "array", items: constrained },
        union: {
          anyOf: [constrained, { type: "number", minimum: 1 }],
        },
        intersection: {
          allOf: [
            {
              type: "object",
              properties: { left: constrained },
              required: ["left"],
            },
            {
              type: "object",
              properties: { right: constrained },
              required: ["right"],
            },
          ],
        },
        dictionary: {
          type: "object",
          additionalProperties: constrained,
        },
      },
      required: ["object", "array", "union", "intersection", "dictionary"],
      $defs: { constrained },
    });

    expect(collectUnsupportedKeywordViolations(schema)).toEqual([]);
    expectStrictObjectNodes(schema);
  });

  it("requires every production generateStructured call to use the shared registry", () => {
    const srcLib = join(process.cwd(), "src", "lib");
    const violations = productionTypeScriptFiles(srcLib).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const callCount = (source.match(/\.generateStructured\s*\(\s*\{/g) ?? [])
        .length;
      const registryCount = (
        source.match(/\.\.\.structuredOutputRequest\s*\(/g) ?? []
      ).length;
      return callCount === registryCount
        ? []
        : [`${path}: ${callCount} calls, ${registryCount} registry entries`];
    });

    expect(violations).toEqual([]);
  });

  it("candidate profile fact items require kind and provenance", () => {
    const schema = zodToOpenAiStrictJsonSchema(productAiResponseSchema);
    const itemSchema = findFactItemSchema(schema);
    const required = itemSchema.required as string[];

    expect(required).toContain("id");
    expect(required).toContain("kind");
    expect(required).toContain("text");
    expect(required).toContain("provenance");
  });

  it("maps z.unknown() optional fields to a JSON value union", () => {
    const schema = zodToOpenAiStrictJsonSchema(
      z.object({ targetValue: z.unknown().optional() }),
    );
    const targetValue = (schema.properties as Record<string, unknown>)
      .targetValue as Record<string, unknown>;
    expect(targetValue.anyOf).toBeDefined();
    expect(noteSchemaAcceptsNull(targetValue)).toBe(true);
    expectStrictObjectNodes(schema);
  });
});

describe("parseProductAiResponse candidate profile handling", () => {
  it("parses a candidate profile and strips leftover buyer roles", () => {
    const { data } = parseProductAiResponse({
      candidateProfile: {
        identity: {},
        direction: {},
        skills: [],
      },
      suggestedBuyerRoles: [{ name: "CRO" }],
    });
    expect(data.candidateProfile.skills).toEqual([]);
    expect(data).not.toHaveProperty("suggestedBuyerRoles");
  });

  it("parses when array fields are omitted under strict output", () => {
    const { data } = parseProductAiResponse({
      candidateProfile: {
        identity: {},
        direction: {},
      },
    });
    expect(data.candidateProfile.problemsSolved).toEqual([]);
    expect(data.candidateProfile.experience).toEqual([]);
    expect(data.candidateProfile.gaps).toEqual([]);
  });
});

describe("openai-responses strict request body", () => {
  it("includes json_schema format with strict enforcement", async () => {
    process.env.PRODUCT_AI_PROVIDER = "openai-responses";
    process.env.PRODUCT_AI_MODEL = "gpt-5.6-luna";
    process.env.PRODUCT_AI_MODEL_URL = "https://api.openai.com/v1/responses";
    process.env.PRODUCT_AI_API_KEY = "sk-test";

    const tinySchema = z.object({ ok: z.boolean() });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return Response.json({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ ok: true }),
              },
            ],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiResponsesProvider(getProductAiConfig());
    await provider.generateStructured({
      messages: [{ role: "user", content: "x" }],
      schema: tinySchema,
      schemaName: "product_setup_synthesis",
      parseOutput: (raw) => ({ data: tinySchema.parse(raw), coercedFields: [] }),
    });

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]![1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.name).toBe("product_setup_synthesis");
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expectStrictObjectNodes(body.text.format.schema);
    expect(body.text.format.type).not.toBe("json_object");
    vi.unstubAllGlobals();
  });
});
