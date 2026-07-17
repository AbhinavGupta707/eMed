import {
  ClinicalSnapshotSchema,
  type ClinicalRecordAdapter,
  type ClinicalSnapshot
} from "@homerounds/clinical-records";
import type { HomeRoundsRepository } from "@homerounds/persistence";

import { deterministicUuid } from "./crypto";
import { OrchestrationError } from "./orchestration";

export class SnapshotService<TFact> {
  constructor(
    private readonly repository: HomeRoundsRepository<ClinicalSnapshot, TFact>,
    private readonly adapter: ClinicalRecordAdapter,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async getOrCreate(patientId: string): Promise<ClinicalSnapshot> {
    const existing = await this.repository.getLatestClinicalSnapshot(
      patientId,
      ClinicalSnapshotSchema
    );
    if (existing) return existing.document;

    const loaded = await this.adapter.loadSnapshot({
      patientId,
      asOf: this.now(),
      observationFreshnessDays: 30
    });
    if (!loaded.ok) throw new OrchestrationError("snapshot_unavailable", true);

    try {
      await this.repository.saveClinicalSnapshot(
        {
          snapshotId: deterministicUuid("clinical-snapshot", patientId, loaded.snapshot.asOf),
          patientId,
          snapshotVersion: 1,
          asOf: loaded.snapshot.asOf,
          document: loaded.snapshot
        },
        ClinicalSnapshotSchema
      );
    } catch {
      const concurrent = await this.repository.getLatestClinicalSnapshot(
        patientId,
        ClinicalSnapshotSchema
      );
      if (concurrent) return concurrent.document;
      throw new OrchestrationError("snapshot_unavailable", true);
    }
    return ClinicalSnapshotSchema.parse(loaded.snapshot);
  }
}
