# テスト方針と実行

結合テストを中心に、保存は実FS、プロセス停止は実子プロセス、成功するPDF生成は実TeXで確認する。Unitはエスケープ、本文変換、日付・年齢、revision、エラー解釈など重要なロジックに使う。UIのIPC mockと実WebViewの検証は分けて報告する。

## ゲート

リポジトリルートから実行する。

| コマンド | 境界と内容 |
| --- | --- |
| `pnpm check` | Oxlint/Oxfmt、TS、Rust fmt/check/Clippy、以下のNode・UI・Unit・Rustテスト |
| `pnpm test:tasks` | Node.js。JSONL、ダッシュボード検索／再読込／HTTP、実メタデータを使う改名ツール |
| `pnpm test:integration` | Vitest＋Testing Library＋実Tiptap。Tauri mockIPCで入力／復元／保存／生成／エラー／出力を検証 |
| `pnpm test:unit` | Vitest。日付・年齢、保存revision、PDFWorker所有権、エラー解釈 |
| `pnpm rust:test` | Cargo。実FSのJSON／写真／bundle／出力、失敗注入・原本復元、Schema、ジョブ、実プロセス |
| `pnpm test:tex` | real-tex featureのreal_tex target。実TeXがなければ失敗し、skipしない |
| `pnpm build:e2e` → `pnpm test:e2e` | desktop-e2e featureの.appと実macOS WebView／IPC／FS／TeX／PDF.js |
| `pnpm tauri build --debug` | テストfeatureを指定しない通常.app |

Rust個別targetは`src-tauri/tests`の実ファイル名を使う。たとえば`cargo test --manifest-path src-tauri/Cargo.toml --locked --test documents`。feature付きClippyは`cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --features desktop-e2e,real-tex -- -D warnings`。同じtargetディレクトリのCargo処理は直列実行する。

## 主な異常系

壊れたJSON、未知Schema／属性／本文node／mark、日付・期間・参照、容量・深さ、画像実体とMIME、非対応テンプレート版を検証する。保存・出力では書込失敗、置換失敗、復元失敗、symlink／読取専用、未知資源、部分成功を確認する。

生成ではTeX未検出、依存不足、コンパイル失敗、タイムアウト、待機／実行中キャンセル、大量ログ、子・孫プロセス停止、通常親終了後の残存プロセスを検証する。UIでは生成・保存中の編集、古いジョブ結果、成功PDF維持、新規／開く／終了確認、IME合成イベントと保存キーの競合を確認する。

確定的な環境異常にはテスト用実行プログラムを使う。その成功は実TeX成功として扱わない。実TeXゲートとネイティブE2Eを別に通す。

## PDFと紙面

スキル経験期間（T61）は単体と生成結合で半角／全角の数字、前後空白、空欄と「3年」「約3年」「半年」「3年6か月」などの自由入力を検証する。旧テンプレート版の表示を保持する。実TeXの`career_skill_experience_renders_digits_and_free_text`で「数字のみ→X年以上」と自由入力の全文保持をPDFから抽出して確認し、画像化して紙面を目視する。

PDFバイナリsnapshotは使わない。テンプレート版と同一入力に対するTeXゴールデンで安定性を確認し、PDFは全文、順序、A4寸法、ページ数、リンクannotation、写真の物理位置と縦横比、欠字・Overfull警告を検証する。

空／通常の両書類、続紙、長いスキル／会社／案件／URL、各固定項目最大長、本文64KiB（日本語／区切りなし英数字）、mark境界、各写真形状を実コンパイルする。最大件数と最大本文長の全組合せを成功保証するものではなく、全体容量と60秒制限を別に適用する。

