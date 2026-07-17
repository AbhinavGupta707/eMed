const UNSUPPORTED_OR_NONESSENTIAL_SCHEMA_KEYWORDS = new Set([
  "format",
  "multipleOf",
  "uniqueItems"
]);

function projectSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(projectSchemaValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const projected: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (UNSUPPORTED_OR_NONESSENTIAL_SCHEMA_KEYWORDS.has(key)) {
      continue;
    }
    if (key === "oneOf") {
      projected.anyOf = projectSchemaValue(child);
      continue;
    }
    projected[key] = projectSchemaValue(child);
  }
  return projected;
}

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uniqueSchemas(values: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const serialized = JSON.stringify(value);
    if (seen.has(serialized)) return false;
    seen.add(serialized);
    return true;
  });
}

function mergePropertySchemas(values: readonly unknown[]): unknown {
  const unique = uniqueSchemas(values);
  if (unique.length === 1) return unique[0];

  const records = unique.filter(isSchemaRecord);
  if (
    records.length === unique.length &&
    records.every(({ const: literal }) => literal !== undefined)
  ) {
    const sharedType = records[0]?.type;
    if (records.every(({ type }) => type === sharedType)) {
      return { type: sharedType, enum: records.map(({ const: literal }) => literal) };
    }
  }
  return { anyOf: unique };
}

function flattenRootObjectUnion(schema: Record<string, unknown>): Record<string, unknown> {
  const variants = Array.isArray(schema.anyOf) ? schema.anyOf : null;
  if (
    !variants ||
    variants.length === 0 ||
    !variants.every(
      (variant) =>
        isSchemaRecord(variant) && variant.type === "object" && isSchemaRecord(variant.properties)
    )
  ) {
    return schema;
  }

  const objectVariants = variants as Array<
    Record<string, unknown> & { properties: Record<string, unknown> }
  >;
  const propertyNames = new Set(
    objectVariants.flatMap(({ properties }) => Object.keys(properties))
  );
  const properties: Record<string, unknown> = {};
  for (const propertyName of propertyNames) {
    properties[propertyName] = mergePropertySchemas(
      objectVariants.flatMap(({ properties: variantProperties }) =>
        propertyName in variantProperties ? [variantProperties[propertyName]] : []
      )
    );
  }

  const required = objectVariants
    .map((variant) => (Array.isArray(variant.required) ? variant.required : []))
    .reduce<string[]>(
      (shared, current) => shared.filter((propertyName) => current.includes(propertyName)),
      (objectVariants[0]?.required as string[] | undefined) ?? []
    );
  const rootAnnotations = { ...schema };
  delete rootAnnotations.anyOf;
  return {
    ...rootAnnotations,
    type: "object",
    properties,
    required,
    additionalProperties: objectVariants.every(
      ({ additionalProperties }) => additionalProperties === false
    )
      ? false
      : undefined
  };
}

/**
 * Projects a full local JSON Schema into the conservative subset accepted by
 * Fireworks structured output across model/server revisions. The original Zod
 * schema remains authoritative and must validate every returned value.
 */
export function toFireworksCompatibleJsonSchema(schema: object): object {
  const projected = projectSchemaValue(schema);
  return isSchemaRecord(projected) ? flattenRootObjectUnion(projected) : {};
}
