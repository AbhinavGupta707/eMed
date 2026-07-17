import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, "../..");
export const SCENARIO_FILE = path.join(REPOSITORY_ROOT, "data/demo/scenarios.v1.json");

const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const REPORT_LEVELS = new Set(["absent", "mild", "moderate", "severe", "unknown"]);
const PALPITATION_LEVELS = new Set(["absent", "intermittent", "current", "unknown"]);
const RED_FLAG_ANSWERS = new Set(["yes", "no", "unsure"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function deterministicUuid(...parts) {
  const bytes = createHash("sha256").update(parts.join("\u001f")).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validateScenarioBundle(value) {
  invariant(
    value && typeof value === "object" && !Array.isArray(value),
    "Scenario bundle must be an object."
  );
  invariant(value.schemaVersion === 1, "Scenario bundle schemaVersion must be 1.");
  invariant(
    value.dataClassification === "synthetic_demo",
    "Only synthetic demo data is permitted."
  );
  invariant(
    value.fixtureMode === "explicit_demo_only",
    "Fixtures must require explicit demo mode."
  );
  invariant(
    typeof value.triggerPrefix === "string" && SAFE_ID.test(value.triggerPrefix),
    "Unsafe trigger prefix."
  );
  invariant(
    typeof value.protocolId === "string" && SAFE_ID.test(value.protocolId),
    "Unsafe protocol id."
  );
  invariant(
    Array.isArray(value.scenarios) && value.scenarios.length === 3,
    "Exactly three demo scenarios are required."
  );

  const ids = new Set();
  const triggers = new Set();
  for (const scenario of value.scenarios) {
    invariant(
      scenario && typeof scenario === "object" && !Array.isArray(scenario),
      "Each scenario must be an object."
    );
    invariant(typeof scenario.id === "string" && SAFE_ID.test(scenario.id), "Unsafe scenario id.");
    invariant(!ids.has(scenario.id), `Duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);
    invariant(
      typeof scenario.patientId === "string" && SAFE_ID.test(scenario.patientId),
      "Unsafe patient id."
    );
    invariant(
      scenario.patientId.startsWith("synthetic-"),
      "Demo patient ids must be visibly synthetic."
    );
    invariant(
      typeof scenario.triggerId === "string" && scenario.triggerId.startsWith(value.triggerPrefix),
      "Trigger is outside the demo namespace."
    );
    invariant(SAFE_ID.test(scenario.triggerId), "Unsafe trigger id.");
    invariant(!triggers.has(scenario.triggerId), `Duplicate trigger id: ${scenario.triggerId}`);
    triggers.add(scenario.triggerId);
    invariant(
      typeof scenario.purpose === "string" &&
        scenario.purpose.length > 0 &&
        scenario.purpose.length <= 240,
      "Invalid round purpose."
    );
    invariant(
      Number.isInteger(scenario.burdenSeconds) &&
        scenario.burdenSeconds > 0 &&
        scenario.burdenSeconds <= 3600,
      "Invalid burden."
    );
    invariant(
      scenario.expectedInitialState === "invited",
      "Seeded scenarios must begin at invited."
    );
    invariant(REPORT_LEVELS.has(scenario.report?.weakness), "Invalid weakness fixture.");
    invariant(
      PALPITATION_LEVELS.has(scenario.report?.palpitations),
      "Invalid palpitations fixture."
    );
    for (const key of ["chestPain", "severeBreathlessness", "fainted"]) {
      invariant(
        RED_FLAG_ANSWERS.has(scenario.report?.redFlags?.[key]),
        `Invalid red flag answer: ${key}`
      );
    }
  }
  invariant(ids.has(value.defaultScenarioId), "Default scenario id is missing.");
  return value;
}

export async function loadScenarioBundle(file = SCENARIO_FILE) {
  return validateScenarioBundle(JSON.parse(await readFile(file, "utf8")));
}

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    invariant(argument.startsWith("--"), `Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    invariant(["base-url"].includes(name), `Unknown option: --${name}`);
    const value = argv[index + 1];
    invariant(value && !value.startsWith("--"), `Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

export function createDemoRuntime(options = {}, environment = process.env) {
  const appEnvironment = environment.APP_ENV ?? "development";
  const demoMode = environment.DEMO_MODE ?? "true";
  invariant(appEnvironment !== "production", "Demo tooling refuses APP_ENV=production.");
  invariant(demoMode === "true", "Demo tooling requires DEMO_MODE=true.");
  const baseUrl = new URL(
    options["base-url"] ?? environment.APP_BASE_URL ?? "http://localhost:3000"
  );
  invariant(["http:", "https:"].includes(baseUrl.protocol), "Demo base URL must use HTTP(S).");
  invariant(
    baseUrl.username === "" && baseUrl.password === "",
    "Credentials are forbidden in the demo base URL."
  );
  return {
    appEnvironment,
    baseUrl,
    demoAccessSecret: environment.DEMO_ACCESS_SECRET,
    databaseUrl: environment.DATABASE_URL
  };
}

function signedSession(runtime, role, patientId) {
  invariant(
    runtime.demoAccessSecret && runtime.demoAccessSecret.length >= 16,
    "Demo secret must be at least 16 characters."
  );
  const session = {
    sessionId: `demo-tool-${role}`,
    role,
    patientId: role === "patient" ? patientId : null,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    dataClassification: "synthetic_demo"
  };
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = createHmac("sha256", runtime.demoAccessSecret)
    .update(encoded)
    .digest("base64url");
  return `homerounds_demo_session=${encoded}.${signature}`;
}

export function authHeaders(runtime, role, patientId = "synthetic-maya") {
  if (runtime.demoAccessSecret) return { cookie: signedSession(runtime, role, patientId) };
  invariant(
    runtime.appEnvironment === "development",
    "A signed DEMO_ACCESS_SECRET session is required outside development."
  );
  return { "x-homerounds-demo-role": role };
}

export async function requestApi(
  runtime,
  pathname,
  { method = "GET", role = "patient", patientId, body } = {}
) {
  const headers = new Headers(authHeaders(runtime, role, patientId));
  headers.set("accept", "application/json");
  if (method !== "GET") {
    headers.set("origin", runtime.baseUrl.origin);
    headers.set("content-type", "application/json");
  }
  const response = await fetch(new URL(pathname, runtime.baseUrl), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error(
      `HomeRounds returned non-JSON for ${method} ${pathname} (HTTP ${response.status}).`
    );
  }
  if (!response.ok) {
    const code = envelope?.error?.code ?? "unknown_error";
    const correlation = envelope?.error?.correlationId ?? "unknown";
    throw new Error(
      `HomeRounds API ${method} ${pathname} failed: ${code} (HTTP ${response.status}, correlation ${correlation}).`
    );
  }
  invariant(
    envelope && typeof envelope === "object" && envelope.data,
    "Malformed HomeRounds success envelope."
  );
  return envelope;
}

export function roundIdForScenario(scenario) {
  return deterministicUuid("round", scenario.patientId, scenario.triggerId);
}

export async function seedScenarios(runtime, bundle) {
  const seeded = [];
  for (const scenario of bundle.scenarios) {
    const envelope = await requestApi(runtime, "/api/rounds", {
      method: "POST",
      role: "patient",
      patientId: scenario.patientId,
      body: {
        patientId: scenario.patientId,
        triggerId: scenario.triggerId,
        purpose: scenario.purpose,
        protocolId: bundle.protocolId,
        burdenSeconds: scenario.burdenSeconds
      }
    });
    const round = envelope.data?.round;
    invariant(
      round?.id === roundIdForScenario(scenario),
      `Unexpected round id for ${scenario.id}.`
    );
    invariant(round?.triggerId === scenario.triggerId, `Unexpected trigger for ${scenario.id}.`);
    seeded.push({
      scenarioId: scenario.id,
      roundId: round.id,
      state: round.state,
      created: envelope.data.created,
      runtimeProfile: envelope.meta?.runtimeProfile
    });
  }
  return seeded;
}

export async function checkSeededScenarios(runtime, bundle) {
  const checked = [];
  for (const scenario of bundle.scenarios) {
    const roundId = roundIdForScenario(scenario);
    const envelope = await requestApi(runtime, `/api/rounds/${roundId}`, {
      role: "patient",
      patientId: scenario.patientId
    });
    const round = envelope.data?.round;
    invariant(round?.id === roundId, `Missing deterministic round for ${scenario.id}.`);
    invariant(round?.patientId === scenario.patientId, `Patient mismatch for ${scenario.id}.`);
    invariant(round?.triggerId === scenario.triggerId, `Trigger mismatch for ${scenario.id}.`);
    invariant(round?.protocolId === bundle.protocolId, `Protocol mismatch for ${scenario.id}.`);
    invariant(round?.purpose === scenario.purpose, `Purpose mismatch for ${scenario.id}.`);
    invariant(
      round?.state === scenario.expectedInitialState,
      `${scenario.id} is ${round?.state}; expected ${scenario.expectedInitialState}. Run reset before the demo.`
    );
    invariant(round?.stateVersion === 0, `${scenario.id} is not at baseline state version 0.`);
    checked.push({
      scenarioId: scenario.id,
      roundId,
      state: round.state,
      runtimeProfile: envelope.meta?.runtimeProfile
    });
  }
  const ids = checked.map(({ roundId }) => roundId);
  const query = new URLSearchParams(ids.map((id) => ["roundId", id]));
  const queue = await requestApi(runtime, `/api/clinician/queue?${query}`, { role: "clinician" });
  invariant(
    Array.isArray(queue.data?.tasks) && queue.data.tasks.length === 0,
    "Baseline demo queue must be empty."
  );
  return checked;
}

function sqlLiteral(value) {
  invariant(typeof value === "string" && SAFE_ID.test(value), "Unsafe SQL fixture literal.");
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildScopedResetSql(bundle) {
  const values = bundle.scenarios
    .map((scenario) => `(${sqlLiteral(scenario.triggerId)}, ${sqlLiteral(scenario.patientId)})`)
    .join(",\n  ");
  return `\\set ON_ERROR_STOP on
begin;

create temporary table homerounds_demo_reset_scope (
  trigger_id text primary key,
  patient_id text not null
) on commit drop;

insert into homerounds_demo_reset_scope (trigger_id, patient_id) values
  ${values};

do \$scope\$
begin
  if exists (
    select 1
    from rounds r
    join homerounds_demo_reset_scope s on s.trigger_id = r.trigger_id
    where r.patient_id <> s.patient_id
  ) then
    raise exception 'demo reset scope mismatch';
  end if;
end
\$scope\$;

create temporary table homerounds_demo_reset_rounds on commit drop as
select r.id
from rounds r
join homerounds_demo_reset_scope s
  on s.trigger_id = r.trigger_id
 and s.patient_id = r.patient_id;

alter table audit_events disable trigger audit_events_reject_update_or_delete;
delete from action_attempts where round_id in (select id from homerounds_demo_reset_rounds);
delete from action_executions where round_id in (select id from homerounds_demo_reset_rounds);
delete from clinical_tasks where round_id in (select id from homerounds_demo_reset_rounds);
delete from measurement_facts where round_id in (select id from homerounds_demo_reset_rounds);
delete from audit_events where round_id in (select id from homerounds_demo_reset_rounds);
delete from rounds where id in (select id from homerounds_demo_reset_rounds);
alter table audit_events enable trigger audit_events_reject_update_or_delete;

do \$verify\$
begin
  if exists (
    select 1
    from rounds r
    join homerounds_demo_reset_scope s
      on s.trigger_id = r.trigger_id
     and s.patient_id = r.patient_id
  ) then
    raise exception 'demo reset did not remove the full scoped seed';
  end if;
end
\$verify\$;

commit;
`;
}
