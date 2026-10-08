import { useEffect, useRef } from "react";
import type { DocumentKind } from "../../infrastructure/app-client";

export const AUTO_PDF_STORAGE_KEY = "resume-studio.auto-pdf";
export const AUTO_PDF_IDLE_MS = 2000;

export function readAutoPdfPreference() {
  try {
    return localStorage.getItem(AUTO_PDF_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeAutoPdfPreference(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_PDF_STORAGE_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}

export function useAutoPdf({
  enabled,
  blocked,
  composing,
  kind,
  projectKey,
  revision,
  generate,
  dateKey = "",
}: {
  enabled: boolean;
  blocked: boolean;
  composing: boolean;
  kind: DocumentKind;
  projectKey: string;
  revision: number;
  generate: () => Promise<void>;
  dateKey?: string;
}) {
  const attempts = useRef(new Map<DocumentKind, string>());
  const callback = useRef(generate);
  const token = `${projectKey}:${revision}:${dateKey}`;
  useEffect(() => {
    callback.current = generate;
  });
  useEffect(() => {
    attempts.current.clear();
  }, [enabled, projectKey]);
  useEffect(() => {
    if (!enabled || blocked || composing || attempts.current.get(kind) === token) return;
    const firstDisplay = !attempts.current.has(kind);
    const timer = window.setTimeout(
      () => {
        attempts.current.set(kind, token);
        void callback.current();
      },
      firstDisplay ? 0 : AUTO_PDF_IDLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [enabled, blocked, composing, kind, token, projectKey]);

  // Manual generation and explicit cancellation consume the current revision too.
  return () => attempts.current.set(kind, token);
}
