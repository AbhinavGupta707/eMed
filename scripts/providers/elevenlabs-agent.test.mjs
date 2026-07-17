import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentPatch, desiredToolConfig, loadAgentSpec } from "./elevenlabs-agent.mjs";

test("the versioned agent spec matches the frozen browser contract", () => {
  const spec = loadAgentSpec();
  assert.deepEqual(spec.tools.map(({ name }) => name).sort(), [
    "propose_patient_report",
    "request_next_round_step"
  ]);
  assert.deepEqual(Object.keys(spec.dynamicVariablePlaceholders).sort(), [
    "history_summary",
    "patient_alias",
    "round_purpose",
    "synthetic_data_only"
  ]);
  assert.equal(spec.maxDurationSeconds, 120);
  assert.match(spec.prompt, /must not diagnose/i);
  assert.match(spec.prompt, /deterministic HomeRounds safety gate/i);
  assert.match(spec.prompt, /preserve every unknown or unsure/i);
});

test("the report tool rejects extra fields and carries every proposal field", () => {
  const spec = loadAgentSpec();
  const report = spec.tools.find(({ name }) => name === "propose_patient_report");
  assert.ok(report);
  const config = desiredToolConfig(report);
  assert.equal(config.type, "client");
  assert.equal(config.expects_response, true);
  assert.equal(config.parameters.additionalProperties, false);
  assert.deepEqual(config.parameters.required, [
    "contractVersion",
    "weakness",
    "palpitations",
    "redFlags",
    "note",
    "unresolvedFields"
  ]);
  assert.deepEqual(config.parameters.properties.unresolvedFields.items.enum, [
    "weakness",
    "palpitations",
    "chest_pain",
    "severe_breathlessness",
    "fainted"
  ]);
});

test("the agent patch keeps exactly two non-parallel client tools and private auth", () => {
  const spec = loadAgentSpec();
  const patch = buildAgentPatch(spec, ["tool_report", "tool_next"]);
  assert.deepEqual(patch.conversation_config.agent.prompt.tool_ids, ["tool_report", "tool_next"]);
  assert.deepEqual(patch.conversation_config.agent.prompt.tools, []);
  assert.equal(patch.conversation_config.agent.prompt.enable_parallel_tool_calls, false);
  assert.equal(patch.conversation_config.conversation.max_duration_seconds, 120);
  assert.equal(patch.platform_settings.auth.enable_auth, true);
  assert.doesNotMatch(JSON.stringify(patch), /xi-api-key|sk_[a-z0-9]/i);
});
