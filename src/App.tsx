import { useEffect, useState } from "react";
import { type AppClient, tauriClient } from "./infrastructure/app-client";
import { TexDiagnosticsPanel } from "./features/diagnostics/TexDiagnosticsPanel";

const documents = ["履歴書", "職務経歴書"] as const;

export function App({ client = tauriClient }: { client?: AppClient }) {
  const [document, setDocument] = useState<(typeof documents)[number]>("履歴書");
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
      <header>
        <p className="eyebrow">Resume Studio</p>
        <h1>応募書類を、自分の言葉で。</h1>
        <p>履歴書・職務経歴書を編集し、LaTeXとPDFへ。</p>
      </header>
      <nav aria-label="書類の選択">
        {documents.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={document === name}
            onClick={() => setDocument(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <section className="document-panel" aria-labelledby="document-title">
        <p className="eyebrow">準備中</p>
        <h2 id="document-title">{document}</h2>
        <p>編集・保存・PDF生成は、これから追加します。</p>
      </section>
      <TexDiagnosticsPanel client={client} />
      <footer>
        <output>
          {versionError
            ? "アプリ情報を取得できませんでした。"
            : version
              ? `バージョン ${version}`
              : "アプリ情報を確認中…"}
        </output>
      </footer>
    </main>
  );
}
