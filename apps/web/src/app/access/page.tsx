import { StatusChip } from "@homerounds/ui";

import { safeDemoDestination } from "@/server/demo-access";

import { AccessForm } from "./access-form";
import styles from "./access.module.css";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccessPage(props: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const search = await props.searchParams;
  const role = first(search.role) === "clinician" ? "clinician" : "patient";
  const destination = safeDemoDestination(role, first(search.next));

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="access-title">
        <div className={styles.intro}>
          <div className={styles.chips}>
            <StatusChip variant="information">Protected synthetic demonstration</StatusChip>
            <StatusChip variant="attention">Not a medical service</StatusChip>
          </div>
          <p className={styles.kicker}>HomeRounds access</p>
          <h1 id="access-title">Start a bounded, auditable demo session.</h1>
          <p>
            The access code creates a one-hour, role-scoped, secure browser cookie. It is checked by
            the server and is not persisted in browser storage, application logs, or the database.
          </p>
          <ul>
            <li>All people, readings, protocols, and actions are fictional.</li>
            <li>No raw camera frames, voice audio, or transcript is retained by HomeRounds.</li>
            <li>Models and providers cannot diagnose, set urgency, or bypass red-flag rules.</li>
          </ul>
        </div>
        <AccessForm destination={destination} initialRole={role} />
      </section>
    </main>
  );
}
