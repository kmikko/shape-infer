import type { ArrayVariant, AstMergeOptions, ObjectVariant, SchemaNode } from "../ast.ts";
import {
  buildRecordValueNode,
  inferNumberEnum,
  inferStringEnum,
  inferStringFormat,
  isRecordLikeObject,
  isRequired,
  resolveHeuristicOptions
} from "../heuristics.ts";
import type { HeuristicOptions } from "../heuristics.ts";
import {
  resolveEmissionStyleOptions
} from "./style.ts";
import type { EmissionStyleOptions, ResolvedEmissionStyleOptions } from "./style.ts";
import { isPrototypeUnsafePropertyName } from "./property-name-safety.ts";

const INDENT = "  ";

export interface ZodEmitterOptions extends EmissionStyleOptions {
  rootTypeName?: string;
  exportSchema?: boolean;
  exportType?: boolean;
  heuristics?: Partial<HeuristicOptions>;
  astMergeOptions?: Partial<AstMergeOptions>;
}

interface EmitContext {
  needsPrototypePropertyGuard: boolean;
}

export function emitZodSchema(
  node: SchemaNode,
  options: ZodEmitterOptions = {}
): string {
  const rootTypeName = options.rootTypeName ?? "Root";
  const schemaName = `${rootTypeName}Schema`;
  const exportSchema = options.exportSchema ?? true;
  const exportType = options.exportType ?? true;
  const schemaKeyword = exportSchema ? "export " : "";
  const typeKeyword = exportType ? "export " : "";
  const heuristics = resolveHeuristicOptions(options.heuristics);
  const style = resolveEmissionStyleOptions(options);
  const context: EmitContext = {
    needsPrototypePropertyGuard: false
  };
  const schemaText = emitNodeSchema(node, 0, heuristics, options.astMergeOptions, style, context);

  const helperLines = context.needsPrototypePropertyGuard
    ? [emitStripPrototypePropertiesHelper(), ""]
    : [];

  return [
    'import { z } from "zod";',
    "",
    ...helperLines,
    `${schemaKeyword}const ${schemaName} = ${schemaText};`,
    "",
    `${typeKeyword}type ${rootTypeName} = z.infer<typeof ${schemaName}>;`,
    ""
  ].join("\n");
}

function emitNodeSchema(
  node: SchemaNode,
  indentLevel: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions,
  context: EmitContext
): string {
  if (node.variants.unknown) {
    return "z.unknown()";
  }

  const variants = new Set<string>();

  if (node.variants.object) {
    variants.add(
      emitObjectSchema(
        node.variants.object,
        indentLevel,
        heuristics,
        astMergeOptions,
        style,
        context
      )
    );
  }

  if (node.variants.array) {
    variants.add(
      emitArraySchema(node.variants.array, indentLevel, heuristics, astMergeOptions, style, context)
    );
  }

  if (node.variants.string) {
    const formatCandidate = inferStringFormat(node.variants.string, heuristics);
    if (style.typeMode === "loose") {
      variants.add(applyStringFormat("z.string()", formatCandidate?.format));
    } else {
      const enumCandidate = inferStringEnum(node.variants.string, heuristics);
      if (enumCandidate) {
        variants.add(
          `z.enum([${enumCandidate.values.map((value) => JSON.stringify(value)).join(", ")}])`
        );
      } else {
        variants.add(applyStringFormat("z.string()", formatCandidate?.format));
      }
    }
  }

  if (node.variants.integer || node.variants.number) {
    if (style.typeMode === "loose") {
      variants.add(node.variants.number ? "z.number()" : "z.number().int()");
    } else {
      const enumCandidate = inferNumberEnum(
        node.variants.integer,
        node.variants.number,
        heuristics
      );
      if (enumCandidate) {
        variants.add(
          `z.union([${enumCandidate.values
            .map((value) => `z.literal(${formatNumberLiteral(value)})`)
            .join(", ")}])`
        );
      } else {
        variants.add(node.variants.number ? "z.number()" : "z.number().int()");
      }
    }
  }

  if (node.variants.boolean) {
    variants.add("z.boolean()");
  }

  if (node.variants.null) {
    variants.add("z.null()");
  }

  const resolvedVariants = [...variants];

  if (resolvedVariants.length === 0) {
    return "z.unknown()";
  }

  if (resolvedVariants.length > heuristics.maxUnionSize) {
    return "z.unknown()";
  }

  if (resolvedVariants.length === 1) {
    return resolvedVariants[0];
  }

  if (style.typeMode === "loose") {
    return emitLooseUnion(resolvedVariants);
  }

  return `z.union([${resolvedVariants.join(", ")}])`;
}

