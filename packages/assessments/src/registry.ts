import type {
  OpticalAssessmentProvider,
  OpticalProviderKind
} from "@homerounds/contracts/assessment";
import { z } from "zod";

export const DEFAULT_RELEASE_OPTICAL_PROVIDER = "finger_ppg" as const;

export const OpticalProviderSelectionSchema = z.enum(["finger_ppg", "vitallens"]);

export type OpticalProviderSelection = z.infer<typeof OpticalProviderSelectionSchema>;

export class OpticalProviderRegistrationError extends Error {
  public readonly code = "optical_provider_not_registered" as const;

  public constructor(public readonly provider: OpticalProviderKind) {
    super(`Release-selected optical provider is not registered: ${provider}`);
    this.name = "OpticalProviderRegistrationError";
  }
}

export type OpticalProviderRegistryInput = Readonly<{
  selected: OpticalProviderSelection;
  providers: Partial<Readonly<Record<OpticalProviderKind, OpticalAssessmentProvider>>>;
}>;

/**
 * Resolves exactly the release-selected provider. It deliberately never falls
 * back to another sensor because consent, data flow, evidence, and provider
 * provenance differ between local finger PPG and proxied VitalLens.
 */
export function resolveReleaseOpticalProvider(
  input: OpticalProviderRegistryInput
): OpticalAssessmentProvider {
  const selected = OpticalProviderSelectionSchema.parse(input.selected);
  const provider = input.providers[selected];

  if (!provider || provider.kind !== selected) {
    throw new OpticalProviderRegistrationError(selected);
  }

  return provider;
}
