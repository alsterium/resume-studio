import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "../../components/ui/button";
import { ButtonGroup, ButtonGroupText } from "../../components/ui/button-group";
import { ChevronLeft, ChevronRight, Columns2, FileText, Minus, Plus, Maximize } from "lucide-react";

let runtimePromise: Promise<typeof import("../../infrastructure/pdf-runtime")> | undefined;
function pdfRuntime() {
  return (runtimePromise ??= import("../../infrastructure/pdf-runtime").catch(
    (failure: unknown) => {
      runtimePromise = undefined;
      throw failure;
    },
  ));
}

// Generated documents use a common A4 page size. Keep lightweight page frames
// in the flow, but release canvas pixel buffers outside the visible window.
function PdfPage({
  document,
  number,
  scale,
  size,
  active,
  current,
  onRendered,
  onError,
}: {
  document: PDFDocumentProxy;
  number: number;
  scale: number;
  size: { width: number; height: number };
  active: boolean;
  current: boolean;
  onRendered: (page: number, scale: number) => void;
  onError: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState<number | null>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let live = true;
    let task: RenderTask | undefined;
    setReady(null);
    if (!active) {
      target.width = 0;
      target.height = 0;
      return;
    }
    void document
      .getPage(number)
      .then(async (pdfPage) => {
        if (!live) return;
        const viewport = pdfPage.getViewport({ scale });
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        task = pdfPage.render({ canvas: target, viewport });
        await task.promise;
        if (live) {
          setReady(scale);
          onRendered(number, scale);
        }
      })
      .catch((failure: unknown) => {
        if (live) {
          console.error("PDF page render failed", failure);
          onError("PDFのページを表示できませんでした。");
        }
      });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [document, number, scale, active, onRendered, onError]);
  return (
    <div
      className="pdf-page"
      data-page-number={number}
      style={{ width: size.width * scale, height: size.height * scale }}
    >
      <canvas
        ref={canvas}
        aria-label={current ? "生成されたPDFページ" : `生成されたPDFページ ${number}`}
        data-rendered-page={ready === scale ? number : undefined}
        data-rendered-scale={ready === scale ? ready : undefined}
      />
    </div>
  );
}

