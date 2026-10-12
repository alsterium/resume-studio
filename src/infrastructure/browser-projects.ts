import type { Project } from "../domain/project";
import type { ProjectSession } from "../domain/session";
import { MAX_PROJECT_BYTES, validateProject } from "../domain/validate-project";

export interface BrowserDraft {
  session: ProjectSession;
  filename: string;
}
export interface DraftStore {
  read(): Promise<BrowserDraft | null>;
  write(draft: BrowserDraft): Promise<void>;
}

export function createDraftStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): DraftStore {
  async function database() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      if (!factory) {
        reject(new Error("このブラウザでは下書き保存を利用できません。"));
        return;
      }
      const request = factory.open("resume-studio", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("ブラウザ内の下書きを開けませんでした。"));
      request.onblocked = () => reject(new Error("別のタブを閉じてから再読み込みしてください。"));
    });
  }
  // Keep writes in submission order, including overlapping database opens.
  let writes: Promise<void> = Promise.resolve();
  return {
    async read() {
      const db = await database();
      try {
        const draft = await new Promise<BrowserDraft | undefined>((resolve, reject) => {
          const transaction = db.transaction("drafts", "readonly");
          const request = transaction.objectStore("drafts").get("current");
          transaction.oncomplete = () => resolve(request.result);
          transaction.onabort = () => reject(new Error("下書きを読み込めませんでした。"));
        });
        if (!draft) return null;
        const { revision, savedRevision } = draft.session;
        if (
          !Number.isSafeInteger(revision) ||
          revision < 0 ||
          !Number.isSafeInteger(savedRevision) ||
          savedRevision < 0 ||
          savedRevision > revision ||
          typeof draft.filename !== "string"
        )
          throw new Error("下書きの状態が不正です。保存済みJSONを開いてください。");
        return {
          ...draft,
          session: { ...draft.session, project: validateProject(draft.session.project) },
        };
      } finally {
        db.close();
      }
    },
    write(draft) {
      // Validate before replacing a recoverable draft; failed edits stay on screen.
      const snapshot = structuredClone({
        ...draft,
        session: { ...draft.session, project: validateProject(draft.session.project) },
      });
      const write = async () => {
        const db = await database();
        try {
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction("drafts", "readwrite");
            transaction.objectStore("drafts").put(snapshot, "current");
            transaction.oncomplete = () => resolve();
            transaction.onabort = () =>
              reject(new Error("下書きを保存できませんでした。JSONをダウンロードしてください。"));
          });
        } finally {
          db.close();
        }
      };
      const result = writes.then(write);
      writes = result.catch(() => {});
      return result;
    },
  };
}

export async function readProjectFile(file: File): Promise<Project> {
  if (file.size > MAX_PROJECT_BYTES) throw new Error("JSONは20MiB以内にしてください。");
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error("プロジェクトJSONを読み込めませんでした。ファイルを確認してください。");
  }
  return validateProject(value);
}

export function projectJson(project: Project): string {
  const json = JSON.stringify(validateProject(project), null, 2) + "\n";
  if (new TextEncoder().encode(json).length > MAX_PROJECT_BYTES)
    throw new Error("保存するJSONは20MiB以内にしてください。");
  return json;
}

export function downloadProject(project: Project, filename: string) {
  const blob = new Blob([projectJson(project)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Mobile browsers may consume the blob after the click handler returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
