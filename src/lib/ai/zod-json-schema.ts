/**
 * Convert Zod schemas to OpenAI strict JSON Schema payloads.
 *
 * OpenAI strict mode requires at every object node:
 * - additionalProperties: false
 * - required: every key in properties (optionality expressed via nullable types)
 *
 * Traversed Zod constructs (via z.toJSONSchema draft-7):
 * - object, array, string, number, boolean, enum, literal
 * - optional / nullable / default (optional+nullable → required property with null union;
 *   default → required non-null property)
 * - union (anyOf), intersection (allOf)
 *
 * Emitted fallbacks for constructs that do not map cleanly:
 * - z.unknown() → JSON value union (string|number|boolean|null|object|array)
 * - z.record() → object with additionalProperties set to the JSON value union
 */

import { z } from "zod";

/**
 * Conservative, provider-independent denylist for strict Structured Outputs.
 *
 * OpenAI's base-model subset supports some of these constraints, but fine-tuned
 * models do not. Others are undocumented or explicitly unsupported. Runtime Zod
 * parsing remains authoritative for every stripped constraint.
 */
export const OPENAI_STRICT_SCHEMA_STRIPPED_KEYWORDS = [
  "$schema",
  "$id",
  "$comment",
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "uniqueItems",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "propertyNames",
  "patternProperties",
  "contains",
  "minContains",
  "maxContains",
  "prefixItems",
  "unevaluatedItems",
  "unevaluatedProperties",
  "oneOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
  "dependencies",
  "examples",
  "contentEncoding",
  "contentMediaType",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
] as const;

export type OpenAiStrictSchemaStrippedKeyword =
  (typeof OPENAI_STRICT_SCHEMA_STRIPPED_KEYWORDS)[number];

/** Accepts any JSON value; used for z.unknown() and record values. */
const OPENAI_JSON_VALUE: Record<string, unknown> = {
  anyOf: [
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
    {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    { type: "array", items: { type: "string" } },
  ],
};

/** OpenAI strict mode rejects root $schema and requires closed objects. */
export function zodToOpenAiStrictJsonSchema(
  schema: z.ZodType,
): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
  return sanitizeOpenAiStrictJsonSchema(raw);
}

export function buildOpenAiJsonSchemaFormat(
  schemaName: string,
  schema: z.ZodType,
): {
  type: "json_schema";
  name: string;
  schema: Record<string, unknown>;
  strict: true;
} {
  const safeName =
    schemaName
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64) || "structured_response";
  return {
    type: "json_schema",
    name: safeName,
    schema: zodToOpenAiStrictJsonSchema(schema),
    strict: true,
  };
}

export function sanitizeOpenAiStrictJsonSchema(
  node: Record<string, unknown>,
): Record<string, unknown> {
  const { $schema, ...rest } = node;
  void $schema;
  return walkJsonSchema(rest) as Record<string, unknown>;
}

function isEmptyJsonSchema(node: Record<string, unknown>): boolean {
  return Object.keys(node).every((key) => key === "$schema" || key === "$ref");
}

function acceptsNull(schema: Record<string, unknown>): boolean {
  if (schema.type === "null") return true;
  if (Array.isArray(schema.type) && schema.type.includes("null")) return true;
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = schema[key];
    if (
      Array.isArray(branches) &&
      branches.some(
        (branch) =>
          branch &&
          typeof branch === "object" &&
          (branch as Record<string, unknown>).type === "null",
      )
    ) {
      return true;
    }
  }
  return false;
}

function ensureNullable(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (acceptsNull(schema)) return schema;
  return { anyOf: [schema, { type: "null" }] };
}

function stripDefault(node: Record<string, unknown>): Record<string, unknown> {
  const { default: defaultValue, ...rest } = node;
  void defaultValue;
  return rest;
}

function collapseObjectAllOf(obj: Record<string, unknown>): void {
  if (!Array.isArray(obj.allOf)) return;
  const branches = obj.allOf.filter(
    (branch): branch is Record<string, unknown> =>
      Boolean(branch) && typeof branch === "object" && !Array.isArray(branch),
  );
  if (
    branches.length !== obj.allOf.length ||
    !branches.every((branch) => branch.type === "object" || branch.properties)
  ) {
    return;
  }

  const properties = {
    ...((obj.properties as Record<string, unknown> | undefined) ?? {}),
  };
  const required = new Set(
    Array.isArray(obj.required) ? (obj.required as string[]) : [],
  );
  for (const branch of branches) {
    Object.assign(
      properties,
      (branch.properties as Record<string, unknown> | undefined) ?? {},
    );
    if (Array.isArray(branch.required)) {
      for (const key of branch.required as string[]) required.add(key);
    }
  }
  obj.type = "object";
  obj.properties = properties;
  obj.required = [...required];
}

function stripUnsupportedKeywords(obj: Record<string, unknown>): void {
  for (const keyword of OPENAI_STRICT_SCHEMA_STRIPPED_KEYWORDS) {
    delete obj[keyword];
  }
}

function walkJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => walkJsonSchema(entry));
  }
  if (!node || typeof node !== "object") {
    return node;
  }

  const obj = { ...(node as Record<string, unknown>) };

  if (typeof obj.$ref === "string") {
    stripUnsupportedKeywords(obj);
    if (Object.keys(obj).every((key) => key === "$ref")) return obj;
  }

  if (isEmptyJsonSchema(obj)) {
    return OPENAI_JSON_VALUE;
  }

  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    const branch = obj[key];
    if (Array.isArray(branch)) {
      obj[key] = branch.map((entry) => walkJsonSchema(entry));
    }
  }

  if (!obj.anyOf && Array.isArray(obj.oneOf)) {
    obj.anyOf = obj.oneOf;
  }
  collapseObjectAllOf(obj);

  const defs = obj.$defs ?? obj.definitions;
  if (defs && typeof defs === "object") {
    const nextDefs = Object.fromEntries(
      Object.entries(defs as Record<string, unknown>).map(([key, value]) => [
        key,
        walkJsonSchema(value),
      ]),
    );
    if (obj.$defs) obj.$defs = nextDefs;
    if (obj.definitions) obj.definitions = nextDefs;
  }

  if (obj.items) {
    obj.items = walkJsonSchema(obj.items);
  }

  if (
    obj.additionalProperties !== undefined &&
    obj.additionalProperties !== false
  ) {
    if (
      typeof obj.additionalProperties === "object" &&
      obj.additionalProperties !== null
    ) {
      const walked = walkJsonSchema(obj.additionalProperties) as Record<
        string,
        unknown
      >;
      obj.additionalProperties = isEmptyJsonSchema(walked)
        ? OPENAI_JSON_VALUE
        : walked;
    }
  }

  if (obj.type === "object" || obj.properties) {
    obj.additionalProperties = false;
    if (obj.properties && typeof obj.properties === "object") {
      const props = obj.properties as Record<string, unknown>;
      const originalRequired = Array.isArray(obj.required)
        ? (obj.required as string[])
        : [];

      obj.properties = Object.fromEntries(
        Object.entries(props).map(([key, rawValue]) => {
          let walked = walkJsonSchema(rawValue) as Record<string, unknown>;
          if (isEmptyJsonSchema(walked)) {
            walked = { ...OPENAI_JSON_VALUE };
          }

          const zodHadDefault =
            rawValue != null &&
            typeof rawValue === "object" &&
            "default" in (rawValue as Record<string, unknown>);

          walked = stripDefault(walked);

          if (!originalRequired.includes(key) && !zodHadDefault) {
            walked = ensureNullable(walked);
          }

          return [key, walked];
        }),
      );

      obj.required = Object.keys(obj.properties as Record<string, unknown>);
    }
  }

  stripUnsupportedKeywords(obj);
  return obj;
}

/** Test helper: assert every object node satisfies OpenAI strict requirements. */
export function assertStrictOpenAiObjectNodes(
  node: unknown,
  assert: (condition: boolean, message: string) => void,
  path = "root",
): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;

  const obj = node as Record<string, unknown>;

  for (const keyword of OPENAI_STRICT_SCHEMA_STRIPPED_KEYWORDS) {
    if (keyword in obj) {
      assert(false, `${path}: unsupported keyword ${keyword}`);
    }
  }

  if (obj.properties && typeof obj.properties === "object") {
    const keys = Object.keys(obj.properties as Record<string, unknown>);
    const required = Array.isArray(obj.required)
      ? (obj.required as string[])
      : [];
    assert(
      obj.additionalProperties === false,
      `${path}: additionalProperties must be false`,
    );
    assert(
      keys.length === required.length &&
        keys.every((key) => required.includes(key)),
      `${path}: required must include every property key (got required=[${required.join(",")}] properties=[${keys.join(",")}])`,
    );
    for (const [key, value] of Object.entries(
      obj.properties as Record<string, unknown>,
    )) {
      assertStrictOpenAiObjectNodes(value, assert, `${path}.${key}`);
    }
  }

  if (obj.items) {
    assertStrictOpenAiObjectNodes(obj.items, assert, `${path}[]`);
  }

  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    const branch = obj[key];
    if (Array.isArray(branch)) {
      branch.forEach((entry, index) =>
        assertStrictOpenAiObjectNodes(
          entry,
          assert,
          `${path}.${key}[${index}]`,
        ),
      );
    }
  }

  const defs = obj.$defs ?? obj.definitions;
  if (defs && typeof defs === "object") {
    for (const [key, value] of Object.entries(
      defs as Record<string, unknown>,
    )) {
      assertStrictOpenAiObjectNodes(value, assert, `${path}.$defs.${key}`);
    }
  }

  if (
    typeof obj.additionalProperties === "object" &&
    obj.additionalProperties !== null
  ) {
    assertStrictOpenAiObjectNodes(
      obj.additionalProperties,
      assert,
      `${path}.additionalProperties`,
    );
  }
}

/** Test helper: collect object nodes that violate strict required rules. */
export function collectStrictObjectViolations(
  node: unknown,
  path = "root",
): string[] {
  const violations: string[] = [];
  assertStrictOpenAiObjectNodes(
    node,
    (condition, message) => {
      if (!condition) violations.push(message);
    },
    path,
  );
  return violations;
}

/** Collect every stripped keyword still present at any recursive schema node. */
export function collectUnsupportedKeywordViolations(
  node: unknown,
  path = "root",
): string[] {
  const violations: string[] = [];
  const walk = (current: unknown, currentPath: string): void => {
    if (Array.isArray(current)) {
      current.forEach((value, index) =>
        walk(value, `${currentPath}[${index}]`),
      );
      return;
    }
    if (!current || typeof current !== "object") return;
    const obj = current as Record<string, unknown>;
    for (const keyword of OPENAI_STRICT_SCHEMA_STRIPPED_KEYWORDS) {
      if (keyword in obj) violations.push(`${currentPath}: ${keyword}`);
    }
    for (const [key, value] of Object.entries(obj)) {
      walk(value, `${currentPath}.${key}`);
    }
  };
  walk(node, path);
  return violations;
}
