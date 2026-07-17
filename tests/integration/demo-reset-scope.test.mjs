import { describe, expect, it } from "vitest";

import {
  buildScopedResetSql,
  createDemoRuntime,
  loadScenarioBundle
} from "../../scripts/demo/lib.mjs";

describe("synthetic demo reset safety", () => {
  it("limits reset to exact trigger and patient pairs in dependency order", async () => {
    const bundle = await loadScenarioBundle();
    const sql = buildScopedResetSql(bundle);

    expect(sql).toMatch(/^\\set ON_ERROR_STOP on\nbegin;/);
    expect(sql).toContain("s.trigger_id = r.trigger_id");
    expect(sql).toContain("s.patient_id = r.patient_id");
    expect(sql).toMatch(
      /delete from action_attempts[\s\S]*delete from action_executions[\s\S]*delete from clinical_tasks[\s\S]*delete from measurement_facts[\s\S]*delete from audit_events[\s\S]*delete from rounds/
    );
    expect(sql).toMatch(/commit;\n$/);
    expect(sql).not.toMatch(/truncate|drop table|delete from rounds\s*;/i);
    expect(sql).not.toMatch(/trigger_id\s+like/i);
    expect(sql).not.toContain("homerounds-test:unrelated-control");
    for (const scenario of bundle.scenarios) {
      expect(sql).toContain(`('${scenario.triggerId}', '${scenario.patientId}')`);
    }
  });

  it("rejects SQL-literal injection and unsafe runtime profiles", async () => {
    const bundle = structuredClone(await loadScenarioBundle());
    bundle.scenarios[0].triggerId = "homerounds-demo:v1:x';drop-table";

    expect(() => buildScopedResetSql(bundle)).toThrow(/Unsafe SQL fixture literal/);
    expect(() => createDemoRuntime({}, { APP_ENV: "production", DEMO_MODE: "true" })).toThrow(
      /APP_ENV=production/
    );
    expect(() => createDemoRuntime({}, { APP_ENV: "demo", DEMO_MODE: "false" })).toThrow(
      /DEMO_MODE=true/
    );
  });
});
