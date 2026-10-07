# ライセンスの扱い

アプリの独自ソース、独自TeXテンプレート、架空サンプルには、現時点でオープンソースライセンスを付与していない。リポジトリは非公開で開発し、GitHubのtemplate設定を利用している。template設定とライセンスの選定は別の事項として管理する。

PRDに従い、公開前にユーザーがアプリ／テンプレートの利用・変更・再配布条件を選定する。選定後にLICENSE、必要なNOTICE、package/Cargoメタデータ、READMEを更新する。現時点の文書整備のためにMIT等を自動で選定しない。

npmとCargoの依存は各依存のライセンスに従う。配布する際はlockfileにある実際の依存版と、その版のLICENSE／NOTICEを確認する。テストfeatureだけのWebDriver依存も区別する。依存ライブラリの利用条件は独自コードへ付けるライセンスとは別に確認する。

TeX本体、LuaTeX-ja、Harano Aji等はシステムにインストール済みのものを使い、アプリに再配布しない。今後フォントやTeX資源を同梱する場合は、同梱する資源の版と利用条件を確認する。

参考PDFは紙面構成の確認にのみ使用する。参考PDFの本人情報・写真をサンプル、スクリーンショット、CIのfixture、リポジトリへ転載しない。

## shadcn/uiの取り込み（T38）

`src/components/ui`は2026-10-07に公式shadcn CLIのnew-york/Radixレジストリから取得し、日本語ラベルと`cn`の参照を調整した。上流のMITライセンスと著作権表示を[notices/shadcn-ui-LICENSE.txt](../notices/shadcn-ui-LICENSE.txt)へ保存する。原典は[shadcn-ui/ui LICENSE.md](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)。この条件は取り込んだコンポーネントに適用し、独自アプリ全体のライセンス選定とは分ける。配布時にはこの表示を含める。