export function PdfPreview({
  bytes,
  standardPages,
  fitToWidth = false,
  spread: controlledSpread,
  onSpreadChange,
  zoom: controlledZoom,
  onZoomChange,
  page: controlledPage,
  onPageChange,
}: {
  bytes: Uint8Array;
  standardPages?: number;
  fitToWidth?: boolean;
  spread?: boolean;
  onSpreadChange?: (spread: boolean) => void;
  zoom?: "fit" | number;
  onZoomChange?: (zoom: "fit" | number) => void;
  page?: number;
  onPageChange?: (page: number) => void;
}) {
  const [pageSize, setPageSize] = useState({ width: 595.276, height: 841.89 });
  const [visible, setVisible] = useState({ first: 1, last: 3 });
  const scrolledPage = useRef<number | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [localSpread, setLocalSpread] = useState(fitToWidth);
  const spread = controlledSpread ?? localSpread;
  const [localFit, setFit] = useState(fitToWidth);
  const fit = controlledZoom === undefined ? localFit : controlledZoom === "fit";
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [localPage, setLocalPage] = useState(1);
  const requestedPage = controlledPage ?? localPage;
  const page = document ? Math.max(1, Math.min(document.numPages, requestedPage)) : requestedPage;
  const [localScale, setScale] = useState(1);
  const scale = typeof controlledZoom === "number" ? controlledZoom : localScale;
  const [rendered, setRendered] = useState<{ page: number; scale: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinching, setPinching] = useState(false);
  const pageSelection = useRef({ page: requestedPage, onPageChange });
  const zoomState = useRef({ scale, onZoomChange, spread, height: pageSize.height });
  const zoomAnchor = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    scale: number;
    height: number | null;
  } | null>(null);

  useEffect(() => {
    zoomState.current = { scale, onZoomChange, spread, height: pageSize.height };
  }, [scale, onZoomChange, spread, pageSize.height]);

  function changeZoom(next: "fit" | number, point?: { x: number; y: number }) {
    if (typeof next === "number") {
      if (!Number.isFinite(next)) return;
      next = Math.round(Math.max(0.25, Math.min(2, next)) * 1000) / 1000;
      const container = paper.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const x = point ? point.x - rect.left : container.clientWidth / 2;
        const y = point ? point.y - rect.top : container.clientHeight / 2;
        // Retain the original anchor until the pending PDF render finishes.
        zoomAnchor.current ??= {
          x,
          y,
          left: container.scrollLeft,
          top: container.scrollTop,
          scale: zoomState.current.scale,
          height: zoomState.current.spread ? null : zoomState.current.height,
        };
      }
      zoomState.current.scale = next;
      setScale(next);
    } else {
      zoomAnchor.current = null;
    }
    setFit(next === "fit");
    zoomState.current.onZoomChange?.(next);
  }

  useEffect(() => {
    const container = paper.current;
    const anchor = zoomAnchor.current;
    if (!container || !anchor || !rendered || rendered.scale !== scale) return;
    const ratio = scale / anchor.scale;
    container.scrollLeft = (anchor.left + anchor.x) * ratio - anchor.x;
    if (anchor.height !== null) {
      const oldHeight = anchor.height * anchor.scale;
      const index = Math.max(0, Math.floor((anchor.top + anchor.y - 24) / (oldHeight + 20)));
      const offset = anchor.top + anchor.y - 24 - index * (oldHeight + 20);
      const resizedOffset =
        offset <= oldHeight ? offset * ratio : oldHeight * ratio + offset - oldHeight;
      container.scrollTop = Math.max(
        0,
        24 + index * (anchor.height * scale + 20) + resizedOffset - anchor.y,
      );
    } else {
      container.scrollTop = (anchor.top + anchor.y) * ratio - anchor.y;
    }
    zoomAnchor.current = null;
  }, [rendered, scale]);

  useEffect(() => {
    const container = paper.current;
    if (!container || !document) return;
    let gestureScale: number | null = null;
    let touchStart: { distance: number; scale: number } | null = null;
    let wheelEnd: ReturnType<typeof setTimeout> | undefined;
    const point = (event: MouseEvent) => ({ x: event.clientX, y: event.clientY });
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (gestureScale !== null) return;
      setPinching(true);
      clearTimeout(wheelEnd);
      wheelEnd = setTimeout(() => setPinching(false), 180);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
      changeZoom(zoomState.current.scale * Math.exp(-event.deltaY * unit * 0.01), point(event));
    };
    // WKWebView/Safari trackpads emit cumulative GestureEvent.scale values.
    const gestureStart = (event: Event) => {
      event.preventDefault();
      gestureScale = zoomState.current.scale;
      clearTimeout(wheelEnd);
      setPinching(true);
    };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as MouseEvent & { scale: number };
      if (gestureScale !== null) changeZoom(gestureScale * gesture.scale, point(gesture));
    };
    const gestureEnd = (event: Event) => {
      event.preventDefault();
      gestureScale = null;
      touchStart = null;
      setPinching(false);
    };
    const distance = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const startTouch = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        touchStart = null;
        if (gestureScale === null) setPinching(false);
        return;
      }
      event.preventDefault();
      touchStart = { distance: distance(event.touches), scale: zoomState.current.scale };
      clearTimeout(wheelEnd);
      setPinching(true);
    };
    const moveTouch = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !touchStart) return;
      event.preventDefault();
      if (gestureScale !== null || touchStart.distance === 0) return;
      changeZoom((touchStart.scale * distance(event.touches)) / touchStart.distance, {
        x: (event.touches[0].clientX + event.touches[1].clientX) / 2,
        y: (event.touches[0].clientY + event.touches[1].clientY) / 2,
      });
    };
    const endTouch = () => {
      touchStart = null;
      if (gestureScale === null) setPinching(false);
    };
    container.addEventListener("wheel", wheel, { passive: false });
    container.addEventListener("gesturestart", gestureStart, { passive: false });
    container.addEventListener("gesturechange", gestureChange, { passive: false });
    container.addEventListener("gestureend", gestureEnd, { passive: false });
    container.addEventListener("touchstart", startTouch, { passive: false });
    container.addEventListener("touchmove", moveTouch, { passive: false });
    container.addEventListener("touchend", endTouch);
    container.addEventListener("touchcancel", endTouch);
    return () => {
      clearTimeout(wheelEnd);
      container.removeEventListener("wheel", wheel);
      container.removeEventListener("gesturestart", gestureStart);
      container.removeEventListener("gesturechange", gestureChange);
      container.removeEventListener("gestureend", gestureEnd);
      container.removeEventListener("touchstart", startTouch);
      container.removeEventListener("touchmove", moveTouch);
      container.removeEventListener("touchend", endTouch);
      container.removeEventListener("touchcancel", endTouch);
    };
  }, [document]);

  useEffect(() => {
    pageSelection.current = { page: requestedPage, onPageChange };
  }, [requestedPage, onPageChange]);

  const changePage = (next: number) => {
    scrolledPage.current = null;
    setLocalPage(next);
    onPageChange?.(next);
  };

  const updateVisiblePages = useCallback(
    (selectPage = false) => {
      const container = paper.current;
      if (!container || !document || spread) return;
      const height = pageSize.height * scale;
      const stride = height + 20;
      const top = Math.max(0, container.scrollTop - 24);
      const first = Math.max(1, Math.floor(top / stride));
      const last = Math.min(
        document.numPages,
        Math.ceil((top + container.clientHeight) / stride) + 2,
      );
      setVisible((previous) =>
        previous.first === first && previous.last === last ? previous : { first, last },
      );
      if (!selectPage || zoomAnchor.current) return;
      const next = Math.max(
        1,
        Math.min(
          document.numPages,
          Math.floor((top + Math.min(container.clientHeight / 3, height / 2)) / stride) + 1,
        ),
      );
      if (next !== pageSelection.current.page) {
        scrolledPage.current = next;
        pageSelection.current.page = next;
        setLocalPage(next);
        pageSelection.current.onPageChange?.(next);
      }
    },
    [document, spread, scale, pageSize.height],
  );

  const fitLayout = useRef({ document, scale, fit, spread });
  useLayoutEffect(() => {
    const previous = fitLayout.current;
    fitLayout.current = { document, scale, fit, spread };
    // Width fitting changes the height of every frame. Stay on the selected
    // page rather than retaining an absolute offset into a different page.
    if (
      fit &&
      !spread &&
      document &&
      paper.current &&
      (previous.document !== document ||
        previous.scale !== scale ||
        previous.fit !== fit ||
        previous.spread !== spread)
    ) {
      paper.current.scrollTop = (page - 1) * (pageSize.height * scale + 20);
    }
  }, [document, scale, fit, spread, page, pageSize.height]);

  useEffect(() => {
    const container = paper.current;
    if (!container || !document) return;
    if (spread) {
      container.scrollTop = 0;
    } else if (scrolledPage.current !== page) {
      container.scrollTop = (page - 1) * (pageSize.height * zoomState.current.scale + 20);
    }
    scrolledPage.current = null;
    // Scale is deliberately not a dependency: zoom preserves its own anchor.
  }, [document, spread, page, pageSize.height]);

  useEffect(() => {
    const container = paper.current;
    if (!container) return;
    const observer = new ResizeObserver(() => updateVisiblePages());
    observer.observe(container);
    updateVisiblePages();
    return () => observer.disconnect();
  }, [updateVisiblePages]);

  const pageRendered = useCallback(
    (page: number, scale: number) => setRendered({ page, scale }),
    [],
  );

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
    void pdfRuntime()
      .then(async ({ loadPdf }) => {
        if (!active) return;
        task = loadPdf(bytes);
        const pdf = await task.promise;
        const firstPage = await pdf.getPage(1);
        const size = firstPage.getViewport({ scale: 1 });
        if (active) {
          const selection = pageSelection.current;
          const nextPage = Math.max(1, Math.min(pdf.numPages, selection.page));
          setPageSize({ width: size.width, height: size.height });
          setDocument(pdf);
          setLocalPage(nextPage);
          if (nextPage !== selection.page) selection.onPageChange?.(nextPage);
        }
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

  return (
    <section aria-label="PDFプレビュー" className="pdf-preview">
      <div className="preview-controls">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="前のページ"
          type="button"
          disabled={!document || page === 1}
          onClick={() => changePage(Math.max(1, page - (spread ? 2 : 1)))}
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
          onClick={() => changePage(Math.min(document?.numPages ?? 1, page + (spread ? 2 : 1)))}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={spread}
          disabled={!document}
          onClick={() => {
            zoomAnchor.current = null;
            setLocalSpread(!spread);
            onSpreadChange?.(!spread);
          }}
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
      <div className="preview-viewport">
        <div className="pdf-paper" ref={paper} onScroll={() => updateVisiblePages(true)}>
          <div className={spread ? "pdf-pages" : "pdf-pages pdf-pages-continuous"}>
            {document &&
              (spread
                ? [page, ...(page < document.numPages ? [page + 1] : [])]
                : Array.from({ length: document.numPages }, (_, index) => index + 1)
              ).map((number) => (
                <PdfPage
                  key={number}
                  document={document}
                  number={number}
                  scale={scale}
                  size={pageSize}
                  current={number === page}
                  active={
                    spread || number === page || (number >= visible.first && number <= visible.last)
                  }
                  onRendered={pageRendered}
                  onError={setError}
                />
              ))}
          </div>
        </div>
        <ButtonGroup
          aria-label="プレビューのズーム操作"
          className="preview-zoom"
          data-pinching={pinching}
        >
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="縮小"
            title="縮小"
            disabled={!document || scale <= 0.25}
            onClick={() => changeZoom(Math.max(0.25, Math.floor((scale - 0.001) * 4) / 4))}
          >
            <Minus aria-hidden="true" />
          </Button>
          <ButtonGroupText asChild className="preview-zoom-value">
            <output aria-label="表示倍率" data-zoom-mode={fit ? "fit" : "manual"}>
              {Math.round(scale * 100)}%
            </output>
          </ButtonGroupText>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="拡大"
            title="拡大"
            disabled={!document || scale >= 2}
            onClick={() => changeZoom(Math.min(2, Math.floor((scale + 0.001) * 4) / 4 + 0.25))}
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="画面に合わせる"
            title="画面に合わせる"
            aria-pressed={fit}
            disabled={!document}
            onClick={() => changeZoom("fit")}
          >
            <Maximize aria-hidden="true" />
          </Button>
        </ButtonGroup>
      </div>
    </section>
  );
}
