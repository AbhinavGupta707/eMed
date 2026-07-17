# HomeRounds security and clinical-safety boundary

HomeRounds is a fictional, synthetic-data hackathon prototype. “Production-grade” in this repository means explicit boundaries, deterministic workflow authority, validation, idempotency, privacy defaults, and honest operations documentation. It does not mean clinical validation, regulatory approval, real-patient readiness, or a medical-device claim.

## Non-negotiable controls

- The deterministic state machine, red-flag gate, capture-quality gate, versioned protocol evaluator, action allowlist, approval rules, idempotency, and persistence transactions own workflow authority.
- A voice/model/provider may propose only schema-valid content for explicit patient confirmation. It cannot choose urgency, diagnose, change treatment, advance arbitrary state, or execute an action.
- A failed, uncertain, missing, or low-quality capture produces no measurement fact.
- Local finger PPG keeps frames in browser memory and sends none. HomeRounds persists no raw camera frames, video, voice audio, or transcript.
- VitalLens is optional, server-keyed, consent-gated, and unavailable without its proxy/key. It changes the boundary because low-resolution frames transit a US third-party service.
- ElevenLabs is optional. The complete text path is authoritative and works with no provider key.
- All fixtures are visibly synthetic. No real identifiers, participant health data, or credentials belong in source, tests, logs, screenshots, or demo databases.

## Documents

- [Threat model](./threat-model.md)
- [Privacy, data flow, and retention](./privacy-data-flow-retention.md)
- [Authentication, audit, supply chain, incident response, and limitations](./security-controls-and-response.md)

## Release-blocking limitations

- No OIDC/OAuth, MFA, real RBAC/ABAC, tenancy, purpose-of-use, break-glass, or clinical identity exists.
- Signed demo-cookie verification exists, but browser login/session issuance does not.
- Hosted demo mode does not fail startup when `DATABASE_URL` is absent; it can select in-memory state.
- Rate limiting is process-local and is not a distributed Vercel/serverless control.
- No complete CSP, WAF policy, centralized safe logger, metrics/alerting, SIEM, SBOM, artifact signing, penetration test, DPIA, clinical safety case, or validated device/population evidence exists.
- `APP_ENV=production` correctly rejects the synthetic fixture provider and is not currently deployable.

Any real-data pilot requires a new security/privacy/clinical architecture review, not a configuration toggle.
