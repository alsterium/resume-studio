# 開発の進め方

## タスク台帳

[tasks/tasks.jsonl](../tasks/tasks.jsonl) を進捗の正本とする。1行1タスクのJSONオブジェクトで、最新状態だけを保存する。履歴はGit差分で確認する。T01〜T28は既存ロードマップから移した実装タスクで、初期状態はすべて未着手。

| フィールド | 規則 |
| --- | --- |
| id / title | 一意で安定したID / タスク名 |
| milestone | M0〜M6はアプリ実装、DEVは開発補助ツール。追加する場合はロードマップと同期 |
| status | todo / in_progress / blocked / done |
| dependsOn | 依存タスクIDの配列。不存在・循環は禁止 |
| acceptance | レビューで確認できる完了条件 |
| owner | 担当名。未割当はnull |
| updatedAt | 更新日のYYYY-MM-DD |
| evidence | コマンドと結果、成果物、残作業等の文字列配列 |
| blocker | ブロック理由と解消条件。該当しなければnull |

初期依存はロードマップの記載順に直列化している。並行実装できることを確認した場合は理由を記録し、依存を調整してから着手する。進行中・完了のタスクには未完了の依存を残さない。

## 作業サイクル

1. 台帳と関連仕様を読み、依存が完了したタスクを選ぶ。大きすぎる場合は新しい一意IDで分割し、依存・完了条件を調整する。
2. `in_progress`、担当、更新日を記録する。必要な設計判断はADRまたは関連設計文書へ残す。
3. 完了条件に向けて実装する。結合テストを主にし、TeXエスケープ・AST変換・日時計算等の重要なロジックは単体テストを行う。
4. 対象のテスト・Lint・型チェックを実行する。アプリ基盤完成後はTS/Rustの品質ゲートとCIも通す。紙面変更は生成PDFを目視確認する。
5. 完了条件を満たしたら `done` にし、検証コマンド・結果と成果物を `evidence` に記録する。未達・未検証なら完了にしない。
6. 台帳検証と差分確認を行い、実装・直接のテスト・台帳更新を同じ目的のコミットにまとめる。

`todo → in_progress → done` を通常の遷移とする。外部要因で進められない場合は `blocked` にし、理由と解消条件を `blocker` に記録する。解消後は依存を確認して再開し、blockerをnullにする。完了後の追加作業は原則新規タスクにする。完了判定の誤りを訂正する場合は依存側の状態も整合させる。

## HTMLダッシュボード

リポジトリルートで以下を実行する（Node.js 22を使用、追加パッケージ不要）。

```sh
node tools/dashboard/server.mjs
```

