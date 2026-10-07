import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renameApp } from "../rename-app.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const paths = [
  "package.json",
  "index.html",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/tauri.conf.json",
  "src-tauri/src",
  "src-tauri/tests",
  "src-tauri/examples",
];
const options = {
  name: "Application Studio",
  slug: "application-studio",
  identifier: "com.example.application-studio",
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "resume-studio-rename-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of paths) await cp(join(repository, path), join(root, path), { recursive: true });
  return root;
}
const load = (root, path) => readFile(join(root, path), "utf8");

test("actual repository metadata, Rust imports, output names and a second rename remain consistent", async (t) => {
  const root = await fixture(t);
  const edits = await renameApp(root, options);
  const config = JSON.parse(await load(root, "src-tauri/tauri.conf.json"));
  assert.equal(JSON.parse(await load(root, "package.json")).name, options.slug);
  assert.equal(config.productName, options.name);
  assert.equal(config.identifier, options.identifier);
  assert.equal(config.app.windows[0].title, options.name);
  assert.equal(config.app.windows[0].label, "main");
  assert.match(await load(root, "src-tauri/Cargo.toml"), /name = "application_studio_lib"/u);
  assert.match(await load(root, "src-tauri/Cargo.lock"), /name = "application-studio"/u);
  assert.match(await load(root, "src-tauri/src/main.rs"), /application_studio_lib::run/u);
  assert.match(await load(root, "src-tauri/tests/generation.rs"), /application_studio_lib/u);
  for (const path of edits.filter((path) => path.endsWith(".rs")))
    assert.doesNotMatch(await load(root, path), /\bresume_studio_lib\b/u);
  assert.match(await load(root, "index.html"), /<title>Application Studio<\/title>/u);
  await renameApp(root, options);
  assert.match(await load(root, "src-tauri/src/main.rs"), /application_studio_lib::run/u);
  await renameApp(root, { ...options, name: "A & $& ' Studio", slug: "another-studio" });
  assert.ok(
    (await load(root, "index.html")).includes("<title>A &amp; $&amp; &#39; Studio</title>"),
  );
  assert.match(await load(root, "src-tauri/src/main.rs"), /another_studio_lib::run/u);
});

test("invalid names, identifiers and dependency collisions do not write any metadata", async (t) => {
  const root = await fixture(t);
  const files = paths.filter(
    (path) => !["src-tauri/src", "src-tauri/tests", "src-tauri/examples"].includes(path),
  );
  const before = await Promise.all(files.map((path) => load(root, path)));
  for (const change of [
    { name: "../escape" },
    { name: " " },
    { name: "invalid\nname" },
    { name: "invalid." },
    { slug: "Upper_Name" },
    { slug: "tauri" },
    { identifier: "example" },
    { identifier: "com.example;command" },
  ])
    await assert.rejects(renameApp(root, { ...options, ...change }));
  assert.deepEqual(await Promise.all(files.map((path) => load(root, path))), before);
});

test("inconsistent Cargo or unsupported window metadata fails before writing", async (t) => {
  const root = await fixture(t);
  const path = "src-tauri/tauri.conf.json";
  const config = JSON.parse(await load(root, path));
  config.app.windows[0].label = "other";
  await writeFile(join(root, path), JSON.stringify(config));
  const before = await load(root, "package.json");
  await assert.rejects(renameApp(root, options), /メタデータ/u);
  assert.equal(await load(root, "package.json"), before);
});
