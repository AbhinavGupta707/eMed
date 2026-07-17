# VitalLens face-rPPG adapter

This browser adapter implements only the frozen HomeRounds optical-assessment contract and exposes only a quality-gated heart-rate estimate. It does not expose respiratory rate, HRV, SpO2, blood pressure, rhythm interpretation, or diagnosis.

## Boundary

- Registration/configuration is checked before capability, consent, camera, or transport work. Missing or invalid configuration returns typed `missing_configuration`.
- Configuration contains a HomeRounds origin and same-origin proxy path. There is no API-key field and no direct provider URL. Live origins require HTTPS; HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]` in development.
- Consent explicitly names the cropped/downsampled frame flow through the HomeRounds server proxy. Consent must be granted before the front camera opens.
- The injected camera session supplies an audio-free, bounded inference payload. The adapter validates byte count, dimensions, frame count, duration, and content type before calling the proxy transport.
- Raw bytes exist only between the injected camera session and injected transport. They are never included in normalized results or errors, there is no logger seam, and the byte buffer is zeroed after every outcome. Camera tracks must be stopped by the session's `stop()` implementation; the adapter calls it after success, failure, timeout, cancellation, and disposal.
- The Checkpoint 2 proxy owns server authentication, provider credentials, origin/rate limits, request-size enforcement, redacted server logging, and provider retention enforcement. The transport must not retain the request buffer after `send()` settles.
- A session receives one coached retry for provider quality. A second retry-quality response is normalized to terminal failure with no measurement.

## Explicit later gates

Fixture success is not live-provider or device evidence. Live VitalLens performance, commercial terms/pricing, provider retention/residency and health-data agreements, acceptance of the third-party frame-processing boundary, and comparison against the physical iPhone path remain explicit human/provider release gates. This synthetic hackathon adapter is not clinically validated software.
