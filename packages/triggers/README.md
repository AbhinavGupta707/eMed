# Synthetic proactive triggers

This package evaluates versioned, structured, synthetic longitudinal facts in a single bounded
scheduled or event invocation. It does not run a daemon, poll continuously, diagnose, set urgency,
accept capture quality, or create a round. A combined change emits only an explainable,
idempotently identified round-creation proposal and proposal event. The existing authoritative
red-flag, protocol, workflow, action, quality, and persistence layers must accept or reject it.

Unknown, missing, stale, mismatched, and conflicting facts fail closed without a proposal. Raw fact
values are absent from trigger explanations. The optional inference handoff contains fixed bounded
summaries, structured fact keys, and server-attested eligible candidates only; raw history, memory
values, transcripts, prompts, provider payloads, and hidden reasoning are excluded by schema.
