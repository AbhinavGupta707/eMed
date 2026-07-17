# HomeRounds

HomeRounds is a synthetic hackathon prototype for adaptive asynchronous clinical rounds. It combines longitudinal context, the smallest useful next assessment, deterministic safety/protocol logic, quality-gated optical capture, an idempotent clinician task, and a clear patient next step.

It is not clinically validated and must not be used with real patient data or for medical decisions.

## Local baseline

Requirements: Node 22.22.2+, pnpm 10.33.0, and (from Checkpoint 1 onward) PostgreSQL.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

The no-key profile uses `VOICE_PROVIDER=disabled` and local finger PPG as the release default. ElevenLabs and VitalLens are optional live adapters with server-only credentials.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

See `planning/README.md` for the product/architecture package and `docs/orchestration/STATE.md` for the active checkpoint.
