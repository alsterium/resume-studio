# Resume Studio（仮称）

日本語の履歴書・職務経歴書を編集し、JSONプロジェクトからLaTeXとPDFを生成するローカルデスクトップアプリ。

Tauri 2＋Reactの初期画面とTS/RustのCI設定を実装済み。書類の切り替えができる。編集、JSON保存、TeX・PDF生成は後続タスクで追加する。GitHub上でのCI実行はremote設定後に確認する。

## 開発起動

macOSでXcodeの開発環境、Node.js 22.14.0、pnpm 10.26.2、Rust 1.96.1を用意する。

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

`pnpm dev`はブラウザ用、`pnpm build`はフロントの型チェックと本番ビルド。対応範囲と検証済み環境は[開発規約](docs/DEVELOPMENT.md#アプリの開発環境)を参照。

品質チェックは`pnpm check`。TS/RustのLint・整形・型チェックと台帳ツールのテストを実行する。

開発は [開発規約](docs/DEVELOPMENT.md) に沿って進め、[JSONL台帳](tasks/tasks.jsonl) でタスクを管理する。[HTMLダッシュボード](tools/dashboard/index.html) で進捗を閲覧できる。起動手順は開発規約を参照。

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
