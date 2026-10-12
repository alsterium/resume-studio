import { useEffect, useRef, useState } from "react";
import { FileText, FilePlus2, FolderOpen, Download } from "lucide-react";
import { ProjectEditor } from "./components/ProjectEditor";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./components/ui/dialog";
import { DiscardDialog } from "./features/files/DiscardDialog";
import { CssPreview } from "./features/preview/CssPreview";
import { TemplatePicker } from "./features/preview/TemplatePicker";
import { newProject, createId } from "./domain/new-project";
import { beginSession, editSession, hasUnsavedChanges, recordSaved } from "./domain/session";
import {
  createDraftStore,
  downloadProject,
  readProjectFile,
  type BrowserDraft,
  type DraftStore,
} from "./infrastructure/browser-projects";
import { importBrowserPhoto } from "./infrastructure/browser-photos";
import type { Project } from "./domain/project";
import type { TemplateManifest } from "./infrastructure/app-client";
import { QrTransferButton } from "./features/transfer/QrTransferButton";
import "./features/transfer/transfer.css";

const manifests = import.meta.glob<TemplateManifest>("../src-tauri/templates/*/manifest.json", {
  eager: true,
  import: "default",
});
const templates = { listTemplates: async () => Object.values(manifests) };
const initialDraft = (): BrowserDraft => ({
  session: beginSession(newProject()),
  filename: "resume-studio.json",
});
const messageOf = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);

export function WebApp({ draftStore }: { draftStore?: DraftStore }) {
  const [store] = useState(() => draftStore ?? createDraftStore());
  const [boot, setBoot] = useState<{
    draft: BrowserDraft;
    error: string | null;
    restored: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void store.read().then(
      (draft) => {
        if (active)
          setBoot({ draft: draft ?? initialDraft(), error: null, restored: draft !== null });
      },
      (failure) => {
        if (active)
          setBoot({
            draft: initialDraft(),
            error: `${messageOf(failure)} 既存の下書きは変更していません。「新規」または「開く」で再開できます。`,
            restored: false,
          });
      },
    );
    return () => {
      active = false;
    };
  }, [store]);
  if (!boot)
    return (
      <main className="web-loading" aria-busy="true">
        下書きを確認中…
      </main>
    );
  return (
    <WebWorkspace
      store={store}
      initial={boot.draft}
      startupError={boot.error}
      restored={boot.restored}
    />
  );
}

