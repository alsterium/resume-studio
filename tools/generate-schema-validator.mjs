import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";

// Compile at development/build time. The desktop CSP never permits eval.
const root = new URL("../", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("schemas/project-v1.schema.json", root), "utf8"));
const ajv = new Ajv({ strict: true, code: { source: true, esm: true }, inlineRefs: false });
const validator = ajv.compile(schema);
mkdirSync(new URL(".generated/", root), { recursive: true });
let code = standaloneCode(ajv, validator);
// Ajv's standalone ESM still emits CJS runtime helper references. Convert only
// these known helpers to static imports so the browser needs no require/eval.
for (const helper of ["ucs2length", "equal"]) {
  const reference = `require("ajv/dist/runtime/${helper}").default`;
  if (code.includes(reference)) {
    code =
      `import ${helper} from "ajv/dist/runtime/${helper}.js";\n` +
      code.replaceAll(reference, `(${helper}.default ?? ${helper})`);
  }
}
if (code.includes("require(")) throw new Error("Unmapped Ajv runtime helper");
writeFileSync(new URL(".generated/project-validator.js", root), code);
writeFileSync(
  new URL(".generated/project-validator.d.ts", root),
  'import type { Project } from "../src/domain/project";\n' +
    "declare function validate(value: unknown): value is Project;\nexport default validate;\n",
);
