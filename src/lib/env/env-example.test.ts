import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SECRET_VALUE =
  /^(sk-proj-|sk-live-|sk_live_|sk_test_|whsec_|sk-[A-Za-z0-9]{20,})/;
const SECRET_KEY =
  /(SECRET|PASSWORD|API_KEY|TOKEN|ENCRYPTION_KEY)$/i;
const LOCAL_HOST = /(localhost|127\.0\.0\.1)/i;
const PLACEHOLDER =
  /^(your-|change-me|placeholder|xxx|example|todo|replace)/i;

function parseAssignments(source: string): Array<{ key: string; value: string }> {
  return source
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return [];
      const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!match) return [];
      const value = (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
      return [{ key: match[1]!, value }];
    });
}

describe(".env.example", () => {
  it("contains only empty or placeholder values", () => {
    const source = readFileSync(".env.example", "utf8");
    const violations: string[] = [];
    for (const { key, value } of parseAssignments(source)) {
      if (!value) continue;
      if (SECRET_VALUE.test(value)) {
        violations.push(`${key} looks like a live credential.`);
        continue;
      }
      if (key === "DATABASE_URL" && !LOCAL_HOST.test(value)) {
        violations.push(`${key} is not a local placeholder database.`);
        continue;
      }
      if (SECRET_KEY.test(key) && !PLACEHOLDER.test(value)) {
        violations.push(`${key} must be empty or a labeled placeholder.`);
      }
    }
    expect(violations).toEqual([]);
  });
});
