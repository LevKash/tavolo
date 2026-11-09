import fs from "node:fs";
import dotenv from "dotenv";

// Tests run ONLY against a throwaway database branch: .env.test.local locally,
// or the TEST_DATABASE_URL secret in CI. Tests that need no database
// (tests/viva.test.ts, tests/monitor.test.ts) run without any URL.
dotenv.config({ path: ".env.test.local", quiet: true });

const hostOf = (url: string) => {
  try {
    return new URL(url.replace(/^["']|["']$/g, "")).hostname;
  } catch {
    return "";
  }
};

const url = process.env.DATABASE_URL ?? "";
if (url) {
  // Refuse to run against any database the app itself is configured to use.
  const protectedHosts = new Set<string>();
  for (const f of [".env.local", ".env.prod.local", ".env.production.local"]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = /^DATABASE_URL(_UNPOOLED)?=(.*)$/.exec(line.trim());
      if (m) protectedHosts.add(hostOf(m[2]).replace("-pooler", ""));
    }
  }
  const host = hostOf(url).replace("-pooler", "");
  if (!host || protectedHosts.has(host)) {
    throw new Error(
      "Refusing to run: DATABASE_URL must point at a test branch, not at the app's own database.",
    );
  }
}
