import type { CompanionPhoneSnapshot } from "../../../packages/companion/src/index";
import { FINGER_PPG_ALGORITHM_VERSION } from "../../../packages/assessments/providers/finger-ppg/signal";

export function validFingerCandidate(
  snapshot: CompanionPhoneSnapshot,
  operationId = crypto.randomUUID()
) {
  return {
    operationId,
    expectedSessionVersion: snapshot.sessionVersion,
    taskId: snapshot.task.taskId,
    taskKind: "finger_pulse" as const,
    clientObservedAt: new Date().toISOString(),
    rawMediaStored: false as const,
    outcome: "derived_candidate" as const,
    derived: {
      pulseBpm: 72,
      durationMs: 15_000,
      algorithmVersion: FINGER_PPG_ALGORITHM_VERSION,
      quality: {
        status: "unreviewed" as const,
        score: 0.9,
        reasons: [],
        metrics: {
          durationMs: 15_000,
          sampleCount: 451,
          cadenceHz: 30,
          jitterRatio: 0.01,
          droppedFrameRatio: 0.01,
          coverage: 0.9,
          saturation: 0.05,
          motion: 0.05,
          signalStrength: 0.01,
          spectralBpm: 72,
          autocorrelationBpm: 72,
          estimatorDifferenceBpm: 0,
          torchAvailable: 0
        }
      }
    }
  };
}
