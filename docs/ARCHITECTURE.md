# アーキテクチャ初期案

## 1. 処理の流れと責務

```text
React：基本情報フォーム＋Tiptap本文編集
  → バージョン付きProject JSON
  → Tauriの用途別コマンド
  → Rust：検証 → 書類モデル → TeX生成＋同梱テンプレート
  → Rust：隔離した作業ディレクトリ → latexmk → LuaLaTeX
  → 生成結果ID → PDF.jsプレビュー／PDF・TeX出力
```

生成ロジックはTauriに依存しないRustライブラリへ分離する。フロントエンドは編集と表示、Rustはデータの最終検証、保存、生成、外部プロセス管理を担当する。TeX生成をTypeScriptとRustの両方に重複実装しない。

まず1つのRust crate内の独立モジュールで始める。別crateやCLIへの抽出は必要になった時点で行う。Node.jsのランタイムやTeXバイナリをアプリに同梱しない。

## 2. 推奨構成

```text
src/
  domain/                  # Project型、UI側検証、編集モデル
  editor/                  # 本文エディタ、限定した拡張と変換
  features/                # 履歴書、職務経歴、ファイル、プレビュー
  infrastructure/          # 型付きTauri clientとテスト用adapter
src-tauri/
  src/
    domain/                # serdeモデル、検証、migration
    generator/             # エスケープ、書類モデル、TeX生成
    storage/               # 原子的JSON保存、asset処理
    compiler/              # 環境診断、ジョブ、プロセス管理
    commands/              # Tauri用薄いadapter
  templates/
    resume-standard/       # manifest.json、main.tex、共通部品
    career-standard/
  tests/                   # 本物のFS・生成・コンパイル結合テスト
tests/
  fixtures/                # 架空JSON、写真、期待TeX
  integration/             # UIとadapterの連携
  e2e/                     # デスクトップの主要フロー
docs/
.github/workflows/
```

テンプレート資源はビルド時に同梱し、bundleからも必ず取得できるようにする。開発時のcwdやリポジトリ内の絶対パスに依存しない。

## 3. Project JSON

JSONは唯一の編集データ。生成TeX、PDF、絶対パス、コンパイルログはプロジェクトに保存しない。1ファイルを移動するだけで内容と写真を引き継げる。

以下はデータの形を示すサンプルであり、正式なJSON SchemaはM2で作成する。

```json
{
  "schemaVersion": 1,
  "projectId": "sample-project",
  "title": "応募書類サンプル",
  "documentDate": "2026-10-05",
  "profile": {
    "name": "山田 太郎",
    "nameKana": "やまだ たろう",
    "birthDate": "1990-04-01",
    "postalCode": "100-0001",
    "address": "東京都千代田区（架空住所）",
    "phone": "090-0000-0000",
    "email": "sample@example.com",
    "photoAssetId": null
  },
  "resume": {
    "education": [],
    "employment": [],
    "qualifications": [],
    "motivation": { "type": "doc", "content": [] },
    "preferences": { "type": "doc", "content": [] }
  },
  "career": {
    "summary": { "type": "doc", "content": [] },
    "positions": [],
    "skills": [],
    "selfPromotion": { "type": "doc", "content": [] }
  },
  "templates": {
    "resume": { "id": "resume-standard", "version": "1.0.0" },
    "career": { "id": "career-standard", "version": "1.0.0" }
  },
  "assets": []
}
```

