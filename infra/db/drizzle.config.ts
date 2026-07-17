import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
const configDirectory = dirname(fileURLToPath(import.meta.url));

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required only when running Drizzle database commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: resolve(configDirectory, "../../packages/persistence/src/postgres/schema.ts"),
  out: resolve(configDirectory, "migrations"),
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true
});
