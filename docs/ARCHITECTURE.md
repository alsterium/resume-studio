# アーキテクチャ

MVPの実装構成を記載する。要求の正本は[PRD](PRD.md)、保存契約は[Project JSON](PROJECT_JSON.md)、紙面は[TeX出力契約](GENERATED_TEX.md)。

## 処理の流れ

```text
React：共通情報／履歴書／職務経歴のフォームとTiptap本文
  → Project JSON snapshot + projectId / revision / jobId / kind
  → 用途別AppClient → Tauri IPC
  → Rust：Schema・意味検証 → 書類モデル → 同梱TeX bundle
  → 専用TempDir → latexmk → LuaLaTeX → PDF bytes
  → 管理対象resultId → PDF.jsのページ描画

JSON保存：snapshot → Rust検証 → 同一ディレクトリ一時書込 → 置換
出力：snapshot → 書類別生成 → ネイティブフォルダ選択 → PDF／TeX保存
```

TeX変換はRustだけで実装する。フロントは編集・表示、Rustは最終検証・ファイル操作・コンパイル・子プロセス管理を担当する。Node.jsは開発ツールで、アプリへ同梱しない。TeXと日本語フォントもシステム側のものを使う。

## モジュール

| 場所 | 責務 |
| --- | --- |
| `src/domain` | Project型、事前生成Schema validator、日付・年齢、session／revision |
| `src/editor` | Tiptapの許可node/mark、本文編集とUndo/Redo |
| `src/features` | 基本情報・履歴・会社／案件・写真、ファイル、診断、エラー、生成／出力／PDFプレビュー |
| `src/infrastructure/app-client.ts` | 用途別の型付きIPC adapter、バイナリPDFとChannel |
| `src-tauri/src/domain` | 同梱Schema、serde型、容量・日付・期間・参照・画像の最終検証 |
| `src-tauri/src/generator` | エスケープ、AST visitor、書類モデル、同梱テンプレート、固定名bundle |
| `src-tauri/src/compiler` | 実行環境診断、ジョブ、キャンセル、プロセス、PDF結果 |
| `src-tauri/src/storage` | JSONの原子的保存、写真正規化、PDF／TeX出力と復元 |
| `src-tauri/src/commands` | ネイティブ選択と用途別Tauri adapter |
| `src-tauri/templates` | 同梱main.tex、sty、manifest |
| `tools` | Node.jsのダッシュボード、Schema生成、E2E、PDF画像化、アプリ改名 |

## 編集データと状態

JSONはschemaVersion 1。共通基本情報、履歴書、職務経歴書、限定本文AST、写真base64、テンプレートID／版を保持する。PDF、TeX、ログ、保存パス、年齢は保持しない。1ファイルを移動して再開できる。未知のSchema版や属性を拒否し、別schemaVersionのmigrationは未実装。T44の資格はresume/careerの独立配列で、旧v1のcareer.qualifications省略時だけ読込時に値をコピーする。

TSとRustが共通Schema／fixtureで構造を検証し、日付・期間・ID・UTF-8容量を意味検証する。Rustは画像実体もデコードして確認する。写真は向きを反映し最大600×800pxへ縮小、元Exifを保持せず再エンコードする。詳しい上限は[JSON仕様](PROJECT_JSON.md)。

編集revisionと保存済みrevisionを分け、保存開始後の追加編集を未保存として維持する。生成結果にはprojectId／revision／kind／jobIdを付け、別プロジェクトや古いジョブの結果を採用しない。各書類の最後の成功PDFを維持し、編集後は更新前と表示する。新規・開くでは生成結果をクリアする。

本文の書式はTiptapで即時表示する。厳密な紙面はPDF.js legacyの同梱workerで描画する。外部CDNを使用しない。共有PDFWorkerはruntimeが所有し、書類切替ではtransportだけを後始末する。フォーム／配列操作の全体Undo、PDF直接編集、自動保存はMVP対象外。自動PDF生成（T41）は既定OFFのアプリ設定としてlocalStorageへ保存し、Project JSONには含めない。読込/書類初回表示は即時、編集後は2秒のdebounceとIME待機で表示中の書類を生成する。projectId＋セッション世代＋書類種別＋revisionで生成試行を記録し、同じ内容の失敗/停止を再試行しない。既存の生成経路を直列で使い、生成中の追加編集は終了後に最新snapshotで再生成する。OFFは待機だけを解除し、実行中ジョブは既存の停止操作で終了する。

