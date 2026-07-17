import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("medication label static accessibility and privacy contract", () => {
  const componentSource = readFileSync(
    new URL("./medication-label-panel.tsx", import.meta.url),
    "utf8"
  );
  const stylesSource = readFileSync(
    new URL("./medication-label.module.css", import.meta.url),
    "utf8"
  );

  it("keeps the image boundary and raw-media omissions explicit", () => {
    expect(componentSource).toContain("temporary image extraction");
    expect(componentSource).toContain("Temporary preview");
    expect(componentSource).toContain("prepared?.clear()");
    expect(componentSource).not.toMatch(/console\.(?:log|info|warn|error)/);
    expect(componentSource).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it("keeps visible focus, touch size, non-color status text, and reduced motion", () => {
    expect(stylesSource).toContain("min-width: 44px");
    expect(stylesSource).toContain("min-height: 44px");
    expect(stylesSource).toContain(":focus-visible");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(componentSource).toContain("<strong>Status:</strong>");
  });
});
