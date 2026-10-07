import { useEffect, useState } from "react";
import { type AppClient, tauriClient } from "./infrastructure/app-client";
import { DraftWorkspace } from "./features/preview/DraftWorkspace";

export function App({ client = tauriClient }: { client?: AppClient }) {
  const [document, setDocument] = useState<"履歴書" | "職務経歴書">("履歴書");
  const [version, setVersion] = useState<string | null>(null);
  const [versionError, setVersionError] = useState(false);
  useEffect(() => {
    let active = true;
    void client.getAppVersion().then(
      (value) => {
        if (active) setVersion(value);
      },
      () => {
        if (active) setVersionError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [client]);
  return (
    <main className="workspace">
      <DraftWorkspace
        client={client}
        document={document}
        onDocumentChange={setDocument}
        versionLabel={
          versionError
            ? "アプリ情報を取得できませんでした。"
            : version
              ? `バージョン ${version}`
              : "アプリ情報を確認中…"
        }
      />
    </main>
  );
}
