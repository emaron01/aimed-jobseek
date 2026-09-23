import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("prisma.config.ts", () => {
  it("owns seed configuration and package.json no longer has prisma.seed", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      prisma?: { seed?: string };
    };
    const config = readFileSync("prisma.config.ts", "utf8");

    expect(pkg.prisma).toBeUndefined();
    expect(config).toContain("defineConfig");
    expect(config).toContain("prisma/schema.prisma");
    expect(config).toContain("prisma/migrations");
    expect(config).toContain("tsx --conditions=react-server prisma/seed.ts");
    expect(config).not.toMatch(/dotenv -e /);
  });
});
