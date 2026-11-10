import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "";

// drizzle-kit can drop columns and tables. It must never be pointed at the live
// database by accident (for example through a local .env file that holds the
// production URL). Schema changes reach production as reviewed SQL in docs/.
const looksLikeProduction =
  url.includes("ep-sweet-mouse") || process.env.NEON_BRANCH === "production";
if (looksLikeProduction && process.env.ALLOW_PRODUCTION_SCHEMA_CHANGE !== "yes") {
  throw new Error(
    "Refusing to run drizzle-kit against the production database. " +
      "Point DATABASE_URL at a development branch.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
