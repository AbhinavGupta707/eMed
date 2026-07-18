import Link from "next/link";

import {
  SYNTHETIC_MAYA_SCENARIOS,
  type PatientScenarioId
} from "@/features/shared-round/patient-round-config";
import { deterministicUuid } from "@/server/crypto";

import styles from "./home.module.css";

const PRIMARY_SCENARIO: PatientScenarioId = "maya-happy-text";

function clinicianHref(): string {
  const query = new URLSearchParams();
  for (const scenario of Object.values(SYNTHETIC_MAYA_SCENARIOS)) {
    query.append("roundId", deterministicUuid("round", scenario.patientId, scenario.triggerId));
  }
  return `/clinician?${query.toString()}`;
}

function protectedHref(role: "patient" | "clinician", destination: string): string {
  if (process.env.APP_ENV !== "demo") return destination;
  const query = new URLSearchParams({ role, next: destination });
  return `/access?${query.toString()}`;
}

function BaselineIllustration() {
  return (
    <figure className={styles.baseline}>
      <figcaption>
        <span>Your recent pattern</span>
        <strong>A small change is worth checking</strong>
      </figcaption>
      <svg
        aria-labelledby="baseline-title baseline-description"
        className={styles.baselineGraph}
        role="img"
        viewBox="0 0 680 190"
      >
        <title id="baseline-title">Illustrative seven-day pattern</title>
        <desc id="baseline-description">
          A calm sample trend with Saturday highlighted as the point to revisit.
        </desc>
        <path
          className={styles.baselineBand}
          d="M18 88 C95 54 144 116 224 92 C304 66 365 110 444 75 C514 44 584 99 662 68 L662 132 C584 160 512 105 444 136 C366 169 302 126 224 150 C143 175 91 112 18 146 Z"
        />
        <path
          className={styles.baselineLine}
          d="M18 115 C95 82 144 142 224 119 C304 92 365 137 444 105 C514 73 584 130 662 98"
        />
        {[18, 125, 232, 339, 446, 553, 662].map((x, index) => (
          <circle
            className={index === 5 ? styles.baselinePointActive : styles.baselinePoint}
            cx={x}
            cy={[115, 119, 117, 122, 104, 94, 98][index]}
            key={x}
            r={index === 5 ? 10 : 6}
          />
        ))}
      </svg>
      <ol aria-hidden="true" className={styles.days}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <li key={day}>{day}</li>
        ))}
      </ol>
    </figure>
  );
}

export default function HomePage() {
  const roundHref = protectedHref("patient", `/round?scenario=${PRIMARY_SCENARIO}`);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          HomeRounds
        </Link>
        <nav aria-label="Home navigation" className={styles.navigation}>
          <a href="#how-it-works">How it works</a>
          <Link href={protectedHref("clinician", clinicianHref())}>Clinician view</Link>
        </nav>
      </header>

      <section aria-labelledby="welcome-title" className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.welcome}>
            <p className={styles.eyebrow}>Your home round</p>
            <h1 id="welcome-title">Good morning, Maya.</h1>
            <p className={styles.lede}>
              A short check-in is ready when you are. We’ll ask what changed, review it with you,
              then offer one useful next step.
            </p>

            <BaselineIllustration />

            <div className={styles.actions}>
              <Link className={styles.primaryAction} href={roundHref}>
                <span aria-hidden="true" className={styles.actionMark} />
                Start a check-in
              </Link>
              <a className={styles.textAction} href="#recent-context">
                See what HomeRounds remembers
              </a>
            </div>
          </div>

          <aside aria-labelledby="context-title" className={styles.context} id="recent-context">
            <p className={styles.contextEyebrow}>For this check-in</p>
            <h2 id="context-title">What I already know</h2>
            <ul>
              <li>
                <span aria-hidden="true">01</span>
                <div>
                  <strong>Your usual baseline</strong>
                  <p>Used only to keep this round focused.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">02</span>
                <div>
                  <strong>Recent medication history</strong>
                  <p>You will confirm anything used in this round.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">03</span>
                <div>
                  <strong>Your saved progress</strong>
                  <p>Only confirmed structured information is restored.</p>
                </div>
              </li>
            </ul>
            <p className={styles.limitNote}>
              HomeRounds cannot diagnose a condition or contact a clinic. Voice and camera checks
              stay optional, with a complete text path available.
            </p>
          </aside>
        </div>
      </section>

      <section aria-labelledby="how-title" className={styles.how} id="how-it-works">
        <div>
          <p className={styles.eyebrow}>One thing at a time</p>
          <h2 id="how-title">A calm path from conversation to next step.</h2>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Tell me what changed</strong>
              <p>Speak or type, then check the words and structured answers yourself.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Do one selected check</strong>
              <p>Use your phone when available, or continue on this computer when supported.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Choose what happens next</strong>
              <p>No action is created until you see it and confirm it.</p>
            </div>
          </li>
        </ol>
      </section>

      <footer className={styles.footer}>Sample profile · Not medical care</footer>
    </main>
  );
}
