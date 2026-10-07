import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "../../components/ui/button";
import { ChevronLeft, ChevronRight, Columns2, FileText } from "lucide-react";

export function PdfPreview({
  bytes,
  standardPages,
  fitToWidth = false,
}: {
  bytes: Uint8Array;
  standardPages?: number;
  fitToWidth?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const secondCanvas = useRef<HTMLCanvasElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [spread, setSpread] = useState(fitToWidth);
  const [fit, setFit] = useState(fitToWidth);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rendered, setRendered] = useState<{ page: number; scale: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = paper.current;
    if (!fit || !document || !container) return;
    let active = true;
    const resize = async () => {
      const pdfPage = await document.getPage(page);
      if (!active || container.clientWidth === 0) return;
      const width = pdfPage.getViewport({ scale: 1 }).width;
      const count = spread && page < document.numPages ? 2 : 1;
      setScale(
        Math.max(
          0.25,
          Math.min(2, (container.clientWidth - 48 - (count - 1) * 20) / (width * count)),
        ),
      );
    };
    const observer = new ResizeObserver(() => void resize().catch(() => {}));
    observer.observe(container);
    void resize().catch(() => {});
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [fit, document, spread, page]);

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
    let secondTask: RenderTask | undefined;
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
        if (active && spread && page < document.numPages && secondCanvas.current) {
          const following = await document.getPage(page + 1);
          if (!active || !secondCanvas.current) return;
          const secondViewport = following.getViewport({ scale });
          const target = secondCanvas.current;
          target.width = Math.ceil(secondViewport.width);
          target.height = Math.ceil(secondViewport.height);
          secondTask = following.render({ canvas: target, viewport: secondViewport });
          await secondTask.promise;
        }
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
      secondTask?.cancel();
    };
  }, [document, page, scale, spread]);

  return (
    <section aria-label="PDFプレビュー" className="pdf-preview">
      <div className="preview-controls">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="前のページ"
          type="button"
          disabled={!document || page === 1}
          onClick={() => setPage(Math.max(1, page - (spread ? 2 : 1)))}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <output aria-label="ページ番号">
          {document ? `${page} / ${document.numPages}` : "PDF読込中…"}
        </output>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="次のページ"
          type="button"
          disabled={!document || page + (spread ? 1 : 0) >= document.numPages}
          onClick={() => setPage(Math.min(document?.numPages ?? 1, page + (spread ? 2 : 1)))}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <label>
          表示倍率
          <select
            value={fit ? "fit" : scale}
            onChange={(event) => {
              setFit(event.target.value === "fit");
              if (event.target.value !== "fit") setScale(Number(event.target.value));
            }}
          >
            <option value="fit">画面に合わせる</option>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
              <option key={value} value={value}>
                {value * 100}%
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={spread}
          disabled={!document}
          onClick={() => setSpread(!spread)}
        >
          {spread ? <Columns2 aria-hidden="true" /> : <FileText aria-hidden="true" />}見開き
        </Button>
      </div>
      {document && standardPages !== undefined && document.numPages > standardPages && (
        <output>
          履歴書は通常の{standardPages}ページを超え、続紙を含む{document.numPages}ページです。
          全ページの内容と改ページ位置を確認してください。
        </output>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="pdf-paper" ref={paper}>
        <div className="pdf-pages">
          <canvas
            ref={canvas}
            aria-label="生成されたPDFページ"
            data-rendered-page={rendered?.page}
            data-rendered-scale={rendered?.scale}
          />
          {spread && document && page < document.numPages && (
            <canvas
              ref={secondCanvas}
              aria-label={`生成されたPDFページ ${page + 1}`}
              data-rendered-page={rendered ? page + 1 : undefined}
              data-rendered-scale={rendered?.scale}
            />
          )}
        </div>
      </div>
    </section>
  );
}
