# HomeRounds database foundation

The checked-in migrations are the source-controlled empty-database bootstrap for
the synthetic HomeRounds prototype. Apply it only to a dedicated PostgreSQL
database. Drizzle commands read `DATABASE_URL` at invocation time; no credential
is stored in this repository.

Action task creation, idempotency registration, attempt recording, and audit
append are committed in one short application transaction. The unique
`action_executions.idempotency_key` constraint is the database concurrency
authority. Audit rows are protected by a trigger that rejects update and delete.

Companion records are stored as JSONB objects, not JSON-encoded strings. The
integrity migration makes that representation a database invariant so malformed
server records fail at write time instead of being misclassified as client input.

Real-database tests use a temporary PostgreSQL schema and skip visibly when
`DATABASE_URL` is not present.

Run Drizzle from the repository root with
`pnpm --filter @homerounds/persistence exec drizzle-kit --config=../../infra/db/drizzle.config.ts <command>`.
