import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Local CLI: `.env.local` then `.env`. Render injects DATABASE_URL; missing
// files are skipped. Do not require `dotenv -e` files.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  ...(process.env.DATABASE_URL?.trim()
    ? { datasource: { url: process.env.DATABASE_URL } }
    : {}),
});
