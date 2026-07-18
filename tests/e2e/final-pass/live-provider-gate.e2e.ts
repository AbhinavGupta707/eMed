import { expect, test } from "@playwright/test";

test("live provider evidence is explicit, separate, and key gated", async ({ request }) => {
  const optedIn = process.env.HOMEROUNDS_LIVE_PROVIDER_OPT_IN === "true";
  const baseUrl = process.env.HOMEROUNDS_LIVE_BASE_URL;
  const hasProviderKey = Boolean(
    process.env.FIREWORKS_API_KEY || process.env.VITALLENS_API_KEY || process.env.ELEVENLABS_API_KEY
  );
  test.skip(
    !optedIn || !baseUrl || !hasProviderKey,
    "live provider check skipped: explicit opt-in, hosted base URL, and a server-only key are required"
  );

  const health = await request.get(new URL("/api/health", baseUrl).toString());
  expect(health.status()).toBe(200);
});
