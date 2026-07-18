import Link from "next/link";

import { StructuredMemoryControls } from "../../../features/patient/structured-memory-controls";
import styles from "./page.module.css";

export default function MemoryPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          HomeRounds
        </Link>
        <Link className={styles.back} href="/">
          Back to home
        </Link>
      </header>
      <section aria-labelledby="memory-title" className={styles.intro}>
        <p>Private by design</p>
        <h1 id="memory-title">What HomeRounds remembers</h1>
        <span>
          Review, correct, or delete structured choices at any time. These choices shape
          presentation only; they never decide urgency, diagnosis, protocol, or care actions.
        </span>
      </section>
      <StructuredMemoryControls />
      <footer className={styles.footer}>Synthetic sample profile · Not medical care</footer>
    </main>
  );
}
