# Local PostgreSQL and migrations

Use only dedicated databases containing synthetic HomeRounds data. PostgreSQL 17 is the target dialect. The repository contains one forward-only bootstrap migration and no automated down migration or migration ledger.

## Start the local database

From the repository root:

```bash
docker compose -f infra/deploy/local-postgres.compose.yaml up -d postgres
docker compose -f infra/deploy/local-postgres.compose.yaml ps
export DATABASE_URL='postgresql://homerounds:homerounds@127.0.0.1:5432/homerounds'
```

The compose service binds only to loopback and keeps data in a named volume. Its default credential is intentionally local/demo-only. Override the `HOMEROUNDS_POSTGRES_*` variables for a shared workstation and do not reuse those values for Neon.

## Apply and verify the migration

Apply the checked-in SQL with `psql`; `ON_ERROR_STOP` and the migration's transaction make a failure visible and atomic:

```bash
psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f infra/db/migrations/0001_homerounds_foundations.sql
psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -c "select to_regclass('public.rounds'), to_regclass('public.audit_events');"
DATABASE_URL="$DATABASE_URL" pnpm --filter @homerounds/persistence test
```

The bootstrap is intentionally not idempotent. If `rounds` already exists, stop and identify the database and its schema state; do not ignore the error or run `drizzle-kit push`. For a clean rehearsal, create a new database/Neon branch and apply every migration in lexical order exactly once.

## Run and prepare the synthetic demo

Start the web application with the same `DATABASE_URL`:

```bash
APP_ENV=development DEMO_MODE=true \
  APP_BASE_URL=http://127.0.0.1:3000 \
  DATABASE_URL="$DATABASE_URL" \
  VOICE_PROVIDER=disabled OPTICAL_ASSESSMENT_PROVIDER=finger_ppg \
  pnpm --filter @homerounds/web dev --hostname 127.0.0.1 --port 3000
```

In a second terminal with the same `DATABASE_URL`:

```bash
pnpm demo:seed --base-url http://127.0.0.1:3000
pnpm demo:check --base-url http://127.0.0.1:3000
```

The check must print all three scenarios as ready and show `(postgres)`. If it reports `in_memory_demo_fallback`, stop: the process did not receive `DATABASE_URL`.

After a rehearsed scenario has progressed, the reset is deliberately narrow:

```bash
pnpm demo:reset --base-url http://127.0.0.1:3000
pnpm demo:check --base-url http://127.0.0.1:3000
```

Reset requires `psql` on `PATH`, refuses `APP_ENV=production`, requires `DEMO_MODE=true`, and deletes/reseeds only the three exact `homerounds-demo:v1:` scenarios. It temporarily disables the append-only audit trigger only inside that scoped transaction. It is not a general database reset or tenant-deletion tool.

## Migration discipline

1. Create a new migration; never edit an applied migration.
2. Review the SQL for locks, table rewrites, constraint validation, retention changes, raw-media columns, grants, and rollback implications.
3. Apply it first to a disposable empty PostgreSQL 17 database and run persistence/integration tests.
4. Apply it to a Neon branch created from the target and rehearse the application plus `demo:check`.
5. Record migration file hashes, start/end times, database branch, operator, release SHA, and results.
6. Take/verify the provider restore point before the target change.
7. Use a direct, non-pooled Neon connection for migrations and `pg_dump`. Use a pooled connection for serverless application traffic when verified with the driver.
8. Promote code only after the schema is compatible. Prefer expand/migrate/contract changes; Vercel code rollback cannot undo a database migration.

The current application consumes only `DATABASE_URL`; it has no separate migration URL. Operators must keep the direct URL out of Vercel runtime configuration and supply it only to the controlled migration command.

## Stop and recovery boundaries

```bash
docker compose -f infra/deploy/local-postgres.compose.yaml stop postgres
```

`docker compose ... down --volumes` permanently removes the local database volume. Use it only for an explicitly disposable synthetic database after confirming the Compose project and volume names.

There is no down migration. Recover a bad schema change by switching to a verified pre-migration branch/restore point, then deploy compatible code. Do not improvise destructive reverse SQL during an incident.
