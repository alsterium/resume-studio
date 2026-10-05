import { useState } from "react";
import type { AppClient } from "../../infrastructure/app-client";
import { PdfPreview } from "./PdfPreview";
import { BodyEditor, emptyBody } from "../../editor/BodyEditor";
import type { JSONContent } from "@tiptap/core";

export function DraftWorkspace({ client }: { client: AppClient }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState<JSONContent>(emptyBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{
    id: string;
    bytes: Uint8Array;
    name: string;
    body: JSONContent;
  } | null>(null);

  async function updatePdf() {
    setBusy(true);
    setError(null);
    const draft = { name, body: "", richBody: body };
    try {
      const { resultId } = await client.generateDraft(draft);
      const bytes = await client.readPdf(resultId);
      setPdf({ id: resultId, bytes, name, body });
    } catch (failure) {
      setError(
        typeof failure === "string" ? failure : "PDF生成に失敗しました。もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="draft-title" className="draft-workspace">
      <div className="draft-editor">
        <h2 id="draft-title">下書き</h2>
        <p>氏名と本文からPDFを生成できます。</p>
        <label>
          氏名
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <p>本文</p>
        <BodyEditor onChange={setBody} />
        <button type="button" disabled={busy} onClick={() => void updatePdf()}>
          {busy ? "PDF生成中…" : "PDF更新"}
        </button>
        {error && <p role="alert">{error}</p>}
        {pdf && (pdf.name !== name || JSON.stringify(pdf.body) !== JSON.stringify(body)) && (
          <output>PDFは更新前の内容です。</output>
        )}
      </div>
      {pdf ? (
        <PdfPreview key={pdf.id} bytes={pdf.bytes} />
      ) : (
        <p className="preview-empty">「PDF更新」でプレビューを表示します。</p>
      )}
    </section>
  );
}
