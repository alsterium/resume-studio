import { getVersion } from "@tauri-apps/api/app";

export interface AppClient {
  getAppVersion(): Promise<string>;
}

export const tauriClient: AppClient = {
  getAppVersion: getVersion,
};
