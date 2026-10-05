import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?worker";

GlobalWorkerOptions.workerPort = new PdfWorker();

export function loadPdf(bytes: Uint8Array) {
  return getDocument({ data: bytes.slice(), useWasm: false });
}
