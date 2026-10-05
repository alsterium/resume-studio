import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import type { JSONContent } from "@tiptap/core";

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
}

export const tauriClient: AppClient = {
  getAppVersion: getVersion,
  diagnoseTex: () => invoke<TexDiagnostics>("diagnose_tex"),
  generateDraft: (draft) => invoke("generate_draft", { draft }),
  readPdf: async (resultId) => new Uint8Array(await invoke<ArrayBuffer>("read_pdf", { resultId })),
};
