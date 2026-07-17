import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentPatch,
  desiredToolConfig,
  loadAgentSpec,
  toElevenLabsParameters
} from "./elevenlabs-agent.mjs";

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
  assert.equal(report.parameters.additionalProperties, false);
  assert.equal("additionalProperties" in config.parameters, false);
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
  assert.deepEqual(config.parameters.properties.note.type, ["string", "null"]);
  assert.equal("maxItems" in config.parameters.properties.unresolvedFields, false);
  assert.equal(
    config.parameters.properties.redFlags.properties.chestPain.description.length > 0,
    true
  );
});

test("the ElevenLabs parameter projection preserves contract shape without unsupported keywords", () => {
  const projected = toElevenLabsParameters({
    type: "object",
    additionalProperties: false,
    required: ["answer"],
    properties: {
      answer: { type: "string", enum: ["yes", "no"] },
      note: { anyOf: [{ type: "string", maxLength: 10 }, { type: "null" }] },
      values: {
        type: "array",
        maxItems: 2,
        uniqueItems: true,
        items: { type: "string", enum: ["one", "two"] }
      }
    }
  });
  assert.deepEqual(projected.required, ["answer"]);
  assert.deepEqual(projected.properties.note.type, ["string", "null"]);
  assert.equal(projected.properties.answer.description.length > 0, true);
  assert.equal(projected.properties.values.items.description.length > 0, true);
  assert.doesNotMatch(
    JSON.stringify(projected),
    /additionalProperties|maxItems|uniqueItems|maxLength/
  );
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
