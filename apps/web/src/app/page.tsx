import Link from "next/link";

import {
  SYNTHETIC_MAYA_SCENARIOS,
  type PatientScenarioId
} from "@/features/shared-round/patient-round-config";
import { readSyntheticBaselineSeed } from "@/server/baselines/demo-seed";
import { deterministicUuid } from "@/server/crypto";
import { getServerRuntime } from "@/server/runtime";
import { ensureSyntheticProactiveRound } from "@/server/triggers/proactive-round";

import styles from "./home.module.css";

const PRIMARY_SCENARIO: PatientScenarioId = "maya-happy-text";

export const dynamic = "force-dynamic";

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
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <li key={day}>{day}</li>
        ))}
      </ol>
    </figure>
  );
}

export default async function HomePage() {
  const runtime = getServerRuntime();
  const [proactiveInvitation, personalization] = await Promise.all([
    ensureSyntheticProactiveRound(runtime).catch(() => null),
    runtime
      .ensureBaselinesReady()
      .then(() => runtime.baselines.getPersonalizationProjection("synthetic-maya"))
      .catch(() => null)
  ]);
  const roundQuery = new URLSearchParams({ scenario: PRIMARY_SCENARIO });
  if (proactiveInvitation) roundQuery.set("triggerId", proactiveInvitation.triggerId);
  const roundHref = protectedHref("patient", `/round?${roundQuery.toString()}`);
  const savedDevice =
    personalization?.defaultDevice ?? readSyntheticBaselineSeed().personalization.defaultDevice;
  const savedDeviceLabel =
    savedDevice.status === "set"
      ? savedDevice.value === "phone"
        ? "Phone for supported checks"
        : savedDevice.value === "tablet"
          ? "Tablet for supported checks"
          : "This computer for supported checks"
      : "Choose a device during the check-in";

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
            <p className={styles.eyebrow}>
              {proactiveInvitation ? "A check-in is ready" : "Start when you’re ready"}
            </p>
            <h1 id="welcome-title">Good morning, Maya.</h1>
            <p className={styles.lede}>
              {proactiveInvitation
                ? "A recent confirmed update in your sample profile looks a little different from your usual pattern. We can check what changed, gather only what helps, and agree one next step together."
                : "You can start a short check-in, gather only what helps, and agree one next step together."}
            </p>

            <div className={styles.invitationNote} role="note">
              <span className={styles.invitationPulse} aria-hidden="true" />
              <div>
                <strong>
                  {proactiveInvitation
                    ? "Invited after a recent sample-profile update"
                    : "An on-demand check-in is available"}
                </strong>
                <p>
                  {proactiveInvitation
                    ? "The bounded change check has been saved once and is ready when you are."
                    : "Start now or come back when it suits you."}
                </p>
              </div>
            </div>

            <BaselineIllustration />

            <div className={styles.actions}>
              <Link className={styles.primaryAction} href={roundHref}>
                <span aria-hidden="true" className={styles.actionMark} />
                {proactiveInvitation ? "Continue invited check-in" : "Start my check-in"}
              </Link>
              <Link className={styles.textAction} href={roundHref}>
                Start a check-in on demand
              </Link>
              <p className={styles.safetyNote}>
                HomeRounds cannot diagnose a condition or contact a medical service.
              </p>
            </div>
          </div>

          <aside aria-labelledby="context-title" className={styles.context} id="recent-context">
            <p className={styles.contextEyebrow}>For this check-in</p>
            <h2 id="context-title">What you asked me to remember</h2>
            <ul>
              <li>
                <span aria-hidden="true">01</span>
                <div>
                  <strong>Your usual baseline</strong>
                  <p>Compared only with compatible, quality-passing sample readings.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">02</span>
                <div>
                  <strong>{savedDeviceLabel}</strong>
                  <p>Your confirmed device preference; you can choose differently today.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">03</span>
                <div>
                  <strong>Your saved progress</strong>
                  <p>Only answers and results you confirmed are restored.</p>
                </div>
              </li>
            </ul>
            <p className={styles.limitNote}>
              Voice and camera stay optional. You can complete the conversation by typing and change
              the device for any supported check.
            </p>
            <Link className={styles.memoryLink} href={protectedHref("patient", "/memory")}>
              Review or change remembered choices
            </Link>
          </aside>
        </div>
      </section>

      <section aria-labelledby="journey-title" className={styles.journey}>
        <div className={styles.journeyHeading}>
          <p className={styles.eyebrow}>A joined-up round</p>
          <h2 id="journey-title">From invitation to a confirmed next action.</h2>
          <p>
            One focused screen at a time, with a safe way forward when a service, signal, or
            connection is unavailable.
          </p>
        </div>
        <ol className={styles.journeySteps}>
          <li>
            <span>Ready</span>
            <strong>Start when you choose</strong>
            <p>Continue this invitation or begin the same short check-in on demand.</p>
          </li>
          <li>
            <span>Remembered</span>
            <strong>Phone preferred</strong>
            <p>Your saved choice is offered first, never forced.</p>
          </li>
          <li>
            <span>Focused</span>
            <strong>One useful check</strong>
            <p>The route adapts to confirmed answers and shows only the selected task.</p>
          </li>
          <li>
            <span>Connected</span>
            <strong>Result returns here</strong>
            <p>A phone result must pass the same checks before the laptop can continue.</p>
          </li>
          <li>
            <span>Confirmed</span>
            <strong>One next action</strong>
            <p>You review the action and its destination before anything is saved.</p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="how-title" className={styles.how} id="how-it-works">
        <div>
          <p className={styles.eyebrow}>One thing at a time</p>
          <h2 id="how-title">A short path with honest recovery.</h2>
          <p className={styles.howIntro}>
            The main route is designed to fit comfortably inside three minutes without hiding
            uncertainty or failure.
          </p>
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
              <p>Use your remembered phone choice, or switch device when supported.</p>
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

      <footer className={styles.footer}>Synthetic sample profile · Not medical care</footer>
    </main>
  );
}
