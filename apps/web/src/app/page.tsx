import { StatusChip } from "@homerounds/ui";
import Link from "next/link";

import {
  SYNTHETIC_MAYA_SCENARIOS,
  type PatientScenarioId
} from "@/features/shared-round/patient-round-config";
import { deterministicUuid } from "@/server/crypto";

import styles from "./home.module.css";

const stories: ReadonlyArray<{
  id: PatientScenarioId;
  eyebrow: string;
  title: string;
  description: string;
  proof: string;
}> = [
  {
    id: "maya-happy-text",
    eyebrow: "Primary demo",
    title: "Calm text-first round",
    description:
      "Confirm structured symptoms, try the selected optical check, review the deterministic result, and create one auditable task.",
    proof: "Works without a voice API key"
  },
  {
    id: "maya-poor-quality",
    eyebrow: "Resilience story",
    title: "Poor signal, honest recovery",
    description:
      "See one coached retry, no invented number, then choose a visibly labelled recorded synthetic recovery or abstain for review.",
    proof: "No raw media or silent fallback"
  },
  {
    id: "maya-red-flag",
    eyebrow: "Safety story",
    title: "Structured red-flag hard stop",
    description:
      "A patient-confirmed answer ends ordinary capture before voice or a model can soften, skip, or reinterpret the safety gate.",
    proof: "Deterministic authority boundary"
  }
];

function clinicianHref(): string {
  const query = new URLSearchParams();
  for (const scenario of Object.values(SYNTHETIC_MAYA_SCENARIOS)) {
    query.append("roundId", deterministicUuid("round", scenario.patientId, scenario.triggerId));
  }
  return `/clinician?${query.toString()}`;
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <nav aria-label="HomeRounds demo destinations" className={styles.nav}>
          <Link className={styles.brand} href="/">
            <span aria-hidden="true">H</span>
            <strong>HomeRounds</strong>
          </Link>
          <div className={styles.navLinks}>
            <Link href="/styleguide">System</Link>
            <Link href={clinicianHref()}>Clinician cockpit</Link>
          </div>
        </nav>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.chips}>
              <StatusChip variant="information">Synthetic demonstration</StatusChip>
              <StatusChip variant="attention">Not clinically validated</StatusChip>
            </div>
            <p className={styles.kicker}>Adaptive asynchronous clinical rounds</p>
            <h1>One short check-in. One evidence chain. One clear next owner.</h1>
            <p className={styles.lede}>
              HomeRounds turns fictional patient-confirmed answers and quality-gated sensor evidence
              into a deterministic, auditable programme workflow—without diagnosis or model-led
              urgency.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryAction} href="/round?scenario=maya-happy-text">
                Start the primary demo
              </Link>
              <Link className={styles.secondaryAction} href={clinicianHref()}>
                Open clinician view
              </Link>
            </div>
          </div>

          <aside className={styles.boundary} aria-labelledby="boundary-title">
            <p className={styles.boundaryNumber}>02:00</p>
            <h2 id="boundary-title">Designed to finish calmly</h2>
            <dl>
              <div>
                <dt>Patient authority</dt>
                <dd>Structured answers and explicit confirmation</dd>
              </div>
              <div>
                <dt>Sensor authority</dt>
                <dd>Passing quality or no numeric measurement</dd>
              </div>
              <div>
                <dt>Workflow authority</dt>
                <dd>Versioned rules and audited persistence</dd>
              </div>
            </dl>
            <p>
              Synthetic hackathon prototype. It is not a medical service and must not be used for
              medical decisions.
            </p>
          </aside>
        </div>
      </section>

      <section className={styles.stories} aria-labelledby="stories-title">
        <header className={styles.sectionHeader}>
          <p className={styles.kicker}>Three deterministic stories</p>
          <h2 id="stories-title">Choose what you want the product to prove</h2>
          <p>
            Each path uses a separate reset-safe synthetic round and the same production boundary.
          </p>
        </header>
        <div className={styles.storyGrid}>
          {stories.map((story, index) => (
            <article className={styles.story} key={story.id}>
              <div className={styles.storyTopline}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{story.eyebrow}</p>
              </div>
              <h3>{story.title}</h3>
              <p>{story.description}</p>
              <strong>{story.proof}</strong>
              <Link href={`/round?scenario=${story.id}`}>Launch this story</Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.multimodal} aria-labelledby="multimodal-title">
        <div>
          <p className={styles.kicker}>Multimodal, with bounded authority</p>
          <h2 id="multimodal-title">Voice can help. Text can always finish.</h2>
        </div>
        <ul>
          <li>
            <strong>Voice</strong>
            ElevenLabs is optional; editable confirmation preserves parity with the no-key text
            path.
          </li>
          <li>
            <strong>Optical</strong>
            Finger PPG and VitalLens share one contract; release evidence decides which claim ships.
          </li>
          <li>
            <strong>Rules</strong>A versioned deterministic protocol—not a model—owns follow-up and
            allowlisted action.
          </li>
          <li>
            <strong>Operations</strong>
            Clinician notes, contact, acknowledgement, completion, and audit provenance persist
            together.
          </li>
        </ul>
      </section>
    </main>
  );
}
