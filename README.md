# Resume Studio（仮称）

日本語の履歴書・職務経歴書を編集し、JSONプロジェクトからLaTeXとPDFを生成するローカルデスクトップアプリ。

現段階の成果物は設計ドキュメント。アプリケーション、TeXテンプレート、CIは未実装。

## ドキュメント

1. [PRD](docs/PRD.md)：目的、MVP、受け入れ条件
2. [アーキテクチャ](docs/ARCHITECTURE.md)：JSON、エディタ、TeX生成、Tauriの境界
3. [実装ロードマップ](docs/IMPLEMENTATION_PLAN.md)：依存順の実装タスクと完了条件
4. [テスト・CI方針](docs/TESTING.md)：結合テスト中心の品質保証とGitHub Actions
5. [参考テンプレート仕様](docs/TEMPLATE_REFERENCE.md)：指定PDFに近い履歴書・職務経歴書の紙面

## 決定済みの前提

- macOS先行。Windows/Linuxは後続の対応対象。
- TypeScript、React、Vite、Oxlint、Oxfmt、Tauri 2、Rust。
- 編集プロジェクトはJSONファイルとして保存する。
- システムにインストール済みのTeX環境を利用する。
- 履歴書・職務経歴書のTeXテンプレートと、再利用可能なアプリリポジトリの両方を用意する。
- 標準書式は指定PDFを参考に、罫線付き履歴書と、見出し・スキル表・会社／案件構成の職務経歴書とする。
- Integrationテストを中心に、重要なロジックはUnitテストで検証する。

## 設計上の初期案

Tiptapで本文を編集し、RustでJSONを検証・TeXへ変換、LuaLaTeXで日本語PDFを生成する。本文の書式を編集画面で確認し、正確な改ページや紙面はPDFプレビューで確認する。具体的な採用案・未確定項目はPRDを参照。
