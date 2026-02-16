import { ArrayVariant, ObjectVariant, SchemaNode } from "../ast";

const INDENT = "  ";

export interface TypeScriptEmitterOptions {
  rootTypeName?: string;
  exportType?: boolean;
}

export function emitTypeScriptType(
  node: SchemaNode,
  options: TypeScriptEmitterOptions = {}
): string {
  const rootTypeName = options.rootTypeName ?? "Root";
  const exportType = options.exportType ?? true;
  const keyword = exportType ? "export " : "";
  const typeText = emitNodeType(node, 0);

  return `${keyword}type ${rootTypeName} = ${typeText};\n`;
}

function emitNodeType(node: SchemaNode, indentLevel: number): string {
  if (node.variants.unknown) {
    return "unknown";
  }

  const variants: string[] = [];

  if (node.variants.object) {
    variants.push(emitObjectType(node.variants.object, indentLevel));
  }

  if (node.variants.array) {
    variants.push(emitArrayType(node.variants.array, indentLevel));
  }

  if (node.variants.string) {
    variants.push("string");
  }

  if (node.variants.integer || node.variants.number) {
    variants.push("number");
  }

  if (node.variants.boolean) {
    variants.push("boolean");
  }

  if (node.variants.null) {
    variants.push("null");
  }

  if (variants.length === 0) {
    return "unknown";
  }

  if (variants.length === 1) {
    return variants[0];
  }

  return variants.join(" | ");
}

function emitObjectType(variant: ObjectVariant, indentLevel: number): string {
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

    const optional = property.seenCount < variant.count;
    const tsName = formatPropertyName(propertyName);
    const tsType = emitNodeType(property.node, indentLevel + 1);
    lines.push(`${propertyIndent}${tsName}${optional ? "?" : ""}: ${tsType};`);
  }

  return `{\n${lines.join("\n")}\n${baseIndent}}`;
}

function emitArrayType(variant: ArrayVariant, indentLevel: number): string {
  if (variant.elementCount === 0) {
    return "Array<unknown>";
  }
  const elementType = emitNodeType(variant.element, indentLevel + 1);
  return `Array<${elementType}>`;
}

function formatPropertyName(propertyName: string): string {
  return isValidIdentifier(propertyName) ? propertyName : JSON.stringify(propertyName);
}

function isValidIdentifier(value: string): boolean {
  return /^[$A-Za-z_][$0-9A-Za-z_]*$/.test(value);
}
