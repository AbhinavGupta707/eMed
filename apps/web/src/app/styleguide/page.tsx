import {
  AppShell,
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EvidencePanel,
  FeedbackState,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  MeasurementQuality,
  Spinner,
  StatusChip,
  StepProgress,
  TaskRow,
  TextArea,
  TranscriptConfirmation
} from "@homerounds/ui";

import styles from "./styleguide.module.css";
import { DialogExample } from "./dialog-example";

const steps = [
  { id: "record", label: "Record", state: "complete" as const },
  { id: "review", label: "Review", state: "current" as const },
  { id: "confirm", label: "Confirm", state: "upcoming" as const },
  { id: "done", label: "Done", state: "upcoming" as const }
];

const shellNavigation = (
  <ul className={styles.shellNavigation}>
    <li>
      <a aria-current="page" href="#shells">
        Overview
      </a>
    </li>
    <li>
      <a href="#tasks">Tasks</a>
    </li>
    <li>
      <a href="#evidence">Evidence</a>
    </li>
  </ul>
);

function SectionHeader({
  number,
  title,
  description
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <header className={styles.sectionHeader}>
      <span aria-hidden="true">{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

export default function StyleguidePage() {
  return (
    <main className={styles.page}>
      <header className={styles.siteHeader}>
        <a className={styles.brand} href="#top">
          <span aria-hidden="true" className={styles.brandMark}>
            H
          </span>
          <span>HomeRounds</span>
        </a>
        <nav aria-label="Style guide sections" className={styles.siteNavigation}>
          <a href="#foundations">Foundations</a>
          <a href="#components">Components</a>
          <a href="#patterns">Patterns</a>
          <a href="#shells">Responsive shells</a>
        </nav>
        <StatusChip variant="information">Synthetic demonstration</StatusChip>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <h1>A calm system for careful follow-up</h1>
          <p>
            Accessible foundations and reusable patterns for patient-friendly monitoring and
            clinician review. Every state is explicit, recoverable, and readable without colour.
          </p>
          <div className={styles.heroActions}>
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary action</Button>
          </div>
        </div>
        <aside className={styles.safetyNote}>
          <strong>Not clinically validated</strong>
          <p>
            This style guide uses synthetic content for design and development. It is not for
            real-world medical decisions.
          </p>
        </aside>
      </section>

      <section className={styles.section} id="foundations">
        <SectionHeader
          description="True-white working surfaces, mineral-sage structure, and semantic states with readable labels."
          number="01"
          title="Foundations"
        />
        <div className={styles.foundationGrid}>
          <article className={styles.foundationPanel}>
            <h3>Colour tokens</h3>
            <div className={styles.swatchGrid}>
              <div>
                <span className={`${styles.swatch} ${styles.swatchInk}`} />
                <strong>Ink</strong>
                <small>#14231D</small>
              </div>
              <div>
                <span className={`${styles.swatch} ${styles.swatchForest}`} />
                <strong>Forest</strong>
                <small>#075F46</small>
              </div>
              <div>
                <span className={`${styles.swatch} ${styles.swatchMineral}`} />
                <strong>Mineral</strong>
                <small>#F4F8F5</small>
              </div>
              <div>
                <span className={`${styles.swatch} ${styles.swatchInformation}`} />
                <strong>Information</strong>
                <small>#285F91</small>
              </div>
              <div>
                <span className={`${styles.swatch} ${styles.swatchWarning}`} />
                <strong>Attention</strong>
                <small>#7A4A05</small>
              </div>
              <div>
                <span className={`${styles.swatch} ${styles.swatchDanger}`} />
                <strong>Action</strong>
                <small>#9A2F2F</small>
              </div>
            </div>
          </article>

          <article className={styles.foundationPanel}>
            <h3>Type scale</h3>
            <div className={styles.typeSpecimens}>
              <p className={styles.typeDisplay}>Display</p>
              <p className={styles.typeHeading}>Section heading</p>
              <p className={styles.typeBody}>
                Body text stays readable at comfortable line lengths and browser zoom levels.
              </p>
              <p className={styles.typeLabel}>Persistent field label</p>
            </div>
          </article>

          <article className={styles.foundationPanel}>
            <h3>Spacing, shape, and focus</h3>
            <div className={styles.spacingScale} aria-label="Eight pixel spacing scale">
              {["8", "12", "16", "24", "32", "48", "64"].map((space) => (
                <span key={space}>{space}</span>
              ))}
            </div>
            <div className={styles.shapeExamples}>
              <span>8px</span>
              <span>12px</span>
              <span>16px</span>
            </div>
            <button className={styles.focusExample} type="button">
              Visible focus example
            </button>
            <p className={styles.foundationNote}>
              Controls use a minimum 44 × 44px target and a visible 3px focus ring.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section} id="components">
        <SectionHeader
          description="Typed primitives with deliberate control text, semantic markup, and persistent guidance."
          number="02"
          title="Core components"
        />

        <div className={styles.demoGrid}>
          <article className={styles.demoPanel}>
            <h3>Buttons</h3>
            <div className={styles.buttonRow}>
              <Button>Primary action</Button>
              <Button variant="secondary">Secondary action</Button>
              <Button variant="quiet">Quiet action</Button>
              <Button variant="danger">Remove</Button>
            </div>
            <h4>States</h4>
            <div className={styles.buttonRow}>
              <Button disabled>Unavailable</Button>
              <Button disabled>
                <Spinner label="Saving" /> Saving
              </Button>
              <Button size="compact" variant="secondary">
                Compact action
              </Button>
            </div>
          </article>

          <article className={styles.demoPanel}>
            <h3>Fields and text areas</h3>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="synthetic-reference">Synthetic reference</FieldLabel>
                <Input
                  aria-describedby="synthetic-reference-help"
                  defaultValue="Participant 014"
                  id="synthetic-reference"
                />
                <FieldDescription id="synthetic-reference-help">
                  Use a synthetic label only. Do not enter names or identifying details.
                </FieldDescription>
              </Field>
              <Field invalid>
                <FieldLabel htmlFor="summary">Short summary</FieldLabel>
                <TextArea
                  aria-describedby="summary-help summary-error"
                  aria-invalid="true"
                  id="summary"
                  rows={4}
                />
                <FieldDescription id="summary-help">
                  Describe the update in your own words.
                </FieldDescription>
                <FieldError id="summary-error">Add a short summary before continuing.</FieldError>
              </Field>
            </FieldGroup>
          </article>

          <article className={styles.demoPanel}>
            <h3>Status chips</h3>
            <div className={styles.statusRow}>
              <StatusChip variant="complete">Complete</StatusChip>
              <StatusChip variant="information">In progress</StatusChip>
              <StatusChip variant="attention">Attention needed</StatusChip>
              <StatusChip variant="action">Action required</StatusChip>
              <StatusChip>Not started</StatusChip>
            </div>
            <h4>Progress</h4>
            <StepProgress label="Synthetic round progress" steps={steps} />
          </article>

          <Card>
            <CardHeader>
              <CardTitle>Structured card composition</CardTitle>
              <CardDescription>Header, content, and action remain distinct.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.cardCopy}>
                Programme review requested. A fictional protocol result may request a task; this
                visual system never creates or authorises one.
              </p>
              <StatusChip variant="information">Awaiting review</StatusChip>
            </CardContent>
            <CardFooter>
              <Button variant="secondary">View synthetic details</Button>
            </CardFooter>
          </Card>

          <article className={styles.demoPanel}>
            <h3>Dialog and drawer</h3>
            <p className={styles.cardCopy}>
              Modal surfaces preserve context, close with Escape, and expose an explicit close
              control.
            </p>
            <DialogExample />
          </article>
        </div>
      </section>

      <section className={styles.section} id="patterns">
        <SectionHeader
          description="Recovery-first patterns keep uncertain, failed, and unconfirmed information explicit."
          number="03"
          title="Workflow patterns"
        />

        <div className={styles.patternStack}>
          <div className={styles.patternGrid}>
            <TranscriptConfirmation defaultValue="I felt more tired than usual after walking upstairs this week." />
            <div className={styles.bannerStack}>
              <Banner title="Information" variant="information">
                This is a synthetic design-system example.
              </Banner>
              <Banner title="Programme review requested" variant="warning">
                The fictional care team has been asked to review this round.
              </Banner>
              <Banner title="Action required" variant="danger">
                Some information needs attention before the demo can continue.
              </Banner>
              <Banner title="Update saved" variant="success">
                The synthetic record was updated successfully.
              </Banner>
            </div>
          </div>

          <div className={styles.qualityGrid}>
            <MeasurementQuality
              details={<p className={styles.qualityDetail}>Demo quality score: 0.91</p>}
              reasons={["Signal duration and stability passed the configured demo quality gate."]}
              status="pass"
            />
            <MeasurementQuality
              reasons={[
                "Movement interrupted the signal.",
                "Keep still and follow the on-screen setup before retrying."
              ]}
              status="retry"
            />
            <MeasurementQuality
              reasons={[
                "A reliable signal was not available.",
                "Continue without a measurement and request review."
              ]}
              status="fail"
            />
          </div>

          <div className={styles.feedbackGrid}>
            <FeedbackState
              description="When synthetic updates arrive, they will appear here."
              kind="empty"
              title="No updates yet"
            />
            <FeedbackState
              description="Please keep this page open."
              kind="loading"
              title="Loading the synthetic round"
            />
            <FeedbackState
              action={<Button variant="secondary">Try again</Button>}
              description="Nothing was changed. Check the connection and retry."
              kind="error"
              title="We could not load this example"
            />
          </div>
        </div>
      </section>

      <section className={styles.section} id="tasks">
        <SectionHeader
          description="The same component supports comfortable reading and compact clinician review without hiding status."
          number="04"
          title="Task rows and density"
        />
        <div className={styles.densityGrid}>
          <div>
            <h3 className={styles.subheading}>Older-adult-friendly</h3>
            <TaskRow
              action={<Button variant="secondary">Open details</Button>}
              dueLabel="Today"
              metadata={["Owner: programme clinician"]}
              participantLabel="Synthetic participant 014"
              status="In progress"
              statusVariant="information"
              title="Follow-up review"
            />
            <TaskRow
              action={<Button variant="secondary">Open details</Button>}
              dueLabel="Tomorrow"
              participantLabel="Synthetic participant 021"
              status="Attention needed"
              statusVariant="attention"
              title="Programme review"
            />
          </div>
          <div>
            <h3 className={styles.subheading}>Clinician compact</h3>
            <TaskRow
              action={
                <Button size="compact" variant="secondary">
                  Open
                </Button>
              }
              density="compact"
              dueLabel="Today"
              participantLabel="Synthetic participant 014"
              status="In progress"
              statusVariant="information"
              title="Follow-up review"
            />
            <TaskRow
              action={
                <Button size="compact" variant="secondary">
                  Open
                </Button>
              }
              density="compact"
              dueLabel="2 days"
              participantLabel="Synthetic participant 033"
              status="Not started"
              title="Confirm plan"
            />
          </div>
        </div>
      </section>

      <section className={styles.section} id="evidence">
        <SectionHeader
          description="Evidence stays source-labelled, bounded, and separate from decision authority."
          number="05"
          title="Evidence panel"
        />
        <EvidencePanel
          description="Synthetic facts for component demonstration only."
          footer="A failed or uncertain optical capture must not appear here as a numeric measurement."
          items={[
            {
              label: "Patient report",
              value: "Confirmed text update",
              source: "Synthetic participant confirmation"
            },
            {
              label: "Capture quality",
              value: "Passed configured demo gate",
              source: "finger_ppg_hr_v1 fixture"
            },
            {
              label: "Protocol outcome",
              value: "Programme review requested",
              source: "Fictional protocol v1"
            }
          ]}
          title="Why this task appears"
        />
      </section>

      <section className={styles.section} id="shells">
        <SectionHeader
          description="Shells reflow from wide workspaces to a single-column 320px layout without horizontal scrolling."
          number="06"
          title="Responsive shells"
        />
        <div className={styles.shellGrid}>
          <AppShell
            contentAs="section"
            contentLabel="Comfortable patient shell example"
            footer="Synthetic demonstration · Not clinically validated"
            header={
              <div className={styles.shellHeader}>
                <strong>HomeRounds</strong>
                <StatusChip variant="information">Synthetic</StatusChip>
              </div>
            }
            navigation={shellNavigation}
            navigationLabel="Comfortable patient shell navigation"
          >
            <div className={styles.shellContent}>
              <span>Comfortable patient shell</span>
              <h3>Review your update</h3>
              <p>Large text, clear sequence, and one primary action at a time.</p>
              <Button>Continue</Button>
            </div>
          </AppShell>
          <div className={styles.mobileFrame}>
            <AppShell
              contentAs="section"
              contentLabel="320 pixel mobile shell example"
              footer="Synthetic demo"
              header={
                <div className={styles.shellHeader}>
                  <strong>HomeRounds</strong>
                  <span>Menu</span>
                </div>
              }
              navigation={shellNavigation}
              navigationLabel="320 pixel mobile shell navigation"
            >
              <div className={styles.shellContent}>
                <span>320px example</span>
                <h3>Confirm what you said</h3>
                <p>The page remains usable at narrow widths and 200% zoom.</p>
                <Button>Continue</Button>
              </div>
            </AppShell>
          </div>
        </div>
      </section>

      <footer className={styles.pageFooter}>
        <strong>HomeRounds visual system</strong>
        <p>Synthetic demonstration. Not clinically validated. Not for real-world use.</p>
      </footer>
    </main>
  );
}
