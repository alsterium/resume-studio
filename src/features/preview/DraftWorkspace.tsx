import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Accordion } from "../../components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../../components/ui/resizable";
import { EditorNavigationContext, EditorSection } from "../../components/EditorSection";
import { TexDiagnosticsPanel } from "../diagnostics/TexDiagnosticsPanel";
import {
  FileText,
  FilePlus2,
  FolderOpen,
  Save,
  ChevronDown,
  Download,
  Settings,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import appConfig from "../../../src-tauri/tauri.conf.json";
import { OperationError } from "../errors/OperationError";
import { useEffect, useRef, useState } from "react";
import type {
  AppClient,
  DocumentKind,
  ExportResult,
  OutputFormat,
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
import { HistoryEditor, ProfileEditor, ResumeEditor } from "../resume/ResumeEditor";
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
  document: controlledDocument,
  onDocumentChange,
  versionLabel,
}: {
  client: AppClient;
  document?: "履歴書" | "職務経歴書";
  onDocumentChange?: (document: "履歴書" | "職務経歴書") => void;
  versionLabel?: string;
}) {
  const [localDocument, setLocalDocument] = useState<"履歴書" | "職務経歴書">("履歴書");
  const document = controlledDocument ?? localDocument;
  const [expandedByDocument, setExpandedByDocument] = useState<Record<string, string[]>>({
    履歴書: ["profile"],
    職務経歴書: ["profile"],
  });
  const expanded = expandedByDocument[document];
  const [compact, setCompact] = useState(
    () => window.matchMedia?.("(max-width: 760px)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 760px)");
    if (!media) return;
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const exportTrigger = useRef<HTMLButtonElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const [session, setSession] = useState(() => beginSession(newProject()));
  const project = session.project;
  const dirty = hasUnsavedChanges(session);
  const currentSession = useRef(session);
  const closeHandler = useRef<() => void>(() => {});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [opening, setOpening] = useState(false);
  const [file, setFile] = useState<SavedProject | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const savingProject = useRef(false);
  const saveShortcut = useRef<(saveAs: boolean) => void>(() => {});
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const name = project.profile.name;
  const body = project.career.summary;
  const photo = project.assets.find((asset) => asset.id === project.profile.photoAssetId);
  const [busy, setBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState<OutputFormat>("pdf");
  const [exportScope, setExportScope] = useState<"selected" | "both">("selected");
  const [exportResults, setExportResults] = useState<ExportResult[] | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
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
    saveShortcut.current = (saveAs) => {
      if (!fileBusy && !opening && pending === null) void saveProject(saveAs);
    };
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

  useEffect(() => {
    let composing = false;
    const startComposition = () => {
      composing = true;
    };
    const endComposition = () => {
      composing = false;
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        composing ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s"
      )
        return;
      event.preventDefault();
      saveShortcut.current(event.shiftKey);
    };
    window.addEventListener("compositionstart", startComposition);
    window.addEventListener("compositionend", endComposition);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("compositionstart", startComposition);
      window.removeEventListener("compositionend", endComposition);
      window.removeEventListener("keydown", keydown);
    };
  }, []);

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
        setExportResults(null);
        setExportMessage(null);
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
    if (savingProject.current) return false;
    savingProject.current = true;
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
      savingProject.current = false;
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
    setExportResults(null);
    setExportMessage(null);
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

  async function exportDocuments() {
    if (jobRunning.current) return;
    jobRunning.current = true;
    const snapshot = session;
    const kinds: DocumentKind[] = exportScope === "both" ? ["resume", "career"] : [selectedKind];
    const label = exportScope === "both" ? "両書類の書き出し" : `${document}の書き出し`;
    let receivingProgress = true;
    setBusy(true);
    setError(null);
    setExportResults(null);
    setExportMessage(null);
    setJob({ document: label, phase: "queued" });
    try {
      const results = await client.exportDocuments(
        snapshot.project,
        kinds,
        exportFormat,
        (phase) => {
          if (receivingProgress && mounted.current && phase !== "succeeded")
            setJob({ document: label, phase });
        },
      );
      receivingProgress = false;
      if (mounted.current) {
        setExportResults(results);
        setExportMessage(
          results === null
            ? "書き出しをキャンセルしました。"
            : currentSession.current.revision !== snapshot.revision
              ? "書き出し中の編集は含まれていません。必要ならもう一度書き出してください。"
              : "書き出し結果を確認してください。",
        );
        setJob(null);
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : String(failure));
        setJob({ document: label, phase: "failed" });
      }
    } finally {
      receivingProgress = false;
      jobRunning.current = false;
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

  const updateProject = (updated: typeof project) => {
    setSession((current) => editSession(current, updated));
    setFileMessage(null);
  };
  const editorDisabled = opening || pending !== null;
  return (
    <section aria-label="応募書類の編集" className="studio-shell">
      <header className="studio-toolbar">
        <div className="project-identity">
          <FileText aria-hidden="true" />
          <strong>{appConfig.productName}</strong>
          <span className="toolbar-divider" />
          <output aria-label="プロジェクトファイル" className="project-filename">
            {file?.displayName ?? "保存先未設定"}
          </output>
          <Badge variant="outline">
            <output aria-label="保存状態">
              {dirty ? "未保存の変更があります" : file ? "保存済み" : "新規プロジェクト"}
            </output>
          </Badge>
        </div>
        <div aria-label="プロジェクト操作" className="project-actions">
          <Button
            variant="outline"
            disabled={fileBusy || busy || pending !== null}
            onClick={() => void requestAction("new")}
          >
            <FilePlus2 aria-hidden="true" />
            新規
          </Button>
          <Button
            variant="outline"
            disabled={fileBusy || busy || pending !== null}
            onClick={() => void requestAction("open")}
          >
            <FolderOpen aria-hidden="true" />
            開く
          </Button>
          <div className="save-actions">
            <Button disabled={fileBusy || pending !== null} onClick={() => void saveProject(false)}>
              <Save aria-hidden="true" />
              保存
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="その他のプロジェクト操作"
                  disabled={fileBusy || pending !== null}
                  size="icon"
                >
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void saveProject(true)} disabled={fileBusy}>
                  名前を付けて保存
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void updatePdf()} disabled={busy || fileBusy}>
                  職務要約の下書きPDF更新
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void client.requestClose().catch(() => setError("終了を要求できませんでした。"))
                  }
                  disabled={busy || fileBusy}
                >
                  終了
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button
            ref={exportTrigger}
            variant="outline"
            disabled={pending !== null}
            onClick={() => setExportOpen(true)}
          >
            <Download aria-hidden="true" />
            書き出し
          </Button>
          <Button
            variant="ghost"
            ref={settingsTrigger}
            aria-label="設定"
            disabled={pending !== null}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings aria-hidden="true" />
            <span className="settings-label">設定</span>
          </Button>
        </div>
      </header>
      <ResizablePanelGroup
        orientation={compact ? "vertical" : "horizontal"}
        className="studio-panels"
      >
        <ResizablePanel
          id="editor"
          defaultSize={compact ? "45%" : 410}
          minSize={compact ? 160 : 320}
          maxSize={compact ? "70%" : "60%"}
          className="inspector-panel"
        >
          <div className="inspector">
            <Tabs
              value={document}
              onValueChange={(value) => {
                const next = value as "履歴書" | "職務経歴書";
                setLocalDocument(next);
                onDocumentChange?.(next);
              }}
              className="document-tabs"
            >
              <TabsList aria-label="書類の選択">
                <TabsTrigger value="履歴書">履歴書</TabsTrigger>
                <TabsTrigger value="職務経歴書">職務経歴書</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="draft-editor inspector-scroll" aria-label="編集パネル">
              <EditorNavigationContext value={expanded}>
                <Accordion
                  type="multiple"
                  value={expanded}
                  onValueChange={(values) =>
                    setExpandedByDocument((current) => ({ ...current, [document]: values }))
                  }
                >
                  <EditorSection value="profile" title="基本情報">
                    <ProfileEditor
                      project={project}
                      disabled={editorDisabled}
                      onChange={updateProject}
                    >
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
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={fileBusy || pending !== null}
                          onClick={() => void importPhoto()}
                        >
                          写真を取り込む
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={!photo || fileBusy || pending !== null}
                          onClick={removePhoto}
                        >
                          写真を削除
                        </Button>
                        <p>JPEG／PNG、5MiB以内。縦横比を保ち最大600×800pxへ調整します。</p>
                      </div>
                    </ProfileEditor>
                  </EditorSection>
                  <div hidden={document !== "履歴書"}>
                    <ResumeEditor
                      project={project}
                      includeProfile={false}
                      includeQualifications={false}
                      disabled={editorDisabled}
                      editorKey={editorKey}
                      onChange={updateProject}
                    />
                  </div>
                  <div hidden={document !== "職務経歴書"}>
                    <EditorSection value="summary" title="職務要約">
                      <BodyEditor
                        key={editorKey}
                        initialContent={body as JSONContent}
                        editable={!editorDisabled}
                        onChange={(content) =>
                          updateProject({
                            ...project,
                            career: { ...project.career, summary: content as BodyDoc },
                          })
                        }
                      />
                    </EditorSection>
                    <CareerEditor
                      key={editorKey}
                      project={project}
                      disabled={editorDisabled}
                      editorKey={editorKey}
                      onChange={updateProject}
                    />
                  </div>
                  <EditorSection value="qualifications" title="免許・資格">
                    <HistoryEditor
                      title="免許・資格"
                      rows={project.resume.qualifications}
                      disabled={editorDisabled}
                      onChange={(qualifications) =>
                        updateProject({ ...project, resume: { ...project.resume, qualifications } })
                      }
                    />
                    <p className="field-hint">免許・資格は両書類で共用します。</p>
                  </EditorSection>
                </Accordion>
              </EditorNavigationContext>
            </div>
            <div className="inspector-footer">
              保存：⌘/Ctrl+S<span>別名保存：⌘/Ctrl+Shift+S</span>
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle aria-label="編集パネルの幅を変更" />
        <ResizablePanel id="preview" minSize={compact ? 180 : 360} className="preview-panel">
          <div className="preview-heading">
            <h2 id="document-title">{document}</h2>
            <TemplatePicker
              client={client}
              project={project}
              kind={selectedKind}
              disabled={editorDisabled || busy}
              onChange={updateProject}
            />
            <Button
              aria-label={document + "PDF更新"}
              disabled={busy || fileBusy || pending !== null}
              onClick={() => void updateDocument()}
            >
              <RefreshCw aria-hidden="true" className={busy ? "animate-spin" : undefined} />
              {busy ? "PDF生成中…" : "PDF更新"}
            </Button>
          </div>
          {pdf && pdf.revision !== session.revision && (
            <div className="stale-notice" aria-live="polite">
              <AlertTriangle aria-hidden="true" />
              <output>PDFは更新前の内容です。</output>
            </div>
          )}
          <div className="operation-status" aria-live="polite">
            {fileMessage && <output>{fileMessage}</output>}
            {job && (
              <output aria-label="生成状態">
                {job.document}：{phases[job.phase]}
              </output>
            )}
            {busy && activeJob.current && (
              <Button
                variant="outline"
                size="sm"
                disabled={cancelling}
                onClick={() => void cancelGeneration()}
              >
                生成をキャンセル
              </Button>
            )}
            {pdf?.document && <output>プレビュー：{pdf.document}</output>}
            {exportMessage && <output aria-label="書き出し状態">{exportMessage}</output>}
          </div>
          {exportResults && (
            <ul aria-label="書き出し結果" className="export-results">
              {exportResults.map((result) => (
                <li key={result.kind}>
                  {result.displayName}：
                  {result.status === "saved"
                    ? "保存しました"
                    : result.status === "skipped"
                      ? "スキップしました"
                      : "保存に失敗しました"}
                  {result.error && <OperationError error={result.error} />}
                </li>
              ))}
            </ul>
          )}
          {error && !pending && !exportOpen && <OperationError error={error} />}
          {pdf ? (
            <PdfPreview
              fitToWidth
              key={pdf.id}
              bytes={pdf.bytes}
              standardPages={pdf.document === "履歴書" ? 2 : undefined}
            />
          ) : (
            <div className="preview-empty">
              <div className="empty-paper">
                <FileText aria-hidden="true" />
                <h3>書類の仕上がりを確認</h3>
                <p>
                  左の項目を編集し、「PDF更新」で
                  <br />
                  プレビューを表示します。
                </p>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      <Dialog open={exportOpen && pending === null} onOpenChange={setExportOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            exportTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>書類を書き出す</DialogTitle>
            <DialogDescription>
              現在の入力を書き出します。保存先フォルダを選択してください。
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy || fileBusy || editorDisabled} className="export-options">
            <label>
              出力形式
              <select
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as OutputFormat)}
              >
                <option value="pdf">PDF</option>
                <option value="tex">TeX一式</option>
              </select>
            </label>
            <label>
              出力対象
              <select
                value={exportScope}
                onChange={(event) => setExportScope(event.target.value as "selected" | "both")}
              >
                <option value="selected">表示中の書類</option>
                <option value="both">履歴書と職務経歴書</option>
              </select>
            </label>
          </fieldset>
          <p className="field-hint">
            TeX一式はTeX環境がなくても保存できます。生成中もこの画面を閉じて編集を続けられます。
          </p>
          {exportMessage && <output aria-live="polite">{exportMessage}</output>}
          {error && <OperationError error={error} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              {busy ? "閉じる" : "キャンセル"}
            </Button>
            <Button
              disabled={busy || fileBusy || editorDisabled}
              onClick={() => void exportDocuments()}
            >
              <Download aria-hidden="true" />
              書き出す
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsOpen && pending === null} onOpenChange={setSettingsOpen}>
        <DialogContent
          className="settings-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            settingsTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>設定</DialogTitle>
            <DialogDescription>PDFを生成するための環境を確認できます。</DialogDescription>
          </DialogHeader>
          <TexDiagnosticsPanel client={client} />
          <output>{versionLabel}</output>
        </DialogContent>
      </Dialog>
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
