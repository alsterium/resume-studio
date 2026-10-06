import { getDocument, PDFWorker } from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?worker";

// The runtime owns this worker for the app lifetime. Loading tasks only own their
// document transport, so destroying one preview cannot destroy the next worker.
const worker = PDFWorker.create({ port: new PdfWorker() });

export function loadPdf(bytes: Uint8Array) {
  return getDocument({ data: bytes.slice(), useWasm: false, worker });
}
