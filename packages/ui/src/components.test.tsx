import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AppShell,
  Banner,
  Button,
  Dialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  MeasurementQuality,
  StatusChip,
  StepProgress,
  TaskRow,
  TextArea,
  TranscriptConfirmation
} from ".";

describe("accessible UI primitives", () => {
  it("uses safe button defaults and exposes semantic variants", () => {
    const markup = renderToStaticMarkup(<Button variant="danger">Remove item</Button>);

    expect(markup).toContain('type="button"');
    expect(markup).toContain("hr-button--danger");
    expect(markup).toContain("Remove item");
  });

  it("keeps labels, instructions, and validation recovery persistently associated", () => {
    const markup = renderToStaticMarkup(
      <Field invalid>
        <FieldLabel htmlFor="summary">What would you like to tell us?</FieldLabel>
        <TextArea aria-describedby="summary-help summary-error" aria-invalid="true" id="summary" />
        <FieldDescription id="summary-help">
          Do not include identifying information.
        </FieldDescription>
        <FieldError id="summary-error">Add a short summary before continuing.</FieldError>
      </Field>
    );

    expect(markup).toContain('for="summary"');
    expect(markup).toContain('aria-describedby="summary-help summary-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('data-invalid="true"');
  });

  it("supports explicit input labelling without placeholder-only instructions", () => {
    const markup = renderToStaticMarkup(
      <Field>
        <FieldLabel htmlFor="reference">Synthetic reference</FieldLabel>
        <Input id="reference" />
      </Field>
    );

    expect(markup).toContain('for="reference"');
    expect(markup).toContain('id="reference"');
    expect(markup).not.toContain("placeholder");
  });

  it("announces warning banners and duplicates status meaning in text", () => {
    const markup = renderToStaticMarkup(
      <Banner title="Review needed" variant="warning">
        Check the synthetic information and try again.
      </Banner>
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Review needed");
    expect(markup).toContain("try again");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("marks the current progress step semantically", () => {
    const markup = renderToStaticMarkup(
      <StepProgress
        steps={[
          { id: "record", label: "Record", state: "complete" },
          { id: "review", label: "Review", state: "current" },
          { id: "confirm", label: "Confirm", state: "upcoming" }
        ]}
      />
    );

    expect(markup).toContain('aria-label="Progress"');
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain("Review");
  });

  it("never presents retry or failed capture quality as a measurement", () => {
    for (const status of ["retry", "fail"] as const) {
      const markup = renderToStaticMarkup(
        <MeasurementQuality reasons={["Signal did not meet the quality gate."]} status={status} />
      );

      expect(markup).toContain("No measurement value is shown for this result.");
      expect(markup).not.toContain("bpm");
    }
  });

  it("keeps transcript confirmation explicit and editable", () => {
    const markup = renderToStaticMarkup(
      <TranscriptConfirmation defaultValue="I felt tired after walking upstairs." />
    );

    expect(markup).toContain("Confirm what you said");
    expect(markup).toContain("Transcript");
    expect(markup).toContain("Nothing is submitted until you confirm.");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Confirm transcript");
  });

  it("renders non-colour task status and compact density as explicit markup", () => {
    const markup = renderToStaticMarkup(
      <TaskRow
        density="compact"
        dueLabel="Today"
        participantLabel="Synthetic participant 014"
        status="Attention needed"
        statusVariant="attention"
        title="Programme review"
      />
    );

    expect(markup).toContain("hr-task-row--compact");
    expect(markup).toContain("Attention needed");
    expect(markup).toContain("hr-status-chip__icon");
  });

  it("renders each status chip with visible text plus an ignored icon", () => {
    const markup = renderToStaticMarkup(<StatusChip variant="complete">Complete</StatusChip>);

    expect(markup).toContain("Complete");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("uses one main landmark by default and supports labelled embedded shell examples", () => {
    const primary = renderToStaticMarkup(<AppShell header="HomeRounds">Content</AppShell>);
    const embedded = renderToStaticMarkup(
      <AppShell
        contentAs="section"
        contentLabel="Embedded shell"
        header="HomeRounds"
        navigation={<a href="#content">Content</a>}
        navigationLabel="Embedded navigation"
      >
        Content
      </AppShell>
    );

    expect(primary).toContain('<main class="hr-app-shell__content">');
    expect(embedded).toContain(
      '<section aria-label="Embedded shell" class="hr-app-shell__content">'
    );
    expect(embedded).not.toContain("<main");
    expect(embedded).toContain('aria-label="Embedded navigation"');
  });

  it("labels dialog and drawer surfaces without relying on visual placement", () => {
    const markup = renderToStaticMarkup(
      <Dialog
        description="Synthetic evidence only"
        onOpenChange={() => undefined}
        open
        placement="drawer"
        title="Evidence details"
      >
        Bounded content
      </Dialog>
    );

    expect(markup).toContain("hr-dialog--drawer");
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("aria-labelledby=");
    expect(markup).toContain("aria-describedby=");
    expect(markup).toContain('aria-label="Close"');
  });
});
