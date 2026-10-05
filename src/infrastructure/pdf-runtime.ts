import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";

GlobalWorkerOptions.workerPort = new PdfWorker();

export function loadPdf(bytes: Uint8Array) {
  return getDocument({ data: bytes.slice(), useWasm: false });
}
