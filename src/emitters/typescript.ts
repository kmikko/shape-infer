import { ArrayVariant, AstMergeOptions, ObjectVariant, SchemaNode } from "../ast";
import {
  HeuristicOptions,
  buildRecordValueNode,
  inferNumberEnum,
  inferStringEnum,
  isRecordLikeObject,
  isRequired,
  resolveHeuristicOptions
} from "../heuristics";
import {
  EmissionStyleOptions,
  ResolvedEmissionStyleOptions,
  resolveEmissionStyleOptions
} from "./style";

const INDENT = "  ";

export interface TypeScriptEmitterOptions extends EmissionStyleOptions {
  rootTypeName?: string;
  exportType?: boolean;
  heuristics?: Partial<HeuristicOptions>;
  astMergeOptions?: Partial<AstMergeOptions>;
}

export function emitTypeScriptType(
  node: SchemaNode,
  options: TypeScriptEmitterOptions = {}
): string {
  const rootTypeName = options.rootTypeName ?? "Root";
  const exportType = options.exportType ?? true;
  const keyword = exportType ? "export " : "";
  const heuristics = resolveHeuristicOptions(options.heuristics);
  const style = resolveEmissionStyleOptions(options);
  const typeText = emitNodeType(node, 0, heuristics, options.astMergeOptions, style);

  return `${keyword}type ${rootTypeName} = ${typeText};\n`;
}

function emitNodeType(
  node: SchemaNode,
  indentLevel: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions
): string {
  if (node.variants.unknown) {
    return "unknown";
  }

  const variants = new Set<string>();

  if (node.variants.object) {
    variants.add(
      emitObjectType(node.variants.object, indentLevel, heuristics, astMergeOptions, style)
    );
  }

  if (node.variants.array) {
    variants.add(
      emitArrayType(node.variants.array, indentLevel, heuristics, astMergeOptions, style)
    );
  }

  if (node.variants.string) {
    if (style.typeMode === "loose") {
      variants.add("string");
    } else {
      const stringEnum = inferStringEnum(node.variants.string, heuristics);
      if (stringEnum) {
        variants.add(stringEnum.values.map((value) => JSON.stringify(value)).join(" | "));
      } else {
        variants.add("string");
      }
    }
  }

  if (node.variants.integer || node.variants.number) {
    if (style.typeMode === "loose") {
      variants.add("number");
    } else {
      const numberEnum = inferNumberEnum(node.variants.integer, node.variants.number, heuristics);
      if (numberEnum) {
        variants.add(numberEnum.values.join(" | "));
      } else {
        variants.add("number");
      }
    }
  }

  if (node.variants.boolean) {
    variants.add("boolean");
  }

  if (node.variants.null) {
    variants.add("null");
  }

  const resolvedVariants = [...variants];

  if (resolvedVariants.length === 0) {
    return "unknown";
  }

  if (resolvedVariants.length > heuristics.maxUnionSize) {
    return "unknown";
  }

  if (resolvedVariants.length === 1) {
    return resolvedVariants[0];
  }

  return resolvedVariants.join(" | ");
}

function emitObjectType(
  variant: ObjectVariant,
  indentLevel: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions
): string {
  if (isRecordLikeObject(variant, heuristics)) {
    const valueNode = buildRecordValueNode(variant, astMergeOptions);
    const valueType = emitNodeType(valueNode, indentLevel + 1, heuristics, astMergeOptions, style);
    return `Record<string, ${valueType}>`;
  }

  const propertyNames = [...variant.properties.keys()].sort((left, right) =>
    left.localeCompare(right)
  );

  if (propertyNames.length === 0) {
    return "{}";
  }

  const baseIndent = INDENT.repeat(indentLevel);
  const propertyIndent = INDENT.repeat(indentLevel + 1);
  const lines: string[] = [];

  for (const propertyName of propertyNames) {
    const property = variant.properties.get(propertyName);
    if (!property) {
      continue;
    }

    const optional =
      style.allOptionalProperties ||
      !isRequired(property.seenCount, variant.count, heuristics);
    const tsName = formatPropertyName(propertyName);
    const tsType = emitNodeType(
      property.node,
      indentLevel + 1,
      heuristics,
      astMergeOptions,
      style
    );
    lines.push(`${propertyIndent}${tsName}${optional ? "?" : ""}: ${tsType};`);
  }

  return `{\n${lines.join("\n")}\n${baseIndent}}`;
}

function emitArrayType(
  variant: ArrayVariant,
  indentLevel: number,
  heuristics: HeuristicOptions,
  astMergeOptions: Partial<AstMergeOptions> | undefined,
  style: ResolvedEmissionStyleOptions
): string {
  if (variant.elementCount === 0) {
    return "Array<unknown>";
  }
  const elementType = emitNodeType(
    variant.element,
    indentLevel + 1,
    heuristics,
    astMergeOptions,
    style
  );
  return `Array<${elementType}>`;
}

function formatPropertyName(propertyName: string): string {
  return isValidIdentifier(propertyName) ? propertyName : JSON.stringify(propertyName);
}

function isValidIdentifier(value: string): boolean {
  return /^[$A-Za-z_][$0-9A-Za-z_]*$/.test(value);
}
