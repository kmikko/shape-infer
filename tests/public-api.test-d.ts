import { expectTypeOf } from "vitest";
import { generateFromFiles, generateFromText } from "../src/index.ts";
import type {
  GenerateFromTextOptions,
  GenerateResult,
  GenerateSchemaOptions,
} from "../src/index.ts";

const sharedOptions: GenerateSchemaOptions = {
  format: "zod",
  typeName: "Product",
};
expectTypeOf(sharedOptions).toMatchTypeOf<GenerateSchemaOptions>();

const generatedFromText = generateFromText({
  ...sharedOptions,
  text: '{"id":1}\n{"id":"2"}\n',
  inputFormat: "jsonl",
});
expectTypeOf(generatedFromText).toEqualTypeOf<Promise<GenerateResult>>();

const textOptions: GenerateFromTextOptions = {
  text: '{"id":1}',
  inputFormat: "json",
};
expectTypeOf(textOptions).toMatchTypeOf<GenerateFromTextOptions>();

const generatedFromFiles = generateFromFiles({
  inputPatterns: ["fixtures/*.json*"],
  inputFormat: "auto",
});
expectTypeOf(generatedFromFiles).toEqualTypeOf<Promise<GenerateResult>>();
