import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const BROWSER_ASSET_ROOT = `${REPOSITORY_ROOT}/apps/web/.next/static`;
const SECRET_NAMES = [
  "FIREWORKS_API_KEY",
  "ELEVENLABS_API_KEY",
  "VITALLENS_API_KEY",
  "DATABASE_URL",
  "DEMO_ACCESS_SECRET"
] as const;
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

type SecretCandidate = { readonly name: (typeof SECRET_NAMES)[number]; readonly value: string };

function normalizedValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^(['"])(.*)\1$/, "$2");
  if (
    trimmed.length < 12 ||
    /^(?:change-me|example|placeholder|your-|postgresql:\/\/localhost)/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function configuredSecrets(): SecretCandidate[] {
  const values = new Map<(typeof SECRET_NAMES)[number], string>();
  for (const name of SECRET_NAMES) {
    const value = normalizedValue(process.env[name]);
    if (value) values.set(name, value);
  }
  for (const relativePath of ["apps/web/.env.local", ".vercel/.env.preview.local"]) {
    const path = `${REPOSITORY_ROOT}/${relativePath}`;
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match) continue;
      const name = match[1] as (typeof SECRET_NAMES)[number];
      if (!SECRET_NAMES.includes(name)) continue;
      const value = normalizedValue(match[2]);
      if (value) values.set(name, value);
    }
  }
  return [...values].map(([name, value]) => ({ name, value }));
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  })
    .split("\0")
    .filter(Boolean);
}

function recursivelyList(path: string): string[] {
  if (!existsSync(path)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) files.push(...recursivelyList(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function isTextPath(path: string): boolean {
  const suffix = path.slice(path.lastIndexOf("."));
  return TEXT_EXTENSIONS.has(suffix) && statSync(path).size <= 5 * 1024 * 1024;
}

describe("final-pass secret, media, and browser-artifact scans", () => {
  const secrets = configuredSecrets();

  it.skipIf(secrets.length === 0)(
    "finds zero exact configured secret values in tracked files, Git patch history, and browser assets",
    () => {
      const tracked = trackedFiles();
      const browserFiles = recursivelyList(BROWSER_ASSET_ROOT).filter(isTextPath);
      const history = execFileSync("git", ["log", "-p", "--all", "--format="], {
        cwd: REPOSITORY_ROOT,
        encoding: "buffer",
        maxBuffer: 256 * 1024 * 1024
      });

      for (const secret of secrets) {
        const needle = Buffer.from(secret.value);
        const trackedMatches = tracked.filter((relativePath) => {
          const absolutePath = `${REPOSITORY_ROOT}/${relativePath}`;
          return isTextPath(absolutePath) && readFileSync(absolutePath).includes(needle);
        });
        const browserMatches = browserFiles
          .filter((path) => readFileSync(path).includes(needle))
          .map((path) => path.slice(REPOSITORY_ROOT.length + 1));
        expect(
          trackedMatches,
          `${secret.name} exact value must not occur in tracked files`
        ).toEqual([]);
        expect(
          browserMatches,
          `${secret.name} exact value must not occur in browser assets`
        ).toEqual([]);
        expect(
          history.includes(needle),
          `${secret.name} exact value must not occur in Git history`
        ).toBe(false);
      }
    },
    30_000
  );

  it.skipIf(!existsSync(BROWSER_ASSET_ROOT))(
    "keeps server configuration names and configured values out of built browser assets",
    () => {
      const files = recursivelyList(BROWSER_ASSET_ROOT).filter(isTextPath);
      expect(files.length).toBeGreaterThan(0);
      const namesPattern = new RegExp(SECRET_NAMES.join("|"));
      const nameMatches = files
        .filter((path) => namesPattern.test(readFileSync(path, "utf8")))
        .map((path) => path.slice(REPOSITORY_ROOT.length + 1));
      expect(nameMatches).toEqual([]);
    }
  );

  it("keeps raw media, audio, transcript, prompt, reasoning, and provider payload fields out of persistence schema", () => {
    const persistenceFiles = [
      "infra/db/migrations/0006_proactive_memory_care_actions.sql",
      "apps/web/src/server/final-pass-repositories.ts"
    ];
    const forbiddenPersistedFields =
      /\b(?:raw_audio|raw_video|raw_frame|camera_frames|audio_bytes|pcm_bytes|full_transcript|hidden_reasoning|provider_payload|stored_prompt)\b/i;
    for (const relativePath of persistenceFiles) {
      expect(readFileSync(`${REPOSITORY_ROOT}/${relativePath}`, "utf8")).not.toMatch(
        forbiddenPersistedFields
      );
    }
  });

  it("tracks no ignored environment, local database, browser trace, raw media, or audio artifact", () => {
    const tracked = trackedFiles();
    expect(
      tracked.filter((path) =>
        /(?:^|\/)(?:\.env(?!\.example$)(?:\.|$)|\.vercel\/|test-results\/|playwright-report\/)|\.(?:wav|mp3|m4a|webm|mov|mp4|pcm|trace|har)$/i.test(
          path
        )
      )
    ).toEqual([]);
  });
});
