import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Prepare every edit before writing; invalid input or metadata cannot partially rename a project.
export async function renameApp(root, { name, slug, identifier }) {
  if (
    typeof name !== "string" ||
    name !== name.trim() ||
    !name.length ||
    name.length > 64 ||
    /[\p{Cc}<>:"/\\|?*]/u.test(name) ||
    name.endsWith(".")
  )
    throw new Error("nameは1〜64文字の、ファイル名に使用できるアプリ名を指定してください。");
  if (
    typeof slug !== "string" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug) ||
    slug.length > 64
  )
    throw new Error("slugは英小文字から始まるkebab-caseで指定してください。");
  if (
    typeof identifier !== "string" ||
    identifier.length > 255 ||
    !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){2,}$/u.test(identifier)
  )
    throw new Error(
      "identifierは逆DNS形式（例: com.example.application-studio）で指定してください。",
    );

  const edits = new Map();
  const load = (path) => readFile(join(root, path), "utf8");
  const packageJson = JSON.parse(await load("package.json"));
  const config = JSON.parse(await load("src-tauri/tauri.conf.json"));
  const cargo = await load("src-tauri/Cargo.toml");
  const lock = await load("src-tauri/Cargo.lock");
  const html = await load("index.html");
  const oldSlug = packageJson.name;
  const packageSection = cargo.match(/\[package\]([\s\S]*?)(?=\n\[|$)/u);
  const libSection = cargo.match(/\[lib\]([\s\S]*?)(?=\n\[|$)/u);
  const oldCrate = libSection?.[1].match(/^name = "([a-z_][a-z0-9_]*)"$/mu)?.[1];
  if (
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(oldSlug) ||
    !packageSection?.[1].includes(`\nname = "${oldSlug}"\n`) ||
    !oldCrate ||
    config.app?.windows?.length !== 1 ||
    config.app.windows[0].label !== "main" ||
    !/<title>[^<]*<\/title>/u.test(html)
  )
    throw new Error("package/Cargo/Tauri/HTMLのメタデータが想定形式と一致しません。");
  const oldLockName = `\nname = "${oldSlug}"\n`;
  if (lock.split(oldLockName).length !== 2)
    throw new Error("Cargo.lock内のアプリpackageを一意に特定できません。");
  if (slug !== oldSlug && lock.includes(`\nname = "${slug}"\n`))
    throw new Error("slugがCargo.lock内の依存package名と重複しています。");
  const crate = `${slug.replaceAll("-", "_")}_lib`;
  packageJson.name = slug;
  config.productName = name;
  config.identifier = identifier;
  config.app.windows[0].title = name;
  edits.set("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
  edits.set("src-tauri/tauri.conf.json", `${JSON.stringify(config, null, 2)}\n`);
  edits.set(
    "src-tauri/Cargo.toml",
    cargo
      .replace(
        packageSection[0],
        packageSection[0].replace(`name = "${oldSlug}"`, `name = "${slug}"`),
      )
      .replace(libSection[0], libSection[0].replace(`name = "${oldCrate}"`, `name = "${crate}"`)),
  );
  edits.set("src-tauri/Cargo.lock", lock.replace(oldLockName, `\nname = "${slug}"\n`));
  const title = name.replaceAll("&", "&amp;").replaceAll("'", "&#39;");
  edits.set(
    "index.html",
    html.replace(/<title>[^<]*<\/title>/u, () => `<title>${title}</title>`),
  );
  async function visit(path) {
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name.endsWith(".rs")) {
        const source = await load(child);
        const updated = source.replace(new RegExp(`\\b${oldCrate}\\b`, "gu"), crate);
        if (updated !== source) edits.set(child, updated);
      }
    }
  }
  for (const directory of ["src-tauri/src", "src-tauri/tests", "src-tauri/examples"])
    await visit(directory);
  for (const [path, content] of edits) await writeFile(join(root, path), content);
  return [...edits.keys()];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2).filter((argument, index) => !(index === 0 && argument === "--")),
      options: {
        name: { type: "string" },
        slug: { type: "string" },
        identifier: { type: "string" },
        help: { type: "boolean" },
      },
    });
    if (values.help) {
      console.log(
        'pnpm template:rename --name "Application Studio" --slug application-studio --identifier com.example.application-studio',
      );
    } else {
      const paths = await renameApp(repository, values);
      console.log(
        `アプリの名称と識別子を変更しました（${paths.length}ファイル）。pnpm formatを実行し、git diffで確認してください。`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
