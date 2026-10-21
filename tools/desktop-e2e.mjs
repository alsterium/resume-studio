import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { remote } from "webdriverio";

// Standalone WebdriverIO drives the same embedded W3C server as the Tauri service.
// No IPC mocks, frontend test bridge, or global Tauri API is installed.
const server = createServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();
await new Promise((resolve) => server.close(resolve));
const config = JSON.parse(
  await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const bundleDirectory = fileURLToPath(
  new URL("../src-tauri/target/debug/bundle/macos/", import.meta.url),
);
const appBundle = join(bundleDirectory, `${config.productName}.app`);
const binary = join(appBundle, "Contents/MacOS", packageJson.name);
const runFile = promisify(execFile);
const projectDirectory = await mkdtemp(join(tmpdir(), "resume-studio-e2e-"));
const offline = process.env.RESUME_STUDIO_E2E_OFFLINE === "1";
const offlineProfile = join(projectDirectory, "offline.sb");
if (offline) {
  assert.equal(process.platform, "darwin", "The offline profile requires macOS");
  await writeFile(
    offlineProfile,
    '(version 1)\n(allow default)\n(deny network-outbound)\n(allow network-outbound (remote ip "localhost:*"))\n',
  );
  // A reserved TEST-NET address must fail at the sandbox boundary, not at a timeout.
  await runFile(
    "/usr/bin/sandbox-exec",
    [
      "-f",
      offlineProfile,
      process.execPath,
      "--input-type=module",
      "-e",
      'import assert from "node:assert/strict"; import {createConnection} from "node:net"; const s=createConnection({host:"203.0.113.1",port:443}); s.setTimeout(2000,()=>s.destroy(new Error("timeout"))); const e=await new Promise(r=>s.once("error",r)); assert.equal(e.code,"EPERM");',
    ],
    { timeout: 5000 },
  );
}
let projectPath = join(projectDirectory, "応募 書類.json");
const exportDirectory = join(projectDirectory, "書き出し");
await mkdir(exportDirectory);
const photoPath = join(projectDirectory, "架空 写真.png");
const fixture = JSON.parse(
  await readFile(new URL("../tests/fixtures/project-full.json", import.meta.url), "utf8"),
);
await writeFile(photoPath, Buffer.from(fixture.assets[0].base64, "base64"));
let output = "";
let launchError;
function launch() {
  output = "";
  launchError = undefined;
  const child = spawn(
    offline ? "/usr/bin/sandbox-exec" : binary,
    offline ? ["-f", offlineProfile, binary] : [],
    {
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
        TAURI_WEBDRIVER_PORT: String(port),
        RESUME_STUDIO_E2E_PROJECT: projectPath,
        RESUME_STUDIO_E2E_PHOTO: photoPath,
        RESUME_STUDIO_E2E_EXPORT: exportDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.on("error", (error) => {
    launchError = error;
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      if (output.length < 65536) output += chunk.toString().slice(0, 65536 - output.length);
    });
  return child;
}
let app = launch();
async function connect() {
  const deadline = Date.now() + 60000;
  for (;;) {
    if (launchError) throw launchError;
    if (app.exitCode !== null || app.signalCode !== null)
      throw new Error(`E2E app exited before ready\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok && (await response.json()).value?.ready) break;
    } catch {
      /* startup poll; checked against the deadline and owned child */
    }
    if (Date.now() >= deadline) throw new Error(`E2E server startup timed out\n${output}`);
    await delay(200);
  }
  return await remote({
    hostname: "127.0.0.1",
    port,
    path: "/",
    logLevel: "error",
    connectionRetryCount: 0,
    connectionRetryTimeout: 30000,
    capabilities: { browserName: "wry" },
  });
}
async function waitForExit() {
  const deadline = Date.now() + 15000;
  while (app.exitCode === null && app.signalCode === null) {
    if (Date.now() >= deadline)
      throw new Error(
        "Confirmed close did not exit the app: " +
          JSON.stringify(
            await browser.execute(() => ({
              saving: document.querySelector('[aria-label="保存状態"]')?.textContent,
              dialog: document.querySelector('[role="dialog"]')?.textContent,
              alert: document.querySelector('[role="alert"]')?.textContent,
              errors: window.__e2eConsoleFailures,
            })),
          ),
      );
    await delay(100);
  }
  assert.equal(app.exitCode, 0, `Confirmed close failed: ${output}`);
}
let browser;
async function presentTestApp() {
  assert.ok(
    app.pid && app.exitCode === null && app.signalCode === null,
    "Owned test app is not running",
  );
  // Activate the owned process directly; Launch Services can select another
  // instance with the same bundle identifier. No RAF/renderer stubs are used.
  await runFile(
    "/usr/bin/osascript",
    [
      "-l",
      "JavaScript",
      "-e",
      `ObjC.import("AppKit"); const owned = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${app.pid}); owned.unhide; owned.activateWithOptions($.NSApplicationActivateIgnoringOtherApps | $.NSApplicationActivateAllWindows);`,
    ],
    { timeout: 5000 },
  );
  await browser.waitUntil(
    async () => await browser.execute(() => document.visibilityState === "visible"),
    { timeout: 10000, interval: 200, timeoutMsg: "Owned test WebView remained hidden" },
  );
}
async function verifyWorkspaceLayout() {
  const dimensions = () =>
    browser.execute(() => {
      const editor = document.querySelector(".inspector-panel").getBoundingClientRect();
      const preview = document.querySelector(".preview-panel").getBoundingClientRect();
      return {
        editor: { width: editor.width, bottom: editor.bottom },
        preview: { width: preview.width, top: preview.top },
        viewport: innerWidth,
        overflow: document.documentElement.scrollWidth,
      };
    });
  const before = await dimensions();
  await verifyScrollBoundaries();
  assert.ok(Math.abs(before.editor.width - 410) < 3, JSON.stringify(before));
  assert.ok(
    before.preview.width >= 360 && before.overflow <= before.viewport,
    JSON.stringify(before),
  );
  const handle = await browser.$('[data-slot="resizable-handle"]');
  await handle.click();
  await browser.keys("ArrowRight");
  await browser.waitUntil(async () => (await dimensions()).editor.width > before.editor.width + 5, {
    timeout: 5000,
  });
  await browser.keys("ArrowLeft");
  const rect = await browser.getWindowRect();
  await browser.setWindowSize(680, 800);
  await browser.waitUntil(
    async () => {
      const size = await dimensions();
      return size.preview.top >= size.editor.bottom - 1 && size.overflow <= size.viewport;
    },
    { timeout: 5000 },
  );
  await captureLayout("compact");
  await verifyScrollBoundaries(true);
  await browser.setWindowSize(rect.width, rect.height);
  await browser.waitUntil(async () => (await dimensions()).preview.width >= 360, { timeout: 5000 });
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const paper = document.querySelector(".pdf-paper");
        const pages = Array.from(paper.querySelectorAll("canvas"));
        const width = pages.reduce((sum, page) => sum + page.getBoundingClientRect().width, 0);
        return width + (pages.length - 1) * 20 + 48 <= paper.clientWidth + 3;
      }),
    { timeout: 5000, timeoutMsg: "Fit preview overflowed its panel" },
  );
  console.log(
    "UI_LAYOUT: PASS (desktop bounds, keyboard resizing, compact stacking, PDF fit, fixed root and internal scrolling)",
  );
}

async function verifyScrollBoundaries(requireOverflow = false) {
  const state = await browser.execute(() => {
    window.scrollTo(100, 100);
    const root = document.scrollingElement;
    return {
      root: {
        top: root.scrollTop,
        left: root.scrollLeft,
        height: root.scrollHeight,
        viewportHeight: innerHeight,
        overscroll: getComputedStyle(document.documentElement).overscrollBehavior,
      },
      panels: [".inspector-scroll", ".pdf-paper"].map((selector) => {
        const element = document.querySelector(selector);
        const previous = element.scrollTop;
        element.scrollTop = 40;
        const result = {
          selector,
          top: element.scrollTop,
          overflow: element.scrollHeight > element.clientHeight,
          overscroll: getComputedStyle(element).overscrollBehavior,
        };
        element.scrollTop = previous;
        return result;
      }),
    };
  });
  assert.equal(state.root.top, 0, JSON.stringify(state));
  assert.equal(state.root.left, 0, JSON.stringify(state));
  assert.ok(state.root.height <= state.root.viewportHeight, JSON.stringify(state));
  assert.equal(state.root.overscroll, "none", JSON.stringify(state));
  for (const panel of state.panels) {
    assert.equal(panel.overscroll, "none", JSON.stringify(state));
    if (requireOverflow) assert.ok(panel.overflow, JSON.stringify(state));
    if (panel.overflow) assert.ok(panel.top > 0, JSON.stringify(state));
  }
}

async function captureLayout(id) {
  const directory = process.env.RESUME_STUDIO_UI_QA_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await delay(350); // Wait for Radix transitions and the native compositor.
  await browser.saveScreenshot(join(directory, `${id}.png`));
}

async function verifyAutoPdf() {
  const waitForPdf = async (label) => {
    await presentTestApp();
    let lastState;
    await browser
      .waitUntil(
        async () => {
          const state = await browser.execute(
            (title) => ({
              job: document.querySelector('[aria-label="生成状態"]')?.textContent,
              failure: document.querySelector('[role="alert"]')?.textContent,
              visibility: document.visibilityState,
              stale: document.querySelector(".stale-notice")?.textContent,
              canvas: document.querySelector("canvas")?.dataset.renderedPage,
              name: document.querySelector(".draft-editor input")?.value,
              title: document.querySelector("#document-title")?.textContent,
              ready:
                document.querySelector('[aria-label="生成状態"]')?.textContent ===
                  `${title}：生成完了` &&
                !document.querySelector(".stale-notice") &&
                document.querySelector("canvas")?.dataset.renderedPage === "1",
            }),
            label,
          );
          lastState = state;
          if (state.failure) throw new Error(JSON.stringify(state));
          if (state.visibility === "hidden") await presentTestApp();
          return state.ready;
        },
        { timeout: 90000, timeoutMsg: `Automatic ${label} PDF did not finish` },
      )
      .catch((failure) => {
        throw new Error(`${failure.message}: ${JSON.stringify(lastState)}`);
      });
  };
  await selectDocument("履歴書");
  await browser.$('[aria-label="設定"]').click();
  const checkbox = await browser.$(".auto-pdf-option input");
  assert.equal(await checkbox.isSelected(), false);
  await checkbox.click();
  await browser.$("button=ダイアログを閉じる").click();
  await browser.$('[role="dialog"]').waitForExist({ reverse: true, timeout: 5000 });
  await waitForPdf("履歴書");
  assert.equal(await browser.execute(() => localStorage.getItem("resume-studio.auto-pdf")), "true");
  await selectDocument("職務経歴書");
  await waitForPdf("職務経歴書");
  await browser.$(".draft-editor input").setValue("架空 自動更新");
  await browser.$(".stale-notice").waitForExist({ timeout: 1000 });
  await waitForPdf("職務経歴書");
  // Reopen the existing JSON through the actual UI; auto-generation uses the loaded snapshot.
  await browser.$("button=開く").click();
  await browser.$("button=保存せず続行").click();
  await browser.waitUntil(
    async () => (await browser.$(".draft-editor input").getValue()) === "架空 山田",
    { timeout: 30000 },
  );
  await waitForPdf("職務経歴書");
  await selectDocument("履歴書");
  await waitForPdf("履歴書");
  await browser.$('[aria-label="設定"]').click();
  assert.equal(await browser.$(".auto-pdf-option input").isSelected(), true);
  await browser.$(".auto-pdf-option input").click();
  await browser.$("button=ダイアログを閉じる").click();
  await browser.$('[role="dialog"]').waitForExist({ reverse: true, timeout: 5000 });
  assert.equal(
    await browser.execute(() => localStorage.getItem("resume-studio.auto-pdf")),
    "false",
  );
  await browser.execute(() => {
    document.querySelector("canvas").dataset.autoOffProof = "retained";
  });
  await browser.$(".draft-editor input").setValue("架空 自動OFF");
  await delay(2500);
  assert.equal(
    await browser.execute(() => document.querySelector("canvas")?.dataset.autoOffProof),
    "retained",
  );
  assert.ok(await browser.$(".stale-notice").isExisting());
  console.log("AUTO_PDF: PASS (opt-in, both initial previews, idle editing, reopen, preference)");
}
async function captureDocumentSections(title) {
  if (!process.env.RESUME_STUDIO_UI_QA_DIR) return;
  await selectDocument(title);
  for (const trigger of await browser.$$('[data-slot="accordion-trigger"][aria-expanded="true"]')) {
    if (await trigger.isDisplayed()) await trigger.click();
  }
  const sections =
    title === "履歴書"
      ? [
          ["profile", "基本情報"],
          ["history", "学歴・職歴"],
          ["qualifications", "免許・資格"],
          ["motivation", "志望動機"],
          ["preferences", "本人希望"],
        ]
      : [
          ["summary", "職務要約"],
          ["career", "職務経歴"],
          ["skills", "スキル"],
          ["self-promotion", "自己PR"],
        ];
  for (const [id, section] of sections) {
    const trigger = await browser.$(
      `[data-slot="accordion-trigger"][aria-label="${section}を編集"]`,
    );
    await trigger.click();
    await browser.execute(() => {
      document.querySelector(".inspector-scroll").scrollTop = 0;
    });
    await delay(300);
    await captureLayout(id);
    await trigger.click();
  }
  await expandEditorSections();
}

async function expandEditorSections() {
  for (const trigger of await browser.$$(
    '[data-slot="accordion-trigger"][aria-expanded="false"]',
  )) {
    if (await trigger.isDisplayed()) await trigger.click();
  }
}
async function selectDocument(title) {
  await browser.$("button=" + title).click();
  await browser.waitUntil(
    async () => {
      if ((await browser.$("#document-title").getText()) === title) return true;
      await browser.$("button=" + title).click();
      return false;
    },
    { timeout: 5000, interval: 200, timeoutMsg: `Document tab did not select ${title}` },
  );
  await expandEditorSections();
}
async function projectAction(title) {
  await browser.$('[aria-label="その他のプロジェクト操作"]').click();
  // The embedded click adapter emits mouse events. Radix opens on pointerdown;
  // use its accessible keyboard path rather than fabricating a pointer event.
  await browser.keys("ArrowDown");
  await browser.$('[role="menuitem"]').waitForExist({ timeout: 5000 });
  for (const item of await browser.$$('[role="menuitem"]')) {
    if ((await item.getText()).trim() === title) {
      await item.click();
      return;
    }
  }
  throw new Error("Project action was not found: " + title);
}
try {
  browser = await connect();
  await presentTestApp();
  // Keep the manual-flow scenario deterministic when rerunning after an interrupted auto test.
  await browser.$('[aria-label="設定"]').click();
  const autoOption = await browser.$(".auto-pdf-option input");
  if (await autoOption.isSelected()) await autoOption.click();
  await browser.$("button=ダイアログを閉じる").click();
  await browser.$('[role="dialog"]').waitForExist({ reverse: true, timeout: 5000 });
  await browser.$('[aria-label="履歴書PDF更新"]').waitForEnabled({ timeout: 90000 });
  await browser.$(".draft-editor input").waitForExist({ timeout: 30000 });
  await browser.execute(() => {
    // PDF.js must also work when the host WebKit lacks this newer Map API.
    delete Map.prototype.getOrInsertComputed;
    window.__e2eConsoleFailures = [];
    const original = console.error.bind(console);
    console.error = (...args) => {
      window.__e2eConsoleFailures.push(args.map(String).join(" ").slice(0, 2000));
      original(...args);
    };
  });
  await browser.$(".draft-editor input").setValue("架空 山田");
  await selectDocument("職務経歴書");
  await browser.$('[aria-label="本文"]').click();
  await browser.$('[aria-label="本文の書式"]').$("button=太字").click();
  await browser.$('[aria-label="本文"]').addValue("架空の職務内容 & % _ # $ { } ~ ^ \\ 日本語");
  const text = await browser.$('[aria-label="本文"]').getText();
  assert.ok(text.includes("架空の職務内容"), `Input was lost: ${text}`);
  await browser
    .$('[aria-label="本文"]')
    .addValue(
      Array.from({ length: 600 }, (_, index) => `\n架空の長文${index + 1}作業記録`).join(""),
    );
  assert.ok((await browser.$('[aria-label="本文"]').getText()).includes("架空の長文600作業記録"));
  // Separate the history group, then use the real Tiptap toolbar on the long body.
  await delay(600);
  await browser.$('[aria-label="本文"]').addValue("\n架空Undo確認");
  await browser.$('[aria-label="本文の書式"]').$("button=元に戻す").click();
  await browser.waitUntil(
    async () => !(await browser.$('[aria-label="本文"]').getText()).includes("架空Undo確認"),
  );
  assert.ok((await browser.$('[aria-label="本文"]').getText()).includes("架空の長文600作業記録"));
  await browser.$('[aria-label="本文の書式"]').$("button=やり直す").click();
  await browser.waitUntil(async () =>
    (await browser.$('[aria-label="本文"]').getText()).includes("架空Undo確認"),
  );
  await selectDocument("履歴書");
  // Date/month controls use the native setter + input/change adapter documented in ADR 0004.
  await browser.execute(() => {
    const inputFor = (label) =>
      Array.from(document.querySelectorAll("label"))
        .find((item) => item.textContent.trim() === label)
        .querySelector("input");
    for (const [label, value] of [
      ["書類日付", "2025-03-01"],
      ["生年月日", "2000-02-29"],
      ["氏名ふりがな", "かくう やまだ"],
      ["現住所・住所ふりがな", "かくうのじゅうしょ"],
    ]) {
      const input = inputFor(label);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  assert.ok((await browser.$('[aria-label="満年齢"]').getText()).includes("満25歳"));
  await browser.$("button=学歴を追加").click();
  await browser.$(".history-row input[type=month]").waitForExist();
  await browser.$(".history-row input:not([type=month])").setValue("架空大学 卒業");
  await browser
    .$('[role="textbox"][aria-label="志望動機・特技・アピールポイント"]')
    .addValue("架空の志望動機末尾");
  await browser.$('[role="textbox"][aria-label="本人希望欄"]').addValue("架空の希望末尾");
  await selectDocument("職務経歴書");
  await browser.$("button=会社を追加").click();
  await browser.execute(() => {
    for (const [label, value] of [
      ["会社名", "架空会社"],
      ["役職・役割", "開発担当"],
      ["会社開始年月", "2020-04"],
      ["事業内容", "開発事業"],
      ["資本金", "100万円"],
      ["従業員数", "10名"],
    ]) {
      const input = Array.from(document.querySelectorAll("label"))
        .find((item) => item.textContent.trim() === label)
        .querySelector("input");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await browser.$("button=案件を追加").click();
  await browser.execute(() => {
    for (const [label, value] of [
      ["案件名", "架空案件"],
      ["案件開始年月", "2021-01"],
      ["プロジェクト規模", "5名"],
      ["案件URL（任意）", "https://example.invalid/case?q=1&x=2"],
    ]) {
      const input = Array.from(document.querySelectorAll("label"))
        .find((item) => item.textContent.trim() === label)
        .querySelector("input");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await browser.$('[role="textbox"][aria-label="業務内容"]').addValue("架空の業務末尾");
  await browser.$('[role="textbox"][aria-label="自己PR"]').addValue("架空の自己PR末尾");
  await browser.$("button=スキルを追加").click();
  await browser.execute(() => {
    for (const [label, value] of [
      ["スキル 1 スキル名", "TypeScript"],
      ["スキル 1 経験期間", "3年"],
      ["スキル 1 説明", "架空スキル説明"],
    ]) {
      const input = Array.from(document.querySelectorAll("label"))
        .find((item) => item.textContent.trim() === label)
        .querySelector("input");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await selectDocument("履歴書");
  await browser.$("button=写真を取り込む").click();
  await browser.waitUntil(
    async () =>
      await browser.execute(() => {
        const image = document.querySelector('img[alt="取り込んだ証明写真"]');
        return image?.complete && image.naturalWidth === 3 && image.naturalHeight === 4;
      }),
    { timeout: 30000 },
  );
  // Replace only OS file selection; exercise real IPC, validation and atomic storage.
  await browser.$(".draft-editor input").click();
  await browser.keys(["Meta", "s"]);
  await browser.waitUntil(
    async () =>
      (await browser.$('[aria-label="プロジェクトファイル"]').getText()) === "応募 書類.json",
    { timeout: 30000 },
  );
  const saved = JSON.parse(await readFile(projectPath, "utf8"));
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.profile.name, "架空 山田");
  assert.equal(saved.profile.nameKana, "かくう やまだ");
  assert.equal(saved.profile.addressKana, "かくうのじゅうしょ");
  assert.equal(saved.profile.birthDate, "2000-02-29");
  assert.equal(saved.documentDate, "2025-03-01");
  assert.equal(saved.resume.education[0].text, "架空大学 卒業");
  assert.ok(JSON.stringify(saved.resume.motivation).includes("架空の志望動機末尾"));
  assert.ok(JSON.stringify(saved.resume.preferences).includes("架空の希望末尾"));
  assert.equal(saved.career.positions[0].companyName, "架空会社");
  assert.equal(saved.career.positions[0].companyOverview.business, "開発事業");
  assert.equal(saved.career.positions[0].projects[0].name, "架空案件");
  assert.equal(saved.career.positions[0].projects[0].url, "https://example.invalid/case?q=1&x=2");
  assert.equal(saved.career.positions[0].endYearMonth, null);
  assert.equal(saved.career.positions[0].projects[0].endYearMonth, null);
  assert.ok(
    JSON.stringify(saved.career.positions[0].projects[0].responsibilities).includes(
      "架空の業務末尾",
    ),
  );
  assert.equal(saved.career.skills[0].experienceLabel, "3年");
  assert.ok(JSON.stringify(saved.career.selfPromotion).includes("架空の自己PR末尾"));
  assert.ok(JSON.stringify(saved.career.summary).includes("架空の職務内容"));
  assert.ok(
    JSON.stringify(saved.career.summary).includes('"type":"bold"'),
    "Saved JSON lost bold formatting",
  );
  assert.equal(saved.assets.length, 1);
  assert.equal(saved.profile.photoAssetId, saved.assets[0].id);
  await browser.$("button=新規").click();
  assert.equal(await browser.$(".draft-editor input").getValue(), "");
  await browser.$("button=開く").click();
  await browser.waitUntil(
    async () => (await browser.$(".draft-editor input").getValue()) === "架空 山田",
    { timeout: 30000 },
  );
  await selectDocument("職務経歴書");
  assert.ok((await browser.$('[aria-label="本文"]').getText()).includes("架空の職務内容"));
  // The real menu selection requests native quit; a clean session needs no modal.
  try {
    await projectAction("終了");
  } catch (failure) {
    console.log("Clean quit click response:", failure.message);
    // A successful clean quit may close the server before the click response.
    // The owned process must still exit successfully below.
  }
  await waitForExit();
  browser = undefined;
  const movedDirectory = join(projectDirectory, "移動した 応募先");
  await mkdir(movedDirectory);
  const movedPath = join(movedDirectory, "応募 書類.json");
  await rename(projectPath, movedPath);
  projectPath = movedPath;
  await rm(photoPath);
  app = launch();
  browser = await connect();
  await presentTestApp();
  await browser.$(".draft-editor input").waitForExist({ timeout: 30000 });
  assert.equal(await browser.$(".draft-editor input").getValue(), "");
  await browser.$("button=開く").click();
  await browser.waitUntil(
    async () => (await browser.$(".draft-editor input").getValue()) === "架空 山田",
    { timeout: 30000 },
  );
  await selectDocument("職務経歴書");
  assert.ok((await browser.$('[aria-label="本文"]').getText()).includes("架空の職務内容"));
  await browser.waitUntil(
    async () =>
      await browser.execute(() => {
        const image = document.querySelector('img[alt="取り込んだ証明写真"]');
        return image?.complete && image.naturalWidth === 3 && image.naturalHeight === 4;
      }),
    { timeout: 30000 },
  );
  assert.ok(
    (await browser.$('[aria-label="本文"] strong').getText()).includes("架空の職務内容"),
    "Restart lost body formatting",
  );
  assert.ok((await browser.$('[aria-label="満年齢"]').getText()).includes("満25歳"));
  await selectDocument("履歴書");
  assert.equal(await browser.$(".history-row input:not([type=month])").getValue(), "架空大学 卒業");
  assert.ok(
    (
      await browser.$('[role="textbox"][aria-label="志望動機・特技・アピールポイント"]').getText()
    ).includes("架空の志望動機末尾"),
  );
  assert.ok(
    (await browser.$('[role="textbox"][aria-label="本人希望欄"]').getText()).includes(
      "架空の希望末尾",
    ),
  );
  await selectDocument("職務経歴書");
  const restoredCareer = await browser.execute(() => ({
    company: Array.from(document.querySelectorAll('[aria-label="職務経歴書の編集"] label'))
      .find((label) => label.textContent.trim() === "会社名")
      .querySelector("input").value,
    caseText: document.querySelector('[role="textbox"][aria-label="業務内容"]').textContent,
    selfPromotion: document.querySelector('[role="textbox"][aria-label="自己PR"]').textContent,
    skill: Array.from(document.querySelectorAll("label"))
      .find((item) => item.textContent.trim() === "スキル 1 経験期間")
      .querySelector("input").value,
  }));
  assert.equal(restoredCareer.company, "架空会社");
  assert.ok(restoredCareer.caseText.includes("架空の業務末尾"));
  assert.ok(restoredCareer.selfPromotion.includes("架空の自己PR末尾"));
  assert.equal(restoredCareer.skill, "3年");
  await selectDocument("履歴書");
  await browser.execute(() => {
    delete Map.prototype.getOrInsertComputed;
    window.__e2eConsoleFailures = [];
    const original = console.error.bind(console);
    console.error = (...args) => {
      window.__e2eConsoleFailures.push(args.map(String).join(" ").slice(0, 2000));
      original(...args);
    };
  });
  await presentTestApp();
  await projectAction("職務要約の下書きPDF更新");
  const renderDeadline = Date.now() + 90000;
  for (;;) {
    const state = await browser.execute(() => ({
      failure: document.querySelector('[role="alert"]')?.textContent,
      diagnostics: window.__e2eConsoleFailures,
      ready: document.querySelector("canvas")?.dataset.renderedPage === "1",
      pageStatus: document.querySelector('[aria-label="ページ番号"]')?.textContent,
      visibility: document.visibilityState,
      canvas: document.querySelector("canvas")
        ? {
            width: document.querySelector("canvas").width,
            height: document.querySelector("canvas").height,
            dataset: { ...document.querySelector("canvas").dataset },
          }
        : null,
    }));
    if (state.failure)
      throw new Error(`${state.failure.slice(0, 2000)}\n${state.diagnostics.slice(-4).join("\n")}`);
    if (state.ready) break;
    if (state.visibility === "hidden") await presentTestApp();
    if (Date.now() >= renderDeadline)
      throw new Error(`Real TeX PDF did not render\n${JSON.stringify(state)}`);
    await delay(200);
  }
  const first = await browser.execute(() => {
    const canvas = document.querySelector("canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 64)
      if (data[i + 3] > 0 && data[i] < 200 && data[i + 1] < 200 && data[i + 2] < 200) dark++;
    return { dark, width: canvas.width };
  });
  assert.ok(first.dark > 20, "PDF canvas is blank");
  // The dedicated process has generated exactly one PDF, whose first result ID is 1.
  // Read the actual Rust result; do not substitute a PDF fixture for the UI generation.
  const pdfBytes = await browser.executeAsync((done) => {
    window.__TAURI_INTERNALS__
      .invoke("read_pdf", { resultId: "1" })
      .then((buffer) => done({ bytes: Array.from(new Uint8Array(buffer)) }))
      .catch((error) => done({ failure: String(error) }));
  });
  assert.equal(pdfBytes.failure, undefined);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfTask = getDocument({ data: new Uint8Array(pdfBytes.bytes), useWasm: false });
  try {
    const pdf = await pdfTask.promise;
    assert.ok(pdf.numPages >= 10, `Long input produced only ${pdf.numPages} draft pages`);
    const contents = await (await pdf.getPage(1)).getTextContent();
    const extracted = contents.items
      .map((item) => item.str ?? "")
      .join("")
      .replace(/\s+/gu, "");
    assert.ok(extracted.includes("架空山田"), "Generated PDF lost the name");
    assert.ok(extracted.includes("架空の職務内容"), "Generated PDF lost the body");
  } finally {
    await pdfTask.destroy();
  }
  const overlayGeometry = () =>
    browser.execute(() => {
      const zoom = document.querySelector(".preview-zoom");
      const viewport = document.querySelector(".preview-viewport");
      const z = zoom.getBoundingClientRect();
      const v = viewport.getBoundingClientRect();
      return {
        right: v.right - z.right,
        bottom: v.bottom - z.bottom,
        colors: Array.from(zoom.children).map((el) => getComputedStyle(el).borderTopColor),
        hint: viewport.textContent.includes("ピンチで"),
      };
    });
  const beforeZoom = await overlayGeometry();
  assert.ok(
    Math.abs(beforeZoom.right - 24) < 1 && Math.abs(beforeZoom.bottom - 24) < 1,
    JSON.stringify(beforeZoom),
  );
  assert.equal(new Set(beforeZoom.colors).size, 1, JSON.stringify(beforeZoom));
  assert.equal(beforeZoom.hint, false);
  // Exercise the visible shadcn buttons with real WebView clicks.
  while (
    Number(
      await browser.execute(() =>
        document.querySelector('[aria-label="表示倍率"]').textContent.replace("%", ""),
      ),
    ) > 25
  ) {
    await browser.$('[aria-label="縮小"]').click();
  }
  for (let i = 0; i < 5; i++) await browser.$('[aria-label="拡大"]').click();
  await browser.waitUntil(
    async () => {
      const state = await browser.execute(() => ({
        ready: document.querySelector("canvas")?.dataset.renderedScale === "1.5",
        visibility: document.visibilityState,
      }));
      if (!state.ready && state.visibility === "hidden") await presentTestApp();
      return state.ready;
    },
    { timeout: 30000 },
  );
  assert.ok((await browser.execute(() => document.querySelector("canvas").width)) > first.width);
  await browser.execute(() => {
    const paper = document.querySelector(".pdf-paper");
    paper.scrollTop = 200;
    paper.scrollLeft = 100;
  });
  assert.deepEqual(await overlayGeometry(), beforeZoom);
  // The embedded driver dispatches DOM mousemove without native :hover state.
  // Verify the hover rule and the equivalent keyboard focus presentation.
  const hoverOpacity = await browser.execute(() => {
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText?.includes(".preview-zoom:hover")) return rule.style.opacity;
      }
    }
  });
  assert.equal(hoverOpacity, "1");
  await browser.execute(() => document.activeElement?.blur());
  await browser.execute(() => document.querySelector('[aria-label="拡大"]').focus());
  await browser.waitUntil(
    async () =>
      await browser.execute(
        () => getComputedStyle(document.querySelector(".preview-zoom")).opacity === "1",
      ),
    { timeout: 3000 },
  );
  await captureLayout("zoom-overlay");
  await browser.execute(() => document.activeElement?.blur());
  await browser.waitUntil(
    async () =>
      await browser.execute(
        () => getComputedStyle(document.querySelector(".preview-zoom")).opacity === "0.55",
      ),
    { timeout: 3000 },
  );
  await captureLayout("zoom-overlay-idle");
  await browser.$(".preview-zoom").moveTo();
  // Synthesized WebKit events verify the actual listener and PDF.js rendering.
  // Physical trackpad gestures remain a separate manual acceptance boundary.
  await browser.execute(() => {
    const paper = document.querySelector(".pdf-paper");
    for (const [type, scale] of [
      ["gesturestart", 1],
      ["gesturechange", 0.5],
    ]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { scale, clientX: 700, clientY: 300 });
      paper.dispatchEvent(event);
    }
  });
  await browser.waitUntil(
    async () =>
      await browser.execute(
        () => document.querySelector("canvas")?.dataset.renderedScale === "0.75",
      ),
    { timeout: 30000 },
  );
  await browser.waitUntil(
    async () =>
      await browser.execute(
        () =>
          document.querySelector(".preview-zoom").dataset.pinching === "true" &&
          getComputedStyle(document.querySelector(".preview-zoom")).opacity === "0.55",
      ),
    { timeout: 3000 },
  );
  await captureLayout("zoom-overlay-pinching");
  await browser.execute(() =>
    document
      .querySelector(".pdf-paper")
      .dispatchEvent(new Event("gestureend", { bubbles: true, cancelable: true })),
  );
  await browser.$('[aria-label="画面に合わせる"]').click();
  await browser.waitUntil(
    async () =>
      await browser.execute(
        () =>
          document.querySelector('[aria-label="画面に合わせる"]').getAttribute("aria-pressed") ===
          "true",
      ),
    { timeout: 5000 },
  );
  console.log(
    "PREVIEW_ZOOM: PASS (buttons, WebKit events, real PDF rendering, fixed overlay, equal borders, hover rule/focus/idle/pinch opacity)",
  );

  // Exercise real WKWebView layout and PDF.js pixels while reading consecutive pages.
  if ((await browser.$("button=見開き").getAttribute("aria-pressed")) === "true") {
    await browser.$("button=見開き").click();
  }
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const pages = document.querySelectorAll(".pdf-page");
        const first = pages[0]?.getBoundingClientRect();
        const second = pages[1]?.getBoundingClientRect();
        return !!second && Math.abs(first.left - second.left) < 1 && second.top > first.bottom + 18;
      }),
    { timeout: 10000 },
  );
  const continuousCount = await browser.execute(
    () => document.querySelectorAll(".pdf-page").length,
  );
  assert.ok(continuousCount >= 2);
  await browser.execute(() => {
    const paper = document.querySelector(".pdf-paper");
    const frames = paper.querySelectorAll(".pdf-page");
    paper.scrollTop = frames[1].offsetTop - frames[0].offsetTop + 20;
  });
  await browser.waitUntil(
    async () =>
      browser.execute(
        () =>
          document.querySelector('[aria-label="ページ番号"]').textContent.startsWith("2 / ") &&
          document.querySelector('[aria-label="生成されたPDFページ"]')?.dataset.renderedPage ===
            "2",
      ),
    { timeout: 10000 },
  );
  const continuous = await browser.execute(() => {
    const paper = document.querySelector(".pdf-paper");
    const canvas = document.querySelector('[aria-label="生成されたPDFページ"]');
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 120 && pixels[i + 3] > 0) dark++;
    const frame = canvas.getBoundingClientRect();
    const viewport = paper.getBoundingClientRect();
    return {
      dark,
      visible: frame.bottom > viewport.top && frame.top < viewport.bottom,
      scroll: paper.scrollTop,
    };
  });
  assert.ok(continuous.dark > 20 && continuous.visible && continuous.scroll > 100);
  await captureLayout("continuous-page-2");
  await browser.$('[aria-label="前のページ"]').click();
  await browser.waitUntil(
    async () =>
      browser.execute(
        () =>
          document.querySelector('[aria-label="ページ番号"]').textContent.startsWith("1 / ") &&
          document.querySelector(".pdf-paper").scrollTop < 1,
      ),
    { timeout: 5000 },
  );
  await browser.$("button=見開き").click();
  console.log(
    "CONTINUOUS_PREVIEW: PASS (vertical page frames, native scroll, page counter, page 2 pixels, previous-page navigation)",
  );

  await browser.$("button=テンプレート一覧を確認").click();
  await browser.waitUntil(
    async () =>
      await browser.execute(() =>
        Array.from(document.querySelectorAll("label")).some(
          (label) =>
            label.textContent.includes("履歴書テンプレート") && label.querySelector("select"),
        ),
      ),
    { timeout: 10000 },
  );
  const resumeTemplate = await browser.execute(() => {
    const select = Array.from(document.querySelectorAll("label"))
      .find((label) => label.textContent.includes("履歴書テンプレート"))
      .querySelector("select");
    const versions = Array.from(select.options).map((option) => JSON.parse(option.value)[1]);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(
      select,
      JSON.stringify(["resume-standard", "1.3.0"]),
    );
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      versions,
      names: Array.from(select.options).map((option) => option.textContent),
      value: select.value,
    };
  });
  assert.deepEqual(resumeTemplate.versions, ["1.3.0", "1.2.0"]);
  assert.deepEqual(resumeTemplate.names, ["履歴書(動的レイアウト) 1.3.0", "履歴書(JIS形式) 1.2.0"]);
  assert.equal(resumeTemplate.value, JSON.stringify(["resume-standard", "1.3.0"]));
  for (const [label, resultId, expected] of [
    ["履歴書", "2", ["架空大学卒業", "架空の志望動機末尾", "架空の希望末尾"]],
    ["職務経歴書", "3", ["架空会社", "架空案件", "架空の業務末尾", "架空の自己PR末尾"]],
  ]) {
    await presentTestApp();
    if (label === "職務経歴書") {
      await selectDocument("職務経歴書");
      const careerNames = await browser.execute(() => {
        const select = Array.from(document.querySelectorAll("label"))
          .find((label) => label.textContent.includes("職務経歴書テンプレート"))
          .querySelector("select");
        return Array.from(select.options).map((option) => option.textContent);
      });
      assert.deepEqual(careerNames, ["職務経歴書 1.2.0"]);
    }
    if (label === "職務経歴書") {
      await browser.execute(() => {
        const observer = new MutationObserver(() => {
          const phase = document.querySelector('[aria-label="生成状態"]')?.textContent;
          if (!phase?.includes("PDFを生成中")) return;
          observer.disconnect();
          const started = performance.now();
          const input = document.querySelector(".draft-editor input");
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
            input,
            "架空 編集継続",
          );
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          window.__e2eEditingDuringCompile = { phase, milliseconds: performance.now() - started };
        });
        observer.observe(document.querySelector(".studio-shell"), {
          childList: true,
          characterData: true,
          subtree: true,
        });
      });
    }
    await browser.$(`[aria-label="${label}PDF更新"]`).click();
    const deadline = Date.now() + 90000;
    for (;;) {
      const state = await browser.execute(
        (title) => ({
          failure: document.querySelector('[role="alert"]')?.textContent,
          diagnostics: window.__e2eConsoleFailures,
          visibility: document.visibilityState,
          ready:
            Array.from(document.querySelectorAll("output")).some(
              (item) => item.textContent === `プレビュー：${title}`,
            ) && document.querySelector("canvas")?.dataset.renderedPage === "1",
        }),
        label,
      );
      if (state.failure)
        throw new Error(`${state.failure}\n${state.diagnostics.slice(-4).join("\n")}`);
      if (state.ready) break;
      if (state.visibility === "hidden") await presentTestApp();
      if (Date.now() > deadline) throw new Error(`Formal ${label} PDF did not render`);
      await delay(200);
    }
    assert.equal(await browser.$('[aria-label="生成状態"]').getText(), `${label}：生成完了`);
    if (label === "履歴書") await verifyWorkspaceLayout();
    await captureDocumentSections(label);
    if (label === "履歴書") {
      const coloredPixels = await browser.execute(() => {
        const canvas = document.querySelector("canvas");
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let index = 0; index < data.length; index += 64) {
          const channels = [data[index], data[index + 1], data[index + 2]];
          if (data[index + 3] > 0 && Math.max(...channels) - Math.min(...channels) > 30) count++;
        }
        return count;
      });
      assert.ok(coloredPixels > 10, "Formal resume preview lost the embedded photo");
    }
    const formalBytes = await browser.executeAsync((id, done) => {
      window.__TAURI_INTERNALS__
        .invoke("read_pdf", { resultId: id })
        .then((buffer) => done({ bytes: Array.from(new Uint8Array(buffer)) }))
        .catch((failure) => done({ failure: String(failure) }));
    }, resultId);
    assert.equal(formalBytes.failure, undefined);
    const task = getDocument({ data: new Uint8Array(formalBytes.bytes), useWasm: false });
    try {
      const pdf = await task.promise;
      if (label === "職務経歴書") {
        assert.ok(pdf.numPages >= 10, `Long input produced only ${pdf.numPages} career pages`);
        expected.push("架空の長文600作業記録");
      }
      let text = "";
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        text += content.items.map((item) => item.str ?? "").join("");
      }
      text = text.replace(/\s+/gu, "");
      for (const value of expected)
        assert.ok(text.includes(value), `Formal ${label} PDF lost ${value}: ${text}`);
    } finally {
      await task.destroy();
    }
    if (label === "職務経歴書") {
      const proof = await browser.execute(() => window.__e2eEditingDuringCompile);
      assert.ok(
        proof?.phase.includes("PDFを生成中"),
        "Editing did not occur during real compilation",
      );
      assert.equal(await browser.$(".draft-editor input").getValue(), "架空 編集継続");
      assert.ok((await browser.$("body").getText()).includes("PDFは更新前の内容です"));
      console.log(
        `RESPONSIVE_EDIT: PASS (10+ pages; input dispatch during compilation ${proof.milliseconds.toFixed(1)}ms; React revision confirmed)`,
      );
      await browser.$(".draft-editor input").setValue("架空 山田");
    }
  }
  // Returning to either document keeps its own last successful PDF.
  for (const label of ["履歴書", "職務経歴書"]) {
    await selectDocument(label);
    await browser.waitUntil(
      async () =>
        await browser.execute(
          (title) =>
            Array.from(document.querySelectorAll("output")).some(
              (item) => item.textContent === `プレビュー：${title}`,
            ) && document.querySelector("canvas")?.dataset.renderedPage === "1",
          label,
        ),
      { timeout: 10000 },
    );
  }
  // Observe the real Channel stage before cancelling through the actual UI.
  // Cancelled generation must not replace the last successfully rendered PDF.
  await browser.execute(() => {
    document.querySelector("canvas").dataset.cancelProof = "previous-success";
    window.__e2eCancelStages = [];
    const observer = new MutationObserver(() => {
      const state = document.querySelector('[aria-label="生成状態"]');
      if (!state) return;
      window.__e2eCancelStages.push(state.textContent);
      if (state.textContent.includes("PDFを生成中")) {
        observer.disconnect();
        Array.from(document.querySelectorAll("button"))
          .find((button) => button.textContent === "生成をキャンセル")
          .click();
      }
    });
    observer.observe(document.querySelector(".studio-shell"), {
      childList: true,
      characterData: true,
      subtree: true,
    });
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.getAttribute("aria-label") === "職務経歴書PDF更新")
      .click();
  });
  await browser
    .waitUntil(
      async () =>
        (await browser.$('[aria-label="生成状態"]').getText()).includes("生成をキャンセルしました"),
      { timeout: 10000 },
    )
    .catch(async (failure) => {
      const state = await browser.execute(() => ({
        stages: window.__e2eCancelStages,
        error: document.querySelector('[role="alert"]')?.textContent,
        failures: window.__e2eConsoleFailures.slice(-4),
      }));
      throw new Error(`${failure.message}: ${JSON.stringify(state)}`);
    });
  assert.equal(
    await browser.execute(() => document.querySelector("canvas")?.dataset.cancelProof),
    "previous-success",
  );
  assert.ok(await browser.$('[aria-label="職務経歴書PDF更新"]').isEnabled());
  assert.equal(await browser.$('[role="alert"]').isExisting(), false);
  await browser.$('[aria-label="設定"]').click();
  await captureLayout("settings");
  await browser.$("button=TeX環境を確認").click();
  await browser.waitUntil(
    async () =>
      await browser.execute(() =>
        Array.from(document.querySelectorAll("output")).some(
          (element) => element.textContent === "日本語PDFを生成できました。",
        ),
      ),
    { timeout: 90000 },
  );
  assert.equal(await browser.$('[role="alert"]').isExisting(), false);
  await browser.$("button=ダイアログを閉じる").click();
  await browser.$('[role="dialog"]').waitForExist({ reverse: true, timeout: 5000 });
  await browser.$("button=書き出し").click();
  await captureLayout("export");
  // Export the current snapshot through real Rust commands and storage.
  // Native picker/overwrite choice alone is substituted in this test build.
  await browser.execute(() => {
    const select = Array.from(document.querySelectorAll("label"))
      .find((label) => label.textContent.startsWith("出力対象"))
      .querySelector("select");
    select.value = "both";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await browser.$("button=書き出す").click();
  assert.equal(await browser.$('button[aria-busy="true"] .animate-spin').isExisting(), true);
  await browser.$('[role="dialog"]').waitForExist({ reverse: true, timeout: 90000 });
  assert.equal(await browser.$('[aria-label="書き出し"] .lucide-check').isExisting(), true);
  assert.equal(await browser.$('[aria-label="書き出し結果"]').isExisting(), false);
  const exportedPdfs = [];
  for (const name of ["履歴書", "職務経歴書"]) {
    const bytes = await readFile(join(exportDirectory, `${name}.pdf`));
    exportedPdfs.push(bytes);
    const task = getDocument({ data: new Uint8Array(bytes), useWasm: false });
    try {
      const pdf = await task.promise;
      const text = (await (await pdf.getPage(1)).getTextContent()).items
        .map((item) => item.str ?? "")
        .join("")
        .replace(/\s+/gu, "");
      assert.ok(text.includes("架空山田"), `Exported ${name} lost the current profile`);
    } finally {
      await task.destroy();
    }
  }
  await browser.$("button=書き出し").click();
  await browser.$("button=書き出す").click();
  await browser.$('[role="dialog"]').waitForExist({ reverse: true, timeout: 90000 });
  await browser.waitUntil(
    async () =>
      (await browser.$('[aria-label="書き出し結果"]').getText()).includes(
        "職務経歴書.pdf：スキップしました",
      ),
    { timeout: 10000 },
  );
  for (const [index, name] of ["履歴書", "職務経歴書"].entries()) {
    assert.deepEqual(await readFile(join(exportDirectory, `${name}.pdf`)), exportedPdfs[index]);
  }
  await browser.$('[role="dialog"]').waitForExist({ reverse: true, timeout: 5000 });
  await browser.$("button=書き出し").click();
  await browser.execute(() => {
    const select = Array.from(document.querySelectorAll("label"))
      .find((label) => label.textContent.startsWith("出力形式"))
      .querySelector("select");
    select.value = "tex";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await browser.$("button=書き出す").click();
  await browser.$('[role="dialog"]').waitForExist({ reverse: true, timeout: 10000 });
  assert.equal(await browser.$('[aria-label="書き出し"] .lucide-check').isExisting(), true);
  for (const [name, style] of [
    ["履歴書", "resume.sty"],
    ["職務経歴書", "career.sty"],
  ]) {
    const directory = join(exportDirectory, `${name}-tex`);
    const main = await readFile(join(directory, "main.tex"), "utf8");
    assert.ok(main.includes("content"));
    assert.ok((await readFile(join(directory, "content.tex"), "utf8")).includes("架空 山田"));
    assert.ok((await readFile(join(directory, style))).length > 0);
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    assert.equal(manifest.engine, "lualatex");
    if (name === "履歴書") assert.equal(manifest.version, "1.3.0");
    await runFile(
      "/Library/TeX/texbin/latexmk",
      [
        "-norc",
        "-lualatex",
        "-no-shell-escape",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "main.tex",
      ],
      {
        cwd: directory,
        env: { ...process.env, PATH: "/Library/TeX/texbin:/usr/bin:/bin" },
        timeout: 60000,
        maxBuffer: 1048576,
      },
    );
    assert.ok(
      (await readFile(join(directory, "main.pdf"))).subarray(0, 5).equals(Buffer.from("%PDF-")),
    );
  }
  await verifyAutoPdf();
  await browser.$(".draft-editor input").setValue("架空 終了確認");
  const closeRequest = await browser.executeAsync((done) => {
    window.__TAURI_INTERNALS__
      .invoke("request_app_close", { quit: false })
      .then(() => done({ requested: true }))
      .catch((failure) => done({ failure: String(failure) }));
  });
  assert.equal(closeRequest.failure, undefined);
  await browser.$('[role="dialog"]').waitForExist({ timeout: 10000 });
  await browser.waitUntil(
    async () =>
      await browser.execute(() =>
        document.querySelector('[role="dialog"]')?.contains(document.activeElement),
      ),
    { timeout: 5000, timeoutMsg: "Unsaved dialog did not receive keyboard focus" },
  );
  await captureLayout("unsaved");
  await browser.$("button=キャンセル").click();
  await browser.waitUntil(async () => !(await browser.$('[role="dialog"]').isExisting()), {
    timeout: 10000,
  });
  assert.equal(await browser.$(".draft-editor input").getValue(), "架空 終了確認");
  // Quit goes through RunEvent::ExitRequested, independently of native window close.
  await projectAction("終了");
  await browser.$('[role="dialog"]').waitForExist({ timeout: 10000 });
  await browser.$("button=キャンセル").click();
  await projectAction("終了");
  await browser.$('[role="dialog"]').waitForExist({ timeout: 10000 });
  // Return the driver response before the owned app shuts down its server.
  await browser.execute(() => {
    setTimeout(
      () =>
        Array.from(document.querySelectorAll('[role="dialog"] button'))
          .find((button) => button.textContent === "保存して続行")
          .click(),
      50,
    );
  });
  await waitForExit();
  assert.equal(JSON.parse(await readFile(projectPath, "utf8")).profile.name, "架空 終了確認");
  console.log(
    "DESKTOP_E2E: PASS (photo import → JSON save/move → restart/restore → draft/resume/career TeX/PDF and embedded photo → cancellation/diagnostics → PDF/TeX export/overwrite skip → guarded close/quit → save/exit; picker adapters)",
  );
  if (offline)
    console.log(
      "OFFLINE_E2E: PASS (external outbound denied for app and children; WebDriver localhost only)",
    );
} finally {
  try {
    if (browser && app.exitCode === null && app.signalCode === null) await browser.deleteSession();
  } finally {
    if (app.exitCode === null && app.signalCode === null && app.pid) {
      const exited = once(app, "exit");
      app.kill("SIGTERM");
      const timer = setTimeout(() => app.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    }
    await rm(projectDirectory, { recursive: true, force: true });
  }
}
