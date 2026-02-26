export type TypeMode = "strict" | "loose";

export interface EmissionStyleOptions {
  typeMode?: TypeMode;
  allOptionalProperties?: boolean;
}

export interface ResolvedEmissionStyleOptions {
  typeMode: TypeMode;
  allOptionalProperties: boolean;
}

export function resolveEmissionStyleOptions(
  options: EmissionStyleOptions = {},
): ResolvedEmissionStyleOptions {
  const typeMode = options.typeMode ?? "strict";
  if (typeMode !== "strict" && typeMode !== "loose") {
    throw new Error(`Unsupported type mode: ${String(typeMode)}.`);
  }

  return {
    typeMode,
    allOptionalProperties: options.allOptionalProperties ?? false,
  };
}
