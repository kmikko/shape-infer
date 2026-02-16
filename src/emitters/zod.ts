import { ArrayVariant, AstMergeOptions, ObjectVariant, SchemaNode } from "../ast";
import {
  HeuristicOptions,
  buildRecordValueNode,
  inferNumberEnum,
  inferStringEnum,
  inferStringFormat,
  isRecordLikeObject,
  isRequired,
  resolveHeuristicOptions
} from "../heuristics";

const INDENT = "  ";

export interface ZodEmitterOptions {
  rootTypeName?: string;
  exportSchema?: boolean;
  exportType?: boolean;
  heuristics?: Partial<HeuristicOptions>;
  astMergeOptions?: Partial<AstMergeOptions>;
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
  const schemaText = emitNodeSchema(node, 0, heuristics, options.astMergeOptions);

  return [
    'import { z } from "zod";',
    "",
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
  astMergeOptions: Partial<AstMergeOptions> | undefined
): string {
  if (node.variants.unknown) {
    return "z.unknown()";
  }

  const variants = new Set<string>();

  if (node.variants.object) {
    variants.add(
      emitObjectSchema(node.variants.object, indentLevel, heuristics, astMergeOptions)
    );
  }

  if (node.variants.array) {
    variants.add(
      emitArraySchema(node.variants.array, indentLevel, heuristics, astMergeOptions)
    );
  }

  if (node.variants.string) {
    const enumCandidate = inferStringEnum(node.variants.string, heuristics);
    if (enumCandidate) {
      variants.add(
        `z.enum([${enumCandidate.values.map((value) => JSON.stringify(value)).join(", ")}])`
      );
    } else {
      const formatCandidate = inferStringFormat(node.variants.string, heuristics);
      variants.add(applyStringFormat("z.string()", formatCandidate?.format));
    }
  }

  if (node.variants.integer || node.variants.number) {
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

  return `z.union([${resolvedVariants.join(", ")}])`;
}

function emitObjectSchema(
  variant: ObjectVariant,
  indentLevel: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined
): string {
  if (isRecordLikeObject(variant, heuristics)) {
    const valueNode = buildRecordValueNode(variant, astMergeOptions);
    const valueSchema = emitNodeSchema(valueNode, indentLevel + 1, heuristics, astMergeOptions);
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
  const lines: string[] = [];

  for (const propertyName of propertyNames) {
    const property = variant.properties.get(propertyName);
    if (!property) {
      continue;
    }

    const optional = !isRequired(property.seenCount, variant.count, heuristics);
    const schema = emitNodeSchema(property.node, indentLevel + 1, heuristics, astMergeOptions);
    const propertySchema = optional ? `${schema}.optional()` : schema;
    lines.push(`${propertyIndent}${JSON.stringify(propertyName)}: ${propertySchema},`);
  }

  return `z.object({\n${lines.join("\n")}\n${baseIndent}})`;
}

function emitArraySchema(
  variant: ArrayVariant,
  indentLevel: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined
): string {
  if (variant.elementCount === 0) {
    return "z.array(z.unknown())";
  }

  const elementSchema = emitNodeSchema(
    variant.element,
    indentLevel + 1,
    heuristics,
    astMergeOptions
  );
  return `z.array(${elementSchema})`;
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