function emitObjectSchema(
  variant: ObjectVariant,
  indentLevel: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions,
  context: EmitContext
): string {
  if (isRecordLikeObject(variant, heuristics)) {
    const valueNode = buildRecordValueNode(variant, astMergeOptions);
    const valueSchema = emitNodeSchema(
      valueNode,
      indentLevel + 1,
      heuristics,
      astMergeOptions,
      style,
      context
    );
    return `z.record(z.string(), ${valueSchema})`;
  }

  const propertyNames = [...variant.properties.keys()].sort((left, right) =>
    left.localeCompare(right)
  );

  if (propertyNames.length === 0) {
    return "z.object({})";
  }

  const baseIndent = INDENT.repeat(indentLevel);
  const propertyIndent = INDENT.repeat(indentLevel + 1);
  const propertyEntries: Array<{
    name: string;
    schema: string;
    optional: boolean;
  }> = [];
  let hasUnsafePropertyName = false;

  for (const propertyName of propertyNames) {
    const property = variant.properties.get(propertyName);
    if (!property) {
      continue;
    }

    const optional =
      style.allOptionalProperties ||
      !isRequired(property.seenCount, variant.count, heuristics);
    const schema = emitNodeSchema(
      property.node,
      indentLevel + 1,
      heuristics,
      astMergeOptions,
      style,
      context
    );
    propertyEntries.push({
      name: propertyName,
      schema,
      optional
    });
    if (isPrototypeUnsafePropertyName(propertyName)) {
      hasUnsafePropertyName = true;
    }
  }

  if (propertyEntries.length === 0) {
    return "z.object({})";
  }

  if (!hasUnsafePropertyName) {
    const lines = propertyEntries.map(({ name, schema, optional }) => {
      const propertySchema = optional ? `${schema}.optional()` : schema;
      return `${propertyIndent}${JSON.stringify(name)}: ${propertySchema},`;
    });
    return `z.object({\n${lines.join("\n")}\n${baseIndent}})`;
  }

  context.needsPrototypePropertyGuard = true;
  const lines = propertyEntries.map(({ name, schema, optional }) => {
    const propertySchema = optional ? `${schema}.optional()` : schema;
    return `${propertyIndent}[${JSON.stringify(name)}, ${propertySchema}],`;
  });
  return `z.preprocess(stripPrototypeProperties, z.object(Object.fromEntries([\n${lines.join("\n")}\n${baseIndent}])))`;
}

function emitArraySchema(
  variant: ArrayVariant,
  indentLevel: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions,
  context: EmitContext
): string {
  if (variant.elementCount === 0) {
    return "z.array(z.unknown())";
  }

  const elementSchema = emitNodeSchema(
    variant.element,
    indentLevel + 1,
    heuristics,
    astMergeOptions,
    style,
    context
  );
  return `z.array(${elementSchema})`;
}

function emitLooseUnion(variants: string[]): string {
  const nonNullVariants = variants.filter((variant) => variant !== "z.null()");
  const hasNull = nonNullVariants.length !== variants.length;

  if (!hasNull) {
    return `z.union([${variants.join(", ")}])`;
  }

  if (nonNullVariants.length === 0) {
    return "z.null()";
  }

  if (nonNullVariants.length === 1) {
    return `${nonNullVariants[0]}.nullable()`;
  }

  return `z.union([${nonNullVariants.join(", ")}]).nullable()`;
}

function applyStringFormat(baseSchema: string, format?: string): string {
  switch (format) {
    case "date-time":
      return `${baseSchema}.datetime()`;
    case "date":
      return `${baseSchema}.date()`;
    case "email":
      return `${baseSchema}.email()`;
    case "uuid":
      return `${baseSchema}.uuid()`;
    case "uri":
      return `${baseSchema}.url()`;
    default:
      return baseSchema;
  }
}

function formatNumberLiteral(value: number): string {
  if (Object.is(value, -0)) {
    return "-0";
  }
  return Number.isInteger(value) ? String(value) : String(value);
}

function emitStripPrototypePropertiesHelper(): string {
  return [
    "const stripPrototypeProperties = (input: unknown): unknown => {",
    '  if (!input || typeof input !== "object" || Array.isArray(input)) {',
    "    return input;",
    "  }",
    "  const copy = Object.create(null) as Record<string, unknown>;",
    "  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {",
    "    copy[key] = value;",
    "  }",
    "  return copy;",
    "};"
  ].join("\n");
}