- 学歴・職歴は`id`、`yearMonth`、`text`を持つ順序付き配列。資格も同じ形式。
- `profile`には`addressKana`、任意の`genderLabel`、任意の`alternateContact`を追加する。別連絡先は郵便番号・住所・ふりがな・電話・メール。年齢は書類日付と生年月日から算出し、保存しない。
- `career.positions`は会社単位。`id/companyName/startYearMonth/endYearMonth/role/companyOverview/projects`を持ち、終了年月nullは在籍中。会社概要は事業内容・資本金表示・従業員数表示などの任意項目。
- `projects`は順序付き案件配列。`id/name/startYearMonth/endYearMonth/overview/phases/responsibilities/achievements/teamSize/languages/technologies/url`。概要・業務・実績は本文AST、フェーズ・言語・技術は文字列配列、規模は表示用文字列、URLは任意のhttp/https文字列。終了年月nullは進行中。
- スキルは`id/name/experienceLabel/description`。資格は`resume.qualifications`を職務経歴書からも参照する。実装時の正式Schemaにこれらを含め、上の例は追加任意項目を省略した最小サンプルとして扱う。
- 日付はISO形式、年月は`YYYY-MM`。配列順を紙面順として扱い、勝手にソートしない。
- 本文はTiptap互換JSONの限定サブセット。`doc/paragraph/text/bulletList/orderedList/listItem/hardBreak`、markは`bold/italic`。許可属性も定義する。見出しは書類構造で表現する。
- 未対応node/mark/属性はエラーとして扱い、保存・出力時に黙って捨てない。貼付HTMLはエディタ側で許可書式へ変換する。
- `assets`は`id`、`mediaType`、`base64`。画像はデコード後の実体も検証し、初期案として画像1枚5MiB、JSON全体20MiB、本文深さ16を上限にする。写真追加前にサイズと向きを調整する。
- 新しいschemaVersionは拒否して原本を維持する。旧版migrationは純粋関数として実装し、元ファイルを明示保存前に書き換えない。
- 任意項目は空でも保存できる。内容の不足は警告、構造不正や不正な日付は保存・生成エラーとして区別する。
- TS型とRust型だけで整合を期待しない。JSON Schema、共通fixture、IPCの生成型または契約テストで境界を検証する。

## 4. エディタと画面

左に書類・セクション一覧、中央に基本情報フォームと本文エディタ、右にPDFプレビューを置く。狭いウィンドウでは編集／プレビューを切り替える。

変更のたびに編集リビジョンを増やし、保存済み／生成済みのリビジョンを記録する。入力中にPDFコンパイルは実行しない。「PDF更新」で現在のスナップショットを生成する。生成開始後に本文が変わった場合、結果には「更新前の内容」と表示する。

本文Undo/Redoはエディタ単位、フォームと行操作のUndoは後続。どちらも未保存状態を正しく扱う。新規・開く・閉じる操作ではJSON保存を促す。IME変換中のショートカット処理はcomposition状態を考慮する。

PDF.jsはnpmで導入しworkerも同梱する。WebViewの内蔵PDF表示に依存しない。Rustが管理する生成結果IDからPDF bytesを取得し、ページを描画する。外部URLへPDFをアップロードしない。

## 5. TeXジェネレータとテンプレート

標準テンプレートの紙面は[参考テンプレート仕様](TEMPLATE_REFERENCE.md)に従う。履歴書は罫線付き帳票、職務経歴書は見出し・スキル表・会社帯・案件詳細の階層とする。

`validate(Project) → DocumentModel → render(template, model) → GeneratedBundle`の順に実行する。GeneratedBundleは`main.tex`、必要な`.sty`などの資源、写真を含む。

通常テキストには単一のエスケープ関数を使い、`\ { } $ & # % _ ^ ~`を処理する。改行、リスト、太字・斜体は限定ASTのvisitorでTeX構造へ変換する。本文をHTMLとしてRustへ渡したり、ユーザー入力をTeX命令として扱ったりしない。

テンプレートの`main.tex`と共通スタイルに紙面の定義を置く。生成された`content.tex`などをそこから読み込む設計にし、プレースホルダの単純な文字列置換で全項目を埋めない。入力由来のファイル名は使わず、資源は固定名で出力する。案件URLは専用の検証・エスケープ処理を通し、長いURLの折返しに対応する。生のTeX命令や任意スキームを許可しない。

manifestにはID、版、書類種別、対応schemaVersion、TeXエンジン、必要パッケージ、フォントを記載する。MVPでは同梱した開発者管理テンプレートだけを実行する。指定版が見つからない場合は勝手に最新版へ置換せず、利用可能な版への変更をUIで提示する。

