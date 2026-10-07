# セットアップ

## 開発環境

macOSのGUIセッションで使用する。検証済みはmacOS 26.5.2／Apple Silicon。`src-tauri/tauri.conf.json`のminimumSystemVersionは12.0だが、最低OS、Intel、Windows/Linuxの実機受け入れはまだ行っていない。

Xcodeの開発環境を用意し、`xcode-select -p`が開発環境を指すことを確認する。Node.jsは`.node-version`の22.14.0、pnpmは`package.json`の10.26.2を使用する。Rustはrustupを用意すると`rust-toolchain.toml`の1.96.1とrustfmt／Clippyが選択される。依存の初回取得にはネットワークが必要。

```sh
node --version
pnpm --version
rustc --version
xcode-select -p
pnpm install --frozen-lockfile
pnpm tauri dev
```

`pnpm dev`はブラウザだけの画面確認で、ネイティブ保存や実TeX生成はTauriで起動する。TauriはViteも起動するので別々に立ち上げない。アプリにNode.jsやTeXを同梱しない。

## TeX環境

アプリはインストール済みのTeXを使用し、自動インストールは行わない。LuaLaTeX用の日本語組版資源を含むTeX環境を用意する。macOSではTeXの配置として`/Library/TeX/texbin`を探索するため、Finder起動時の最小PATHでも利用できる。

| 種類 | 必要なコマンド／資源 |
| --- | --- |
| 実行ファイル | latexmk、lualatex、kpsewhich |
| 日本語組版 | ltjsarticle.cls、luatexja-preset.sty、regexpatch.sty |
| 紙面・画像・リンク | graphicx.sty、geometry.sty、hyperref.sty、color.sty |
| フォント | HaranoAjiMincho-Regular.otf、HaranoAjiMincho-Bold.otf、HaranoAjiGothic-Medium.otf、HaranoAjiGothic-Bold.otf |

TeX Liveをtlmgrで管理している環境では、使用中のTeX Liveと同じ年のパッケージ管理先で以下を追加できる。管理者権限が必要な配置では、その環境の運用方法に従う。

```sh
tlmgr install latexmk luatexja haranoaji regexpatch graphics geometry hyperref
latexmk --version
lualatex --version
kpsewhich HaranoAjiGothic-Bold.otf
```

ローカル検証はTeX Live 2026basic、LuaHBTeX 1.24、latexmk 4.88。CIの導入方法と版の固定範囲は[CI](CI.md)を参照する。利用者のインストール済みTeXをこの版へ自動変更する機能はない。

起動後に「TeX環境を確認」を押し、日本語PDFの成功まで確認する。版の表示だけで生成成功とは扱わない。診断は一時ディレクトリで固定日本語TeXを実コンパイルする。コマンドラインでも確認できる。

```sh
cargo run --manifest-path src-tauri/Cargo.toml --locked --example diagnose_tex
```

不足時の資源名・対処は[トラブルシューティング](TROUBLESHOOTING.md)。TeXが未導入でもJSON編集・保存とTeX一式の出力はできる。

## .appとサンプル

```sh
pnpm tauri build --debug
open 'src-tauri/target/debug/bundle/macos/Resume Studio.app'
```

releaseビルドは`pnpm tauri build`、生成先は`src-tauri/target/release/bundle/macos`。通常ビルドにdesktop-e2e featureを指定しない。署名・公証・配布用Releaseの発行はMVPに含めない。

「開く」で`tests/fixtures/project-full.json`を選ぶと全項目入りの架空サンプルを読み込める。空のサンプルは`project-empty.json`。本人データで試す前に別名保存し、参照PDF・本人写真・入力JSONをGit管理へ含めない。

デスクトップE2Eの前提と再現手順は[テスト](TESTING.md)。GitHub templateから派生するときは[リポジトリ再利用](REPOSITORY_TEMPLATE.md)に従う。