紙面変更時は架空fixtureのPDFを画像化し、各ページと一覧画像を目視する。Node.jsからmacOSのSwift/PDFKitで描画する。Pythonは使用しない。[TeX契約のQA手順](GENERATED_TEX.md#t20の検証マトリクスと目視qa)に従い、本人データやQA生成物をGitへ追加しない。

## ネイティブE2Eの境界

`tools/desktop-e2e.mjs`のNode.jsが同梱.appを最小PATHで起動し、WebdriverIO standaloneからembedded W3C serverへ接続する。実写真取り込み、JSON保存／移動／終了／再起動／復元、両書類と下書きのPDF描画・文字抽出、診断、キャンセル、両PDF／TeX書き出し、独立コンパイル、未保存終了と保存を確認する。

OS pickerと上書き選択はテストfeatureのadapterで置き換える。日付・年月・倍率の一部はDOMの値変更イベントを使用する。driverのkeyboard actionsもDOM KeyboardEventであり、物理キーや日本語IMEを代替しない。アプリの生成・保存・プロセス・PDF描画は代替しない。[ADR 0004](adr/0004-desktop-e2e.md)に詳細を記載している。

日本語IMEの基本入力はT08でユーザー確認済み。最終受け入れT28では10ページ相当の編集／Undo/Redo／compile中入力と、アプリ単位の外部通信遮断をE2Eで補完する。ネイティブダイアログ、物理保存キー／IME、PCのネットワーク断は[受け入れ記録](ACCEPTANCE.md)に従って別に確認する。未確認のケースを自動E2Eの成功だけで完了扱いにしない。

## CI

書き出しボタン（T60）は`preview.test.tsx`でスピナー・全件保存成功のチェックマーク・3秒後の解除・ダイアログ自動閉鎖・フォーカス復帰・結果確認案内なしを確認する。部分失敗／スキップ／キャンセル／例外で成功表示にならないことと、書き出し中の編集通知・再実行を確認する。実WebView E2Eはダイアログを再度開いてPDF／TeXの保存と上書きスキップを検証する。

[CI workflow](../.github/workflows/ci.yml)はfrontend-quality（Ubuntu）、rust-quality（macOS）、desktop-e2e（macOS）、required-checksで構成する。実TeX、通常bundleもdesktop-e2eに含む。required-checksは3品質ジョブの全成功を要求し、失敗・キャンセル・skipを拒否する。現行ゲート、固定版、導入・再現方法は[CI](CI.md)を参照する。

CIの入力と診断ログには架空データだけを使用する。現行workflowは専用artifactをアップロードしない。紙面QAのPDF／画像は指定したローカル一時ディレクトリへ保存する。署名・公証・公開ReleaseのチェックはMVPには含めない。

## C案UIの検証（T38）

UI結合は項目を開いて既存の保存・写真・履歴・会社・案件・スキル・生成・診断・出力・未保存確認を通す。`layout.test.tsx`で項目と書類の往復後の入力・本文書式・Undo履歴、意図しない自動生成がないことを検証する。本文は折りたたみ後も同じDOMを保持する。

jsdomはレイアウトを計算しないため、ResizeObserverとPointerEventを補い、Resizableのハンドルにだけ固定矩形を返す。全要素がゼロ矩形だとライブラリが入力へのクリックを境界操作として捕捉するための補正であり、幅合わせ・ドラッグ・実PDF描画の証明には使わない。

`pnpm build:e2e`後の`pnpm test:e2e`は実macOS WKWebViewで書類タブ・項目・メニュー・モーダルを操作し、実TeX生成、PDF.js描画、生成中の編集、停止、診断、JSONとPDF/TeXの保存、終了確認を検証する。`RESUME_STUDIO_UI_QA_DIR=/private/tmp/resume-ui-qa pnpm test:e2e`で架空入力の画面スクリーンショットを保存できる。成果物は目視QA用でリポジトリへ同梱しない。日付／selectの操作は既存ADRのnative setter adapterを使い、本番IPCとレンダラは置換しない。

T38の検証結果: `pnpm check`で116件（Node 9 / UI結合36 / UI単体12 / Rust 59）とdoc-testが成功。実WebView E2Eはデスクトップの境界寸法、キーボードでの幅変更、680pxでの上下配置、PDF幅合わせも検証する。埋め込みWebDriverのクリックはMouseEventのため、PointerEventで開くRadixメニューは実際のArrowDownキー経路を使う。Dialogの存在とフォーカス、ネイティブ描画の完了を待って確認する。検証用ビルドと通常の`pnpm tauri build --debug`も成功した。

## 自動PDF生成（T41）

`auto-pdf.test.tsx`はTauri mockIPC・描画コンポーネントの代替・仮想時間で既定OFF、設定保持、読込/再読込、両書類初回表示、連続入力のdebounce、IME待機、生成中の編集の後続反映、OFF、失敗/キャンセルの再試行抑止、停止要求失敗後の追従、手動更新を確認する。実WebViewの`AUTO_PDF`は設定ON、両書類の初回生成、入力停止後の実TeX/PDF描画、JSON再読込での生成、OFF設定を確認する。物理IMEは既存の手動受け入れ境界と同じ。

実WebViewの操作はダイアログ閉鎖完了と書類タブの実際の切替を待つ。前面化はAppKitで検証が所有するPIDを直接指定し、描画・RAFは置換しない。

## 動的な書類日付（T45）

UI結合では指定日/今日の保存再読込、指定日の復元、翌日の復帰時の日付と年齢、日跨ぎ後の自動生成と固定モードの非生成を確認する。時計の変更は仮想時間であり、実PDFはRustのローカル時計で両書類と年齢を検証して画像化・目視確認する。

## 履歴書の固定欄（T47）

実TeXテストで短い行・長い行・以上の実ボックスが罫線込み9.5mmになることを検証する。日本語と英数字の長い学歴/職歴/資格について、実PDFの全文保持、2ページ/A4、文字縮小と欄内の左右位置、電話と現住所ラベルの同じ文字寸法をPDFKitで確認する。空/通常/続紙/最大長の既存テストを通し、画像でタイトル余白・電話中央・年齢後の縦線除去を確認する。

T48では実TeXの既存13テストで通常/空欄/最大長/写真/続紙の全文保持・寸法を確認し、画像で基本情報/住所の連結、太い外枠と生年月日下、細い住所間境界、電話欄の整列を確認する。

T49は実PDFの通常/空欄で名前ラベルの垂直中央を目視し、長い名前/現住所/別連絡先ふりがなの全文保持と実際の文字幅の縮小を固定欄結合テストで検証する。最大長・写真・続紙の既存実TeX検証も通す。

T50は通常/空欄の実PDFで年齢の括弧と空欄保持、生年月日と年齢の間に縦線がなく、性別だけが全高の縦罫線で区切られることを確認し、最大長の性別の続紙退避と全文保持を既存実TeXテストで検証する。

T51は実TeXの既存13テストを通し、通常/空欄のPDF画像で生年月日と年齢の右配置、性別の縦線と欄高を確認する。
年齢右端と性別罫線の間の2mm余白も紙面で確認する。

T52は履歴書の3種類の履歴欄について2月/10月/空欄を生成結合テストで検証し、通常/空欄の実PDF画像で電話番号の垂直中央とふりがなとの罫線位置、月列を確認する。

## プレビューのズーム（T53）

UI結合は＋/−の25〜200%境界、キーボード、幅合わせからの変更、書類別の倍率/ページ保持、再生成、Ctrl付きwheel、累積WebKit gesture、重複イベント抑止、2指タッチとキャンセル後の1指操作を検証する。実WebView E2Eはshadcnボタンをクリックして実PDF描画を確認し、右下24pxの固定配置、スクロール後の配置、倍率を含む全枠線色の一致、案内文の非表示を確認する。合成WebKitイベントによる再描画も検証するが、物理トラックパッドの操作は代替しない。画面はRESUME_STUDIO_UI_QA_DIRに保存して目視する。

T53追加：非操作時0.55、キーボードフォーカス時1、ピンチ中0.55の透明度を実WebViewで確認する。埋め込みdriverのDOM mousemoveではネイティブ:hoverが変わらないため、ホバーはCSS規則も確認する。UI結合はgesture/touch開始終了とwheel停止後の状態解除を確認する。

## 学生時代の研究（T62）

UI結合で追加・自由入力・本文書式・並べ替え・削除・保存復元を確認する。TS/Rustで旧JSON、件数上限、ID重複、本文容量を検証し、生成結合で職務経歴の後の表示順・空欄非表示・旧テンプレート対応を確認する。実TeXで研究本文と長文の改ページ、A4、欠字/Overfullなしを確認し、PDFを画像化して目視する。

## 編集アコーディオンの順序（T63）

既存の全項目編集・保存復元のUI結合で、履歴書の5項目と職務経歴書の7項目の表示順を確認する。書類別の免許・資格の入力と開閉状態が切替後も保持されることを確認する。

## 軽量Web版（T65/T66）

`tests/integration/web.test.tsx`で実Tiptapとfake-indexeddbを使い、共通全項目JSONの読込→編集→ダウンロード→再読込、下書き復元、保存順序、古い保存完了、読込/保存失敗時の保持、未保存確認、表示切替とIMEキーを検証する。写真正規化は`tests/unit/browser-photos.test.ts`、5MiB base64と不正文字/paddingは共通Project単体で検証する。Mac UI回帰、両ビルド、Lint/型/書式を通す。公開物にTauri/PDF/TeX/fixtureを含めず、公開HTTPSとCSPを確認する。実Safariと390pxの表示を目視し、実iPhoneのキーボード/ダウンロードは未検証境界として報告する。詳細は[WEB](WEB.md)。
