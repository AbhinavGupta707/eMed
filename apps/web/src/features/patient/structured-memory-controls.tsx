"use client";

import { HomeRoundsApiClient } from "@homerounds/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./structured-memory-controls.module.css";

type MemoryData = Awaited<ReturnType<HomeRoundsApiClient["getStructuredMemory"]>>;
type Projection = MemoryData["projection"];

function apiBaseUrl(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

function source(now: string) {
  return {
    schemaVersion: "structured-memory-source.v1" as const,
    kind: "patient_confirmation" as const,
    sourceId: "memory-settings-device-choice",
    confirmationId: globalThis.crypto.randomUUID(),
    sourceTimestamp: now,
    recordedAt: now,
    structuredOnly: true as const,
    transcriptStored: false as const,
    rawMediaStored: false as const,
    promptStored: false as const,
    providerPayloadStored: false as const
  };
}

function deviceLabel(code: string): string {
  return code === "phone" ? "Phone for supported checks" : "This computer for supported checks";
}

export function StructuredMemoryControls() {
  const client = useMemo(() => new HomeRoundsApiClient({ baseUrl: apiBaseUrl() }), []);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = (await client.getStructuredMemory()).projection;
      setError(null);
      setProjection(next);
    } catch {
      setError("Your remembered choices could not be loaded. Nothing was changed.");
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    void client
      .getStructuredMemory()
      .then(({ projection: next }) => {
        if (!active) return;
        setError(null);
        setProjection(next);
      })
      .catch(() => {
        if (active) setError("Your remembered choices could not be loaded. Nothing was changed.");
      });
    return () => {
      active = false;
    };
  }, [client]);

  const update = useCallback(
    async (
      label: string,
      request: Parameters<HomeRoundsApiClient["updateStructuredMemory"]>[0]
    ) => {
      setPending(label);
      setError(null);
      try {
        setProjection((await client.updateStructuredMemory(request)).projection);
      } catch {
        setError("That change could not be safely confirmed. Reload the latest saved version.");
      } finally {
        setPending(null);
      }
    },
    [client]
  );

  if (!projection && !error) {
    return <p className={styles.loading}>Loading your confirmed choices…</p>;
  }

  const device = projection?.entries.find(({ key }) => key === "round_device") ?? null;
  const currentCode = device?.value.kind === "code" ? device.value.code : null;

  return (
    <div className={styles.stack}>
      {error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button onClick={() => void load()} type="button">
            Reload saved choices
          </button>
        </div>
      ) : null}

      {projection?.consentStatus !== "granted" ? (
        <section aria-labelledby="memory-consent-title" className={styles.card}>
          <p className={styles.eyebrow}>Your choice</p>
          <h2 id="memory-consent-title">Remember structured preferences</h2>
          <p>
            HomeRounds can remember only the choices you confirm, such as which device you prefer.
            Conversation text, audio, camera frames, prompts, and model reasoning are never memory.
          </p>
          <button
            className={styles.primary}
            disabled={!projection || pending !== null}
            onClick={() => {
              if (!projection) return;
              const now = new Date().toISOString();
              void update("consent", {
                kind: "consent",
                expectedStoreVersion: projection.storeVersion,
                mutationId: globalThis.crypto.randomUUID(),
                consent: {
                  status: "granted",
                  policyVersion: "structured-memory-consent-v1",
                  decisionId: globalThis.crypto.randomUUID(),
                  decidedAt: now
                },
                occurredAt: now
              });
            }}
            type="button"
          >
            {pending === "consent" ? "Saving…" : "Allow structured memory"}
          </button>
        </section>
      ) : (
        <section aria-labelledby="device-memory-title" className={styles.card}>
          <p className={styles.eyebrow}>Confirmed preference</p>
          <h2 id="device-memory-title">Device for supported checks</h2>
          <p>
            {currentCode
              ? `Currently remembered: ${deviceLabel(currentCode)}.`
              : "No device choice is remembered yet."}
          </p>
          <div className={styles.actions}>
            {!device ? (
              <button
                className={styles.primary}
                disabled={pending !== null}
                onClick={() => {
                  const now = new Date().toISOString();
                  void update("set", {
                    kind: "mutate",
                    mutation: {
                      operation: "set",
                      mutationId: globalThis.crypto.randomUUID(),
                      expectedStoreVersion: projection.storeVersion,
                      memoryId: globalThis.crypto.randomUUID(),
                      key: "round_device",
                      value: { kind: "code", code: "phone" },
                      source: source(now),
                      occurredAt: now
                    }
                  });
                }}
                type="button"
              >
                {pending === "set" ? "Saving…" : "Remember phone"}
              </button>
            ) : (
              <>
                <button
                  className={styles.primary}
                  disabled={pending !== null}
                  onClick={() => {
                    const now = new Date().toISOString();
                    void update("correct", {
                      kind: "mutate",
                      mutation: {
                        operation: "correct",
                        mutationId: globalThis.crypto.randomUUID(),
                        expectedStoreVersion: projection.storeVersion,
                        memoryId: device.memoryId,
                        key: device.key,
                        expectedMemoryVersion: device.memoryVersion,
                        value: {
                          kind: "code",
                          code: currentCode === "phone" ? "desktop" : "phone"
                        },
                        source: source(now),
                        occurredAt: now
                      }
                    });
                  }}
                  type="button"
                >
                  {pending === "correct"
                    ? "Saving…"
                    : currentCode === "phone"
                      ? "Use this computer instead"
                      : "Use phone instead"}
                </button>
                <button
                  className={styles.secondary}
                  disabled={pending !== null}
                  onClick={() => {
                    const now = new Date().toISOString();
                    void update("delete", {
                      kind: "mutate",
                      mutation: {
                        operation: "delete",
                        mutationId: globalThis.crypto.randomUUID(),
                        expectedStoreVersion: projection.storeVersion,
                        memoryId: device.memoryId,
                        key: device.key,
                        expectedMemoryVersion: device.memoryVersion,
                        source: source(now),
                        occurredAt: now
                      }
                    });
                  }}
                  type="button"
                >
                  {pending === "delete" ? "Removing…" : "Forget this choice"}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {projection?.consentStatus === "granted" ? (
        <button
          className={styles.withdraw}
          disabled={pending !== null}
          onClick={() => {
            const now = new Date().toISOString();
            void update("withdraw", {
              kind: "consent",
              expectedStoreVersion: projection.storeVersion,
              mutationId: globalThis.crypto.randomUUID(),
              consent: {
                status: "withdrawn",
                policyVersion: "structured-memory-consent-v1",
                decisionId: globalThis.crypto.randomUUID(),
                decidedAt: now
              },
              occurredAt: now
            });
          }}
          type="button"
        >
          {pending === "withdraw"
            ? "Removing remembered choices…"
            : "Withdraw permission and clear all choices"}
        </button>
      ) : null}
    </div>
  );
}
