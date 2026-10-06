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
const appBundle = fileURLToPath(
  new URL("../src-tauri/target/debug/bundle/macos/Resume Studio.app", import.meta.url),
);
const binary = join(appBundle, "Contents/MacOS/resume-studio");
const runFile = promisify(execFile);
const projectDirectory = await mkdtemp(join(tmpdir(), "resume-studio-e2e-"));
let projectPath = join(projectDirectory, "応募 書類.json");
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
  const child = spawn(binary, [], {
    env: {
      ...process.env,
      PATH: "/usr/bin:/bin",
      TAURI_WEBDRIVER_PORT: String(port),
      RESUME_STUDIO_E2E_PROJECT: projectPath,
      RESUME_STUDIO_E2E_PHOTO: photoPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
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
    if (Date.now() >= deadline) throw new Error("Confirmed close did not exit the app");
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
  // Activation changes native window visibility; no RAF/renderer stubs are used.
  // The exact bundle is the one whose child process this harness already owns.
  await runFile("/usr/bin/open", ["-a", appBundle], { timeout: 5000 });
  await browser.waitUntil(
    async () => await browser.execute(() => document.visibilityState === "visible"),
    { timeout: 10000, interval: 200, timeoutMsg: "Owned test WebView remained hidden" },
  );
}
try {
  browser = await connect();
  await presentTestApp();
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
  await browser.$('[aria-label="本文"]').click();
  await browser.$("button=太字").click();
  await browser.$('[aria-label="本文"]').addValue("架空の職務内容 & % _ # $ { } ~ ^ \\ 日本語");
  const text = await browser.$('[aria-label="本文"]').getText();
  assert.ok(text.includes("架空の職務内容"), `Input was lost: ${text}`);
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
  await browser.$("button=職務経歴書").click();
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
  await browser.$("button=履歴書").click();
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
  await browser.$("button=保存").click();
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
  assert.ok((await browser.$('[aria-label="本文"]').getText()).includes("架空の職務内容"));
  // Normal clean exit, move only JSON, remove original image, then launch a fresh app.
  await browser.execute(() => {
    setTimeout(
      () =>
        Array.from(document.querySelectorAll("button"))
          .find((button) => button.textContent === "終了")
          .click(),
      50,
    );
  });
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
  await browser.$("button=職務経歴書").click();
  const restoredCareer = await browser.execute(() => ({
    company: document.querySelector('[aria-label="職務経歴書の編集"] input').value,
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
  await browser.$("button=履歴書").click();
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
  await browser.$("button=PDF更新").click();
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
  // The embedded driver's option click does not dispatch select change in WKWebView.
  // Drive the native value setter and DOM event; the PDF renderer remains real.
  await browser.execute(() => {
    const select = document.querySelector(".preview-controls select");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "1.5");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
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
  for (const [label, resultId, expected] of [
    ["履歴書", "2", ["架空大学卒業", "架空の志望動機末尾", "架空の希望末尾"]],
    ["職務経歴書", "3", ["架空会社", "架空案件", "架空の業務末尾", "架空の自己PR末尾"]],
  ]) {
    await presentTestApp();
    if (label === "職務経歴書") await browser.$("button=職務経歴書").click();
    await browser.$(`button=${label}PDF更新`).click();
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
  }
  // Returning to either document keeps its own last successful PDF.
  for (const label of ["履歴書", "職務経歴書"]) {
    await browser.$(`button=${label}`).click();
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
  await browser.$(".draft-editor input").setValue("架空 終了確認");
  const closeRequest = await browser.executeAsync((done) => {
    window.__TAURI_INTERNALS__
      .invoke("request_app_close", { quit: false })
      .then(() => done({ requested: true }))
      .catch((failure) => done({ failure: String(failure) }));
  });
  assert.equal(closeRequest.failure, undefined);
  await browser.$("dialog[open]").waitForExist({ timeout: 10000 });
  assert.ok(await browser.execute(() => document.querySelector("dialog").matches(":modal")));
  await browser.$("button=キャンセル").click();
  await browser.waitUntil(async () => !(await browser.$("dialog").isExisting()), {
    timeout: 10000,
  });
  assert.equal(await browser.$(".draft-editor input").getValue(), "架空 終了確認");
  // Quit goes through RunEvent::ExitRequested, independently of native window close.
  await browser.$("button=終了").click();
  await browser.$("dialog[open]").waitForExist({ timeout: 10000 });
  await browser.$("button=キャンセル").click();
  await browser.$("button=終了").click();
  await browser.$("dialog[open]").waitForExist({ timeout: 10000 });
  // Return the driver response before the owned app shuts down its server.
  await browser.execute(() => {
    setTimeout(
      () =>
        Array.from(document.querySelectorAll("dialog button"))
          .find((button) => button.textContent === "保存して続行")
          .click(),
      50,
    );
  });
  await waitForExit();
  assert.equal(JSON.parse(await readFile(projectPath, "utf8")).profile.name, "架空 終了確認");
  console.log(
    "DESKTOP_E2E: PASS (photo import → JSON save/move → restart/restore → draft/resume/career TeX/PDF and embedded photo → guarded close/quit → save/exit; picker adapters)",
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
