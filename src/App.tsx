import { useState } from "react";

const documents = ["履歴書", "職務経歴書"] as const;

export function App() {
  const [document, setDocument] = useState<(typeof documents)[number]>("履歴書");

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
    </main>
  );
}
