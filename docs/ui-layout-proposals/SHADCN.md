# shadcn/ui版のレイアウト案（T37）

T36の共通機能要件と3レイアウトを継承し、shadcn/uiのコンポーネント構成を指定して組み込みimage_genで再生成。比較用の画像であり、コンポーネントをインストール・実装したものではない。

## デザイン指定

白い背景、neutral/zinc系の文字と淡い背景、細い境界線、約6pxの角丸、36px相当の入力とボタン、14px相当の本文、Lucide風のアウトラインアイコン。主要ボタンは黒、補助操作はoutline/ghost。未保存はBadge、更新前PDFは淡い警告色のAlertで区別する。テンプレート名は「標準履歴書 1.2.0」。前案の規格名・住所検索・未対応リンク書式は追加しないよう指定した。

| 案 | 主なコンポーネント | 目的 |
| --- | --- | --- |
| [A：3ペイン](a-three-pane-shadcn.png) | Sidebar、Tabs、Resizable、Scroll Area、Card、Input、Label | 項目移動・入力・PDF確認を同時に行う |
| [B：ステップ式2ペイン](b-guided-two-pane-shadcn.png) | Tabs、Button、Separator、Card、Table、Resizable | 入力項目を順に確認する。ステップ表示はButton等の組合せ |
| [C：PDF重視](c-preview-first-shadcn.png) | Tabs、Accordion、Toggle Group、Card、Resizable、Scroll Area | 本文を修正しながらPDFを広く確認する |

共通操作はButton、Dropdown Menu、Badge、Select、Alert。PDF紙面の描画は既存のPDF.js、本文編集は既存のTiptapを使う想定で、それぞれの周辺UIをshadcn/uiで構成する。PDFは読み取り専用、更新は手動、JSON保存も明示操作という要件を維持する。

## プロンプトと参照

実際に渡した全文は[prompts-shadcn.json](prompts-shadcn.json)。組み込み画像生成ツールを使用。各画像は1440×900相当の画面構成案で、実装時の1200×800での表示・操作検証は別途必要。

2026-10-07に公式ドキュメントを参照：[Sidebar](https://ui.shadcn.com/docs/components/sidebar)、[Resizable](https://ui.shadcn.com/docs/components/resizable)、[Tabs](https://ui.shadcn.com/docs/components/tabs)。

## 目視確認

3画像でニュートラルなコンポーネント表現、書類切替、未保存表示、保存、書き出し、テンプレート、PDF更新、更新前警告、ページ／倍率操作を確認した。AはSidebarとフォーム、BはCard内の編集表、CはAccordionと本文ツールバーを表現する。

画像生成の細部は仕様ではない。Aに生成された備考欄・必須マークは追加要件とせず、既存のモデルと検証条件に合わせる。Bの年月欄に生成された期間や「現在に至る」は既存の年月・内容欄へ正しく分ける。BのPDF見開きは右端が切れているため、実装では全幅表示または横スクロールで全文を確認できるようにする。Cのわずかなアクセント色はneutralテーマへ統一可能。写真寸法や紙面は既存TeXテンプレートを正本とする。
