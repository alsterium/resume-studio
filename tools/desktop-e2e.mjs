import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { remote } from "webdriverio";

// Standalone WebdriverIO drives the same embedded W3C server as the Tauri service.
// No IPC mocks, frontend test bridge, or global Tauri API is installed.
const server = createServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();
await new Promise((resolve) => server.close(resolve));
const binary = fileURLToPath(
  new URL(
    "../src-tauri/target/debug/bundle/macos/Resume Studio.app/Contents/MacOS/resume-studio",
    import.meta.url,
  ),
);
const app = spawn(binary, [], {
  env: { ...process.env, PATH: "/usr/bin:/bin", TAURI_WEBDRIVER_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
let launchError;
app.on("error", (error) => {
  launchError = error;
});
for (const stream of [app.stdout, app.stderr])
  stream.on("data", (chunk) => {
    if (output.length < 65536) output += chunk.toString().slice(0, 65536 - output.length);
  });
let browser;
try {
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
  browser = await remote({
    hostname: "127.0.0.1",
    port,
    path: "/",
    logLevel: "error",
    connectionRetryCount: 0,
    connectionRetryTimeout: 30000,
    capabilities: { browserName: "wry" },
  });
  await browser.$(".draft-editor input").waitForExist({ timeout: 30000 });
  await browser.$(".draft-editor input").setValue("架空 山田");
  await browser.$('[aria-label="本文"]').click();
  await browser.$('[aria-label="本文"]').addValue("架空の職務内容 & % _ # $ { } ~ ^ \\ 日本語");
  const text = await browser.$('[aria-label="本文"]').getText();
  assert.ok(text.includes("架空の職務内容"), `Input was lost: ${text}`);
  await browser.$("button=PDF更新").click();
  const renderDeadline = Date.now() + 90000;
  for (;;) {
    const state = await browser.execute(() => ({
      error: document.querySelector('[role="alert"]')?.textContent,
      ready: document.querySelector("canvas")?.dataset.renderedPage === "1",
    }));
    if (state.error) throw new Error(state.error.slice(0, 2000));
    if (state.ready) break;
    if (Date.now() >= renderDeadline) throw new Error("Real TeX PDF did not render");
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
      .catch((error) => done({ error: String(error) }));
  });
  assert.equal(pdfBytes.error, undefined);
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
    const select = document.querySelector("select");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "1.5");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await browser.waitUntil(
    async () =>
      await browser.execute(
        () => document.querySelector("canvas")?.dataset.renderedScale === "1.5",
      ),
    { timeout: 30000 },
  );
  assert.ok((await browser.execute(() => document.querySelector("canvas").width)) > first.width);
  console.log(
    "DESKTOP_E2E: PASS (app bundle → WebDriver input → real TeX → PDF text/canvas → zoom)",
  );
} finally {
  try {
    if (browser) await browser.deleteSession();
  } finally {
    if (app.exitCode === null && app.signalCode === null && app.pid) {
      const exited = once(app, "exit");
      app.kill("SIGTERM");
      const timer = setTimeout(() => app.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    }
  }
}
