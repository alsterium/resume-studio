import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const [input, output, ...extra] = process.argv.slice(2);
if (process.platform !== "darwin" || !input || !output || extra.length > 0) {
  throw new Error("macOS: node tools/render-pdf.mjs <input.pdf> <new-output-directory>");
}
const pdf = resolve(input);
const directory = resolve(output);
const information = await stat(pdf);
if (!information.isFile() || information.size > 20 * 1024 * 1024) {
  throw new Error("PDFは20MiB以内の通常ファイルにしてください。");
}
await mkdir(directory);
const script = fileURLToPath(new URL("./pdf-render.swift", import.meta.url));
const result = await promisify(execFile)("/usr/bin/swift", [script, pdf, directory], {
  timeout: 120_000,
  maxBuffer: 1024 * 1024,
});
process.stdout.write(result.stdout);
