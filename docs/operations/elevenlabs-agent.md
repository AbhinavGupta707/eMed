# ElevenLabs voice-agent operations

HomeRounds uses one existing private ElevenLabs agent for the optional live browser conversation. The versioned specification is [agent-spec.v1.json](../../infra/providers/elevenlabs/agent-spec.v1.json). It defines the prompt, four bounded synthetic dynamic variables, a 120-second cap, and exactly two client tools. The browser—not ElevenLabs—implements those tools, and neither tool can confirm a report, choose urgency, select a test, or execute an action.

## Safe reconciliation

Keep `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in `apps/web/.env.local` for local work or in the server-only Vercel environment. Never pass a key as a CLI argument.

Run the read-only preview first:

```bash
pnpm elevenlabs:preview
```

The preview prints only specification hashes, tool names/actions, and readiness. It does not print the key, agent ID, prompt, provider payload, transcript, or audio.

ElevenLabs accepts a documented JSON-schema subset for client-tool hints. The script projects the versioned strict schema into that provider dialect, including its nullable-string tuple and omission of unsupported keywords. The browser still parses every actual call with the original strict Zod contract, so this projection never widens workflow authority or permits extra fields to mutate state.

Apply only after the matching client-tool code and tests are on the release branch:

```bash
pnpm elevenlabs:apply
pnpm elevenlabs:verify
```

The apply command updates exact-name tools in place, creates a missing exact-name tool, refuses duplicate names, and updates the configured agent. It does not delete tools or create a duplicate agent. The final read-back must match the versioned spec or the command fails.

The provider may hydrate the exact referenced tools into the read-back `prompt.tools` array even when the update request sends an empty inline list plus `tool_ids`. Verification accepts only an absent/empty list or exactly the two expected names; any additional or renamed tool is drift.

## Live evidence gate

Configuration success is not live-conversation evidence. Before presenting voice as live, verify all of the following with synthetic content only:

1. the authenticated HomeRounds credential endpoint returns a short-lived token and the same `global` server location used by the browser SDK;
2. an installed browser connects, asks for microphone permission, and visibly shows the editable proposal;
3. the agent calls only `propose_patient_report` and `request_next_round_step`;
4. unknown/unsure answers remain unresolved, a malformed call cannot mutate state, and the patient explicitly reviews the proposal;
5. timeout, denial, disconnect, and no-key paths recover to complete text input;
6. HomeRounds persistence and logs contain no raw audio or raw transcript.

The account's privacy, retention, residency, subprocessors, quota, and contractual terms remain separate owner/provider evidence. `ELEVENLABS_SERVER_LOCATION=global` is routing configuration, not a zero-retention or residency guarantee.
