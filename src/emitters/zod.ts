import { ArrayVariant, ObjectVariant, SchemaNode } from "../ast";

const INDENT = "  ";

export interface ZodEmitterOptions {
  rootTypeName?: string;
  exportSchema?: boolean;
  exportType?: boolean;
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
  const schemaText = emitNodeSchema(node, 0);

  return [
    'import { z } from "zod";',
    "",
    `${schemaKeyword}const ${schemaName} = ${schemaText};`,
    "",
    `${typeKeyword}type ${rootTypeName} = z.infer<typeof ${schemaName}>;`,
    ""
  ].join("\n");
}

function emitNodeSchema(node: SchemaNode, indentLevel: number): string {
  if (node.variants.unknown) {
    return "z.unknown()";
  }

  const variants: string[] = [];

  if (node.variants.object) {
    variants.push(emitObjectSchema(node.variants.object, indentLevel));
  }

  if (node.variants.array) {
    variants.push(emitArraySchema(node.variants.array, indentLevel));
  }

  if (node.variants.string) {
    variants.push("z.string()");
  }

  if (node.variants.integer || node.variants.number) {
    variants.push("z.number()");
  }

  if (node.variants.boolean) {
    variants.push("z.boolean()");
  }

  if (node.variants.null) {
    variants.push("z.null()");
  }

  if (variants.length === 0) {
    return "z.unknown()";
  }

  if (variants.length === 1) {
    return variants[0];
  }

  return `z.union([${variants.join(", ")}])`;
}

function emitObjectSchema(variant: ObjectVariant, indentLevel: number): string {
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

    const optional = property.seenCount < variant.count;
    const schema = emitNodeSchema(property.node, indentLevel + 1);
    const propertySchema = optional ? `${schema}.optional()` : schema;
    lines.push(`${propertyIndent}${JSON.stringify(propertyName)}: ${propertySchema},`);
  }

  return `z.object({\n${lines.join("\n")}\n${baseIndent}})`;
}

function emitArraySchema(variant: ArrayVariant, indentLevel: number): string {
  if (variant.elementCount === 0) {
    return "z.array(z.unknown())";
  }

  const elementSchema = emitNodeSchema(variant.element, indentLevel + 1);
  return `z.array(${elementSchema})`;
}
