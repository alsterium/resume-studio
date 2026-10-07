# GitHub Actionsの品質ゲート

[CI workflow](../.github/workflows/ci.yml)はmainへのpush、pull request、手動実行で動く。GitHubへアクセスする権限はcontents: read、checkout後の認証情報は残さない。同じブランチの古い実行はキャンセルする。

| ジョブ | 実行環境 | 必須の確認 |
| --- | --- | --- |
| frontend-quality | Ubuntu 24.04 / Node 22.14.0 | frozen-lockfileでインストール、Oxlint/Oxfmt、TypeScript、JSONL/HTTP、UI結合、重要ロジックUnit、本番フロントbundle |
| rust-quality | macOS 15 / rust-toolchain.toml | Rust fmt、全target check/Clippy、Unitと実ファイル・プロセスの結合、doc-test |
| desktop-e2e | macOS 15 / システムTeX | 両テストfeatureの全target Clippy、テスト用.app、実WebView E2E、実TeXの全文/紙面検証、テストfeatureなしの通常.app、通常依存からのWebDriver除外 |
| required-checks | Ubuntu 24.04 | 上の3ジョブがすべてsuccessであること。失敗・キャンセル・skipを成功として扱わない |

macOS E2Eは実IPCで編集・写真・JSON保存/移動/再起動・両書類のTeX/PDF・診断・キャンセル・両PDF保存・独立TeX一式のコンパイル・終了保存を検証する。ファイルpickerと上書き選択のadapterはdesktop-e2e featureだけにある。OSダイアログの実操作、日本語IME、最低macOS上の受け入れは[MVP受け入れ](IMPLEMENTATION_PLAN.md)で別に記録する。

通常アプリのbundleは`pnpm tauri build --debug`で作る。desktop-e2e featureを渡さず、同じ.app生成経路を確認する。署名・公証・配布用Releaseは対象外。すべてのCargo処理を各ジョブ内で順番に行い、同じ出力先のfeature切替とdoc-testを並行実行しない。

Actionsはcommit SHAで固定する。Node/Rust/pnpmはリポジトリの版指定、npm/Cargo依存はlockfileとlocked/frozen-lockfileを使用する。CIのBasicTeX 2026.0301インストーラはSHA-256で検証し、TeX資源は指定したTeX Liveミラーから取得する。tlmgrで取得する資源のrevisionはミラーの状態に依存するため、TeXの版をCIログへ残す。PDFバイナリの一致は要件に含めず、文字・配置・寸法・警告・リンク・写真と独立コンパイルを確認する。

ローカルでの再現は[DEVELOPMENT.md](DEVELOPMENT.md)の`pnpm check`、`pnpm build:e2e`→`pnpm test:e2e`、`pnpm test:tex`、`pnpm tauri build --debug`を順番に使う。通常bundleのビルドはテスト用bundleを置き換えるため、E2Eを再実行する場合は先に`pnpm build:e2e`で作り直す。検証は架空データだけを用い、個人の応募書類をCIのfixtureやログに含めない。
