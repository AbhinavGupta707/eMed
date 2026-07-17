# Release, hosted deployment, and rollback

This is a deploy-ready procedure, not deployment evidence. Vercel, Neon, live providers, and physical iPhone checks require owner access and remain pending until observed.

## Release gate

Run from a clean checkout of the exact candidate SHA:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:demo
pnpm build
pnpm test:e2e
pnpm test:e2e:patient
pnpm test:e2e:clinician
pnpm test:a11y
pnpm test:performance
git diff --check
```

These checks use fixtures, Chromium, and an iPhone-sized WebKit Playwright profile. They do not prove a physical iPhone, physical Safari permissions/torch/thermal behavior, a live provider, or a hosted deployment.

## Neon preparation

1. Create a PostgreSQL 17 project/branch in an approved region near the Vercel function region. The checked-in Vercel configuration selects London (`lhr1`); confirm the chosen Neon region rather than assuming co-location.
2. Create separate least-privilege runtime and migration roles when the account supports it. The migration role owns schema changes; the runtime role should not own or alter schema.
3. Keep two URLs out of source control: a direct URL for migration/backup and a pooled `-pooler` URL for serverless runtime.
4. Apply migrations through the direct URL as described in [the migration runbook](./postgresql-and-migrations.md).
5. Run the candidate against a rehearsal branch, seed/check it, and record that the runtime profile is `postgres`.
6. Configure and test the actual Neon history-retention/snapshot policy for the selected plan. Defaults and limits change; do not claim recovery until a restore rehearsal succeeds.

Neon recommends direct connections for ORM migrations and `pg_dump`; pooled URLs use PgBouncer transaction mode and are intended for concurrent application traffic.

## Vercel project preparation

For Git import, set:

- Root Directory: `apps/web`.
- Include source files outside the Root Directory: enabled, because the app imports workspace packages and root lock/config files.
- Framework: Next.js.
- Node.js: 22.x; record the exact build/runtime version and keep it within the root engine range.
- Install command: the value in `infra/deploy/vercel.json`.
- Build command: `pnpm build` from `apps/web`.
- Function region: London (`lhr1`) unless the reviewed database placement requires another checked-in change.
- Deployment protection: enabled for the public synthetic demo.

`infra/deploy/vercel.json` is an actual Vercel configuration file but is outside the application root because Checkpoint 4D does not own `apps/web`. A CLI operator can pass it with Vercel's `--local-config` option. Automatic Git deployments will not discover it at this location; the integration owner must either reproduce the reviewed settings in the dashboard or place an approved copy at `apps/web/vercel.json`.

Set the variables from `infra/deploy/hosted-demo.env.example` in the Vercel environment store. In particular:

- `APP_ENV=demo` and `DEMO_MODE=true` (synthetic only);
- `APP_BASE_URL` is the exact stable HTTPS origin for that deployment;
- `DATABASE_URL` is the pooled Neon runtime URL;
- `DEMO_ACCESS_SECRET` is a new random server-only secret;
- `VOICE_PROVIDER=disabled`, `OPTICAL_ASSESSMENT_PROVIDER=finger_ppg`, `STORE_RAW_MEDIA=false`, and `ENABLE_PROVIDER_TRACING=false` for the no-key baseline.

Vercel environment changes apply only to new deployments. Preview URLs vary, while the application uses one exact `APP_BASE_URL` for mutation-origin checks. A preview needs its own matching branch-specific value and redeploy; do not test mutations on a preview configured with the production origin.

## Current central-only promotion blockers

1. **Browser demo session issuance:** the server validates signed cookies, but no login/session-issuance route or operator utility installs the browser cookie. `APP_ENV=demo` therefore returns `401` to an ordinary browser. Do not deploy as `APP_ENV=development` to bypass this boundary.
2. **Database fail-closed:** absent `DATABASE_URL` selects in-memory state instead of failing startup. Promotion must block unless `demo:check` and API metadata show `postgres`; a central environment rule should eventually require PostgreSQL for hosted demo mode.
3. **Git-discovered Vercel config:** the checked-in configuration is not at the Vercel application root. Dashboard replication or an integration-owned `apps/web/vercel.json` is required.
4. **No health/readiness endpoint:** use the root page plus authenticated `demo:check`; a dedicated readiness endpoint is a central application change.

## Deploy and verify

After the blockers are resolved and account access is approved:

1. Deploy a preview of the exact candidate using the linked Git project or Vercel CLI with the reviewed local config.
2. Inspect build logs for the frozen install, Node/pnpm versions, and absence of environment values.
3. Verify HTTPS and the security headers from `infra/deploy/vercel.json`.
4. Apply/confirm migrations, then run `demo:seed` and `demo:check` against the exact HTTPS origin using the server-side demo secret. Require `(postgres)`.
5. Open new patient and clinician sessions, complete the no-key text/poor-quality path, cold-start another instance, and verify shared persisted state.
6. Inspect browser bundles for server-only configuration markers and network/storage for raw media.
7. Keep providers disabled until their separate opt-in checks pass.
8. Promote/alias only the verified deployment; record URL, Vercel deployment ID, Git SHA, environment revision, database branch, migration hashes, and operator.

## Rollback

### Code-only failure with compatible schema

1. Stop promotion and preserve correlation/deployment IDs without copying sensitive request bodies.
2. Run `vercel rollback` to the immediately previous deployment, or `vercel rollback <deployment-url>` where the plan supports a selected target.
3. Run `vercel rollback status`, root-page checks, and authenticated `demo:check`.
4. Confirm that the restored deployment still points to a compatible database and has the expected environment snapshot.

### Provider/configuration failure

Set `VOICE_PROVIDER=disabled` and/or select `finger_ppg`, leave raw media/tracing off, and create a new deployment. Do not switch optical providers inside an active round; start a new assessment with explicit provenance and consent where required.

### Database or incompatible-migration failure

Vercel rollback alone is insufficient. Stop writes, use Neon Time Travel/branch restore to create and inspect a recovery branch inside the configured retention window, verify counts and invariants, switch the runtime URL through a new deployment, then run `demo:check`. Do not mutate or delete the damaged branch until evidence and recovery are accepted.

For this synthetic prototype, reseeding a new empty branch is an acceptable demo recovery when loss is explicitly declared. It is not a real-patient backup strategy.

## Official platform references checked 17 July 2026

- [Vercel Turborepo deployment](https://vercel.com/docs/monorepos/turborepo)
- [Vercel local configuration option](https://vercel.com/docs/cli/global-options)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel production rollback](https://vercel.com/docs/deployments/rollback-production-deployment)
- [Neon manual Vercel connection](https://neon.com/docs/guides/vercel-manual)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
