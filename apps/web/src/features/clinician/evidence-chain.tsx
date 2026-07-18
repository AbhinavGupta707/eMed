/** @jsxRuntime automatic */
/** @jsxImportSource react */

import type { DomainEvent } from "@homerounds/contracts";
import { StatusChip } from "@homerounds/ui";

import type { ClinicianTaskDetail, ResourceState } from "./model";
import { formatDateTime, readableToken } from "./presentation";
import styles from "./clinician-cockpit.module.css";

function ResourceNotice({
  state
}: {
  state: Exclude<ResourceState<unknown>, { status: "available" }>;
}) {
  return (
    <p className={styles.resourceNotice} data-resource-state={state.status}>
      <strong>{readableToken(state.status)}:</strong> {state.explanation}
    </p>
  );
}

function EvidenceValues({ children }: { children: React.ReactNode }) {
  return <dl className={styles.evidenceValues}>{children}</dl>;
}

function EvidenceValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ChainStep({
  number,
  title,
  source,
  children
}: {
  number: string;
  title: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <li className={styles.chainStep}>
      <div aria-hidden="true" className={styles.chainNumber}>
        {number}
      </div>
      <div className={styles.chainBody}>
        <header className={styles.chainHeader}>
          <h4>{title}</h4>
          <span>Source: {source}</span>
        </header>
        {children}
      </div>
    </li>
  );
}

function TriggerStep({ detail }: { detail: ClinicianTaskDetail }) {
  const round = detail.round;
  const snapshot = detail.snapshot;
  return (
    <ChainStep
      number="1"
      source="round service + synthetic FHIR adapter"
      title="Trigger and provenance"
    >
      {round.status === "available" ? (
        <EvidenceValues>
          <EvidenceValue label="Trigger reference" value={round.value.triggerId} />
          <EvidenceValue label="Round purpose" value={round.value.purpose} />
          <EvidenceValue label="Round state" value={readableToken(round.value.state)} />
        </EvidenceValues>
      ) : (
        <ResourceNotice state={round} />
      )}
      {snapshot.status === "available" ? (
        <EvidenceValues>
          <EvidenceValue label="Record source" value={readableToken(snapshot.value.source)} />
          <EvidenceValue label="Snapshot as of" value={formatDateTime(snapshot.value.asOf)} />
          <EvidenceValue
            label="FHIR references"
            value={
              snapshot.value.observations.length > 0 ? (
                <ul className={styles.inlineList}>
                  {snapshot.value.observations.slice(0, 3).map((observation) => (
                    <li key={observation.factId}>
                      {observation.factId} · {observation.provenance.targetReference}
                    </li>
                  ))}
                </ul>
              ) : (
                "No observation references returned"
              )
            }
          />
        </EvidenceValues>
      ) : (
        <ResourceNotice state={snapshot} />
      )}
    </ChainStep>
  );
}

function ReportStep({ detail }: { detail: ClinicianTaskDetail }) {
  const report = detail.report;
  return (
    <ChainStep number="2" source="patient-confirmed structured report" title="Confirmed report">
      {report.status === "available" ? (
        <EvidenceValues>
          <EvidenceValue label="Report ID" value={report.value.reportId} />
          <EvidenceValue label="Input mode" value={readableToken(report.value.inputMode)} />
          <EvidenceValue label="Weakness" value={readableToken(report.value.weakness)} />
          <EvidenceValue label="Palpitations" value={readableToken(report.value.palpitations)} />
          <EvidenceValue label="Confirmed at" value={formatDateTime(report.value.confirmedAt)} />
        </EvidenceValues>
      ) : (
        <ResourceNotice state={report} />
      )}
    </ChainStep>
  );
}

function MeasurementStep({ detail }: { detail: ClinicianTaskDetail }) {
  const measurement = detail.measurement;
  const captureQuality = detail.captureQuality;
  return (
    <ChainStep
      number="3"
      source="registered optical provider + quality gate"
      title="Measurement and quality"
    >
      {measurement.status === "available" ? (
        <EvidenceValues>
          <EvidenceValue
            label="Accepted value"
            value={`${measurement.value.value} ${measurement.value.unit}`}
          />
          <EvidenceValue label="Provider" value={readableToken(measurement.value.provider)} />
          <EvidenceValue label="Algorithm" value={measurement.value.algorithmVersion} />
          <EvidenceValue
            label="Quality"
            value={`${readableToken(measurement.value.quality.status)} · score ${measurement.value.quality.score.toFixed(2)}`}
          />
          <EvidenceValue
            label="Quality reasons"
            value={
              measurement.value.quality.reasons.map(readableToken).join(", ") ||
              "No reasons returned"
            }
          />
          <EvidenceValue label="Raw media" value="Absent (rawMediaRef is null)" />
        </EvidenceValues>
      ) : captureQuality.status === "available" ? (
        <EvidenceValues>
          <EvidenceValue label="Accepted value" value="No numeric measurement accepted" />
          <EvidenceValue label="Quality" value={readableToken(captureQuality.value.status)} />
          <EvidenceValue label="Quality score" value={captureQuality.value.score.toFixed(2)} />
          <EvidenceValue
            label="Quality reasons"
            value={
              captureQuality.value.reasons.map(readableToken).join(", ") || "No reasons returned"
            }
          />
          <EvidenceValue label="Raw media" value="Absent by contract" />
        </EvidenceValues>
      ) : (
        <ResourceNotice state={measurement} />
      )}
    </ChainStep>
  );
}

