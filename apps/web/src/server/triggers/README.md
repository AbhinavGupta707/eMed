# Bounded trigger server seam

`TriggerServerService.evaluateBounded` performs one explicitly scheduled or event-delivered
evaluation. It does not start a timer, poll, subscribe, or claim continuous monitoring. Triggered
results are committed atomically by idempotency key as proposal-only events; this seam never creates
a round and exposes no API.

The in-memory repository is for keyless tests and local composition only. Durable storage,
migrations, authoritative round creation, API/client registration, and workflow wiring remain
central integration responsibilities.
