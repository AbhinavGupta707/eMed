import { describe, expect, it } from "vitest";

import { toFireworksCompatibleJsonSchema } from "./fireworks-schema";

describe("Fireworks JSON Schema compatibility projection", () => {
  it("flattens the root union while preserving provider-supported bounds", () => {
    const source = {
      oneOf: [
        {
          type: "object",
          properties: {
            decision: { type: "string", const: "select" },
            id: { type: "string", pattern: "^[a-z]+$", minLength: 1, maxLength: 80 },
            score: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["decision", "id", "score"],
          additionalProperties: false
        },
        {
          type: "object",
          properties: {
            decision: { type: "string", const: "abstain" },
            id: { type: "null" },
            score: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["decision", "id", "score"],
          additionalProperties: false
        }
      ]
    };

    const result = toFireworksCompatibleJsonSchema(source);

    expect(result).toEqual({
      type: "object",
      properties: {
        decision: { type: "string", enum: ["select", "abstain"] },
        id: {
          anyOf: [
            { type: "string", pattern: "^[a-z]+$", minLength: 1, maxLength: 80 },
            { type: "null" }
          ]
        },
        score: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["decision", "id", "score"],
      additionalProperties: false
    });
    expect(source.oneOf[0]?.properties.id).toHaveProperty("pattern", "^[a-z]+$");
  });

  it("preserves nested definitions, enums, constants, and strict object keys", () => {
    expect(
      toFireworksCompatibleJsonSchema({
        $defs: {
          state: { type: "string", enum: ["ready", "missing"] }
        },
        type: "object",
        properties: {
          contractVersion: { type: "string", const: "adaptive-selection.v1" },
          state: { $ref: "#/$defs/state" }
        },
        required: ["contractVersion", "state"],
        additionalProperties: false
      })
    ).toEqual({
      $defs: {
        state: { type: "string", enum: ["ready", "missing"] }
      },
      type: "object",
      properties: {
        contractVersion: { type: "string", const: "adaptive-selection.v1" },
        state: { $ref: "#/$defs/state" }
      },
      required: ["contractVersion", "state"],
      additionalProperties: false
    });
  });
});
