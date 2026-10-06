import { useEffect, useRef, useState } from "react";
import type {
  AppClient,
  DocumentKind,
  JobPhase,
  SavedProject,
} from "../../infrastructure/app-client";
import { PdfPreview } from "./PdfPreview";
import { BodyEditor } from "../../editor/BodyEditor";
import type { JSONContent } from "@tiptap/core";
import { createId, newProject } from "../../domain/new-project";
import type { BodyDoc } from "../../domain/project";
import { beginSession, editSession, hasUnsavedChanges, recordSaved } from "../../domain/session";
import { DiscardDialog } from "../files/DiscardDialog";
import { HistoryEditor, ResumeEditor } from "../resume/ResumeEditor";
import { CareerEditor } from "../career/CareerEditor";
import { TemplatePicker } from "./TemplatePicker";

type PendingAction = "new" | "open" | "close";
type Preview = {
  id: string;
  bytes: Uint8Array;
  name: string;
  body: JSONContent;
  projectId: string;
  revision: number;
  document?: string;
};
const phases: Record<JobPhase | "reading" | "cancelling", string> = {
  queued: "生成待ち",
  validating: "入力を確認中",
  generating: "書類を準備中",
  compiling: "PDFを生成中",
  reading: "PDFを読み込み中",
  succeeded: "生成完了",
  failed: "生成失敗",
  cancelled: "生成をキャンセルしました",
  cancelling: "生成を停止中",
};

