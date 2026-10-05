# テスト・GitHub Actions方針

## 1. 基本方針

外部との境界を実際に通るIntegrationテストを中心にする。保存・読込では一時ディレクトリの本物のファイル、PDF生成では実TeXを使う。Unitテストは変換・検証・状態遷移など、誤りの影響が大きいロジックを狙う。

ブラウザ内でIPCをmockしたテストと、実Tauri／実TeXのテストは分けて報告する。前者だけでデスクトップアプリ全体を検証したとは扱わない。

## 2. レイヤーと主要ケース

| レイヤー | ツール案 | 必須ケース |
| --- | --- | --- |
| UI結合 | Vitest＋Testing Library | フォーム・エディタ・編集状態・IPC adapter連携、テンプレート選択、JSON復元、診断表示 |
| Rust結合 | cargo test、一時FS | JSON往復、写真展開、保存失敗、版不整合、生成bundle、既存ファイル維持 |
| 実TeX結合 | cargo testの専用target、latexmk/LuaLaTeX | 日本語、特殊文字、空欄、太字・斜体・リスト、両テンプレート、複数ページ、写真 |
| デスクトップE2E | WebdriverIO＋Tauri embedded WebDriver | 入力→保存→終了→再起動→読込→実PDF生成→出力、本文書式・写真の維持 |
| Unit | Rust／Vitest | TeX escape、AST visitor、日付・容量検証、migration、revision・ジョブ状態遷移 |
| 手動受け入れ | 実macOS | IME、native dialog、bundleのTeX検出、紙面品質、オフライン |

UI結合テストでは安定したadapterを差し替え、コンポーネント内部やDOM構造の細部をmockしない。保存成功・失敗など利用者の観測できる結果を確認する。

## 3. 重要な異常系

- 壊れたJSON、未知のschemaVersion、未知の本文node/mark、未対応template版。
- 写真の不正base64、実体とMIMEの不一致、容量上限超過。
- 保存先書込失敗、置換失敗、一時書込後の中断。失敗注入はstorage境界で行い、実FSの往復も別に確認する。
- TeX未検出、パッケージ／フォント不足、コンパイル失敗、60秒超過、キャンセル。
- 生成中に編集、生成後に再編集、古いjobの遅延完了、両書類の片方のみ失敗。
- スペース・日本語を含むパス、TeX特殊文字を含む入力、巨大な標準出力、子プロセス停止。

TeX未検出などの確定的な異常系はテスト用実行adapterを使えるが、成功フローと中断処理は実プロセスでも検証する。

## 4. PDF検証

PDFのバイナリsnapshotは使わない。生成日時・内部ID・TeX版で差が出るため、検証対象を分ける。

1. TeX：正規化した期待ファイルとの比較で変換の退行を検出する。
2. PDF：ページ数・A4寸法・日本語の期待文字列・終端の目印を確認する。ページ数は代表fixtureだけ固定し、長文は内容維持と妥当な範囲を確認する。
3. ログ：Missing character、エラー、固定fixtureでの重大なOverfull警告を失敗にする。許容例外は理由と範囲を明記する。
4. 紙面：固定TeX環境でPDFを画像化し、テンプレート変更時に目視する。通常・長文・写真なしを対象にする。

テスト専用のPDF抽出／画像化ツールはCIへ導入する。利用者のPCにはアプリ実行に必要なTeX環境だけを要求する。

## 5. CIジョブ

| ジョブ | runner | チェック内容 |
| --- | --- | --- |
| frontend-quality | Linux | 固定pnpm＋frozen lockfile、Oxlint、Oxfmt、tsc、UI結合・重要Unit、Vite build |
| rust-quality | macOS | 固定Rust、cargo fmt、cargo check、Clippy、TeX不要の結合・Unit |
| tex-integration | Linux | 固定したTeX環境、日本語パッケージ・フォント、実TeXの専用結合テスト、PDF抽出・ログ確認 |
| desktop-e2e | macOS | 本物のTeX環境、テスト用Tauriビルド、embedded WebDriver、実IPC・実FS・実PDFフロー |
| desktop-build | macOS | production設定のTauri bundle生成、資源同梱、テスト用プラグイン除外 |

macOS先行でも、純粋なフロント処理とTeXテンプレートはLinux CIで検証する。Linuxのアプリ対応を意味しない。

起動条件は`pull_request`、既定ブランチへの`push`、`workflow_dispatch`。PRで必要なCIは署名鍵や外部サービスのsecretなしで動かす。通常CIのpermissionsは`contents: read`。Releaseの作成や公開は別workflowとする。

キャッシュはpnpm storeとCargoをlockfile・toolchain・OSで分ける。TeX環境は固定版または固定イメージdigestを使い、macOSの環境も版情報を記録する。Actions参照はレビューしたcommit SHAへ固定する。

失敗時だけ架空データのコンパイルログ・PDF・スクリーンショットを短い保持期間でartifactにする。全テストジョブを集約する必須statusを用意し、依存ジョブの失敗・キャンセル・未実行を成功扱いにしない。実TeXジョブはTeX未検出を理由にskipしない。

## 6. 開発コマンドの契約

実装時にpackage scriptsとCargo taskへ対応付ける。以下は予定コマンドであり、現時点では実行できない。

```sh
pnpm lint             # oxlint
pnpm format:check     # oxfmt --check
pnpm typecheck        # tsc --noEmit（分割tsconfigなら各対象を確認）
pnpm test:integration # vitestのUI結合テスト
pnpm test:unit        # 重要ロジック
pnpm build            # Vite production build
pnpm test:e2e         # Tauri＋実TeXのdesktop E2E
cargo fmt --all --check
cargo check --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --lib --test storage --test generator
cargo test --locked --test tex_integration
```

Cargoコマンドは`src-tauri`をcwdとして実行する。専用test target名は基盤構築時に決める。check/clippyはデスクトップの既定featureを対象にし、全featureを無条件に混ぜて本番で不要なテストプラグインを有効にしない。

Oxlintの型情報を使う追加ルールは導入可能だが、Lintの成功をTypeScript型チェックの代わりにしない。OxfmtはRustの整形を担わず、rustfmtを別途実行する。

## 7. E2E上の注意

現行の[Tauri公式WebDriver資料](https://v2.tauri.app/develop/tests/webdriver/)では、WebdriverIO＋`@wdio/tauri-service`のembedded方式でmacOSを含む実機テストが可能。直接`tauri-driver`を使う方式はWindows/Linux向けのため、MVPのmacOS CIはembedded方式でM1に検証する。

テスト用WebDriverプラグインは明示的なtest featureでのみ有効にする。production buildには制御サーバーを含めない。native dialogの自動化が難しいケースではテスト用adapterを使い、dialogを含めた保存・読込は手動受け入れで補完する。E2Eでmockした境界を記録する。

M1で成立しない場合は、理由・代替候補をADRに記録する。UI結合＋Rust実TeX結合で進捗は継続できるが、実macOS全フローの受け入れ確認を省略しない。
