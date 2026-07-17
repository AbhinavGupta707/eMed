#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SPEC_PATH = fileURLToPath(
  new URL("../../infra/providers/elevenlabs/agent-spec.v1.json", import.meta.url)
);
const API_BASE_URL = "https://api.elevenlabs.io/v1/convai/";
const EXPECTED_TOOL_NAMES = ["propose_patient_report", "request_next_round_step"];
const EXPECTED_DYNAMIC_VARIABLES = [
  "history_summary",
  "patient_alias",
  "round_purpose",
  "synthetic_data_only"
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function loadAgentSpec(path = SPEC_PATH) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  invariant(plainObject(value), "ElevenLabs agent spec must be an object.");
  invariant(value.schemaVersion === 1, "Unsupported ElevenLabs agent spec version.");
  invariant(value.agentName === "HomeRounds Voice Intake", "Unexpected ElevenLabs agent name.");
  invariant(
    typeof value.firstMessage === "string" && value.firstMessage.length > 20,
    "Missing first message."
  );
  invariant(
    typeof value.prompt === "string" && value.prompt.length > 500,
    "Agent prompt is unexpectedly small."
  );
  invariant(value.maxDurationSeconds === 120, "Agent duration must remain 120 seconds.");
  invariant(
    plainObject(value.dynamicVariablePlaceholders),
    "Missing dynamic variable placeholders."
  );
  invariant(
    JSON.stringify(Object.keys(value.dynamicVariablePlaceholders).sort()) ===
      JSON.stringify(EXPECTED_DYNAMIC_VARIABLES),
    "Dynamic variables do not match the browser contract."
  );
  invariant(
    Array.isArray(value.tools) && value.tools.length === 2,
    "Exactly two client tools are required."
  );
  invariant(
    JSON.stringify(value.tools.map(({ name }) => name).sort()) ===
      JSON.stringify([...EXPECTED_TOOL_NAMES].sort()),
    "Client tool names do not match the browser contract."
  );
  for (const tool of value.tools) {
    invariant(plainObject(tool.parameters), `Missing parameters for ${tool.name}.`);
    invariant(tool.parameters.type === "object", `${tool.name} parameters must be an object.`);
    invariant(
      tool.parameters.additionalProperties === false,
      `${tool.name} must reject extra fields.`
    );
  }
  invariant(
    !JSON.stringify(value).match(/xi-api-key|sk_[a-z0-9]|api[_-]?key/i),
    "Agent spec contains a secret-like value."
  );
  return value;
}

function loadEnvironmentFile(path) {
  if (!existsSync(path)) return {};
  const entries = [];
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

export function loadProviderEnvironment(source = process.env) {
  const local = loadEnvironmentFile(`${REPOSITORY_ROOT}/apps/web/.env.local`);
  const apiKey = source.ELEVENLABS_API_KEY || local.ELEVENLABS_API_KEY;
  const agentId = source.ELEVENLABS_AGENT_ID || local.ELEVENLABS_AGENT_ID;
  invariant(
    typeof apiKey === "string" && apiKey.length > 0,
    "ELEVENLABS_API_KEY is not configured."
  );
  invariant(
    typeof agentId === "string" && agentId.length > 0,
    "ELEVENLABS_AGENT_ID is not configured."
  );
  return { apiKey, agentId };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!plainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)])
  );
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function hash(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : stableJson(value))
    .digest("hex");
}

function containsDesired(actual, desired) {
  if (Array.isArray(desired)) {
    return Array.isArray(actual) && stableJson(actual) === stableJson(desired);
  }
  if (!plainObject(desired)) return actual === desired;
  return (
    plainObject(actual) &&
    Object.entries(desired).every(([key, value]) => containsDesired(actual[key], value))
  );
}

export function desiredToolConfig(tool) {
  return {
    type: "client",
    name: tool.name,
    description: tool.description,
    expects_response: true,
    execution_mode: "immediate",
    interruption_mode: "allow",
    parameters: tool.parameters,
    pre_tool_speech: "auto",
    response_timeout_secs: 10,
    tool_error_handling_mode: "auto"
  };
}

export function buildAgentPatch(spec, toolIds) {
  invariant(
    toolIds.length === 2 && new Set(toolIds).size === 2,
    "Exactly two distinct tool IDs are required."
  );
  return {
    name: spec.agentName,
    conversation_config: {
      conversation: { max_duration_seconds: spec.maxDurationSeconds },
      agent: {
        first_message: spec.firstMessage,
        language: "en",
        dynamic_variables: {
          dynamic_variable_placeholders: spec.dynamicVariablePlaceholders
        },
        prompt: {
          prompt: spec.prompt,
          tool_ids: toolIds,
          tools: [],
          enable_parallel_tool_calls: false,
          enable_reasoning_summary: false
        }
      }
    },
    platform_settings: { auth: { enable_auth: true } }
  };
}

function safeAgentState(agent, spec, toolIds) {
  const configuration = agent.conversation_config ?? {};
  const prompt = configuration.agent?.prompt ?? {};
  const placeholders = configuration.agent?.dynamic_variables?.dynamic_variable_placeholders ?? {};
  return {
    nameMatches: agent.name === spec.agentName,
    firstMessageMatches: configuration.agent?.first_message === spec.firstMessage,
    promptMatches: prompt.prompt === spec.prompt,
    durationMatches: configuration.conversation?.max_duration_seconds === spec.maxDurationSeconds,
    dynamicVariablesMatch:
      stableJson(placeholders) === stableJson(spec.dynamicVariablePlaceholders),
    toolIdsMatch:
      Array.isArray(prompt.tool_ids) &&
      stableJson([...prompt.tool_ids].sort()) === stableJson([...toolIds].sort()),
    inlineToolsAbsent: Array.isArray(prompt.tools) && prompt.tools.length === 0,
    parallelToolsDisabled: prompt.enable_parallel_tool_calls === false,
    reasoningSummaryDisabled: prompt.enable_reasoning_summary === false,
    authenticationRequired: agent.platform_settings?.auth?.enable_auth === true
  };
}