[ダッシュボード](http://127.0.0.1:8000/tools/dashboard/) を開く。HTMLが `tasks/tasks.jsonl` をfetchし、全体・マイルストーンの完了数、状態、依存、完了条件、検証証跡を表示する。検索と状態・マイルストーンの絞り込みを組み合わせられる。「台帳を再読み込み」で変更を反映する。自動監視・書き戻しは行わない。

別のポートを使う場合は `node tools/dashboard/server.mjs 8001`。Ctrl+Cで終了する。サーバーは127.0.0.1で待ち受け、ダッシュボードのHTML・JavaScriptとJSONL台帳だけを配信する。作業ディレクトリによらずスクリプトの位置から資源を読み込む。

サーバーなしでも [index.html](../tools/dashboard/index.html) を直接開き、「JSONLファイルを選択」で台帳を読み込める。ファイル変更後は再選択する。外部CDN・ネットワーク依存はない。不正データの場合はエラーを表示し、前回の正常データを維持する。

進捗率は完了件数÷総件数であり、工数・納期の推定ではない。画面で編集せずJSONLを更新するため、Gitで変更をレビューできる。

```sh
node --test tools/tests/*.test.mjs
```

上記は台帳の整合性、依存、完了証跡、検索とHTTP配信を検証する。Node.js 22で動作確認。アプリの実装タスクと独立した開発補助ツールで、将来のCIへ組み込む対象とする。

## アプリの開発環境

T01ではTauri 2＋React＋TypeScript＋Viteの初期画面を追加する。MVPの最低OSはmacOS 12.0として`src-tauri/tauri.conf.json`へ設定。CPUはApple Silicon（aarch64）を先行検証する。Intel（x86_64）、最低OS上の実機検証、Windows/Linux対応は未実施。

| 項目 | 固定版／検証環境 |
| --- | --- |
| macOS実機 | 26.5.2、arm64 |
| 開発環境 | Xcode（`xcode-select -p`が開発環境を指すこと） |
| Node.js | 22.14.0、`.node-version`に記録 |
| pnpm | 10.26.2、`package.json`の`packageManager`に固定 |
| Rust | 1.96.1、`rust-toolchain.toml`に固定、rustfmt・Clippyを含む |
| Tauri | Rust/API/CLI 2.12.1、tauri-build 2.7.1 |
| React / TypeScript / Vite | 19.3.0 / 7.0.2 / 8.3.2（package.jsonとlockfileに固定） |

初回は`pnpm install --frozen-lockfile`、開発起動は`pnpm tauri dev`。Rust依存はCargo.lockで固定し、初回コンパイル時に取得する。ブラウザのみの画面確認は`pnpm dev`、フロントの型チェックと本番ビルドは`pnpm build`。TauriとViteを別々に起動する必要はない。

初期画面での書類切り替えは編集内容の保存を伴わない。T04では型付きAppClientからTauriのアプリ版を取得する。メインウィンドウに`core:app:allow-version`だけを許可し、ファイル・shell等の汎用IPCは公開していない。必要な権限は機能を追加するタスクで宣言する。

T01の検証ではフロントビルド、Cargoチェック、開発起動と実macOSの1200×800ウィンドウ生成を確認。Browserプラグイン内の参照先不整合と画面収録・アクセシビリティ権限不足により、画面の目視と操作確認は未実施。macOSのWebView操作を含む自動テストはT09、結合テスト基盤はT04で追加する。

設定は[TauriのVite連携](https://v2.tauri.app/start/frontend/vite/)と[macOS bundle設定](https://v2.tauri.app/distribute/macos-application-bundle/)を参考にする。最低OS 12.0は本プロジェクトの設定値であり、その版での動作保証は実機検証後に確定する。

## 品質チェック

リポジトリルートから`pnpm check`で以下を一括実行する。個別実行も可能。

| コマンド | 内容 |
| --- | --- |
| `pnpm lint` | Oxlint 1.87.0、TS・React・アクセシビリティ等のcorrectnessルール、警告も失敗 |
| `pnpm format:check` / `pnpm format` | Oxfmt 0.72.0による書式確認／適用 |
| `pnpm typecheck` | tscによる独立した型チェック |
| `pnpm rust:format:check` / `pnpm rust:format` | rustfmtによる書式確認／適用 |
| `pnpm rust:check` | Cargoの全target型チェック（locked） |
| `pnpm rust:lint` | Clippy、全target、警告も失敗（locked） |
| `pnpm test:tasks` | JSONL・ダッシュボード・localhost HTTPの6テスト |
| `pnpm test:integration` | Vitest＋Testing Library、UIとTauri adapterの結合テスト |
| `pnpm rust:test` | cargo test、実設定ファイルの結合テスト |

フロントLint対象は`src`・`tests`とVite/Vitest設定。Oxfmt対象は同じアプリ・テストソースとHTML・TS・npm・Tauri・Oxc設定。既存の設計文書、JSONL台帳、独立したダッシュボードは一括整形対象に含めない。ダッシュボードは`test:tasks`で検証する。

`pnpm build`は型チェック後に本番bundleを生成する。`pnpm check`はファイルの書き換えを行わない。HTTP結合テストは127.0.0.1への待受を必要とするため、待受を禁止したsandboxでは通常の開発環境で実行する。テストをskipして成功扱いにしない。

設定は[Oxlint設定資料](https://oxc.rs/docs/guide/usage/linter/config)と[Oxfmt CLI](https://oxc.rs/docs/guide/usage/formatter/cli.html)を参照。Oxlintの成功でTypeScript型チェックを代替しない。

テスト基盤はVitest 5.0.3、Testing Library React 16.3.3、user-event 14.6.7、jest-dom 7.0.1。jsdomはNode 22.14.0と互換の26.1.0に固定する。UIテストのIPCはTauri公式mockIPCで代替するため、実WebView・実Rust通信の検証には含めない。Rust結合テストは実ファイルからTauri設定・権限・npmメタデータを読み取り、crateとの整合を確認する。架空日本語入力は`tests/fixtures`へ置く。重要な変換ロジックのUnitテストは対象ロジックの実装時に追加する。
