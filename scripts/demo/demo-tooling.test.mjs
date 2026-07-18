import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  REPOSITORY_ROOT,
  buildScopedResetSql,
  createDemoRuntime,
  deterministicUuid,
  loadScenarioBundle,
  roundIdForScenario,
  validateScenarioBundle
} from "./lib.mjs";

test("the checked-in bundle is synthetic, exact, and deterministic", async () => {
  const bundle = await loadScenarioBundle();
  assert.equal(bundle.scenarios.length, 3);
  assert.deepEqual(
    bundle.scenarios.map(({ id }) => id),
    ["maya-happy-text", "maya-poor-quality", "maya-red-flag"]
  );
  for (const scenario of bundle.scenarios) {
    assert.equal(scenario.patientId, "synthetic-maya");
    assert.equal(scenario.expectedInitialState, "invited");
    assert.equal(
      roundIdForScenario(scenario),
      deterministicUuid("round", scenario.patientId, scenario.triggerId)
    );
  }
});

test("scenario validation rejects production-like or out-of-namespace data", async () => {
  const bundle = structuredClone(await loadScenarioBundle());
  bundle.scenarios[0].patientId = "real-patient";
  assert.throws(() => validateScenarioBundle(bundle), /visibly synthetic/);

  const triggerBundle = structuredClone(await loadScenarioBundle());
  triggerBundle.scenarios[0].triggerId = "other:trigger";
  assert.throws(() => validateScenarioBundle(triggerBundle), /outside the demo namespace/);
});

test("runtime refuses production and non-demo profiles", () => {
  assert.throws(
    () => createDemoRuntime({}, { APP_ENV: "production", DEMO_MODE: "false" }),
    /APP_ENV=production/
  );
  assert.throws(
    () => createDemoRuntime({}, { APP_ENV: "demo", DEMO_MODE: "false" }),
    /DEMO_MODE=true/
  );
});

test("runtime carries an automation bypass only through request configuration", () => {
  const runtime = createDemoRuntime(
    { "base-url": "https://preview.example" },
    {
      APP_ENV: "demo",
      DEMO_MODE: "true",
      DEMO_ACCESS_SECRET: "synthetic-demo-secret",
      VERCEL_AUTOMATION_BYPASS_SECRET: "synthetic-bypass-secret"
    }
  );
  assert.equal(runtime.automationBypassSecret, "synthetic-bypass-secret");
});

test("reset SQL is exact-scope, transactional, and dependency ordered", async () => {
  const bundle = await loadScenarioBundle();
  const sql = buildScopedResetSql(bundle);
  assert.match(sql, /^\\set ON_ERROR_STOP on\nbegin;/);
  assert.match(sql, /create temporary table homerounds_demo_reset_scope/);
  assert.match(
    sql,
    /alter table audit_events disable trigger audit_events_reject_update_or_delete/
  );
  assert.match(sql, /alter table audit_events enable trigger audit_events_reject_update_or_delete/);
  assert.match(
    sql,
    /delete from companion_operations[\s\S]*delete from companion_results[\s\S]*update companion_pairings[\s\S]*delete from companion_sessions[\s\S]*delete from companion_pairings[\s\S]*delete from action_attempts[\s\S]*delete from action_executions[\s\S]*delete from clinical_tasks[\s\S]*delete from voice_biomarker_facts[\s\S]*delete from measurement_facts[\s\S]*delete from audit_events[\s\S]*delete from rounds/
  );
  assert.match(sql, /commit;\n$/);
  assert.doesNotMatch(sql, /truncate/i);
  for (const scenario of bundle.scenarios) assert.match(sql, new RegExp(scenario.triggerId));
});

test("the browser replay asset is visibly labelled, explicit, synthetic, and raw-media free", async () => {
  const fixture = JSON.parse(
    await readFile(
      path.join(REPOSITORY_ROOT, "apps/web/public/demo/recorded-valid-capture.v1.json"),
      "utf8"
    )
  );
  assert.equal(fixture.dataClassification, "synthetic_demo");
  assert.equal(fixture.containsRawMedia, false);
  assert.equal(fixture.containsPatientData, false);
  assert.equal(fixture.automaticFallbackAllowed, false);
  assert.equal(fixture.usePolicy.requiresDemoMode, true);
  assert.equal(fixture.usePolicy.requiresLiveCaptureFailure, true);
  assert.equal(fixture.usePolicy.requiresExplicitUserSelection, true);
  assert.equal(fixture.usePolicy.mustNeverReplaceOrModifyLiveMeasurement, true);
  assert.equal(fixture.measurementPrototype.rawMediaRef, null);
});
