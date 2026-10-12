# 開発の進め方

現在の利用・セットアップは[README](../README.md)と[SETUP](SETUP.md)、実装構成は[ARCHITECTURE](ARCHITECTURE.md)、テスト／CIは[TESTING](TESTING.md)と[CI](CI.md)を参照する。以下のT番号付き記録は各段階の実装・検証経緯を含む。タスクの最新状態はJSONL台帳を正本とする。リポジトリ再利用は[REPOSITORY_TEMPLATE](REPOSITORY_TEMPLATE.md)、書類テンプレート開発は[TEMPLATE_DEVELOPMENT](TEMPLATE_DEVELOPMENT.md)、ライセンスは[LICENSE_POLICY](LICENSE_POLICY.md)。

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

初期画面での書類切り替えは編集内容の保存を伴わない。T04では型付きAppClientからTauriのアプリ版を取得する。T05ではメインウィンドウにアプリ版読取と`allow-diagnose-tex`を許可する。独自コマンドはAppManifestでも宣言し、ファイル・shell等の汎用IPCは公開していない。

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
| `pnpm test:tasks` | JSONL・ダッシュボード・localhost HTTPと改名ツールの結合テスト |
| `pnpm test:integration` | Vitest＋Testing Library、UIとTauri adapterの結合テスト |
| `pnpm test:unit` | Vitest、日付・年齢等の重要な純粋ロジック |
| `pnpm rust:test` | cargo test、実設定ファイルの結合テスト |

フロントLint対象は`src`・`tests`とVite/Vitest設定。Oxfmt対象は同じアプリ・テストソースとHTML・TS・npm・Tauri・Oxc設定。既存の設計文書、JSONL台帳、独立したダッシュボードは一括整形対象に含めない。ダッシュボードは`test:tasks`で検証する。

`pnpm build`は型チェック後に本番bundleを生成する。`pnpm check`はファイルの書き換えを行わない。HTTP結合テストは127.0.0.1への待受を必要とするため、待受を禁止したsandboxでは通常の開発環境で実行する。テストをskipして成功扱いにしない。

