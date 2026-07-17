import {
  VoiceAgentReportProposalSchema,
  type PatientReport,
  type VoiceAgentReportProposal
} from "@homerounds/contracts";
import { describe, expect, it, vi } from "vitest";

import { VoiceProposalReviewController } from "./proposal-review-controller";

const ROUND_ID = "b8731a19-3b2e-4c44-a1ab-d92b96b7e26a";
const REPORT_ID = "7ed2fa3a-b3fd-47a8-bbf5-4a5389800f80";
const NOW = "2026-07-17T12:00:00.000Z";

function proposal(overrides: Partial<VoiceAgentReportProposal> = {}): VoiceAgentReportProposal {
  return VoiceAgentReportProposalSchema.parse({
    contractVersion: "voice-report-proposal.v1",
    weakness: "mild",
    palpitations: "intermittent",
    redFlags: {
      chestPain: "no",
      severeBreathlessness: "no",
      fainted: "no"
    },
    note: "Synthetic patient reports feeling different this morning.",
    unresolvedFields: [],
    ...overrides
  });
}

function controller(
  input: VoiceAgentReportProposal,
  onConfirmed: (report: PatientReport) => Promise<void> = vi.fn(async () => undefined)
) {
  return new VoiceProposalReviewController({
    proposal: input,
    roundId: ROUND_ID,
    onConfirmed,
    createId: () => REPORT_ID,
    now: () => NOW
  });
}

function reviewAll(
  subject: VoiceProposalReviewController,
  values: {
    weakness?: PatientReport["weakness"];
    palpitations?: PatientReport["palpitations"];
    chestPain?: PatientReport["redFlags"]["chestPain"];
    severeBreathlessness?: PatientReport["redFlags"]["severeBreathlessness"];
    fainted?: PatientReport["redFlags"]["fainted"];
  } = {}
): void {
  subject.reviewField("weakness", values.weakness ?? "mild");
  subject.reviewField("palpitations", values.palpitations ?? "intermittent");
  subject.reviewField("chest_pain", values.chestPain ?? "no");
  subject.reviewField("severe_breathlessness", values.severeBreathlessness ?? "no");
  subject.reviewField("fainted", values.fainted ?? "no");
  subject.reviewNote("keep");
  subject.setExplicitConfirmation(true);
}

describe("voice proposal review controller", () => {
  it("keeps a resolved proposal unconfirmed until every field and final confirmation are explicit", async () => {
    const onConfirmed = vi.fn(async () => undefined);
    const subject = controller(proposal(), onConfirmed);

    await subject.confirm();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(subject.getSnapshot()).toMatchObject({
      status: "review_required",
      firstIncompleteField: "weakness",
      canConfirm: false
    });

    reviewAll(subject);
    expect(subject.getSnapshot().canConfirm).toBe(true);
    await subject.confirm();

    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledWith({
      reportId: REPORT_ID,
      roundId: ROUND_ID,
      weakness: "mild",
      palpitations: "intermittent",
      redFlags: {
        chestPain: "no",
        severeBreathlessness: "no",
        fainted: "no"
      },
      note: "Synthetic patient reports feeling different this morning.",
      inputMode: "voice_confirmed",
      confirmedAt: NOW
    });
    expect(subject.getSnapshot().status).toBe("confirmed");
  });

  it("preserves explicitly reviewed unknown and unsure values from an unresolved proposal", async () => {
    const onConfirmed = vi.fn(async () => undefined);
    const unresolved = proposal({
      weakness: "unknown",
      palpitations: "unknown",
      redFlags: {
        chestPain: "unsure",
        severeBreathlessness: "no",
        fainted: "unsure"
      },
      unresolvedFields: ["weakness", "palpitations", "chest_pain", "fainted"]
    });
    const subject = controller(unresolved, onConfirmed);

    reviewAll(subject, {
      weakness: "unknown",
      palpitations: "unknown",
      chestPain: "unsure",
      fainted: "unsure"
    });
    await subject.confirm();

    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        weakness: "unknown",
        palpitations: "unknown",
        redFlags: {
          chestPain: "unsure",
          severeBreathlessness: "no",
          fainted: "unsure"
        }
      })
    );
    expect(subject.getSnapshot().announcement).toMatch(/preserved exactly/i);
  });

  it("passes an explicitly reviewed red flag unchanged and never sets urgency itself", async () => {
    const onConfirmed = vi.fn<(report: PatientReport) => Promise<void>>(async () => undefined);
    const subject = controller(
      proposal({
        redFlags: {
          chestPain: "yes",
          severeBreathlessness: "no",
          fainted: "no"
        }
      }),
      onConfirmed
    );

    reviewAll(subject, { chestPain: "yes" });
    await subject.confirm();

    const report = onConfirmed.mock.calls[0]?.[0];
    expect(report?.redFlags.chestPain).toBe("yes");
    expect(JSON.stringify(report)).not.toMatch(/urgency|diagnos|action/i);
  });

  it("retains reviewed values when confirmation fails and permits an exact retry", async () => {
    const onConfirmed = vi
      .fn<(report: PatientReport) => Promise<void>>()
      .mockRejectedValueOnce(new Error("synthetic handoff rejection"))
      .mockResolvedValueOnce(undefined);
    const subject = controller(proposal(), onConfirmed);
    reviewAll(subject);

    await subject.confirm();
    expect(subject.getSnapshot()).toMatchObject({ status: "error", canConfirm: true });
    expect(subject.getSnapshot().answers.weakness).toBe("mild");

    await subject.confirm();
    expect(onConfirmed).toHaveBeenCalledTimes(2);
    expect(subject.getSnapshot().status).toBe("confirmed");
  });
});
