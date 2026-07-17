import { ProtocolResultSchema } from "@homerounds/contracts";
import { z } from "zod";

export const AllowedActionSchema = z.enum(["create_programme_task", "show_emergency_guidance"]);

export type AllowedAction = z.infer<typeof AllowedActionSchema>;

export const ActionProposalSchema = z
  .object({
    actionType: AllowedActionSchema,
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    protocolResult: ProtocolResultSchema.strict(),
    proposedBy: z.literal("deterministic_protocol")
  })
  .strict()
  .superRefine((proposal, context) => {
    if (!proposal.protocolResult.allowedActions.includes(proposal.actionType)) {
      context.addIssue({
        code: "custom",
        path: ["actionType"],
        message: "the proposed action is not allowed by the deterministic protocol result"
      });
    }
  });

export const ActionConfirmationSchema = z
  .object({
    confirmed: z.literal(true),
    confirmedAt: z.iso.datetime(),
    confirmationKind: z.literal("explicit_patient_confirmation")
  })
  .strict();

export const ActionAuthorizationSchema = z
  .object({
    authorized: z.literal(true),
    actorKind: z.enum(["patient", "clinician", "system"]),
    actorId: z.string().min(1).max(120),
    scope: z.enum(["programme_task:create", "emergency_guidance:present"])
  })
  .strict();

export const ExecuteActionInputSchema = z
  .object({
    proposal: ActionProposalSchema,
    confirmation: ActionConfirmationSchema,
    authorization: ActionAuthorizationSchema,
    expectedStateVersion: z.number().int().nonnegative(),
    correlationId: z.string().min(1).max(120)
  })
  .strict()
  .superRefine((input, context) => {
    const requiredScope =
      input.proposal.actionType === "create_programme_task"
        ? "programme_task:create"
        : "emergency_guidance:present";
    if (input.authorization.scope !== requiredScope) {
      context.addIssue({
        code: "custom",
        path: ["authorization", "scope"],
        message: `action requires ${requiredScope}`
      });
    }
  });

export type ActionProposal = z.infer<typeof ActionProposalSchema>;
export type ExecuteActionInput = z.infer<typeof ExecuteActionInputSchema>;
