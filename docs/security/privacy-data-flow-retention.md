# Privacy, data flow, and retention

## Data classification

The only permitted application data is `synthetic_demo`. The checked-in FHIR bundle, scenario identifiers, reports, tasks, screenshots, traces, and databases must remain fictional. Do not enter volunteer, attendee, employee, clinician, or patient health information into the demo.

HomeRounds data minimization is an architectural boundary, not consent to process real health data.

## Implemented flows

| Flow                      | Leaves browser?                                                                                              | HomeRounds durable storage                                                                                                                             | External processor / boundary                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Synthetic FHIR fixture    | Sent to HomeRounds API as bounded snapshot/facts when requested                                              | Normalized synthetic snapshot/facts with provenance                                                                                                    | Vercel and Neon in hosted shape                                                          |
| Structured patient report | Confirmed enum answers and input mode go to API                                                              | Confirmed structured answers in audit-derived evidence. Optional note/transcript is deliberately not persisted; event records `freeTextStored: false`. | Vercel and Neon                                                                          |
| Local finger PPG          | No camera frames or derived time series are sent by the provider path                                        | Passing derived heart-rate fact, quality/provenance/device metadata, and `rawMediaRef: null`; failures create no number                                | None for capture processing; ordinary HomeRounds result API afterward                    |
| VitalLens                 | Consent-gated 40×40 RGB frame bytes plus bounded metadata go to HomeRounds, then the fixed provider endpoint | Only normalized passing result/quality/provider provenance; no input bytes/video or raw provider response                                              | Rouast/VitalLens API in US `us-east-2` according to provider documentation               |
| ElevenLabs voice          | Browser audio/WebRTC and presentation events go to ElevenLabs after a server-issued token                    | HomeRounds stores the patient-confirmed structured report and safe session provenance, not raw audio or transcript                                     | ElevenLabs account/environment; retention/residency depends on reviewed account features |
| Clinician workflow        | Bounded synthetic note/action commands go to HomeRounds API                                                  | Task state, safe evidence references, attempts, before/after audit metadata                                                                            | Vercel and Neon                                                                          |
| Application errors        | Safe machine code, status, correlation, bounded schema issues                                                | PostgreSQL audit where domain-relevant; default structured runtime logger is no-op                                                                     | Vercel platform may still produce framework/function logs                                |
| CI browser diagnostics    | Synthetic UI/network trace only; no live provider or deployment secret is configured                         | GitHub failure artifact for three days                                                                                                                 | GitHub Actions                                                                           |

## Raw-media and transcript boundary

### Local finger PPG

Camera frames exist only transiently in browser memory for local signal extraction. Tracks/workers must stop on success, failure, cancel, navigation, page hide, timeout, or unmount. Frames and sample buffers are not part of the provider result, API payload, database schema, logs, or network flow.

### VitalLens

VitalLens is not an on-device claim. The browser/preprocessor supplies low-resolution frames to the HomeRounds server proxy after explicit synthetic-demo consent. The server enforces request identity, consent/version metadata, 40×40 dimensions, byte length, a 5 MB limit, timeout, fixed upstream, and strict response normalization, then overwrites its input buffer. HomeRounds does not persist the frame payload.

VitalLens currently states that input video is processed in volatile memory and deleted after inference, that only preprocessed low-resolution frames are accepted, that the API is hosted in US `us-east-2`, and that explicit biometric/health-data consent is mandatory. Those are provider statements, not independent HomeRounds verification. The API is general-wellness only and not a medical device.

### ElevenLabs

The HomeRounds server sends its long-lived API key only to the ElevenLabs token endpoint and returns a short-lived WebRTC token to the authenticated browser. Voice audio does not traverse the HomeRounds application server. Tentative/final transcript is presentation state in memory; only a patient-confirmed structured report becomes workflow evidence.

The `eu-residency` configuration value does not by itself guarantee residency or zero retention. ElevenLabs documents isolated residency and Zero Retention as separately enabled account/contract features, with processing/subprocessor limitations. Keep voice disabled until the key, agent, workspace, residency, retention, history/redaction settings, DPA/BAA needs, and subprocessors are explicitly reviewed.

## Retention inventory

| Store                                 | Current retention/deletion                                                                                      | Boundary                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Browser camera/audio/transcript state | Session/capture lifetime; cleanup is required on every terminal/lifecycle path                                  | No durable browser storage is intended                                 |
| PostgreSQL rounds/facts/tasks/audit   | No TTL. Persists until exact demo reset or database/branch removal. Audit is append-only in ordinary operation. | Synthetic-only; not a production retention schedule                    |
| Measurement raw media                 | Forbidden: `raw_media_ref` must be null and startup refuses raw-media storage                                   | No object-storage implementation exists                                |
| HomeRounds runtime logs               | Default safe logger is no-op; platform logs follow Vercel settings                                              | Never enable request bodies/provider tracing                           |
| GitHub Playwright failure artifact    | Three days, failure only                                                                                        | May contain synthetic UI content; access-control as diagnostic data    |
| Vercel deployment/build logs          | Provider/project policy                                                                                         | Verify plan retention and access before deploy; no secrets/payloads    |
| Neon history/snapshots/backups        | Selected plan and configured restore window                                                                     | Defaults change; record observed settings and test restore             |
| ElevenLabs content/history            | Provider account/config/contract                                                                                | HomeRounds cannot assert zero retention without observed configuration |
| VitalLens request                     | Provider states process-and-delete after inference                                                              | Verify contract/settings before any non-synthetic consideration        |

`demo:reset` is not a general erasure workflow. It deletes and reseeds only three exact synthetic scenarios, temporarily disabling the append-only trigger inside that transaction. A real service would need data-subject rights, legal hold, audit-preserving erasure design, consent records, retention schedules, backup expiry, and processor deletion verification.

## Logging rules

Allowed: event type, timestamp, release/deployment ID, correlation ID, safe error code/status, role kind, provider/version, duration bucket, quality status/reason enum, protocol/rule ID, idempotency outcome, and explicit false absence flags.

Forbidden: authorization/cookies, database URLs, keys/secrets/tokens, patient-like names, free text/notes/transcripts, audio, video/image/frame/sample bytes, provider request/response bodies, raw headers, and full unbounded Zod/request payloads.

## Provider and platform references checked 17 July 2026

- [VitalLens privacy and legal boundary](https://docs.rouast.com/guides/privacy/)
- [VitalLens general-wellness limitation](https://www.rouast.com/api/)
- [ElevenLabs WebRTC token endpoint](https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token)
- [ElevenLabs API-key guidance](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys)
- [ElevenLabs data residency and Zero Retention limitations](https://elevenlabs.io/docs/overview/administration/data-residency)
- [Neon pooling and direct-connection guidance](https://neon.com/docs/connect/connection-pooling)
