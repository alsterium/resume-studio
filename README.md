# Resume Studio

日本語の履歴書・職務経歴書を編集し、JSONに保存して、ローカルのLaTeXから提出用PDFを生成するmacOSアプリ。参考書式に沿った罫線付き履歴書と、見出し・スキル表・会社／案件で構成する職務経歴書を同梱する。

基本情報はフォーム、本文はTiptapのWYSIWYGで編集する。段落、太字、斜体、箇条書き、番号付きリスト、改行、Undo/Redoに対応。正確な紙面・改ページは実PDFプレビューで確認する。JSONには両書類の内容、書式、順序、テンプレート参照、写真をまとめて保存する。

## セットアップと起動

macOS、Xcodeの開発環境、Node.js 22.14.0、pnpm 10.26.2、Rust 1.96.1を用意する。Rust版は`rust-toolchain.toml`、npm/Cargo依存はlockfileで固定している。Apple Silicon／macOS 26.5.2で検証済み。設定上の最低OSは12.0だが、最低OSとIntel上の実機検証、Windows/Linux対応は未実施。

PDF生成にはシステムのTeX環境が必要。latexmk、LuaLaTeX、kpsewhich、LuaTeX-ja、Harano Ajiフォントを使う。必要資源と追加方法は[セットアップ](docs/SETUP.md)を参照する。

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

通常の.appを作る場合は`pnpm tauri build --debug`。生成先は`src-tauri/target/debug/bundle/macos/Resume Studio.app`。署名・公証・自動更新はMVP対象外。

## 使い方

1. 「新規」で共通情報、履歴書、職務経歴書を入力する。「開く」から[架空サンプル](tests/fixtures/project-full.json)も読み込める。
2. 必要ならJPEG/PNGの写真を取り込む。取り込み時に向きとサイズを調整し、JSONへ埋め込む。
3. 「保存」または「名前を付けて保存」でJSONを保存する。Cmd/Ctrl+Sで保存、Shift併用で別名保存。日本語変換中は保存キーを処理しない。
4. 各書類の「PDF更新」で実PDFを生成し、倍率50〜200%とページ移動で確認する。設定の「PDFを自動生成する」をONにすると、読込・初回表示と入力停止から2秒後に表示中のPDFを更新する。設定は再起動後も保持し、JSON保存は引き続き手動。編集後の古いPDFには更新前の表示を付ける。
5. 「書き出し」で形式（PDF／TeX一式）と対象（片方／両方）を選び、フォルダへ保存する。両書類は別ファイルになり、上書き確認と書類別の結果を表示する。

JSONを保存して終了し、再起動後に「開く」で編集を再開できる。未保存変更がある場合は保存・破棄・キャンセルを選ぶ。PDF生成は非同期で、生成中も編集できる。正式書類の生成はキャンセル可能。TeXがなくても編集、JSON保存、TeX一式の書き出しを利用できる。

「TeX環境を確認」で実行ファイル、パッケージ、フォントと日本語PDFを診断する。失敗時の対処は[トラブルシューティング](docs/TROUBLESHOOTING.md)。上限と保存の保証範囲は[JSON仕様](docs/PROJECT_JSON.md)、紙面と続紙は[TeX出力契約](docs/GENERATED_TEX.md)に記載している。

## 開発と検証

```sh
pnpm check
pnpm build:e2e
pnpm test:e2e
pnpm test:tex
```

`pnpm check`はOxlint/Oxfmt、TypeScript、Rust fmt/check/Clippy、Nodeツール、UI結合、重要ロジックUnit、Rustの実ファイル・プロセス結合テストを実行する。後ろの3コマンドはmacOS GUIと実TeXを必要とする。[GitHub Actions](https://github.com/alsterium/resume-studio/actions)でも実TeX・実WebView・通常bundleを必須ジョブとして検証する。詳細は[テスト](docs/TESTING.md)と[CI](docs/CI.md)。

タスク管理には[JSONL台帳](tasks/tasks.jsonl)と対話型HTMLダッシュボードを使用する。Node.jsで起動する。

```sh
node tools/dashboard/server.mjs
```

[http://127.0.0.1:8000/tools/dashboard/](http://127.0.0.1:8000/tools/dashboard/)で台帳を読み込み、検索・状態／マイルストーンの絞り込み・再読込ができる。[開発規約](docs/DEVELOPMENT.md)と[AGENTS.md](AGENTS.md)に進め方を定義している。

## リポジトリと書類テンプレート

GitHubの非公開テンプレートリポジトリとして設定済み。[再利用手順](docs/REPOSITORY_TEMPLATE.md)のNode.jsツールでアプリ名・識別子・crate名を変更できる。書類テンプレートの追加・版管理・検証は[テンプレート開発](docs/TEMPLATE_DEVELOPMENT.md)を参照する。

アプリと独自TeXテンプレートのライセンスは未付与。現在は非公開で開発しており、公開前に利用・再配布条件を決める。依存ライブラリとシステムTeX資源のライセンスはそれぞれ別に扱う。[ライセンス方針](docs/LICENSE_POLICY.md)。

[PRD](docs/PRD.md)、[アーキテクチャ](docs/ARCHITECTURE.md)、[実装ロードマップ](docs/IMPLEMENTATION_PLAN.md)、[参考書式](docs/TEMPLATE_REFERENCE.md)も参照できる。MVPの最終受け入れは[受け入れ記録](docs/ACCEPTANCE.md)とタスクT28で記録する。
# Web版

[軽量Webエディタ](https://resume-studio.alsterium.com/)ではスマホから同じプロジェクトJSONを開いて編集できます。「保存」はJSONのダウンロード、下書きはブラウザ内に自動保存します。正式PDF／TeXはMac版で出力します。開発・公開手順は[WEB](docs/WEB.md)を参照してください。
