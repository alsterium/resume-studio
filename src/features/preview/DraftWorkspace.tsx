import { useState } from "react";
import type { AppClient, SavedProject } from "../../infrastructure/app-client";
import { PdfPreview } from "./PdfPreview";
import { BodyEditor } from "../../editor/BodyEditor";
import type { JSONContent } from "@tiptap/core";
import { newProject } from "../../domain/new-project";
import type { BodyDoc } from "../../domain/project";

export function DraftWorkspace({ client }: { client: AppClient }) {
  const [project, setProject] = useState(newProject);
  const [file, setFile] = useState<SavedProject | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const name = project.profile.name;
  const body = project.career.summary;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{
    id: string;
    bytes: Uint8Array;
    name: string;
    body: JSONContent;
  } | null>(null);

  async function openProject() {
    setFileBusy(true);
    setError(null);
    try {
      const opened = await client.openProject();
      if (opened) {
        setProject(opened.project);
        setFile({ fileId: opened.fileId, displayName: opened.displayName });
        setEditorKey((key) => key + 1);
        setPdf(null);
        setFileMessage("JSONを読み込みました。");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setFileBusy(false);
    }
  }

  async function saveProject(saveAs: boolean) {
    setFileBusy(true);
    setError(null);
    try {
      const saved = await client.saveProject(project, file?.fileId ?? null, saveAs);
      if (saved) {
        setFile(saved);
        setFileMessage("JSONを保存しました。");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setFileBusy(false);
    }
  }

  function resetProject() {
    setProject(newProject());
    setFile(null);
    setPdf(null);
    setError(null);
    setFileMessage(null);
    setEditorKey((key) => key + 1);
  }

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
        <div aria-label="プロジェクト操作">
          <button type="button" disabled={fileBusy || busy} onClick={resetProject}>
            新規
          </button>
          <button type="button" disabled={fileBusy || busy} onClick={() => void openProject()}>
            開く
          </button>
          <button type="button" disabled={fileBusy} onClick={() => void saveProject(false)}>
            保存
          </button>
          <button type="button" disabled={fileBusy} onClick={() => void saveProject(true)}>
            名前を付けて保存
          </button>
        </div>
        <output aria-label="プロジェクトファイル">{file?.displayName ?? "保存先未設定"}</output>
        {fileMessage && <output>{fileMessage}</output>}
        <h2 id="draft-title">下書き</h2>
        <p>氏名と本文からPDFを生成できます。</p>
        <label>
          氏名
          <input
            value={name}
            onChange={(event) => {
              setProject({ ...project, profile: { ...project.profile, name: event.target.value } });
              setFileMessage(null);
            }}
          />
        </label>
        <p>本文</p>
        <BodyEditor
          key={editorKey}
          initialContent={body as JSONContent}
          onChange={(content) => {
            setProject({ ...project, career: { ...project.career, summary: content as BodyDoc } });
            setFileMessage(null);
          }}
        />
        <button type="button" disabled={busy || fileBusy} onClick={() => void updatePdf()}>
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
