# 書類テンプレートの開発

MVPはビルド時に同梱した開発者管理テンプレートだけを利用する。利用者が任意のTeXを読み込んで実行する機能はない。Project JSONは内容とテンプレートID／版を保持し、組版用寸法を保持しない。

## 構成と契約

`src-tauri/templates/resume-standard-v1.2`／`resume-standard-v1.3`と`career-standard-v1.2`にそれぞれ`manifest.json`、`main.tex`、`resume.sty`／`career.sty`がある。Rustの`generator/templates.rs`がinclude_str!で同梱するため、実行時のcwdやリポジトリの位置に依存しない。

manifestはID、version、displayName、documentKind（resume／career）、対応schemaVersions、engine（lualatex）、packages、fontsを定義する。解決にはID・版・書類種別・Schema・エンジンの一致が必要。同じIDの新版を追加しても旧JSONの指定版を勝手に置き換えない。

`generator/documents.rs`が検証済みProjectから書類モデルを作り、`content.tex`を生成する。main.texはこれを読み込む入口、styは項目マクロと紙面の定義。入力テキストには共通エスケープ、本文には限定AST visitor、URLには専用検証とエスケープを使う。新しいテンプレートで入力をTeX命令として挿入しない。

## 新しい紙面の追加

1. 同じ書類種別のディレクトリをコピーし、新しいID／版／表示名をmanifestへ設定する。本文・写真の仕様を保ってstyとmain.texを変更する。
2. `generator/templates.rs`の同梱一覧へmanifest/main/styのinclude_str!を追加する。生成モデルが既存のマクロを出すため、新しいstyもそのマクロ契約を実装する。
3. 出力するstyle名は現在の許可名`resume.sty`／`career.sty`を使用する。別名や資源を追加する場合は`generator/bundle.rs`の固定資源許可リストと`storage/outputs.rs`の置換可能資源、書込テストも更新する。
4. パッケージやフォントを増やす場合はmanifestに記載し、`compiler/diagnostics.rs`の診断資源とCIのTeX導入を更新する。manifest記載資源を診断する契約テストも通す。
5. 架空Projectで新しいテンプレート参照を指定し、`documents`結合テストとゴールデンを追加する。版不一致を拒否し、UI一覧から明示選択できることを確認する。
6. 実TeX、紙面QA、実WebView、通常bundleを確認する。紙面変更時は検証済みの版を更新する。過去版を削除する場合は、旧JSONが明示的な選択変更を必要とすることを記録する。

スタイルだけの変更でも日本語・長文・英数字・写真・続紙への影響を検証する。参照原本の文章や本人写真をテストへ転記しない。生成資源と版は[TeX出力契約](GENERATED_TEX.md)、紙面の基準は[参考仕様](TEMPLATE_REFERENCE.md)を参照する。

## 検証

```sh
pnpm check
pnpm test:tex
pnpm build:e2e
pnpm test:e2e
pnpm tauri build --debug
```

`src-tauri/tests/documents.rs`は変換・版・実FS展開、`real_tex.rs`は独立コンパイル、全文・寸法・リンク・写真を検証する。必要なテンプレートのケースを追加する。最大長と画像化の手順は[GENERATED_TEX.md](GENERATED_TEX.md#t20の検証マトリクスと目視qa)。QA成果物はGitへ追加しない。

リポジトリのアプリ名変更は書類テンプレートIDや版を変更しない。アプリ全体の複製は[再利用手順](REPOSITORY_TEMPLATE.md)、ライセンスは[方針](LICENSE_POLICY.md)に従う。
