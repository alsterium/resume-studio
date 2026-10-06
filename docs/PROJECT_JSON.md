# Project JSON v1

構造の正本は [project-v1.schema.json](../schemas/project-v1.schema.json)。型は [TypeScript](../src/domain/project.ts) と [Rust](../src-tauri/src/domain/project.rs)。全項目入りの [架空fixture](../tests/fixtures/project-full.json) と [空fixture](../tests/fixtures/project-empty.json) を両実装で検証する。

1つのJSONに基本情報、履歴書、会社→案件の職務経歴、本文書式、テンプレート参照、埋め込み写真を保持する。絶対パス、TeX、PDF、ログ、年齢は保存しない。配列の順序が表示順となる。

schemaVersionは1のみ。未知の項目・node・mark・属性も拒否し、黙って削除しない。別schemaVersionのmigrationはまだなく、新版を読んだ際に原本を書き換えない。構造として正しい別テンプレートID・版はJSONに保持できるが、実行可能な同梱版かの照合は生成時に行う（T17）。

書類日付は必須の実在ISO日付。生年月日・行の年月・開始年月は未入力の空文字を許す。終了年月はnullが在籍中／進行中、空文字が未入力。入力した日付は0001〜9999年のグレゴリオ暦、年月はYYYY-MM。入力済みの終了年月は開始年月より前にできない。未入力の内容に関する警告はフォーム・生成側で扱い、JSON保存を妨げない。

本文はTiptap互換のdoc、paragraph、text、hardBreak、bulletList、orderedList、listItem。markはbold／italicのみ。番号付きリストのattrsはstart（1〜65535）とtype:nullを許す。listItemはparagraphから始める。空のdocとparagraphはcontentの省略・空配列のどちらも許す。Rustの保存時に空のcontent/marksとattrs.type:nullを省略することがあるが、書式・値・順序は維持する。

上限を超えた入力は切り捨てず拒否する。

| 対象 | 上限 |
| --- | --- |
| JSONファイル | 20MiB。読込は実ファイルbytes、書込は整形済みJSON bytesで検証 |
| JSON構造 | 深さ64、値200,000個。Schema実行前に制限 |
| 通常の表示文字列 | Unicodeコードポイント1,024個。C0/C1制御文字は禁止 |
| 行・会社・案件・スキル・写真ID | ASCII英数字・ハイフン・アンダースコア1〜80文字。プロジェクト内で重複不可 |
| 学歴・職歴・資格・スキル | 各200行 |
| 会社／会社あたりの案件 | 100社／200件 |
| フェーズ・言語・技術 | 各50個 |
| 本文1欄 | UTF-8 text合計64KiB、node合計10,000、深さ16、リスト4階層 |
| 写真 | JPEG/PNG、4枚まで、base64デコード後1枚5MiB |
| 案件URL | http/https、ホスト必須、2,048文字。空文字・省略可 |

photoAssetIdがnullでなければassets内のIDを参照する。写真実体のMIME・画像寸法・向きの検証と取り込みはT13で追加する。v1の容量検証だけで画像としての妥当性を保証しない。

フロントはAjv 8.20.0でSchemaをNode側で事前コンパイルする。`pnpm generate:schemas`の生成先は.gitignore対象の.generated。build・typecheck・test:integration・test:unitで自動実行し、生成物を手編集しない。ブラウザ内でevalやFunctionを使わない。Rustはjsonschema 0.58.5（外部HTTP・ファイル参照featureなし）で同梱Schemaを検証後、serde型へ変換し、日付・期間・ID参照・本文容量を検証する。

Schemaは構造を表し、日付の実在性、期間の順序、参照先、UTF-8容量などは意味の検証で補う。共通の不正データfixtureと容量・深さテストで、TS/Rustが同じ条件を拒否することを確認する。

## 保存と読み込み

「新規」「開く」「保存」「名前を付けて保存」でJSONを扱う。ファイル選択はRust側のnative dialogで行う。WebViewにはパスを渡さず、Rustが保持する現在の保存先IDと表示用ファイル名を返す。汎用ファイル読書き・dialog IPCは許可しない。保存名は.jsonで終える（大文字も可）。拡張子を後から補ってnative dialogの上書き確認を迂回しない。

読み込み時は容量・Schema・意味の検証を終えてから現在のプロジェクトを置き換える。キャンセル・不正JSON・未知の版では入力を保持し、原本へ書き込まない。本文エディタは読み込み時に再生成して書式を復元する。

保存は全項目を検証し、保存先と同じディレクトリの一時ファイルへ書き込む。既存ファイルの権限を維持し、flushとsync_allの後に置換する。保存完了後にだけ保存先IDを更新する。書込・置換失敗では原本を保持し、一時ファイルを削除する。親ディレクトリのfsyncによる電源断時の保証は行っていない。未保存表示・新規／開く／終了時の破棄確認はT12で追加する。
