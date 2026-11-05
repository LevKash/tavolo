import dotenv from "dotenv";

// Tests run ONLY against the throwaway Neon branch named in .env.test.local.
dotenv.config({ path: ".env.test.local", quiet: true });

const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
// Endpoint of the PRODUCTION branch. Never run tests against it.
const PRODUCTION_ENDPOINT = "ep-sweet-mouse-b1ftir6x";
if (!host || host.includes(PRODUCTION_ENDPOINT)) {
  throw new Error(
    "Refusing to run: DATABASE_URL must point at a test branch (.env.test.local), not production.",
  );
}