## テンプレートとコンパイル

同梱テンプレートはID・版・書類種別・Schema・LuaLaTeXの完全一致で解決する。対応版がなければエラーを表示し、利用可能版を明示選択する。`include_str!`で同梱するので実行時のcwdに依存しない。

通常テキストは共通エスケープ、書式は限定AST visitor、URLは専用検証を通す。入力の任意TeXやパスを実行しない。資源名はmain.tex、content.tex、固定sty／manifest／photo-Nのみ。履歴書は通常2ページ、あふれた内容は続紙へ、職務経歴書は内容に応じて自動改ページする。

実行環境はPATHとmacOSの既知の配置から検出する。任意の実行ファイルをProject JSONから指定する機能や、利用者向けパス設定画面はない。診断は11資源と3実行ファイルを調べ、日本語PDFを実コンパイルする。

各ジョブは新しいTempDirを使い、latexmkへ引数配列で`-norc`、LuaLaTeX、非対話、エラー停止、shell escape無効を指定する。標準出力／標準エラーは読み続け、各先頭64KiBを保持する。PDFは20MiB、コンパイルは各PDF60秒まで。通常の成功・失敗・キャンセル後に作業ディレクトリを削除し、PDFはメモリの直近4結果として保持する。異常な強制終了後の期限掃除・下書き復旧は実装していない。

診断、下書き、正式生成、書き出しは共有ゲートで1件ずつ処理し、実行中を含む最大8件に制限する。blocking workerがゲートを所有するため、IPC futureが失われても多重実行しない。正式生成はChannelで段階を通知し、登録済みjobIdのキャンセルを受ける。待機中は即座に解除、実行中は専用Unixプロセスグループと子プロセスを停止・回収する。PDF／TeX書き出しにはキャンセルボタンを提供しない。

## 保存・書き出し

保存先はRustが保持するIDで扱い、WebViewへ任意パスAPIを公開しない。JSONは全検証後に同一ディレクトリへ一時書込し、flush／sync_allして置換する。既存権限を維持し、置換失敗は原本と未保存状態を維持する。親ディレクトリfsyncによる電源断保証は提供しない。

書き出しは現在snapshotから生成し、プレビューPDFを流用しない。PDFは一時書込後に置換、TeXは一式を準備してフォルダを置換する。TeXの置換失敗は原本フォルダを復元し、復元にも失敗した場合は退避先を保持して表示する。既存の未知資源／symlink／読取専用を拒否する。各書類に上書き確認と保存／スキップ／失敗を返し、部分成功を維持する。

未保存変更の新規・開く・終了は保存／破棄／キャンセルを選ぶ。RustがCloseRequested／ExitRequestedを一度阻止し、WebViewの確認後に終了を許可する。ファイル操作／生成／出力中の終了は完了後の再操作を案内する。

## IPCと権限

| コマンド | 用途 |
| --- | --- |
| `open_project` / `save_project` | ネイティブ選択、JSON検証・読み書き |
| `import_photo` | ネイティブ選択、画像検証・正規化 |
| `list_templates` | 同梱manifest一覧 |
| `diagnose_tex` | 実環境診断、日本語PDF確認 |
| `generate_draft` / `generate_document` | 下書き／正式snapshotの生成 |
| `cancel_generation` | 登録済み正式ジョブの停止 |
| `read_pdf` | 管理対象resultIdからPDFバイナリ取得 |
| `export_documents` | 現在snapshotのPDF／TeX出力 |
| `request_app_close` / `finish_app_close` | 終了要求と確認後の許可 |

独自コマンドはbuild.rsのAppManifest、permissions、main capabilityで宣言する。汎用fs／shell／dialog IPCは公開しない。通常画面はmainウィンドウだけ、リモートoriginを許可せず、CSPで同梱資源とPDF描画用blob/dataへ限定する。

WebDriverサーバーとpicker adapterはdesktop-e2e featureだけに含める。通常依存にWebDriverがないことと通常.appをCIで確認する。詳細は[テスト](TESTING.md)と[ADR 0004](adr/0004-desktop-e2e.md)。
