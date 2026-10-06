import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
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

export interface TexDiagnostics {
  tools: { name: string; path: string | null; version: string | null }[];
  missingDependencies: string[];
  pdfValidated: boolean;
  error: { code: string; message: string; log: string } | null;
}

export interface AppClient {
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
