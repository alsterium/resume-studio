# リポジトリの再利用

この非公開リポジトリはGitHubのtemplate repositoryとして設定している。アクセス権のあるアカウントから「Use this template」で別リポジトリを作成できる。通常のcloneも利用できる。作成先の公開範囲とライセンスは利用者が決める。

## 名称の変更

新しいリポジトリで、Node.js 22とpnpm 10.26.2を用意し、以下を実行する。

```sh
pnpm install --frozen-lockfile
pnpm template:rename --name "Document Workshop" --slug document-workshop --identifier com.example.document-workshop
pnpm format
pnpm rust:format
git diff
pnpm check
```

ツールは引数と現在のメタデータを検証してからファイルを書き換える。実行時のI/O障害に対する全ファイル一括トランザクションは提供しないため、変更はGit差分で確認する。何度でも再実行できる。既存依存packageと重複するslugは拒否する。

| 指定 | 変更先と用途 |
| --- | --- |
| `--name` | Tauri productName、ウィンドウの表示タイトル、HTML title。Reactの表示名とE2Eの.appパスはproductNameを参照 |
| `--slug` | package.json name、Cargo package名とlockfile、Rust lib名とsrc/tests/examplesの参照。実行ファイル名もこの値 |
| `--identifier` | Tauri bundle identifier。自分の管理する逆DNS形式で指定 |

`--name`は1〜64文字のファイル名に使える表示名、`--slug`は英小文字から始まるkebab-case、`--identifier`は3要素以上の逆DNS形式に限定する。内部ウィンドウlabelは`main`を維持する。このlabelは表示名ではなく、capability、終了イベント、テストから参照する識別子である。

履歴書／職務経歴書の書類名、Project JSON、同梱TeX manifestのテンプレートID、サンプルデータ、ドキュメント内の元リポジトリURLは改名しない。別用途へ派生する場合はそれぞれの仕様として変更する。新しいリポジトリではREADMEのURLや説明、task台帳の過去の証跡も確認し、新規開発タスクを追加する。

## アイコンと生成物

正方形のPNGまたはSVGを用意し、CLIでアイコン一式を生成する。参照原本や本人写真を使わず、利用権のある素材を使用する。

```sh
pnpm tauri icon /path/to/app-icon.png
pnpm tauri build --debug
```

CLIの既定出力は`src-tauri/icons`。Tauri設定のiconリストにあるPNG、icns、icoをGit差分で確認する。macOS用の`.app`は`src-tauri/target/debug/bundle/macos/Document Workshop.app`、中の実行ファイルは`Contents/MacOS/document-workshop`となる。通常のreleaseビルドは`pnpm tauri build`、出力先は`target/release/bundle/macos`。

WebdriverIOのテスト用アプリは別途生成する。

```sh
pnpm build:e2e
pnpm test:e2e
pnpm test:tex
```

これらはmacOS、GUIセッション、システムTeXを必要とする。E2E後に通常アプリを生成するときは、テストfeatureを指定せずに再ビルドする。詳細は[CI](CI.md)と[開発規約](DEVELOPMENT.md)を参照。

## cloneでの検証

T26は元リポジトリと別ディレクトリの新規cloneへ実装差分を適用し、`Document Workshop`へ変更し、品質ゲート111テスト、通常.appビルド、改名後の実WebView E2Eの成功を確認した。実行結果はタスク台帳へ記録している。cloneの名称変更や架空アイコン生成は検証用であり、元アプリの名称・アイコンは変更しない。