LuaLaTeX＋LuaTeX-jaを採用候補とし、Harano AjiなどTeX環境側のフォントを使う。OS専用フォントへの依存を避け、同一環境で再現できるよう依存一覧を固定する。フォントのアプリ再配布はMVPに含めない。

## 6. コンパイルと保存

Rustから引数配列で外部プロセスを起動する。shell文字列は使わない。生成ジョブごとに新規作業ディレクトリを作り、プロジェクトのディレクトリをcwdにしない。

latexmkはLuaLaTeXモード、非対話、エラー時停止、shell escape無効で起動する。ユーザー側のlatexmk設定を読み込まない設定と、制御したTeX入力・出力パスをM1で検証する。環境診断は実行ファイルの存在確認に加え、同じ起動経路で最小日本語PDFをコンパイルする。

GUI起動時はシェル起動時のPATHと異なる場合があるため、PATH検出に加え、既知のmacOS配置と利用者指定の実行ファイルパスを扱う。実行ファイル設定はアプリ設定に保存し、JSON内の値から任意コマンドを実行しない。

1件ずつ生成し、jobIdと編集revisionを付与する。キャンセル・タイムアウト・終了時にlatexmkだけでなくLuaLaTeXなどの子プロセスも停止する。標準出力・標準エラーは継続読取して上限を設け、終了コード・ログ・PDF実体を確認して成功判定する。

診断の分類は`INVALID_PROJECT / UNSUPPORTED_VERSION / TEMPLATE_NOT_FOUND / TEX_NOT_FOUND / TEX_DEPENDENCY_MISSING / COMPILE_FAILED / TIMEOUT / CANCELLED / IO_ERROR`。UIには短い説明、必要に応じて詳細ログを表示する。ログをJSONへ埋め込まず、個人情報を含む可能性があるためCIのfixtureは架空データのみとする。

JSONは保存先と同じディレクトリへ一時書込・flush後、置換する。PDFとTeXも生成完了後に出力先へ反映する。TeX一式は専用サブディレクトリに出力し、既存ファイルがある場合は上書き確認する。両PDFの出力は書類別に成功／失敗を返し、部分成功を隠さない。

作業ディレクトリは結果利用中のみ保持し、プレビュー切替・アプリ終了・次回起動時の期限切れ掃除で削除する。失敗時も入力データと最後に成功したPDFは維持する。

## 7. IPC境界

| コマンド案 | 用途 |
| --- | --- |
| `open_project` | ファイル選択、読込、検証、migration |
| `save_project` | 選択済み保存先または名前を付けて保存、原子的保存 |
| `import_photo` | ファイル選択、画像検証、asset化 |
| `list_templates` | 同梱manifest取得 |
| `diagnose_tex` | 実行環境と最小日本語組版の確認 |
| `generate_pdf` | Projectスナップショット、書類種別、revisionからジョブ開始 |
| `cancel_generation` | 所有するjobIdの処理を中止 |
| `read_generated_pdf` | 管理対象resultIdのPDF取得 |
| `export_pdf` / `export_tex` | 保存先選択後の出力 |

ファイル選択は用途別コマンドからネイティブダイアログを呼ぶ。フロントへ汎用のshell実行・任意ファイル読書きAPIを公開しない。Rust内部でパスと結果IDを検証する。

Tauriのcapabilitiesは必要なウィンドウと機能に限定する。アプリ独自コマンドは登録だけでは全ウィンドウに開かれる場合があるため、AppManifestで宣言したpermissionも設定する。CSPを構成し、PDF workerの読込と本番bundleでの動作をM1で確認する。[Tauri Capabilities](https://v2.tauri.app/security/capabilities/)

## 8. 設計検証の優先順位

最初に、bundleからのテンプレート読込、日本語PDF生成、macOSのGUI環境でのTeX検出、PDF.js、IME、実機E2Eを小さな縦切りで検証する。ここが成立してから編集機能を広げる。