export function WebWorkspace({
  store,
  initial,
  startupError = null,
  restored = false,
}: {
  store: DraftStore;
  initial: BrowserDraft;
  startupError?: string | null;
  restored?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const { session, filename } = draft;
  const project = session.project;
  const dirty = hasUnsavedChanges(session);
  const [documentKind, setDocumentKind] = useState<"履歴書" | "職務経歴書">("履歴書");
  const [view, setView] = useState("edit");
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [transferActive, setTransferActive] = useState(false);
  const [error, setError] = useState<string | null>(startupError);
  const [fileMessage, setFileMessage] = useState<string | null>(
    restored ? "このブラウザの下書きを復元しました。" : null,
  );
  const [draftReceipt, setDraftReceipt] = useState<{
    draft: BrowserDraft;
    error: string | null;
  } | null>(null);
  const [persist, setPersist] = useState(startupError === null);
  const draftState = !persist
    ? "下書き保存を停止中"
    : draftReceipt?.draft !== draft
      ? "下書きを保存中…"
      : draftReceipt.error
        ? `下書きを保存できません：${draftReceipt.error}`
        : "このブラウザに下書き保存済み";
  const [pending, setPending] = useState<"new" | "open" | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(filename);
  const [saveError, setSaveError] = useState<string | null>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const latest = useRef({ dirty, busy, pending, saveOpen });
  const shortcut = useRef<(rename: boolean) => void>(() => {});

  useEffect(() => {
    if (!persist) return;
    let active = true;
    void Promise.resolve()
      .then(() => store.write(draft))
      .then(
        () => {
          if (active) setDraftReceipt({ draft, error: null });
        },
        (failure) => {
          if (active) setDraftReceipt({ draft, error: messageOf(failure) });
        },
      );
    return () => {
      active = false;
    };
  }, [draft, store, persist]);

  useEffect(() => {
    latest.current = { dirty, busy, pending, saveOpen };
    shortcut.current = (rename) => {
      if (busy || pending || saveOpen || transferActive) return;
      if (rename) showSaveDialog();
      else save();
    };
  });
  useEffect(() => {
    let composing = false;
    const start = () => {
      composing = true;
    };
    const end = () => {
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
      shortcut.current(event.shiftKey);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty || latest.current.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("compositionstart", start);
    window.addEventListener("compositionend", end);
    window.addEventListener("keydown", keydown);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("compositionstart", start);
      window.removeEventListener("compositionend", end);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  function updateProject(updated: Project) {
    setDraft((current) => ({ ...current, session: editSession(current.session, updated) }));
    setFileMessage(null);
  }
  function action(value: "new" | "open") {
    if (value === "open") {
      projectInput.current?.click();
      return;
    }
    setDraft(initialDraft());
    setEditorKey((key) => key + 1);
    setPersist(true);
    setError(null);
    setFileMessage(null);
  }
  function requestAction(value: "new" | "open") {
    if (busy || pending) return;
    if (dirty) setPending(value);
    else action(value);
  }
  function save(name = filename): boolean {
    setError(null);
    setSaveError(null);
    try {
      const normalized = name.trim();
      if (
        !normalized ||
        Array.from(normalized).some(
          (char) =>
            char === "/" ||
            char === "\\" ||
            char.codePointAt(0)! < 32 ||
            char.codePointAt(0) === 127,
        )
      )
        throw new Error("ファイル名にパスや制御文字は使用できません。");
      const nextName = /\.json$/iu.test(normalized) ? normalized : `${normalized}.json`;
      downloadProject(project, nextName);
      setDraft((current) => ({
        ...current,
        filename: nextName,
        session: recordSaved(current.session, session),
      }));
      setFileMessage("JSONのダウンロードを開始しました。保存先はブラウザで確認してください。");
      return true;
    } catch (failure) {
      setError(messageOf(failure));
      setSaveError(messageOf(failure));
      return false;
    }
  }
  function showSaveDialog() {
    setSaveName(filename);
    setSaveError(null);
    setSaveOpen(true);
  }
  function continueAction(withSave: boolean) {
    if (!pending || (withSave && !save())) return;
    const next = pending;
    setPending(null);
    action(next);
  }
  async function openFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const loaded = await readProjectFile(file);
      setDraft({ session: beginSession(loaded), filename: file.name });
      setEditorKey((key) => key + 1);
      setPersist(true);
      setFileMessage("JSONを読み込みました。元ファイルは変更していません。");
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }
  async function importPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const imported = await importBrowserPhoto(file);
      const id = createId("photo");
      setDraft((current) => {
        const previous = current.session.project;
        return {
          ...current,
          session: editSession(current.session, {
            ...previous,
            profile: { ...previous.profile, photoAssetId: id },
            assets: [
              ...previous.assets.filter((asset) => asset.id !== previous.profile.photoAssetId),
              { id, mediaType: imported.mediaType, base64: imported.base64 },
            ],
          }),
        };
      });
      setFileMessage("写真を取り込みました。");
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace web-workspace">
      <section className="studio-shell" aria-label="応募書類の編集">
        <header className="studio-toolbar">
          <div className="project-identity">
            <FileText aria-hidden="true" />
            <strong>Resume Studio</strong>
            <Badge variant="outline">Web</Badge>
            <output className="project-filename" aria-label="プロジェクトファイル">
              {filename}
            </output>
          </div>
          <div className="project-actions" aria-label="プロジェクト操作">
            <QrTransferButton
              project={project}
              dirty={dirty}
              disabled={busy || pending !== null || saveOpen}
              onActiveChange={setTransferActive}
              onReceive={(received) => {
                setDraft({
                  session: editSession(beginSession(received), received),
                  filename: "resume-studio.json",
                });
                setEditorKey((key) => key + 1);
                setPersist(true);
                setError(null);
                setFileMessage("QRで受信した内容を取り込みました。JSONは未保存です。");
              }}
            />
            <Button
              variant="outline"
              disabled={busy || pending !== null || transferActive}
              onClick={() => requestAction("new")}
            >
              <FilePlus2 aria-hidden="true" />
              新規
            </Button>
            <Button
              variant="outline"
              disabled={busy || pending !== null}
              onClick={() => requestAction("open")}
            >
              <FolderOpen aria-hidden="true" />
              開く
            </Button>
            <Button disabled={busy || pending !== null} onClick={() => save()}>
              <Download aria-hidden="true" />
              保存
            </Button>
            <Button variant="outline" disabled={busy || pending !== null} onClick={showSaveDialog}>
              別名保存
            </Button>
          </div>
        </header>
        <div className="web-status" aria-live="polite">
          <output aria-label="保存状態">
            {dirty ? "JSONへの未保存変更あり" : "JSONへの未保存変更なし"}
          </output>
          <output aria-label="下書き保存状態">{draftState}</output>
          {fileMessage && <output>{fileMessage}</output>}
        </div>
        {error && !pending && !saveOpen && (
          <div className="web-error" role="alert">
            {error}
          </div>
        )}
        <fieldset className="web-view-switch" aria-label="表示の切替">
          <Button
            variant={view === "edit" ? "default" : "outline"}
            aria-pressed={view === "edit"}
            onClick={() => setView("edit")}
          >
            編集
          </Button>
          <Button
            variant={view === "preview" ? "default" : "outline"}
            aria-pressed={view === "preview"}
            onClick={() => setView("preview")}
          >
            プレビュー
          </Button>
        </fieldset>
        <div className="web-panels" data-view={view}>
          <div className="web-editor">
            <ProjectEditor
              project={project}
              document={documentKind}
              onDocumentChange={setDocumentKind}
              disabled={busy || pending !== null || transferActive}
              photoBusy={busy}
              editorKey={editorKey}
              onChange={updateProject}
              onImportPhoto={() => {
                if (project.assets.length >= 4 && !project.profile.photoAssetId) {
                  setError("写真は4枚以内にしてください。");
                  return;
                }
                photoInput.current?.click();
              }}
              onRemovePhoto={() =>
                updateProject({
                  ...project,
                  profile: { ...project.profile, photoAssetId: null },
                  assets: project.assets.filter(
                    (asset) => asset.id !== project.profile.photoAssetId,
                  ),
                })
              }
              footer="保存するとJSONをダウンロードします。最終PDFはMac版で出力できます。"
            />
          </div>
          <div className="web-preview-panel">
            <div className="web-preview-heading">
              <h2>{documentKind}</h2>
              <select
                className="web-preview-kind"
                aria-label="プレビューする書類"
                value={documentKind}
                onChange={(event) => setDocumentKind(event.target.value as "履歴書" | "職務経歴書")}
              >
                <option>履歴書</option>
                <option>職務経歴書</option>
              </select>
              <TemplatePicker
                client={templates}
                project={project}
                kind={documentKind === "履歴書" ? "resume" : "career"}
                disabled={busy || pending !== null}
                onChange={updateProject}
              />
            </div>
            <p className="web-preview-note">
              簡易プレビューです。改ページ・文字の収まりはMac版で確認してください。
            </p>
            <CssPreview project={project} kind={documentKind === "履歴書" ? "resume" : "career"} />
          </div>
        </div>
        <input
          ref={projectInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="プロジェクトJSONを選択"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void openFile(file);
          }}
        />
        <input
          ref={photoInput}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          aria-label="証明写真ファイルを選択"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void importPhoto(file);
          }}
        />
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>プロジェクトを別名保存</DialogTitle>
              <DialogDescription>現在の内容をJSONとしてダウンロードします。</DialogDescription>
            </DialogHeader>
            <label>
              ファイル名
              <input
                className="web-filename-input"
                value={saveName}
                maxLength={200}
                onChange={(event) => setSaveName(event.target.value)}
              />
            </label>
            {saveError && <p role="alert">{saveError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveOpen(false)}>
                キャンセル
              </Button>
              <Button
                onClick={() => {
                  if (save(saveName)) setSaveOpen(false);
                }}
              >
                ダウンロード
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {pending && (
          <DiscardDialog
            busy={busy}
            error={error}
            onSave={() => continueAction(true)}
            onDiscard={() => continueAction(false)}
            onCancel={() => setPending(null)}
          />
        )}
      </section>
    </main>
  );
}
