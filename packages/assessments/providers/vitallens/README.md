# VitalLens face-rPPG adapter

This browser adapter implements only the frozen HomeRounds optical-assessment contract and exposes only a quality-gated heart-rate estimate. It does not expose respiratory rate, HRV, SpO2, blood pressure, rhythm interpretation, or diagnosis.

## Boundary

- Registration/configuration is checked before capability, consent, camera, or transport work. Missing or invalid configuration returns typed `missing_configuration`.
- Configuration contains a HomeRounds origin and same-origin proxy path. There is no API-key field and no direct provider URL. Live origins require HTTPS; HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]` in development.
- Consent explicitly names VitalLens/Rouast Labs, third-party processing, the cropped/downsampled frame flow through the HomeRounds server proxy, no audio, no raw-frame retention, and the no-measurement decline outcome. Consent must be granted before the front camera opens and is not silently reused by a new provider instance.
- The browser gateway checks secure-context, front-camera, and camera-permission state without prompting. The permission prompt occurs only after consent when capture opens the front camera. Page hide, backgrounding, caller cancellation, timeout, and disposal all stop tracks and clear camera/canvas state.
- Each browser frame is center-cropped, scaled locally to `40x40`, converted from RGBA to RGB24, and sampled at a bounded 15 fps. A single request contains 16–900 frames, at least five seconds of capture, no audio, and no more than the configured payload limit. These limits match the provider file API while conserving frame-credit budget.
- Raw bytes exist only between the injected camera session and injected transport. They are never included in normalized results or errors, there is no logger seam, and the byte buffer is zeroed after every outcome. Camera tracks must be stopped by the session's `stop()` implementation; the adapter calls it after success, failure, timeout, cancellation, and disposal.
- The proxy owns server authentication, the server-only provider key, origin/rate limits, request-size enforcement, a bounded replay-request history, consent freshness, timeout/cancellation, and strict provider-result normalization. Upstream quota is typed as unavailable. Browser and server buffers are zeroed after every outcome and no response forwards waveforms or other provider payload fields.
- A session receives one coached retry for provider quality. A second retry-quality response is normalized to terminal failure with no measurement.

## Explicit later gates

Fixture success is not live-provider or device evidence. Live VitalLens performance, plan limits/pricing, acceptance of the third-party frame-processing boundary, and comparison against the physical iPhone path remain explicit human/provider release gates. Rouast's published privacy terms state that usage and quality metadata are retained even though input frames and estimates are processed and deleted; release review must account for that metadata and the documented US processing region. This synthetic hackathon adapter is not clinically validated software.