function ProtocolStep({ detail }: { detail: ClinicianTaskDetail }) {
  const result = detail.protocolResult;
  return (
    <ChainStep number="5" source="safety protocol evaluator" title="Rule and decision">
      {result.status === "available" ? (
        <EvidenceValues>
          <EvidenceValue
            label="Protocol"
            value={`${result.value.protocolId} · ${result.value.protocolVersion}`}
          />
          <EvidenceValue label="Outcome" value={readableToken(result.value.outcome)} />
          <EvidenceValue
            label="Matched rules"
            value={result.value.matchedRuleIds.join(", ") || "None returned"}
          />
          <EvidenceValue
            label="Fact IDs"
            value={result.value.factIds.join(", ") || "None returned"}
          />
          <EvidenceValue
            label="Missing fact keys"
            value={result.value.missingFactKeys.join(", ") || "None returned by evaluator"}
          />
        </EvidenceValues>
      ) : (
        <ResourceNotice state={result} />
      )}
    </ChainStep>
  );
}

function VoiceBiomarkerStep({ detail }: { detail: ClinicianTaskDetail }) {
  const fact = detail.voiceBiomarkerFact;
  return (
    <ChainStep
      number="4"
      source="local sustained-vowel feature extractor + quality gate"
      title="Research voice signal"
    >
      {fact.status === "available" ? (
        <EvidenceValues>
          <EvidenceValue label="Status" value="Research-only baseline signal — not a diagnosis" />
          <EvidenceValue
            label="Median fundamental frequency"
            value={
              fact.value.features.medianFundamentalFrequencyHz === null
                ? "Unavailable"
                : `${fact.value.features.medianFundamentalFrequencyHz.toFixed(1)} Hz`
            }
          />
          <EvidenceValue
            label="Jitter"
            value={
              fact.value.features.jitterPercent === null
                ? "Unavailable"
                : `${fact.value.features.jitterPercent.toFixed(2)}%`
            }
          />
          <EvidenceValue
            label="Shimmer"
            value={
              fact.value.features.shimmerPercent === null
                ? "Unavailable"
                : `${fact.value.features.shimmerPercent.toFixed(2)}%`
            }
          />
          <EvidenceValue
            label="Harmonic-to-noise ratio"
            value={
              fact.value.features.harmonicToNoiseRatioDb === null
                ? "Unavailable"
                : `${fact.value.features.harmonicToNoiseRatioDb.toFixed(1)} dB`
            }
          />
          <EvidenceValue
            label="Quality"
            value={`Pass · score ${fact.value.quality.score.toFixed(2)}`}
          />
          <EvidenceValue label="Raw audio" value="Absent by contract" />
        </EvidenceValues>
      ) : (
        <ResourceNotice state={fact} />
      )}
    </ChainStep>
  );
}

function idempotencyStatus(detail: ClinicianTaskDetail): string {
  if (detail.timeline.status !== "available") {
    return "Creation key returned; attempt history is not available in the current response.";
  }
  if (detail.timeline.value.some((event) => event.type === "programme_task_duplicate_suppressed")) {
    return "Duplicate request suppression is present in the returned audit history.";
  }
  if (detail.timeline.value.some((event) => event.type === "programme_task_created")) {
    return "Task creation is present; no duplicate-suppression event was returned.";
  }
  return "Task key returned; no creation attempt event was returned.";
}

function TaskStep({ detail }: { detail: ClinicianTaskDetail }) {
  const task = detail.task;
  return (
    <ChainStep number="6" source="action service" title="Task and action">
      <EvidenceValues>
        <EvidenceValue label="Task ID" value={task.id} />
        <EvidenceValue label="Action type" value={readableToken(task.type)} />
        <EvidenceValue label="Owner" value={readableToken(task.ownerRole)} />
        <EvidenceValue label="Task status" value={readableToken(task.status)} />
        <EvidenceValue label="Idempotency key" value={task.idempotencyKey} />
        <EvidenceValue label="Idempotency status" value={idempotencyStatus(detail)} />
      </EvidenceValues>
    </ChainStep>
  );
}

