# ADR 0002: PDFプレビュー

状態: 採用（2026-10-06）

PDF.js 6.4.299を採用し、Node 22.14.0との互換性を公式npmパッケージのenginesで確認した。Viteでworkerを同梱し、PDF bytesをRustの管理する結果IDから取得する。WebView内蔵PDF表示や外部CDNに依存しない。

[PDF.js公式API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)と[ページ移動の公式例](https://github.com/mozilla/pdf.js/blob/master/examples/learning/prevnext.html)に従い、getDocument・getPage・canvas renderを利用する。Uint8Arrayはworkerへ移譲されるためコピーを渡す。ページ変更時は前のrender taskを中断し、破棄時はloading taskを破棄する。

実macOS WebViewで日本語・特殊文字を含む複数ページPDFを描画し、拡大とページ移動を確認した。Wasm画像デコードは無効とし、写真対応のT13で改めて検証する。

## ズーム操作（T53）

shadcn/uiのButtonとButtonGroupを使い、−・実倍率・＋・幅合わせをプレビューの右下24pxへ固定する。スクロール領域とオーバーレイの親を分け、紙面のスクロールに追従させない。案内文を表示せず、倍率とボタンの枠線は共通色にする。倍率は25〜200%、ボタンは25%刻み。幅合わせの実倍率から指定倍率へ切り替え、書類別設定の既存契約を維持する。

WKWebView/Safariのgesturestart/change/end、Ctrl付きwheel、2指TouchEventをプレビュー領域だけで処理する。通常wheel・1指スクロールは抑止しない。WebKitの累積scaleは開始時倍率へ掛け、同時wheel/touchで二重拡大しない。描画完了後に操作位置を基準にスクロールを補正する。リスナーは破棄時に解除する。

参照：[shadcn ButtonGroup](https://ui.shadcn.com/docs/components/radix/button-group)、[公式ソース](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button-group.tsx)、[MDN wheel](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)、[MDN gesturechange](https://developer.mozilla.org/en-US/docs/Web/API/Element/gesturechange_event)。既存Radix系UIに合わせて公式ButtonGroup/Textを追加し、追加依存は不要。

操作パネルは通常opacity 0.55、hover/focus-within時は1、ピンチ中は優先して0.55。Ctrl付きwheelの最終イベントから180msでピンチ状態を解除する。表示切替は150ms、reduced-motionではアニメーションなし。透明度を下げても操作可能。

## 1ページ表示の縦連続スクロール（T75）

見開きOFFでは全ページの軽量な枠を縦に並べる。生成PDFは共通A4サイズのため、先頭ページの実寸と倍率で枠の高さを確保し、ページ間隔20pxを維持する。画面内と前後のページだけcanvasへ描画し、画面外のピクセルバッファを解放する。描画中のページが範囲外へ出た場合や倍率/書類変更ではRenderTaskを中断し、破棄後の非同期結果を反映しない。

スクロール位置から表示ページを算出して番号と書類別の保持状態を更新する。スクロール起点の番号変更ではページ先頭へジャンプしない。前/次ボタン・再生成・書類切替・見開きから戻る操作では対象ページの先頭へ移動する。見開きONは従来の横2ページ表示。ズームはページ内の基準点を保ち、ページ間隔を倍率に掛けない。幅合わせや領域幅の変更時は現在ページの先頭を保つ。PDFランタイムの遅延読込promiseを共有し、読込失敗時は再試行可能にする。
