# HomeRounds companion substrate

This package owns the short-lived, one-round phone pairing state machine. It has no provider,
protocol, capture-quality, urgency, or care-action authority.

## Integration ports

- `CompanionRoundAuthorityPort` supplies the server-validated current round version, selected task,
  allowed task kinds, owner scope, and consent requirement.
- `CompanionPairingRepository` persists keyed token hashes, opaque session hashes, versioned state,
  derived result proposals, and idempotency receipts. `exchange`, `commitSessionMutation`,
  `revokePairing`, and `replacePairing` must each be atomic.
- `CompanionCryptoPort` supplies a 256-bit pairing token, deterministic opaque session tokens, keyed
  hashes, and request fingerprints. Keys stay server-only.
- Clock and identifier sources are injected so expiry, replay, and concurrency behavior remain
  deterministic under test.

The in-memory repository is development/test-only. Hosted integration must register a durable
adapter with a unique active-pairing constraint per round, unique token/session hashes, unique
`(session_id, operation_id)` receipts, optimistic version checks, and transactionally coupled
pairing/session/result updates.

Phone result records are proposals with `pending_deterministic_workflow` status. A companion session
cannot accept quality, advance a round, set urgency, execute an action, or acknowledge its own
result. Raw frames, images, video, PCM, transcript, prompts, provider payloads, hidden reasoning, and
keys are outside every result schema.
