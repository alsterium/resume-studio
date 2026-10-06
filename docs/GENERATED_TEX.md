# 書類別TeX bundle

正式Projectは検証後、履歴書／職務経歴書の書類モデルに変換し、選択された同梱テンプレートで`GeneratedBundle`を生成する。入力テキストは共通エスケープ、本文は限定AST visitorを通す。入力をTeX命令として評価したり、テンプレートへの文字列置換を行ったりしない。

## 出力契約

- `main.tex`：固定の入口。LuaLaTeX、ltjsarticle、luatexja-preset（Harano Aji）で`content.tex`を読み込む。
- `content.tex`：書類の項目を固定マクロへ渡す。履歴書は基本情報・2連絡先・3履歴表・志望動機・希望欄、職務経歴書は氏名・日付・要約・スキル／共通資格・会社／案件の全項目・自己PRを出力する。配列順を保持する。
- `resume.sty`または`career.sty`：紙面・項目の組版定義。T17は初期の流し込みレイアウト。参考PDFへの罫線・余白・改ページ調整はT18／T19、境界を含む組版検証はT20で行う。
- `manifest.json`：テンプレートID・版・表示名・書類種別・対応Schema・エンジン・必要パッケージ／フォント。
- 履歴書だけ、選択写真を正規化して`photo-1.png`または`photo-1.jpg`へ展開する。未選択写真や元画像パス、Projectの管理用ID／titleは紙面へ出さない。

同梱版は`resume-standard`／`career-standard`の`1.0.0`、Schema 1、LuaLaTeX。ID・版・書類種別・Schemaの完全一致で解決し、非対応なら`TEMPLATE_NOT_FOUND`として拒否する。JSONの指定版を自動変更しない。画面の「テンプレート一覧を確認」から利用可能な版を明示選択すると未保存変更になる。

履歴書の年齢は書類日付時点で計算。未入力の年月・任意欄は空欄。職務経歴の終了年月nullは在籍中／進行中、空文字は空欄を保持する。空の任意会社項目・案件本文／URLは省略する。URLはHTTP(S)として検証してリンク先を正規化・エスケープし、表示には区切り文字の折返し候補を入れる。

入力はProject JSONの制限に従い、生成後の`content.tex`は64MiB以内（超過はエラー、切り捨てなし）。bundleの書込は呼出側が所有する新規作業ディレクトリで行う。資源名は固定の許可リストに限定し、重複・既存ファイル／symlinkは書込前に拒否、各ファイルはcreate_newで作成する。途中のI/Oエラーでは作業ディレクトリ所有者が片付ける。コンパイル時はTempDirが成功／失敗双方を片付ける。利用者向け保存・上書き確認はT23で実装する。

## 単体コンパイルの確認

開発用exampleはJSONから**新しい**ディレクトリへbundleを展開する。既存ディレクトリへの上書きは行わない。

```sh
cargo run --manifest-path src-tauri/Cargo.toml --locked --example project_to_tex -- tests/fixtures/project-full.json resume /tmp/resume-bundle
cd /tmp/resume-bundle
latexmk -norc -lualatex -interaction=nonstopmode -halt-on-error -latexoption=-no-shell-escape main.tex
```

職務経歴書は`resume`を`career`へ変えて別の新規ディレクトリを指定する。Rust結合テストは正式全項目・書式・版拒否・写真資源・実FS保存を検証し、`pnpm test:tex`は空／全項目の両書類をアプリと同じ隔離コンパイルと展開後の単体コンパイルで確認する。実macOS E2Eは保存・再起動後の両書類を画面操作から生成し、実PDFの文字とPDF.js描画を確認する。