function isAgentStateReady(state) {
  return Object.values(state).every(Boolean);
}

async function apiRequest(fetcher, apiKey, path, init = {}) {
  const response = await fetcher(new URL(path, API_BASE_URL), {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "xi-api-key": apiKey,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(
      `ElevenLabs ${init.method ?? "GET"} ${path} failed with status ${response.status}.`
    );
  }
  return response.status === 204 ? {} : response.json();
}

async function findExactTool(fetcher, apiKey, name) {
  const query = new URLSearchParams({ search: name, page_size: "100", types: "client" });
  const listed = await apiRequest(fetcher, apiKey, `tools?${query}`);
  const matches = (Array.isArray(listed.tools) ? listed.tools : []).filter(
    (tool) => tool?.tool_config?.name === name
  );
  invariant(
    matches.length <= 1,
    `Multiple ElevenLabs tools named ${name}; refusing an ambiguous update.`
  );
  if (matches.length === 0) return null;
  return apiRequest(fetcher, apiKey, `tools/${encodeURIComponent(matches[0].id)}`);
}

async function reconcileTool({ fetcher, apiKey, tool, apply }) {
  const desired = desiredToolConfig(tool);
  const existing = await findExactTool(fetcher, apiKey, tool.name);
  if (!existing) {
    if (!apply) return { name: tool.name, action: "create", id: null };
    const created = await apiRequest(fetcher, apiKey, "tools", {
      method: "POST",
      body: JSON.stringify({ tool_config: desired })
    });
    invariant(
      typeof created.id === "string" && created.id.length > 0,
      `Create ${tool.name} returned no ID.`
    );
    return { name: tool.name, action: "created", id: created.id };
  }
  const id = existing.id;
  invariant(typeof id === "string" && id.length > 0, `${tool.name} has no tool ID.`);
  if (containsDesired(existing.tool_config, desired))
    return { name: tool.name, action: "unchanged", id };
  if (!apply) return { name: tool.name, action: "update", id };
  await apiRequest(fetcher, apiKey, `tools/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ tool_config: desired })
  });
  return { name: tool.name, action: "updated", id };
}

export async function reconcileElevenLabsAgent({
  fetcher = fetch,
  apiKey,
  agentId,
  spec = loadAgentSpec(),
  mode = "preview"
}) {
  invariant(["preview", "apply", "verify"].includes(mode), "Unsupported reconciliation mode.");
  const apply = mode === "apply";
  const before = await apiRequest(fetcher, apiKey, `agents/${encodeURIComponent(agentId)}`);
  invariant(before.agent_id === agentId, "ElevenLabs returned a different agent.");
  const tools = [];
  for (const tool of spec.tools) {
    tools.push(await reconcileTool({ fetcher, apiKey, tool, apply }));
  }
  const knownToolIds = tools.map(({ id }) => id).filter((id) => typeof id === "string");
  if (!apply && knownToolIds.length !== 2) {
    return {
      mode,
      specHash: hash(spec),
      promptHash: hash(spec.prompt),
      tools: tools.map(({ name, action }) => ({ name, action })),
      agentReady: false,
      agentAction: "wait_for_tool_ids"
    };
  }
  const patch = buildAgentPatch(spec, knownToolIds);
  const beforeState = safeAgentState(before, spec, knownToolIds);
  if (mode === "verify") {
    invariant(isAgentStateReady(beforeState), "ElevenLabs agent configuration drift detected.");
    return {
      mode,
      specHash: hash(spec),
      promptHash: hash(spec.prompt),
      tools: tools.map(({ name, action }) => ({ name, action })),
      agentReady: true,
      agentAction: "unchanged"
    };
  }
  if (apply && !isAgentStateReady(beforeState)) {
    await apiRequest(fetcher, apiKey, `agents/${encodeURIComponent(agentId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  }
  const after = apply
    ? await apiRequest(fetcher, apiKey, `agents/${encodeURIComponent(agentId)}`)
    : before;
  const afterState = safeAgentState(after, spec, knownToolIds);
  if (apply)
    invariant(
      isAgentStateReady(afterState),
      "ElevenLabs agent did not match the versioned spec after update."
    );
  return {
    mode,
    specHash: hash(spec),
    promptHash: hash(spec.prompt),
    tools: tools.map(({ name, action }) => ({ name, action })),
    agentReady: isAgentStateReady(afterState),
    agentAction: isAgentStateReady(beforeState) ? "unchanged" : apply ? "updated" : "update"
  };
}

function parseMode(arguments_) {
  invariant(arguments_.length <= 1, "Use no flag, --verify, or --apply.");
  if (arguments_.length === 0) return "preview";
  if (arguments_[0] === "--verify") return "verify";
  if (arguments_[0] === "--apply") return "apply";
  throw new Error("Use no flag, --verify, or --apply.");
}

const invokedPath = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const spec = loadAgentSpec();
    const provider = loadProviderEnvironment();
    const result = await reconcileElevenLabsAgent({
      ...provider,
      spec,
      mode: parseMode(process.argv.slice(2))
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "ElevenLabs agent reconciliation failed."
    );
    process.exitCode = 1;
  }
}
