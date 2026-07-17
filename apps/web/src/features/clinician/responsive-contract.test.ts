import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const cockpitSource = readFileSync(new URL("./clinician-cockpit.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("./action-panel.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(
  new URL("./clinician-cockpit.module.css", import.meta.url),
  "utf8"
);

describe("clinician responsive and accessibility source contract", () => {
  it("keeps one named main landmark, a unique queue navigation label, and one page heading", () => {
    expect(cockpitSource).toContain('navigationLabel="Clinician priority queue"');
    expect(cockpitSource.match(/<h1/g)).toHaveLength(1);
    expect(cockpitSource).toContain("Clinician cockpit");
    expect(cockpitSource).toContain("<AppShell");
  });

  it("uses persistent labels, explicit confirmation, and restrained mutation live regions", () => {
    expect(actionSource).toContain('<FieldLabel htmlFor="clinician-note">Note draft</FieldLabel>');
    expect(actionSource).toContain("No success is displayed until");
    expect(actionSource).toContain('aria-live="polite"');
    expect(actionSource.match(/aria-live=/g)).toHaveLength(1);
    expect(actionSource).toContain("<Dialog");
  });

  it("defines narrow layout, touch targets, reduced motion, forced colours, and overflow-safe IDs", () => {
    expect(stylesSource).toContain("min-height: var(--touch-target)");
    expect(stylesSource).toContain("@media (max-width: 44rem)");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesSource).toContain("@media (forced-colors: active)");
    expect(stylesSource).toContain("overflow-wrap: anywhere");
    expect(stylesSource).not.toContain("min-width: 44rem");
  });

  it("keeps synthetic, non-diagnostic, and raw-media-absent disclosures persistent", () => {
    expect(cockpitSource).toContain("Synthetic data only");
    expect(cockpitSource).toContain("Not clinically validated");
    expect(cockpitSource).toContain("No raw camera frames");
    expect(cockpitSource).not.toMatch(/API_KEY|DATABASE_URL|BEGIN PRIVATE KEY/);
  });
});
