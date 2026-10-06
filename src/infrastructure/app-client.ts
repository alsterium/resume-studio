import { getVersion } from "@tauri-apps/api/app";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { JSONContent } from "@tiptap/core";
import type { Project } from "../domain/project";
import { validateProject } from "../domain/validate-project";

export interface SavedProject {
  fileId: string;
  displayName: string;
}
export interface OpenedProject extends SavedProject {
  project: Project;
}

export interface ImportedPhoto {
  mediaType: "image/jpeg" | "image/png";
  base64: string;
  width: number;
  height: number;
}

export interface TexDiagnostics {
  tools: { name: string; path: string | null; version: string | null }[];
  missingDependencies: string[];
  pdfValidated: boolean;
  error: { code: string; message: string; log: string } | null;
}

export type DocumentKind = "resume" | "career";
export type JobPhase =
  | "queued"
  | "validating"
  | "generating"
  | "compiling"
  | "succeeded"
  | "failed"
  | "cancelled";
export interface GeneratedDocument {
  resultId: string;
  projectId: string;
  revision: number;
  kind: DocumentKind;
  jobId: string;
}
export interface TemplateManifest {
  id: string;
  version: string;
  displayName: string;
  documentKind: DocumentKind;
  schemaVersions: number[];
  engine: string;
  packages: string[];
  fonts: string[];
}

export interface AppClient {
  listTemplates(): Promise<TemplateManifest[]>;
  generateDocument(
    project: Project,
    kind: DocumentKind,
    revision: number,
    onProgress: (phase: JobPhase) => void,
    jobId: string,
  ): Promise<GeneratedDocument>;
  cancelGeneration(jobId: string): Promise<boolean>;
  importPhoto(): Promise<ImportedPhoto | null>;
  onCloseRequested(handler: () => void): Promise<() => void>;
  requestClose(): Promise<void>;
  finishClose(): Promise<void>;
  getAppVersion(): Promise<string>;
  diagnoseTex(): Promise<TexDiagnostics>;
  generateDraft(draft: {
    name: string;
    body: string;
    richBody?: JSONContent;
  }): Promise<{ resultId: string }>;
  readPdf(resultId: string): Promise<Uint8Array>;
  openProject(): Promise<OpenedProject | null>;
  saveProject(
    project: Project,
    fileId: string | null,
    saveAs: boolean,
  ): Promise<SavedProject | null>;
}

export const tauriClient: AppClient = {
  listTemplates: () => invoke("list_templates"),
  generateDocument: (project, kind, revision, onProgress, jobId) => {
    const validated = validateProject(project);
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new Error("編集revisionを確認できませんでした。");
    const progress = new Channel<JobPhase>();
    progress.onmessage = onProgress;
    return invoke("generate_document", {
      project: validated,
      kind,
      revision,
      progress,
      jobId,
    });
  },
  cancelGeneration: (jobId) => invoke("cancel_generation", { jobId }),
  importPhoto: () => invoke("import_photo"),
  onCloseRequested: (handler) => listen("resume-studio:request-close", handler),
  requestClose: () => invoke("request_app_close", { quit: true }),
  finishClose: () => invoke("finish_app_close"),
  getAppVersion: getVersion,
  diagnoseTex: () => invoke<TexDiagnostics>("diagnose_tex"),
  generateDraft: (draft) => invoke("generate_draft", { draft }),
  readPdf: async (resultId) => new Uint8Array(await invoke<ArrayBuffer>("read_pdf", { resultId })),
  openProject: async () => {
    const result = await invoke<OpenedProject | null>("open_project");
    return result ? { ...result, project: validateProject(result.project) } : null;
  },
  saveProject: (project, fileId, saveAs) =>
    invoke("save_project", { project: validateProject(project), fileId, saveAs }),
};
