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
| `pnpm test:tasks` | JSONL・ダッシュボード・localhost HTTPの6テスト |
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
