import { expect, test, vi } from "vitest";

const engine = vi.hoisted(() => ({
  getDocument: vi.fn(),
  createWorker: vi.fn(),
  worker: { destroy: vi.fn() },
}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: engine.getDocument,
  PDFWorker: { create: engine.createWorker },
}));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?worker", () => ({ default: class {} }));

test("前PDFの後始末が未完了でも次のPDFはruntime所有workerを使う", async () => {
  let finishCleanup: () => void = () => {};
  const oldCleanup = new Promise<void>((resolve) => {
    finishCleanup = resolve;
  });
  engine.createWorker.mockReturnValue(engine.worker);
  engine.getDocument.mockReturnValueOnce({
    promise: Promise.resolve({ numPages: 1 }),
    destroy: () => oldCleanup,
  });
  engine.getDocument.mockReturnValueOnce({
    promise: Promise.resolve({ numPages: 2 }),
    destroy: async () => {},
  });
  const { loadPdf } = await import("../../src/infrastructure/pdf-runtime");
  const previous = loadPdf(new Uint8Array([1]));
  await expect(previous.promise).resolves.toEqual({ numPages: 1 });
  const disposing = previous.destroy();
  const replacement = loadPdf(new Uint8Array([2]));
  await expect(replacement.promise).resolves.toEqual({ numPages: 2 });
  expect(engine.createWorker).toHaveBeenCalledTimes(1);
  expect(engine.getDocument).toHaveBeenCalledTimes(2);
  for (const [options] of engine.getDocument.mock.calls) expect(options.worker).toBe(engine.worker);
  expect(engine.worker.destroy).not.toHaveBeenCalled();
  finishCleanup();
  await disposing;
  await replacement.destroy();
});