export function DraftWorkspace({
  client,
  document = "履歴書",
}: {
  client: AppClient;
  document?: "履歴書" | "職務経歴書";
}) {
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
  const [draftPdf, setDraftPdf] = useState<Preview | null>(null);
  const [documentPdfs, setDocumentPdfs] = useState<Partial<Record<DocumentKind, Preview>>>({});
  const [job, setJob] = useState<{
    document: string;
    phase: JobPhase | "reading" | "cancelling";
  } | null>(null);
  const activeJob = useRef<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancellationRequested = useRef(false);
  const jobRunning = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const selectedKind = document === "履歴書" ? "resume" : "career";
  const pdf = documentPdfs[selectedKind] ?? draftPdf;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
        setDraftPdf(null);
        setDocumentPdfs({});
        setJob(null);
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
    setDraftPdf(null);
    setDocumentPdfs({});
    setJob(null);
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
    if (jobRunning.current) return;
    jobRunning.current = true;
    const snapshot = session;
    setBusy(true);
    setError(null);
    const draft = { name, body: "", richBody: body };
    try {
      const { resultId } = await client.generateDraft(draft);
      const bytes = await client.readPdf(resultId);
      if (
        mounted.current &&
        currentSession.current.project.projectId === snapshot.project.projectId
      )
        setDraftPdf({
          id: resultId,
          bytes,
          name,
          body,
          projectId: snapshot.project.projectId,
          revision: snapshot.revision,
        });
    } catch (failure) {
      setError(
        typeof failure === "string" ? failure : "PDF生成に失敗しました。もう一度お試しください。",
      );
    } finally {
      jobRunning.current = false;
      setBusy(false);
    }
  }

  async function updateDocument() {
    if (jobRunning.current) return;
    jobRunning.current = true;
    const snapshot = session;
    const kind = selectedKind;
    const label = document;
    const generationId = ++generation.current;
    const jobId = createId("job");
    activeJob.current = jobId;
    cancellationRequested.current = false;
    setCancelling(false);
    let receivingProgress = true;
    const showPhase = (phase: JobPhase | "reading") => {
      if (mounted.current && generation.current === generationId)
        setJob({ document: label, phase });
    };
    setBusy(true);
    setError(null);
    showPhase("queued");
    try {
      const result = await client.generateDocument(
        snapshot.project,
        kind,
        snapshot.revision,
        (phase) => {
          if (receivingProgress && !cancellationRequested.current && phase !== "succeeded")
            showPhase(phase);
        },
        jobId,
      );
      receivingProgress = false;
      if (
        result.projectId !== snapshot.project.projectId ||
        result.revision !== snapshot.revision ||
        result.kind !== kind ||
        result.jobId !== jobId
      )
        throw new Error("生成結果と編集中の書類が一致しません。もう一度生成してください。");
      showPhase("reading");
      const bytes = await client.readPdf(result.resultId);
      if (
        mounted.current &&
        currentSession.current.project.projectId === snapshot.project.projectId
      ) {
        setDocumentPdfs((current) => ({
          ...current,
          [kind]: {
            id: result.resultId,
            bytes,
            name,
            body,
            projectId: result.projectId,
            revision: result.revision,
            document: label,
          },
        }));
        showPhase("succeeded");
      }
    } catch (failure) {
      if (mounted.current) {
        const message = failure instanceof Error ? failure.message : String(failure);
        const cancelled = message.startsWith("PDF生成をキャンセルしました。 (CANCELED)");
        showPhase(cancelled ? "cancelled" : "failed");
        if (!cancelled) setError(message);
      }
    } finally {
      receivingProgress = false;
      jobRunning.current = false;
      activeJob.current = null;
      setCancelling(false);
      if (mounted.current) setBusy(false);
    }
  }

  async function cancelGeneration() {
    const jobId = activeJob.current;
    const previous = job;
    if (!jobId || cancellationRequested.current) return;
    cancellationRequested.current = true;
    setCancelling(true);
    setError(null);
    setJob((current) => (current ? { ...current, phase: "cancelling" } : current));
    try {
      await client.cancelGeneration(jobId);
    } catch (failure) {
      if (mounted.current && activeJob.current === jobId) {
        cancellationRequested.current = false;
        setCancelling(false);
        setJob(previous);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
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
        <h2 id="draft-title">応募書類の編集</h2>
        <p>編集内容から、選択した書類のPDFを生成できます。</p>
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
        <p>職務要約</p>
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
        <div hidden={document !== "履歴書"}>
          <ResumeEditor
            project={project}
            includeQualifications={false}
            disabled={opening || pending !== null}
            editorKey={editorKey}
            onChange={(updated) => {
              setSession((current) => editSession(current, updated));
              setFileMessage(null);
            }}
          />
        </div>
        <div hidden={document !== "職務経歴書"}>
          <CareerEditor
            key={editorKey}
            project={project}
            disabled={opening || pending !== null}
            editorKey={editorKey}
            onChange={(updated) => {
              setSession((current) => editSession(current, updated));
              setFileMessage(null);
            }}
          />
        </div>
        <HistoryEditor
          title="免許・資格"
          rows={project.resume.qualifications}
          disabled={opening || pending !== null}
          onChange={(qualifications) => {
            setSession((current) =>
              editSession(current, {
                ...current.project,
                resume: { ...current.project.resume, qualifications },
              }),
            );
            setFileMessage(null);
          }}
        />
        <p>免許・資格は両書類で共用します。</p>
        <TemplatePicker
          client={client}
          project={project}
          disabled={opening || pending !== null || busy}
          onChange={(updated) => {
            setSession((current) => editSession(current, updated));
            setFileMessage(null);
          }}
        />
        <button
          type="button"
          disabled={busy || fileBusy || pending !== null}
          onClick={() => void updateDocument()}
        >
          {document}PDF更新
        </button>
        <button type="button" disabled={busy || fileBusy} onClick={() => void updatePdf()}>
          {busy ? "PDF生成中…" : "PDF更新"}
        </button>
        {error && !pending && <p role="alert">{error}</p>}
        {busy && activeJob.current && (
          <button type="button" disabled={cancelling} onClick={() => void cancelGeneration()}>
            生成をキャンセル
          </button>
        )}
        {job && (
          <output aria-label="生成状態" aria-live="polite">
            {job.document}：{phases[job.phase]}
          </output>
        )}
        {pdf?.document && <output>プレビュー：{pdf.document}</output>}
        {pdf && pdf.revision !== session.revision && <output>PDFは更新前の内容です。</output>}
      </div>
      {pdf ? (
        <PdfPreview
          key={pdf.id}
          bytes={pdf.bytes}
          standardPages={pdf.document === "履歴書" ? 2 : undefined}
        />
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
