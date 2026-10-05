import { useState } from "react";
import type { AppClient, TexDiagnostics } from "../../infrastructure/app-client";

export function TexDiagnosticsPanel({ client }: { client: AppClient }) {
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<TexDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    setError(null);
    setReport(null);
    try {
      setReport(await client.diagnoseTex());
    } catch {
      setError("TeX環境を確認できませんでした。もう一度お試しください。");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section aria-labelledby="tex-diagnostics-title">
      <h2 id="tex-diagnostics-title">PDF生成環境</h2>
      <button type="button" disabled={checking} onClick={() => void check()}>
        {checking ? "確認中…" : "TeX環境を確認"}
      </button>
      {checking && <output>日本語PDFを生成して確認しています…</output>}
      {error && <p role="alert">{error}</p>}
      {report && (
        <div>
          {report.pdfValidated && <output>日本語PDFを生成できました。</output>}
          {report.error && <p role="alert">{report.error.message}</p>}
          {report.missingDependencies.length > 0 && (
            <div>
              <p>以下をTeX環境へ追加してください。</p>
              <ul>
                {report.missingDependencies.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary>確認結果の詳細</summary>
            <ul>
              {report.tools.map((tool) => (
                <li key={tool.name}>
                  {tool.name}: {tool.path ?? "未検出"} {tool.version ?? ""}
                </li>
              ))}
            </ul>
            {report.error?.log && <pre>{report.error.log}</pre>}
          </details>
        </div>
      )}
    </section>
  );
}