export function EvidenceChain({ detail }: { detail: ClinicianTaskDetail }) {
  return (
    <section aria-labelledby="evidence-chain-heading" className={styles.sectionBlock}>
      <header className={styles.sectionHeading}>
        <div>
          <h3 id="evidence-chain-heading">Evidence chain</h3>
          <p>Each link names its source. Unreturned evidence remains visibly unavailable.</p>
        </div>
        <StatusChip variant="information">Source labelled</StatusChip>
      </header>
      <ol className={styles.evidenceChain}>
        <TriggerStep detail={detail} />
        <ReportStep detail={detail} />
        <MeasurementStep detail={detail} />
        <VoiceBiomarkerStep detail={detail} />
        <ProtocolStep detail={detail} />
        <TaskStep detail={detail} />
      </ol>
    </section>
  );
}

function missingEvidence(detail: ClinicianTaskDetail): string[] {
  const gaps: string[] = [];
  if (detail.report.status !== "available") gaps.push("Confirmed structured report not returned");
  if (detail.measurement.status !== "available" && detail.captureQuality.status !== "available")
    gaps.push("Measurement and quality detail not returned");
  if (detail.protocolResult.status !== "available")
    gaps.push("Protocol decision detail not returned");
  return gaps;
}

export function EvidenceBoundary({ detail }: { detail: ClinicianTaskDetail }) {
  const protocolMissing =
    detail.protocolResult.status === "available" ? detail.protocolResult.value.missingFactKeys : [];
  const snapshotIssues =
    detail.snapshot.status === "available"
      ? detail.snapshot.value.issues.map(
          (issue) => `${readableToken(issue.code)}: ${issue.detailKey}`
        )
      : [];
  const gaps = missingEvidence(detail);
  const abstained =
    (detail.protocolResult.status === "available" &&
      detail.protocolResult.value.outcome === "abstain_for_review") ||
    (detail.round.status === "available" && detail.round.value.state === "abstained_for_review");
  const items = [...protocolMissing, ...snapshotIssues, ...gaps];

  return (
    <aside aria-labelledby="review-boundary-heading" className={styles.boundary}>
      <div>
        <h3 id="review-boundary-heading">Uncertainty and review boundary</h3>
        <p>
          {abstained
            ? "The safety workflow requested human review because evidence was incomplete."
            : "No diagnosis or clinical completeness claim is made by this prototype."}
        </p>
      </div>
      <StatusChip variant={abstained || items.length > 0 ? "attention" : "neutral"}>
        {abstained ? "Abstained" : items.length > 0 ? "Evidence gaps" : "No returned gaps"}
      </StatusChip>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>
          No missing facts were returned by the injected detail response. This is not a clinical
          completeness claim.
        </p>
      )}
      <p>
        Raw camera frames, face video, and raw voice audio are absent by design and are never shown
        as evidence here.
      </p>
    </aside>
  );
}

function TimelineEvent({ event }: { event: DomainEvent }) {
  return (
    <li className={styles.timelineEvent}>
      <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
      <div>
        <strong>{readableToken(event.type)}</strong>
        <span>
          Actor: {readableToken(event.actor.kind)} · {event.actor.id}
        </span>
        <span>Source: {readableToken(event.source)}</span>
        <span>Correlation: {event.correlationId}</span>
        <span>Reference: {event.eventId}</span>
      </div>
    </li>
  );
}

export function AuditTimeline({ detail }: { detail: ClinicianTaskDetail }) {
  const timeline = detail.timeline;
  return (
    <section aria-labelledby="audit-timeline-heading" className={styles.sectionBlock}>
      <header className={styles.sectionHeading}>
        <div>
          <h3 id="audit-timeline-heading">Event and audit timeline</h3>
          <p>Actor, source, correlation, and reference remain visible for each returned event.</p>
        </div>
      </header>
      {timeline.status === "available" ? (
        timeline.value.length > 0 ? (
          <ol className={styles.timeline}>
            {timeline.value
              .toSorted(
                (left, right) =>
                  left.occurredAt.localeCompare(right.occurredAt) ||
                  left.eventId.localeCompare(right.eventId)
              )
              .map((event) => (
                <TimelineEvent event={event} key={event.eventId} />
              ))}
          </ol>
        ) : (
          <p className={styles.resourceNotice}>No audit events were returned for this task.</p>
        )
      ) : (
        <ResourceNotice state={timeline} />
      )}
    </section>
  );
}
