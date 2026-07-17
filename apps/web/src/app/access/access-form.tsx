"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import styles from "./access.module.css";

type DemoRole = "patient" | "clinician";

export function AccessForm(props: { initialRole: DemoRole; destination: string }) {
  const [role, setRole] = useState<DemoRole>(props.initialRole);
  const [accessCode, setAccessCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessCode, role, destination: props.destination })
      });
      const body = (await response.json()) as {
        data?: { redirectTo?: string };
        error?: string;
      };
      if (!response.ok || !body.data?.redirectTo) {
        setError(
          response.status === 429
            ? "Too many attempts. Wait a few minutes and try again."
            : "That access code was not accepted. Check it and try again."
        );
        return;
      }
      window.location.assign(body.data.redirectTo);
    } catch {
      setError("HomeRounds could not start a protected session. Check the connection and retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset>
        <legend>Choose the synthetic demo role</legend>
        <label className={role === "patient" ? styles.roleSelected : styles.role}>
          <input
            checked={role === "patient"}
            name="role"
            onChange={() => setRole("patient")}
            type="radio"
            value="patient"
          />
          <span>
            <strong>Patient round</strong>
            Confirm fictional symptoms and complete the short check-in.
          </span>
        </label>
        <label className={role === "clinician" ? styles.roleSelected : styles.role}>
          <input
            checked={role === "clinician"}
            name="role"
            onChange={() => setRole("clinician")}
            type="radio"
            value="clinician"
          />
          <span>
            <strong>Clinician cockpit</strong>
            Review the synthetic evidence chain and close the programme task.
          </span>
        </label>
      </fieldset>

      <label className={styles.secret}>
        <span>Demo access code</span>
        <input
          autoComplete="current-password"
          autoFocus
          maxLength={512}
          onChange={(event) => setAccessCode(event.currentTarget.value)}
          required
          type="password"
          value={accessCode}
        />
      </label>

      {error ? (
        <p aria-live="polite" className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <button disabled={pending} type="submit">
        {pending ? "Starting protected session…" : "Enter synthetic demo"}
      </button>
      <Link href="/">Return to the overview</Link>
    </form>
  );
}