設定は[Oxlint設定資料](https://oxc.rs/docs/guide/usage/linter/config)と[Oxfmt CLI](https://oxc.rs/docs/guide/usage/formatter/cli.html)を参照。Oxlintの成功でTypeScript型チェックを代替しない。

テスト基盤はVitest 5.0.3、Testing Library React 16.3.3、user-event 14.6.7、jest-dom 7.0.1。jsdomはNode 22.14.0と互換の26.1.0に固定する。UIテストのIPCはTauri公式mockIPCで代替するため、実WebView・実Rust通信の検証には含めない。Rust結合テストは実ファイルからTauri設定・権限・npmメタデータを読み取り、crateとの整合を確認する。架空日本語入力は`tests/fixtures`へ置く。重要な変換ロジックのUnitテストは対象ロジックの実装時に追加する。

## TeX環境の診断

初期画面の「TeX環境を確認」で、Rust側の`diagnose_tex`を実行する。PATHとmacOSの既知の配置（`/Library/TeX/texbin`等）からlatexmk、LuaLaTeX、kpsewhichを探し、版・日本語パッケージ・Harano Ajiフォントを確認する。診断コマンドに入力TeXや任意の実行パスを渡すことはできない。

依存が揃っていれば、同梱の固定日本語TeXを隔離した一時ディレクトリでlatexmkへ渡す。ユーザーのlatexmk設定を読み込まない`-norc`、LuaLaTeX、非対話、エラー停止、shell escape無効を指定する。生成終了コードとPDFヘッダを確認し、診断の一時ファイルを削除する。プロセスのログは標準出力・標準エラーそれぞれ先頭64KiBだけ保持し、全出力は読み続ける。タイムアウト時はmacOSの専用プロセスグループを停止する。操作キャンセル・ジョブ状態の管理はT21・T22で追加する。

診断結果の確認用に以下も実行できる。依存不足や生成失敗なら終了コード1を返す。

```sh
cargo run --manifest-path src-tauri/Cargo.toml --locked --example diagnose_tex
```

T05はTeX Live 2026basic＋latexmk 4.88で検証済み。ユーザーの管理者操作でlatexmkを追加後、GUIに近いPATH=/usr/bin:/binで実診断がpdfValidated=trueを返した。制限されたsandboxでフォントキャッシュに書き込めない場合は通常の開発環境で実行する。

実macOS WebViewの確認用exampleも追加した。実際の同梱React画面の診断ボタンを押し、実IPC・実TeX・成功表示まで確認する。タイムアウトや失敗表示は終了コード1。テスト用scriptはexampleだけに含み、本番アプリには組み込まない。T09のWebdriverIOによる編集からプレビューまでのE2Eは別途実装する。

```sh
pnpm build
cargo build --manifest-path src-tauri/Cargo.toml --locked --example gui_diagnostics --features tauri/custom-protocol
env PATH=/usr/bin:/bin src-tauri/target/debug/examples/gui_diagnostics
```

実行結果はGUI_DIAGNOSTICS: PASS。通常のアプリと同じmain capabilityを使い、検証結果の通知用URLはnavigation callbackで捕捉して外部通信を防ぐ。画面の紙面・見た目の目視確認を代替するものではない。

## 下書きPDFプレビュー

T07では氏名・本文を入力し「PDF更新」でRustのgenerate_draftを実行する。Rustが最大4件の成功PDFをメモリに保持し、結果IDからread_pdfのバイナリIPCで取得する。任意パスの読取や任意TeX入力は公開しない。編集後はPDFに「更新前の内容」と表示し、再生成に失敗しても成功PDFを維持する。正式モデルとジョブのリビジョン照合は後続で拡張する。

PDF.js 6.4.299のlegacy版と同版workerをViteで同梱する。通常版は新しいMap.getOrInsertComputedを描画時に使用するため、旧WebKitにも対応する互換版を採用する。E2EではこのAPIを明示的に無効にして実描画を検証する。外部CDNを利用せず、Uint8Arrayを渡して描画する。倍率50〜200%、前／次のページに対応。CSPは同梱workerとPDF内フォント用のblob/dataのみ追加する。Wasm画像デコードは現時点で無効にし、写真実装時に検証する。

以下は実macOS WebViewで180行の架空日本語を入力→実TeX→複数ページPDF描画→150%拡大→2ページ目描画を確認する。canvasの描画ピクセルも検査する。

```sh
pnpm build
cargo build --manifest-path src-tauri/Cargo.toml --locked --example gui_diagnostics --features tauri/custom-protocol
env PATH=/usr/bin:/bin RESUME_STUDIO_PROBE=preview src-tauri/target/debug/examples/gui_diagnostics
```

GUI_DIAGNOSTICS: PASSを確認済み。exampleは本番と同じcommands・PdfStore・capabilityを使用する。UI結合テストではPDF.js境界をmockし、入力→生成→結果読取、倍率・移動、失敗時のPDF保持を検証する。実描画は上のネイティブ検証で別途確認する。

## 本文WYSIWYG編集

T08の本文エディタはTiptap 3.31.4。doc・paragraph・text・hardBreak・bulletList・orderedList・listItem、bold・italicだけを有効にする。太字／斜体、2種類のリスト、本文Undo/Redoを提供する。DraftはrichBodyのJSONをRustへ渡し、段落・リスト・markをTeXへ変換する。対応外node/mark/属性、制御文字、要素数・深さ・全本文のサイズ超過は生成を拒否する。番号付きリストは開始番号を保持し、混在する箇条書きとは独立したカウンタを使う。正式SchemaとTS/Rust契約はT10、完全なvisitor仕様のテスト拡充はT16で行う。

実TiptapでJSON取得→クリア→再投入を確認し、書式付き日本語fixtureの実PDF生成・文字抽出も確認した。RESUME_STUDIO_PROBE=editorのネイティブ検証はツールバー・JSON往復・合成compositionイベント・実PDF描画を確認する。合成compositionをOSの日本語IME検証の代わりにはしない。

実IMEの受け入れ確認は、pnpm tauri devの本文欄で日本語IMEの変換・候補選択・Enterによる確定・続きの入力を行う。確定時の消失・二重入力・余計な改行がないことと、PDF更新で確定した日本語が表示されることを確認する。2026-10-06、ユーザーから一連の操作について「全て正常です」と回答を得て、T08の実IME受け入れを完了した。

## デスクトップE2E

```sh
pnpm build:e2e
pnpm test:e2e
```

最初のコマンドは同梱フロントとdesktop-e2e featureのテスト用.app bundleを作る。2つ目はNode.jsでbundle内の専用アプリを最小PATHで起動し、WebdriverIOから本文入力→実IPC→実TeX→PDF描画と倍率変更を確認する。生成PDFから氏名・本文も文字抽出する。要素入力と倍率用DOMイベントの制限は[ADR 0004](adr/0004-desktop-e2e.md)に記録した。終了時にセッションとアプリを停止する。実TeX環境とmacOSのWebViewが必要で、通常CIのブラウザ内mockテストとは別に報告する。

E2E後に本番アプリを作るときは通常のpnpm tauri buildを使う。desktop-e2e featureを渡さない。WebDriverプラグインは既定の依存グラフに含まれず、通常のcapabilityを増やさない。

## JSONプロジェクトのファイル操作

T11の新規・開く・保存・名前を付けて保存は[Project JSON v1](PROJECT_JSON.md)を使用する。フロントの開発起動でもSchema validatorを事前生成する。tauri-plugin-dialog 2.8.1を固定し、[公式Rust API](https://v2.tauri.app/plugin/dialog/)を用途別コマンド内のblocking workerから呼ぶ。WebViewの権限はopen_project/save_projectだけで、dialog/fsの汎用権限を追加しない。

UI結合テストは実TiptapとTauri mockIPCで復元・全項目保存・別名保存・キャンセル・失敗からの再試行を確認する。Rust storage結合テストは日本語／スペースを含む実パスで往復・移動・上書き・容量制限・既存権限維持を検証する。置換境界への失敗注入では実一時書込後の原本保持と後始末を確認する。

desktop-e2eではNodeが所有する一時ディレクトリのJSONパスをRESUME_STUDIO_E2E_PROJECTへ渡す。desktop-e2e featureのRustだけがnative pickerをそのパスへ置き換える。UIの入力→実IPC→実JSON保存→新規→実JSON読み込み→実TeX→PDF描画を通す。本番ビルドはこの環境変数を解釈しない。native dialog自体の操作と終了・再起動を含む最終受け入れはT28で確認する。

## 未保存変更と終了確認

T12は編集revisionと保存成功revisionを分離する。UI結合では保存待機中の追加入力、保存失敗／キャンセル、破棄確認の各選択、保存成功後の読み込み失敗、終了通知から保存後の終了を検証する。Unitでは遅延した保存結果が追加編集や別プロジェクトの状態を巻き戻さないことを確認する。

native closeは[WindowEvent::CloseRequested](https://docs.rs/tauri/latest/tauri/enum.WindowEvent.html)、quitは[RunEvent::ExitRequested](https://docs.rs/tauri/latest/tauri/enum.RunEvent.html)をRustで阻止する。WebViewはイベントのlisten/unlistenと用途別request_app_close/finish_app_closeだけを使用する。汎用window destroyやprocess exit IPCを許可しない。

desktop-e2eは実IPCでwindow.closeを要求して確認画面のキャンセル・入力保持を検証し、終了ボタンからapp.exitの阻止と確認画面を検証する。最後に保存して続行で実JSONの更新と所有アプリの終了コード0を確認する。ここはnativeイベントとRust処理を代替しない。UI結合のdialog.showModal/closeはjsdomにないため最小adapterで代替し、実WebViewのmodal表示はE2Eで確認する。OSのタイトルバー・Cmd+QとIME操作の組合せは最終手動受け入れで補完する。

## 写真の取り込みと資源展開

T13はimage 0.25.10（default featureなし、JPEG/PNGのみ）とbase64 0.22.1を固定する。[ImageReader](https://docs.rs/image/0.25.10/image/struct.ImageReader.html)のlimitsと[ImageDecoder](https://docs.rs/image/0.25.10/image/trait.ImageDecoder.html)の寸法・出力容量・orientationを使用する。画像をデコードして向きを適用し、縮小後の画素だけを再エンコードする。[写真の契約](PROJECT_JSON.md#写真)を参照する。

Rust photos結合テストは実PNG/JPEGの取り込み、透過、90度Exif回転と再取り込み時の二重回転防止、縮小、原本保持、JSON移動と元画像削除後の復元、固定名資源展開、既存資源保持を検証する。破損・不正形式・MIME不一致・base64不正・5MiB超・1辺8192px超・1600万画素超を拒否する。全項目fixtureの古い1px PNGは実体検証で破損が判明したため、Nodeで生成した正常な3×4px架空パターンへ置き換えた。

UI結合は実TiptapとIPC adapterを通し、取り込み・置換・選択・削除・写真付きJSON保存・読み込み・キャンセル・失敗時保持を確認する。desktop-e2eの写真pickerだけはRESUME_STUDIO_E2E_PHOTOの一時パスへ代替する。実IPCで写真を取り込み、画像のnaturalWidth/Heightと描画完了を確認する。実JSON保存→正常終了→JSONだけ移動／元画像削除→別プロセスで再起動→写真／本文を復元→実TeX／PDF→保存後正常終了まで通す。写真のPDF配置と画像を含むPDF.js描画はT18・T20で検証する。native picker自体の実操作は最終手動受け入れに含める。

## 履歴書の編集

T14は共通の氏名・写真に加え、プロジェクト名、書類日付、氏名ふりがな、生年月日、任意の性別表示、現住所と別連絡先の5項目を編集する。年齢は既存の暦日関数で書類日付時点の満年齢を算出し、JSONへ重複保存しない。性別を空にした場合は任意フィールドを省略する。別連絡先をオフにするとその入力を削除することを画面で説明する。

学歴・職歴・免許/資格はそれぞれ最大200行。年月は任意、内容は1024文字以内。行IDを維持して上へ/下へで並べ替え、追加には独立したIDを使う。志望動機と本人希望欄は限定WYSIWYGを使用する。新規/読込では各エディタを再生成し、保存済み本文を復元する。読込中と破棄確認中は全項目の編集を停止する。

UI結合は全項目の入力、3表の追加/削除/上下移動、本文書式、保存/再読込/新規、任意項目の省略、未保存確認、200行境界を検証する。desktop-e2eには氏名/住所のふりがな、日付・満年齢、学歴、志望動機・希望欄の実JSON保存と再起動後の復元を追加する。日付等の入力にはADR 0004と同じDOMイベントadapterを使い、実React・IPC・Rust保存処理は代替しない。現段階の下書きPDFは氏名と職務要約のみを出力する。正式履歴書の生成はT17/T18で接続する。

## 職務経歴書の編集

T15で書類切替を編集画面へ接続する。氏名・写真・職務要約と資格は共通の画面で編集し、資格は`resume.qualifications`だけに保存する。会社・案件は選択した1件の詳細を編集する。配下に多数の本文があるJSONでも、全案件のWYSIWYGを同時に作らない。選択の変更は保存状態を変更せず、現在の入力をJSONモデルに維持する。会社・案件を切り替えると本文エディタを再生成するため、その案件の本文Undo履歴は引き継がない。書類切替では編集画面を維持し、本文を再生成しない。

会社名・在籍期間・役割と任意の事業内容/資本金/従業員数、案件名・期間・概要/業務/実績のWYSIWYG・フェーズ/言語/技術の一覧・規模・任意URLを編集する。終了年月nullを在籍中/進行中、空文字を未入力として扱う。入力した終了年月が開始年月より前、またはURLがhttp/https以外ならエラーを表示し保存を拒否する。任意URL・会社概要を空にするとフィールドを省略する。会社削除は配下の案件も削除することを画面で説明する。

会社100件・案件200件/社・スキル200件・フェーズ/言語/技術各50件の上限で追加を停止する。会社・案件・スキルは上下移動で順序を変更でき、独立IDを維持する。自己PRは限定WYSIWYG。未保存確認中・読み込み中はフォームと案件本文を含む全エディタを編集不可にする。

UI結合は全項目編集・順序・選択をまたぐ書式保持・共通資格・保存/再読込/新規、期間とURLの拒否/修正後の保存、任意フィールド省略、未保存保護、各件数上限を検証する。desktop-e2eは実会社/案件/経験期間/自己PRの入力→実JSON保存→正常終了/移動/再起動→書類切替と階層・本文の復元まで確認する。正式職務経歴書PDFはT17/T19で接続する。

## 本文からTeXへの変換

T16はRustの共通visitorを両書類の本文変換の正本とする。許可ASTの親子関係・mark・属性・UTF-8容量・要素数・リスト階層を検証してから変換する。空docは空文字、空段落は1段落分として扱う。段落を`\leavevmode{}`で始め、先頭/連続/末尾のhardBreakも`\newline`で安全に出力する。旧処理の先頭改行は実TeXで「There's no line here to end」を再現し、修正後にコンパイルと末尾の文字抽出を確認した。

番号付きリストは箇条書きの深さと別にenumi〜enumivを選び、各リストのstartを維持する。TeX既定の深い階層の英字/ローマ数字は使わず、エディタ同様に全階層を算用数字とする。markは入力順に内側から適用し、bold/italicの両順序を確認する。通常文字とTeX命令らしい入力も同じエスケープを1回だけ通す。

入力本文の64KiB/10,000 node制限とは別に、変換済み本文を2MiB以内に制限する。旧256KiB制限は64KiBの許可済み特殊文字がエスケープで膨らむと拒否していたため、全入力上限を収容する2MiBへ変更した。本文を切り捨てない。

`tests/fixtures/body-visitor.json`と手書きの期待TeXを照合し、空段落、先頭改行、全特殊文字、複合mark、4階層の混在リスト、独立した番号開始と末尾目印をUnitで検証する。無効な親子関係・フィールド、空text、制御文字、64KiB/10,000 node境界、特殊文字の出力膨張も確認する。`pnpm test:tex`は実LuaLaTeXで4ケースを生成し、欠字/はみ出しログを検査し、macOSのPDFKitで日本語・文字・番号・末尾を抽出する。

## 正式書類の生成とテンプレート選択

T17では「履歴書PDF更新」「職務経歴書PDF更新」が正式Project全項目をRustのgenerate_documentへ渡す。テンプレート一覧はlist_templatesで取得し、非対応ID／版を維持したまま明示選択で変更できる。生成失敗で最後の成功PDFを維持し、生成時revisionと編集revisionが異なれば古い内容と表示する。ジョブと書類別結果の管理は下記T21の仕様を使用する。初期の「PDF更新」（氏名と職務要約だけの下書き）は検証経路として暫定的に残す。

生成ファイル・版解決・制限・単体コンパイル手順は[GENERATED_TEX.md](GENERATED_TEX.md)。T17の紙面は初期流し込み版で、参考帳票の組版はT18／T19。PDF再生成時に前のloading taskのdestroyと次の生成が重なり、共有workerでPDFWorker.createが失敗することを実E2Eで再現した。runtimeが同梱PDFWorkerを所有し、各loading taskは書類のtransportだけを後始末する構成へ修正した。workerをtaskの所有物にしないため、前のPDFのdestroyが次のworkerを破棄しない。E2Eは下書き→写真付き履歴書→職務経歴書の連続生成を通してこの回帰も検証する。

## 紙面の検証と画像化

実TeXによる紙面の上限検証と目視QAは[GENERATED_TEX.md](GENERATED_TEX.md#t20の検証マトリクスと目視qa)の手順を使用する。検証用PDFを残す環境変数はreal-tex結合テストだけが参照し、通常アプリには含めない。Node起動の`pnpm pdf:render`はmacOS PDFKitで全ページPNGと一覧を作る。

## 生成ジョブ（T21）

正式書類の生成はProjectの不変snapshot、書類種別、編集revisionを渡す非同期IPCで行う。Rustの`GenerationJobs`が待機と実行を管理し、入力確認→書類準備→コンパイルの段階を呼出元専用のTauri Channelへ通知する。全書類・暫定下書き・環境診断は同じコンパイルgateを使い、TeXの同時起動を防ぐ。実行中を含む最大8件を受け付け、超過は明示エラーにする。IPCの待機が破棄されても実行workerは完了までgateを所有し、二重起動を防ぐ。正式書類の操作キャンセルは下記T22の仕様を使用する。

フロントエンドは結果のprojectId／revision／kindを要求snapshotと照合してからPDFを読み込む。両書類の最後の成功PDFを別々に保持し、切替時は対象書類の結果を表示する。生成中も編集と書類切替を許可し、完了したPDFのrevisionが現在と異なれば「更新前の内容」と表示する。失敗・バイナリ読込失敗では直前の成功結果を維持し、再実行を許可する。新規／別JSON読込では結果を消す。新規・読込・終了・重複生成は生成完了まで待ち、JSON保存は生成中でも可能。完了後に遅れて到着した進行通知を無視し、前ジョブの通知で新ジョブを巻き戻さない。

Rust結合では並行ジョブの待機／失敗後の再実行、IPC future破棄時のgate保持、待機件数制限と枠の解放を確認する。UI結合では生成中編集・書類切替・書類別保持・古いrevision・結果照合・生成／読込失敗・再実行・新規時の消去を検証し、実macOS E2EでChannel接続と両書類の再表示を確認する。

## 生成のキャンセルと後始末（T22）

正式書類の各要求はランダムなjobIdを持つ。Rustは実行／待機中のIDだけを登録し、IDに対応するCancellationを停止する。IDはASCII英数字とハイフン、1〜128byteに限定し、重複は拒否する。IPCはPIDや任意コマンドを受け付けず、`cancel_generation`は既存の正式書類用permission内に限定する。

待機中の停止はWakerで待機futureを起こし、現在のTeX終了を待たずに取り除く。実行中は20msごとのプロセス監視で停止要求を確認し、macOSでそのコマンド専用のプロセスグループを停止する。タイムアウトはコンパイル開始から60秒。プロセス所有者のDropでも停止・waitを行い、I/O失敗を含む早期returnで子を残さない。親だけ正常終了して子が出力pipeを保持する場合も、グループを停止してからログreaderをjoinする。停止は一度だけ行う。

TeXの作業ディレクトリはTempDirで所有し、成功・キャンセル・タイムアウト・失敗で削除する。後始末の完了までworkerが生成gateを保持する。停止済みジョブはPDFを返さず、直前の成功PDFを保持する。画面の「生成を停止中」は要求受付後から生成IPCの終了まで表示し、編集を許可しつつ新規／開く／終了／再生成を待たせる。停止が生成完了と競合して既にIDが消えている場合はfalseを返し、正常に完了した結果を表示する。停止要求のIPC失敗は再試行できる。暫定下書きと環境診断は共通gateと既存の時間制限を使い、MVPの操作キャンセルは正式な両書類を対象とする。

Rust結合で待機停止の即時解放、実行停止、ID重複拒否／再利用、実shellの子プロセス停止と一時ディレクトリ削除を検証する。UI結合では待機／実行停止・停止IPC失敗と再試行・後始末待機・成功結果の保持と再生成を確認する。macOS E2Eは実Channelのコンパイル段階を監視し、実際の停止ボタンと限定IPCを通して成功PDFが置き換わらないことを確認する。

## PDF・TeXの書き出し（T23）

「書類を書き出す」でPDF／TeX一式と、表示中／両書類を選ぶ。現在のProject snapshotを用途別`export_documents`へ渡し、Rust側のネイティブフォルダ選択で保存先を決める。WebViewから保存パス、任意TeX、任意コマンドは受け取らない。現在の入力からPDFを生成するため、プレビューが更新前でもその古いPDFを保存しない。TeX一式はTeXの実行・診断を伴わずに生成する。

保存先に`履歴書.pdf`／`職務経歴書.pdf`、または`履歴書-tex`／`職務経歴書-tex`を作る。TeXフォルダはmain.tex、content.tex、同梱style、manifest.jsonと写真を含み、単独でコンパイルできる。名前が既にある場合は書類ごとにネイティブ上書き確認を表示し、「この書類をスキップ」で原本を残す。片方の失敗は他方を取り消さず、保存／スキップ／失敗とエラーをそれぞれ表示する。

PDFは同じ保存先の一時ファイルへ書込・syncしてから置換し、既存の権限を維持する。TeXは隣接一時フォルダへ一式を書込・syncしてから置換する。既存フォルダを退避し、置換失敗時はフォルダ全体を復元する。復元も失敗した場合は退避資源を削除せず、保持したパスをエラーで知らせる。symlink、書込不可の資源、生成資源以外のファイルが入ったTeXフォルダは置換しない。外部でコンパイルして補助ファイルを作ったフォルダには、別の保存先を選ぶ。これはクラッシュ後の自動復旧や外部アプリとの同時編集を保証する仕組みではない。

書き出し中も入力を編集できるが、追加編集は出力へ反映されない。完了時にその旨を表示する。新規／開く／終了／重複生成は完了まで待ち、最後の成功プレビューは変えない。保存先選択のキャンセルは結果を作らない。プレビュー生成と同じGenerationJobsの直列gateを使い、PDFコンパイルは各書類60秒の期限を適用する。現在の書き出しには操作キャンセルボタンを設けず、プレビュー生成の停止操作と分ける。

Rust outputs結合テストは実ファイルでPDFの置換失敗・原本保持、TeX一式／写真／manifestの保存、全体復元、復元失敗時の原本退避先の保持、未知の資源／symlink／読取専用の拒否、両書類と部分成功・上書き選択を検証する。UI結合は出力対象と形式、保存／部分成功／スキップ／キャンセル／失敗／編集中のsnapshotと操作待機を確認する。

macOS E2Eには実IPCで両書類のPDFを保存・文字抽出し、上書きスキップで原本が同じこと、両TeX一式の実latexmkコンパイルを確認する経路を追加した。desktop-e2e featureだけが`RESUME_STUDIO_E2E_EXPORT`の所有一時フォルダでpickerを代替し、上書き確認はスキップを選ぶ。本番は環境変数を解釈しない。macOS実アプリで全経路PASS、全品質ゲート101テストとdoc-testも成功。ネイティブダイアログの実操作はT28で補完する。

## 診断と失敗からの復旧（T24）

診断は実行ファイル3種、同梱テンプレートのパッケージ、regexpatch、日本語の通常／太字フォント12資源を確認する。パッケージ・フォント不足ではPDF生成を実行せず、不足した資源を表示する。Rust結合でmissing dependencyとコンパイル未実行を確認し、manifestの各パッケージが診断対象であることを検証する。

生成／保存／終了前の保存／書き出し／診断の失敗は共通の対処表示を使う。既存IPCの先頭行末にある既知エラーコードだけを解析し、その後のログを折りたたんで表示する。構造化された診断にも同じ表示を使い、ログ内のコード風文字やHTMLは実行・分類しない。ログは既存のRust出力上限を維持し、画面では高さを制限して読む。

UI結合でTeX未検出・時間切れ・コンパイル失敗の対処と成功PDF保持、再生成の回復、パッケージ／太字フォント不足、ログの開閉とHTMLの文字表示を確認する。既存のJSON保存失敗／原本保持／未保存状態と別名保存のテスト、出力の部分失敗と再実行も品質ゲートに含む。macOS E2Eで実TeX環境診断→日本語PDF→両書類の生成と保存まで成功を確認した。利用者向け対処は[TROUBLESHOOTING.md](TROUBLESHOOTING.md)を参照する。

## 保存ショートカット（T33）

Cmd/Ctrl+Sで保存、Shift付きで名前を付けて保存する。現在の入力と保存先を既存のsave_projectへ渡し、保存中の追加入力は従来どおり未保存として維持する。compositionイベント中、isComposing、229 keyCode、Alt付き、他の入力処理がpreventDefaultしたキーは処理しない。ファイル操作／読込／破棄確認中はキーによる保存を抑止し、同時の複数キーは同期refで重複保存を防ぐ。

UI結合で氏名と本文エディタからの保存、別名保存、IME抑止、連続キー、保存中の追加編集と確認中の抑止を検証する。macOS E2EはWebDriverのMeta+Sから実WebView／IPC／Rust保存を通す。WebDriverはDOM KeyboardEventを送るため、OSの物理キーとIME変換の組合せはT28で補完する。

## JIS形式TeX履歴書の紙面改善（T34）

Web上の多摩通信社／shigioのTeX履歴書を参照し、標準履歴書1.1.0を追加。旧版を保存したJSONは同じ1.0.0を使い、新規の既定を1.1.0とする。紙面の寸法と参照元は[TEMPLATE_REFERENCE](TEMPLATE_REFERENCE.md#7-jis形式を参考にした履歴書110t34)、出力契約は[GENERATED_TEX](GENERATED_TEX.md)を参照。既存プロジェクトはテンプレート選択から新版へ変更する。

実TeX10件は新版で空／通常のA4・2ページ、最大固定項目、64KiB本文、縦長／正方形／横長JPEG・PNG／写真なし、長文と続紙、TeX一式の独立コンパイルを確認。通常／空の全2ページと最大固定項目の全12ページをPDFKitで画像化し目視QA。旧版の資源を保持し、新版へ同じ本文を渡して出力する契約も結合テストで確認した。品質ゲートと実WebViewのPDF描画・TeX/PDF書き出しを確認する。QA成果物はリポジトリへ同梱しない。

## 参照原本の紙面への再調整（T35）

参照7ページを再レンダリングし、ラベル座標とフォント寸法を測って履歴書1.2.0／職務経歴書1.1.0を追加。原本の本文や写真は収録せず、架空fixtureで紙面を確認する。Regularフォントとscale=1、氏名の横配置、写真の位置と枠線、履歴行数／行高、自由欄の配分、案件名と期間の同一行を調整した。旧版を保持し、新規のみ新版を既定にする。詳細と原本との相違の範囲は[TEMPLATE_REFERENCE](TEMPLATE_REFERENCE.md#8-参照原本への再調整t35)を参照。

実TeX10件と品質ゲート、macOS実WebView E2E、通常.appビルドが成功。両新版の通常／架空サンプルと最大固定項目15ページを画像化して確認した。TeX独立書き出しをコンパイルし、旧版の選択と本文保持も結合テストで確認。QA成果物はリポジトリへ収録しない。

## C案の画面構成（T38）

[画面別の画像とプロンプト](ui-layout-proposals/screens/README.md)を基に、公式shadcn/uiとTailwind CSSを導入した。コンポーネントの取得設定は`components.json`、ローカル実装は`src/components/ui`、テーマと配置は`src/styles.css`で管理する。上部の保存操作、書類別の項目、幅調整可能なPDFプレビュー、書き出し／設定／未保存確認のDialogを実装する。TeXテンプレート・IPC・Project契約は継続する。

`EditorSection`は非表示の内容もマウントして本文とUndo履歴を保持する。書類ごとの折りたたみ状態と最後に成功したPDFを保持する。PDFプレビューは見開きを既定とし、幅合わせと倍率を切り替える。テンプレート一覧は「テンプレート一覧を確認」から取得する。職務要約だけの下書きPDFは保存ボタン横のメニューへ移した。生成状態と失敗はプレビュー側で表示する。

写真の登録・選択・削除UIは履歴書の基本情報だけに表示する（T39）。共通プロフィールに保存した写真データは書類の切替や職務経歴書側からの保存でも保持する。

## 画面のスクロール境界（T40）

画面ルート（html/body/#root）はbodyを固定し、ウィンドウの寸法内でoverflowを隠し、overscroll-behaviorをnoneにする。編集パネル・PDF・textarea・ダイアログ・エラーログもnoneを指定し、内部スクロールを残して端でのバウンドと親への伝播を抑える。従来のcontainは内部のバウンドを許すため置き換える。CSSの挙動は[WebKitのOverscroll Behavior実装](https://bugs.webkit.org/show_bug.cgi?id=176454)を参照。

実WebViewのE2Eは通常幅と680px幅でルートの寸法・スクロール位置・適用済みCSS、狭い画面で編集/PDFの内部スクロールを確認する。プログラムによるスクロール確認であり、物理トラックパッドの二本指ジェスチャーや旧macOSの挙動を代替しない。

## 自動PDF生成（T41）

設定の「PDFを自動生成する」は既定OFF。アプリのlocalStorageへ真偽値だけ保存し、プロジェクトの内容や保存revisionには影響しない。ON時は読込後/各書類初回表示に生成し、以後は2秒入力が止まった時に表示中の書類を更新する。IME変換中と生成/ファイル操作/破棄確認中は待機。生成中の追加編集は完了後に再生成し、手動生成・失敗・停止の同じrevisionは繰り返さない。OFFで未実行タイマーを解除し、進行中の生成は既存のキャンセルで停止できる。設定保存失敗時は今回の起動中だけ適用する旨を表示する。

## PDF表示設定の保持（T42）

見開きON/OFFと画面に合わせる/指定倍率は履歴書・職務経歴書ごとにDraftWorkspaceで保持し、PdfPreviewへ制御値として渡す。PDFのresultIdによる再マウントは維持し、表示設定は手動/自動の再生成や書類切替でも維持する。Project JSONや保存revisionには含めない。

T43では表示中ページも書類ごとに保持する。新しいPDFを読み込んだ後、保持した番号を実際のページ数以内に補正してから描画する。ページ数が減った場合は最終ページを表示し、その番号を保持する。見開きONでも先頭の表示ページ番号を保持する。

## 職務経歴書の独立資格（T44）

資格編集の共通UIは選択書類のqualificationsへ接続する。データはresume/careerで分離し、新規は空欄。旧JSONのcareer.qualifications省略だけをTS/Rustで独立配列へ正規化し、全行IDとの衝突を避ける。generatorはcareer.qualificationsだけを職務経歴書へ出力し、年月を「N年M月 取得」へ整形する。未入力は取得表記も省略する。

## 動的な書類日付（T45）

基本情報の書類日付設定で指定日/今日を選ぶ。省略時は指定日で、documentDateModeだけを追加保存し元のdocumentDateは切替時に保持する。UIはローカル日付を日跨ぎと復帰時に再評価して満年齢へ反映する。Rust generatorはPDF生成/書き出し時にchrono::Localから当日を解決し、両書類の日付と履歴書の年齢に同じ値を使う。日跨ぎは編集revisionを変更せず、今日モードだけ自動PDFの試行キーに当日を含めて追従する。

T46では書類日付の選択を「今日の日付を使う」チェックボックスへ変更する。ONはtoday、OFFはfixedへ対応させ、指定日・設定保存・動的な日付の解決はT45と同じ。

## 履歴書の固定欄調整（T47）

履歴書1.2.0の紙面不具合を修正する。電話の9pt中央配置、Email/自由欄タイトルの1mm余白、年齢後の縦罫線除去、以上を含む9.5mmの固定行、欄幅超過時の文字縮小は[TEMPLATE_REFERENCE](TEMPLATE_REFERENCE.md#9-固定欄の表示不具合修正t47)に従う。実ボックスとPDF文字寸法の検証および紙面QAを行う。

T48は基本情報・現住所・別連絡先を蓄積してResumeFinishで一体描画する。項目間の外側余白と二重枠を除去し、外枠/生年月日下を1.2pt、住所間を0.4ptにする。他の履歴書セクション外枠も1.2ptで統一。写真・長文続紙の扱いを維持する。

T49は名前欄にだけラベル/氏名ボックスの垂直中央揃えを適用する。名前・両連絡先のふりがなは欄幅を測定し、超過した場合だけ通常9ptから文字を縮小する。電話との境界位置、太枠、9.5mm履歴行を保持する。

T50では生年月日と年齢を同じ領域へ置き、性別の手前を0.4ptの縦罫線で区切り、満年齢を括弧で囲む。空の年齢は空欄のまま。基本情報の連結太枠と写真位置、ふりがな縮小を維持する。

T51は生年月日と括弧年齢の共有セルを右揃えとし、左右2mm余白を保って右へ配置する。性別の縦線と中央配置、欄寸法を維持する。
右揃えで初期化されるrightskipを2mmへ戻し、年齢と性別の縦罫線の間に余白を確保する。

T52は電話の日本語ラベルと数字の字面の高さの違いを補正し、個別の組版ボックスを縦中央で合わせる。履歴書の月列は保存値YYYY-MMを維持し、生成時だけ先頭ゼロを除去する。

## プレビュー右下のズーム操作（T53）

倍率selectをshadcn/ui Button/ButtonGroupの−・倍率・＋・幅合わせへ置き換えた。プレビュー右下に固定し、倍率の枠線もボタンと同色。通常/ピンチ中は半透明、hover/キーボードフォーカス時は濃く表示し、ピンチ案内文は表示しない。25〜200%と書類別保持を維持し、WebKit GestureEvent/Ctrl付きwheel/2指タッチで操作する。実WebViewで配置・枠線・実PDF描画・透明度を検証し、物理トラックパッド操作は別確認とする。設計はADR 0002、検証境界はTESTINGとADR 0004へ記録。

## 職務経歴書の見出しと期間表示（T54）

職務経歴書の1.2.0を追加して新規プロジェクトの既定にし、既存1.0.0／1.1.0の出力を保つ。書類タイトルとセクション見出しの文字・罫線間に余白を設け、スキル説明だけを行内で垂直中央へ配置する。T61で、スキル経験期間への「年以上」の補完は数字のみ（半角・全角）に限定する。「3年」などの自由入力はそのまま表示する。会社・案件期間は保存値`YYYY-MM`を維持し、PDFで「YYYY年M月」と表示する。設計・受け入れ条件と紙面確認は[TEMPLATE_REFERENCE](TEMPLATE_REFERENCE.md#15-職務経歴書の見出しと期間表示t54)を参照。

## スキル説明の行内中央配置（T55）

スキル行の余白をセルの高さへ含め、説明を行全体の中央へ配置する。一行／複数行の名前と説明についてNode／PDF.jsの文字座標から行中央と説明中央の差を検証し、画像化して確認する。資格は`CareerQualification`で従来の配置を保持する。T54の検証が文字の有無と長い名前に対する見た目だけだったことを訂正し、一行の通常例も座標で検証する。

## スキル行の高さと罫線余白（T56）

最小行高14mm、上下余白2mmを明示し、一行・説明空欄・二行の短い内容でも同じ高さを保つ。長い内容は上下余白を残して拡張／分割する。左列は余白内で上寄せ、右列は中央に配置する。自動行間を除去し、点線の前後で余白が変化しないようにする。資格の配置は維持する。実PDFの連続する行の高さ・説明中央・上下余白を座標で検証し、通常／空／長文のコンパイルと画像確認を行う。

## 免許・資格の共通行高（T57）

職務経歴書1.2.0の免許・資格はCareerSkillと同じ組版を使い、最小14mm・上下2mmの余白に統一する。資格名は上寄せ、取得年月は縦中央とし、年月が空欄でも行高を保つ。長文は内容に合わせて拡張／分割する。T55／T56の資格配置保持はこの追加指定で置き換える。実PDFでスキルと資格の行高・取得年月の中央・余白を測定し、画像で紙面を確認する。

## 先頭スキル行の重複余白（T58）

スキル見出し専用のCareerSkillsSectionを追加し、下罫線後の外側余白を0mmとする。先頭行のセル内2mmだけで罫線との間隔を確保し、従来の3mmとの重複を除去する。他のCareerSectionは罫線後3mmを保持し、旧版の生成マクロも保持する。最小14mm、右列中央、資格の共通配置は維持する。実PDFの見出し罫線から先頭スキル本文まで2mmであることを座標で検証し、画像化して確認する。

## 経歴要約の上余白（T59）

職務経歴書1.2.0のCareerSummarySectionで経歴要約の上余白を7mmから5mmへ縮小する。他の見出しの上余白7mmと罫線前後の余白、旧版は保持する。実PDFと画像で確認する。

## 学生時代の研究（T62）

職務経歴の後に任意の研究一覧を設ける。既存案件と同じ本文/言語/技術入力・追加/並べ替え/削除操作を使い、未入力の研究はPDFへ出さない。省略可能なcareer.researchesで旧JSONの読み込みを維持する。
