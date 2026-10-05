import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

export interface TexDiagnostics {
  tools: { name: string; path: string | null; version: string | null }[];
  missingDependencies: string[];
  pdfValidated: boolean;
  error: { code: string; message: string; log: string } | null;
}

export interface AppClient {
  getAppVersion(): Promise<string>;
  diagnoseTex(): Promise<TexDiagnostics>;
}

export const tauriClient: AppClient = {
  getAppVersion: getVersion,
  diagnoseTex: () => invoke<TexDiagnostics>("diagnose_tex"),
};
