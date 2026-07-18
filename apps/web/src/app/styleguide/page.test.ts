import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styleguide.module.css", import.meta.url), "utf8");
const compactPageSource = pageSource.replace(/\s+/g, " ");

describe("responsive style guide source contract", () => {
  it("has one descriptive page heading and landmark navigation", () => {
    expect(pageSource.match(/<h1/g)).toHaveLength(1);
    expect(pageSource).toContain("A calm system for careful follow-up");
    expect(pageSource).toContain('aria-label="Style guide sections"');
  });

  it("keeps safety and synthetic-data disclosures visible", () => {
    expect(pageSource).toContain("Sample profile · Not medical care");
    expect(pageSource).toContain("Not clinically validated");
    expect(compactPageSource).toContain("not for real-world medical decisions");
  });

  it("demonstrates non-colour workflow and recovery states", () => {
    for (const label of [
      "Complete",
      "In progress",
      "Attention needed",
      "Action required",
      "Try again"
    ]) {
      expect(pageSource).toContain(label);
    }
    expect(pageSource).toContain('status="retry"');
    expect(pageSource).toContain('status="fail"');
  });

  it("documents narrow-width behavior without horizontal scrolling", () => {
    expect(pageSource).toContain("320px example");
    expect(stylesSource).toContain("@media (max-width: 30rem)");
    expect(stylesSource).toContain("overflow: clip");
  });

  it("uses synthetic participants and contains no secret-like configuration labels", () => {
    expect(pageSource).toContain("Synthetic participant 014");
    expect(pageSource).not.toContain("API_KEY");
    expect(pageSource).not.toContain("DATABASE_URL");
    expect(pageSource).not.toContain("BEGIN PRIVATE KEY");
  });
});
