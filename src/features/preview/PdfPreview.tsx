import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export function PdfPreview({ bytes }: { bytes: Uint8Array }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rendered, setRendered] = useState<{ page: number; scale: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof import("../../infrastructure/pdf-runtime").loadPdf> | undefined;
    void import("../../infrastructure/pdf-runtime")
      .then(async ({ loadPdf }) => {
        if (!active) return;
        task = loadPdf(bytes);
        const pdf = await task.promise;
        if (active) setDocument(pdf);
      })
      .catch((failure: unknown) => {
        if (active) {
          console.error("PDF load failed", failure);
          setError("PDFを読み込めませんでした。もう一度生成してください。");
        }
      });
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let task: RenderTask | undefined;
    void document
      .getPage(page)
      .then(async (pdfPage) => {
        if (!active || !canvas.current) return;
        const target = canvas.current;
        const viewport = pdfPage.getViewport({ scale });
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        task = pdfPage.render({ canvas: target, viewport });
        await task.promise;
        if (active) setRendered({ page, scale });
      })
      .catch((failure: unknown) => {
        if (active) {
          console.error("PDF page render failed", failure);
          setError("PDFのページを表示できませんでした。");
        }
      });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [document, page, scale]);

  return (
    <section aria-label="PDFプレビュー" className="pdf-preview">
      <div className="preview-controls">
        <button type="button" disabled={!document || page === 1} onClick={() => setPage(page - 1)}>
          前のページ
        </button>
        <output aria-label="ページ番号">
          {document ? `${page} / ${document.numPages}` : "PDF読込中…"}
        </output>
        <button
          type="button"
          disabled={!document || page === document.numPages}
          onClick={() => setPage(page + 1)}
        >
          次のページ
        </button>
        <label>
          表示倍率
          <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
              <option key={value} value={value}>
                {value * 100}%
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="pdf-paper">
        <canvas
          ref={canvas}
          aria-label="生成されたPDFページ"
          data-rendered-page={rendered?.page}
          data-rendered-scale={rendered?.scale}
        />
      </div>
    </section>
  );
}
