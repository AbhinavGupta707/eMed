# HomeRounds inference boundary

`@homerounds/inference` is the server-only, synthetic-demo inference foundation for HomeRounds.
It permits a model to propose bounded evidence fields; it never gives a model workflow authority.

## Authority and data boundary

- Deterministic code creates the candidate allowlist, chooses the fallback, owns the red-flag and
  capture-quality gates, evaluates protocols, sets urgency, and executes allowlisted actions.
- Adaptive inference may return one already-listed eligible `candidateModuleId` or explicitly
  abstain. Every evidence reference must name an item in the supplied bounded context.
- The provider cannot create round, state, candidate, evidence, action, or fact IDs. The server adds
  `roundId` and `stateVersion` to a validated decision; they are never accepted from model output.
- `AdaptiveSelectionService` reads the current authority state before and after inference. A stale
  version, missing round, non-synthetic state, or non-clear red-flag gate refuses the proposal.
- Prompts and provider responses are ephemeral. Do not log or persist them. Persist only the frozen
  envelope/outcome fields, whose provenance is limited to an attempt ID, provider/task/model aliases,
  contract version, timestamp, bounded duration, and optional token counts.
- Never place a Fireworks key in a browser bundle. The transport accepts a server-injected key and
  does not read environment variables itself.

## Deterministic model routing

The allowlist is fixed in `model-router.ts`:

| Task                        | Modality    | Fireworks model                             | Reasoning |
| --------------------------- | ----------- | ------------------------------------------- | --------- |
| Adaptive module selection   | text        | `accounts/fireworks/models/deepseek-v4-pro` | `none`    |
| Medication-label extraction | vision only | `accounts/fireworks/models/kimi-k2p6`       | `none`    |

Task, contract, and modality must agree. Kimi K2.6 cannot be routed to text selection, and a vision
request must contain an image content part. Models never choose their own route.

## Composition

Construct `FireworksChatCompletionsTransport` with injected fetch, clock, ID, and abort-aware sleep
implementations. Wrap it in `StructuredAdaptiveSelectionProvider`, then put that provider behind
`AdaptiveSelectionService` with a current-state reader. The service—not the transport—is the safe
entry point for a workflow because it performs the final stale-state and deterministic-gate checks.

Use `DisabledStructuredCompletionTransport` or `DisabledAdaptiveSelectionProvider` for the no-key
profile. `FakeStructuredCompletionTransport` and `FakeAdaptiveSelectionProvider` support keyless,
deterministic fixtures. They pass through the same frozen output schemas and authority service.

## Timeout, retry, and errors

The Fireworks boundary has one hard deadline across the request, response-body read, retry waits,
and all attempts. Caller cancellation aborts the in-flight fetch. Only rate limits, Fireworks 5xx
responses, and transport failures are retryable, with exponential or bounded `Retry-After` delays
and at most four configured attempts. Authentication, malformed output, contract rejection,
cancellation, and an exhausted hard timeout are not retried.

Callers receive only the frozen redacted failure taxonomy. HTTP bodies, provider IDs, response IDs,
exception text, prompts, and raw content are never included in an error.

## Checks

The normal package suite is keyless:

```bash
pnpm --filter @homerounds/inference lint
pnpm --filter @homerounds/inference typecheck
pnpm --filter @homerounds/inference test
pnpm --filter @homerounds/inference build
```

The live Fireworks test is deliberately separate and skipped unless both explicit opt-in and a
server-only key are supplied. It runs three consecutive exact-contract trials:

```bash
RUN_LIVE_FIREWORKS_TESTS=true FIREWORKS_API_KEY='<server-only>' \
  pnpm --filter @homerounds/inference exec vitest run src/fireworks.live.test.ts
```

Live connectivity or fixture evidence is not release evidence by itself. Follow the Checkpoint 7
integration gates before enabling a hosted provider.

Provider wire shapes follow the official
[Chat Completions API](https://docs.fireworks.ai/api-reference/post-chatcompletions) and
[structured outputs guide](https://docs.fireworks.ai/structured-responses/structured-response-formatting).
