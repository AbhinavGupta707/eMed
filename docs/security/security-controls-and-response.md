# Authentication, integrity, supply chain, and response

## Authentication and authorization

Current identity is a synthetic demo mechanism:

- signed cookie payload contains session ID, role (`patient`, `clinician`, or system), optional synthetic patient scope, expiry, and `synthetic_demo` classification;
- signature uses the server-only demo secret; cookie attributes are `Secure`, `HttpOnly`, and `SameSite=Strict`;
- patient routes enforce matching patient scope and clinician routes enforce role;
- development-only loopback can use an explicit role header when no demo secret exists;
- state-changing requests also require exact origin.

This is not real authentication. There is no browser login/session issuance, OIDC/OAuth, MFA, password recovery, user lifecycle, tenant boundary, RBAC/ABAC policy store, purpose-of-use, break-glass, consent management, or per-session revocation. Vercel deployment protection is an additional demo control, not a replacement for application identity. Do not handle real data.

## Audit, idempotency, and concurrency

- Every round transition checks the expected state and version; stale or invalid transitions fail.
- Clinician mutations use optimistic concurrency and audited before/after metadata.
- Clinical tasks and action executions use unique idempotency keys; duplicate attempts are suppressed and incompatible reuse is rejected.
- Task/action/audit effects that must agree are committed in a PostgreSQL transaction.
- Audit events include actor/source, patient/round, correlation, event/schema version, time, and bounded payload.
- PostgreSQL rejects ordinary audit update/delete; reserved event types must be written through transactional repository methods.
- Standalone audit payloads recursively reject credentials, transcript, and raw-media keys.

These guarantees rely on PostgreSQL for multi-instance operation. `in_memory_demo_fallback` is deterministic test/recovery behavior, not hosted concurrency evidence. Database-owner activity, migration DDL, and the exact demo reset remain privileged exceptions that need operator audit.

## Provider credentials and tokens

- Keep `DATABASE_URL`, `DEMO_ACCESS_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and `VITALLENS_API_KEY` in server environment storage only.
- Prefer provider service-account keys with the minimum endpoint/quota scope; never use a personal key when service accounts are available.
- The ElevenLabs browser receives only a bounded session token. The VitalLens browser never receives its API key or direct production credential.
- Never place secrets in `NEXT_PUBLIC_*`, build arguments, fixture files, screenshots, Vercel URLs, GitHub workflow inputs, CLI arguments captured in shell history, or logs.
- Rotate after any suspected disclosure. Rotating the demo secret also invalidates demo cookies and changes the derived assessment-attestation secret.

## Supply-chain posture

The default CI path:

- uses read-only `GITHUB_TOKEN` permissions, concurrency cancellation, job timeouts, and no live provider/deployment secrets;
- pins checkout, Node setup, artifact upload, and Gitleaks actions to verified full commit SHAs;
- installs exact Node 22.22.2 and pnpm 10.33.0, then uses `pnpm install --frozen-lockfile`;
- runs format, lint, strict types, package/unit/contract/integration/demo suites, production build, browser journeys, accessibility, performance, full-history secret scan, and browser-bundle key-marker inspection;
- uploads Playwright diagnostics only on failure for three days.

The normal CI intentionally does **not** run `pnpm audit`. A prior local rerun was refused because it would disclose the workspace dependency graph/private workspace package names to npm. `.github/workflows/dependency-advisory.yml` is manual-only, requires an affirmative privacy input, and targets a GitHub environment named `dependency-advisory-approved`. The repository administrator must configure a required reviewer on that environment before first use. Only a successful run for the candidate SHA is current advisory evidence.

Dependabot alerts/security updates are an alternative only after the owner approves GitHub dependency-graph processing and enables the repository settings. Do not treat a checked-in manifest, a historical audit, or “no alert visible” as a current scan.

Known gaps before a pilot:

- pin the PostgreSQL service/local image by reviewed digest rather than the mutable `postgres:17-alpine` tag;
- add reviewed dependency-diff policy, SBOM/provenance/signing, license review, and artifact verification;
- review third-party action source and update pins intentionally through owner-reviewed pull requests;
- enable branch protection with required CI jobs, CODEOWNERS review for workflow/security/deployment changes, signed commits/tags as appropriate, and no administrator bypass for release gates;
- run penetration, configuration, and cloud/IAM reviews.

GitHub public-repository secret scanning is a complementary control; push protection and private vulnerability reporting require repository-admin verification. Gitleaks is not proof that a value was never exposed elsewhere.

## Incident response

Use [the operations incident playbook](../operations/incident-recovery-observability.md). Security-specific minimums:

1. Contain the deployment/provider and protect users; do not copy raw payloads as evidence.
2. Rotate every credential whose exposure cannot be ruled out and invalidate demo sessions.
3. Preserve safe Git SHA, deployment/database/provider versions, timestamps, correlation IDs, and access/audit records.
4. Assess source, browser bundles, Git history, GitHub artifacts/alerts, Vercel environment/log access, Neon roles/branches, and provider dashboards.
5. Notify the repository owner and affected processors; follow their credential and breach procedures.
6. Restore only from a verified code/database point and rerun secret, state, idempotency, raw-media, and claim gates.
7. Record root cause, affected boundary, dwell time, rotations, deletion/retention decisions, recovery evidence, and follow-ups without sensitive content.

Use GitHub private vulnerability reporting when the repository administrator has enabled it; do not post exploitable secrets or raw data in a public issue.

## Explicit clinical and product limitations

- Not clinically validated, not a medical device, not diagnostic, and not intended for treatment/medication decisions or clinical monitoring.
- Fictional protocol thresholds, red flags, patient wording, priority, owner, and service window have not been approved for care.
- Local finger PPG and VitalLens estimate pulse for synthetic demonstration only. No ECG, rhythm/arrhythmia, oxygen saturation, blood pressure, respiratory diagnosis, or validated accuracy claim exists.
- VitalLens itself describes its API as general-wellness only. A passing provider response is still rejected unless HomeRounds quality/status gates pass.
- One iPhone/browser run would show feasibility only. Playwright's iPhone profile is not physical Safari/camera/torch/permission/thermal evidence.
- Voice is accessibility-optional; transcript must be editable/confirmed. ElevenLabs output cannot replace structured safety questions.
- No live eMed/EHR integration, real care-team task delivery, SLA monitoring, paging, messaging, or emergency-service contact exists.
- No validated availability, disaster-recovery objective, support/on-call service, device/population matrix, accessibility assistive-technology sign-off, or post-market monitoring exists.

Before real use: define intended purpose and regulatory status; complete DCB0129/DCB0160 work as applicable, clinical safety case/hazard log, DPIA/records of processing/retention, identity/tenancy/access controls, vendor agreements/residency, device/population validation, usability/accessibility studies, security testing, backup/restore objectives, incident/on-call operations, protocol governance/signing/expiry, and qualified clinical approval.

## Official GitHub references checked 17 July 2026

- [Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
- [Least-privilege `GITHUB_TOKEN`](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)
- [Dependabot quickstart and dependency graph](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/dependabot-quickstart)
- [Secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)
