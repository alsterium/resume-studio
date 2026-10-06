import { useEffect, useRef, useState } from "react";
import type { AppClient, SavedProject } from "../../infrastructure/app-client";
import { PdfPreview } from "./PdfPreview";
import { BodyEditor } from "../../editor/BodyEditor";
import type { JSONContent } from "@tiptap/core";
import { createId, newProject } from "../../domain/new-project";
import type { BodyDoc } from "../../domain/project";
import { beginSession, editSession, hasUnsavedChanges, recordSaved } from "../../domain/session";
import { DiscardDialog } from "../files/DiscardDialog";
import { ResumeEditor } from "../resume/ResumeEditor";

type PendingAction = "new" | "open" | "close";

export function DraftWorkspace({ client }: { client: AppClient }) {
  const [session, setSession] = useState(() => beginSession(newProject()));
  const project = session.project;
  const dirty = hasUnsavedChanges(session);
  const currentSession = useRef(session);
  const closeHandler = useRef<() => void>(() => {});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [opening, setOpening] = useState(false);
  const [file, setFile] = useState<SavedProject | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const name = project.profile.name;
  const body = project.career.summary;
  const photo = project.assets.find((asset) => asset.id === project.profile.photoAssetId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{
    id: string;
    bytes: Uint8Array;
    name: string;
    body: JSONContent;
  } | null>(null);

  useEffect(() => {
    currentSession.current = session;
    closeHandler.current = () => void requestAction("close");
  });
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void client
      .onCloseRequested(() => closeHandler.current())
      .then((unlisten) => {
        if (disposed) unlisten();
        else unsubscribe = unlisten;
      })
      .catch(() => {
        if (!disposed) setError("終了確認を準備できませんでした。アプリを再起動してください。");
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [client]);

  async function openProject() {
    setFileBusy(true);
    setOpening(true);
    setError(null);
    try {
      const opened = await client.openProject();
      if (opened) {
        setSession(beginSession(opened.project));
        setFile({ fileId: opened.fileId, displayName: opened.displayName });
        setEditorKey((key) => key + 1);
        setPdf(null);
        setFileMessage("JSONを読み込みました。");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setFileBusy(false);
      setOpening(false);
    }
  }

  async function saveProject(saveAs: boolean) {
    const snapshot = session;
    setFileBusy(true);
    setError(null);
    try {
      const saved = await client.saveProject(project, file?.fileId ?? null, saveAs);
      if (saved) {
        setFile(saved);
        setSession((current) => recordSaved(current, snapshot));
        setFileMessage("JSONを保存しました。");
        return (
          currentSession.current.project.projectId === snapshot.project.projectId &&
          currentSession.current.revision === snapshot.revision
        );
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setFileBusy(false);
    }
    return false;
  }

  async function importPhoto() {
    if (!photo && project.assets.length >= 4) {
      setError("写真は4枚以内にしてください。不要な写真を削除してから取り込んでください。");
      return;
    }
    setFileBusy(true);
    setError(null);
    try {
      const imported = await client.importPhoto();
      if (imported) {
        const id = createId("photo");
        setSession((current) =>
          editSession(current, {
            ...current.project,
            profile: { ...current.project.profile, photoAssetId: id },
            assets: [
              ...current.project.assets.filter(
                (asset) => asset.id !== current.project.profile.photoAssetId,
              ),
              { id, mediaType: imported.mediaType, base64: imported.base64 },
            ],
          }),
        );
        setFileMessage("写真を取り込みました。");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setFileBusy(false);
    }
  }

  function removePhoto() {
    setSession((current) =>
      editSession(current, {
        ...current.project,
        profile: { ...current.project.profile, photoAssetId: null },
        assets: current.project.assets.filter(
          (asset) => asset.id !== current.project.profile.photoAssetId,
        ),
      }),
    );
    setFileMessage(null);
  }

  function resetProject() {
    setSession(beginSession(newProject()));
    setFile(null);
    setPdf(null);
    setError(null);
    setFileMessage(null);
    setEditorKey((key) => key + 1);
  }

  async function performAction(action: PendingAction) {
    if (action === "new") resetProject();
    else if (action === "open") await openProject();
    else {
      try {
        await client.finishClose();
      } catch {
        setError("終了できませんでした。もう一度お試しください。");
      }
    }
  }

  async function requestAction(action: PendingAction) {
    if (fileBusy || busy) {
      setFileMessage("処理の完了後にもう一度操作してください。");
      return;
    }
    if (pending) return;
    if (dirty) setPending(action);
    else await performAction(action);
  }

  async function saveAndContinue() {
    const action = pending;
    if (action && (await saveProject(false))) {
      setPending(null);
      await performAction(action);
    }
  }

  async function discardAndContinue() {
    const action = pending;
    setPending(null);
    if (action) await performAction(action);
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
          <button
            type="button"
            disabled={fileBusy || busy}
            onClick={() => void requestAction("new")}
          >
            新規
          </button>
          <button
            type="button"
            disabled={fileBusy || busy}
            onClick={() => void requestAction("open")}
          >
            開く
          </button>
          <button type="button" disabled={fileBusy} onClick={() => void saveProject(false)}>
            保存
          </button>
          <button type="button" disabled={fileBusy} onClick={() => void saveProject(true)}>
            名前を付けて保存
          </button>
          <button
            type="button"
            disabled={fileBusy || busy}
            onClick={() =>
              void client.requestClose().catch(() => setError("終了を要求できませんでした。"))
            }
          >
            終了
          </button>
        </div>
        <output aria-label="プロジェクトファイル">{file?.displayName ?? "保存先未設定"}</output>
        <output aria-label="保存状態">
          {dirty ? "未保存の変更があります" : file ? "保存済み" : "新規プロジェクト"}
        </output>
        {fileMessage && <output>{fileMessage}</output>}
        <h2 id="draft-title">下書き</h2>
        <p>氏名と本文からPDFを生成できます。</p>
        <label>
          氏名
          <input
            disabled={opening || pending !== null}
            value={name}
            onChange={(event) => {
              const value = event.target.value;
              setSession((current) =>
                editSession(current, {
                  ...current.project,
                  profile: { ...current.project.profile, name: value },
                }),
              );
              setFileMessage(null);
            }}
          />
        </label>
        <div aria-label="証明写真">
          {project.assets.length > 0 && (
            <label>
              保存済み写真
              <select
                disabled={fileBusy || pending !== null}
                value={project.profile.photoAssetId ?? ""}
                onChange={(event) => {
                  const photoAssetId = event.target.value || null;
                  setSession((current) =>
                    editSession(current, {
                      ...current.project,
                      profile: { ...current.project.profile, photoAssetId },
                    }),
                  );
                  setFileMessage(null);
                }}
              >
                <option value="">写真なし</option>
                {project.assets.map((asset, index) => (
                  <option key={asset.id} value={asset.id}>
                    写真 {index + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          {photo ? (
            <img
              src={`data:${photo.mediaType};base64,${photo.base64}`}
              alt="取り込んだ証明写真"
              width={90}
              height={120}
              style={{ objectFit: "contain" }}
            />
          ) : (
            <p>写真なし</p>
          )}
          <button
            type="button"
            disabled={fileBusy || pending !== null}
            onClick={() => void importPhoto()}
          >
            写真を取り込む
          </button>
          <button
            type="button"
            disabled={!photo || fileBusy || pending !== null}
            onClick={removePhoto}
          >
            写真を削除
          </button>
          <p>JPEG／PNG、5MiB以内。縦横比を保ち最大600×800pxへ調整します。</p>
        </div>
        <p>本文</p>
        <BodyEditor
          key={editorKey}
          initialContent={body as JSONContent}
          editable={!opening && pending === null}
          onChange={(content) => {
            setSession((current) =>
              editSession(current, {
                ...current.project,
                career: { ...current.project.career, summary: content as BodyDoc },
              }),
            );
            setFileMessage(null);
          }}
        />
        <ResumeEditor
          project={project}
          disabled={opening || pending !== null}
          editorKey={editorKey}
          onChange={(updated) => {
            setSession((current) => editSession(current, updated));
            setFileMessage(null);
          }}
        />
        <button type="button" disabled={busy || fileBusy} onClick={() => void updatePdf()}>
          {busy ? "PDF生成中…" : "PDF更新"}
        </button>
        {error && !pending && <p role="alert">{error}</p>}
        {pdf && (pdf.name !== name || JSON.stringify(pdf.body) !== JSON.stringify(body)) && (
          <output>PDFは更新前の内容です。</output>
        )}
      </div>
      {pdf ? (
        <PdfPreview key={pdf.id} bytes={pdf.bytes} />
      ) : (
        <p className="preview-empty">「PDF更新」でプレビューを表示します。</p>
      )}
      {pending && (
        <DiscardDialog
          busy={fileBusy}
          error={error}
          onSave={() => void saveAndContinue()}
          onDiscard={() => void discardAndContinue()}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
