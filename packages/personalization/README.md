# Bounded personalisation

This package stores patient-confirmed presentation preferences and a bounded history of structured
task outcomes. It does not store conversational content, media, diagnoses, inferred clinical
preferences, or hidden model state. Every non-unknown preference has explicit confirmation
provenance, and the projection is presentation context only.

The independent `structured-memory-store.v1` keeps only consented typed slots. Every slot carries a
source timestamp and memory version. Corrections replace the prior value, deletion removes it, and
consent withdrawal clears all active values while retaining only value-free operation metadata.
Every projected value is explicitly ineligible for direct inference handoff and has no clinical,
workflow, urgency, quality, or action authority.
