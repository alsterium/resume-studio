# ADR 0002: PDFプレビュー

状態: 採用（2026-10-06）

PDF.js 6.4.299を採用し、Node 22.14.0との互換性を公式npmパッケージのenginesで確認した。Viteでworkerを同梱し、PDF bytesをRustの管理する結果IDから取得する。WebView内蔵PDF表示や外部CDNに依存しない。

[PDF.js公式API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)と[ページ移動の公式例](https://github.com/mozilla/pdf.js/blob/master/examples/learning/prevnext.html)に従い、getDocument・getPage・canvas renderを利用する。Uint8Arrayはworkerへ移譲されるためコピーを渡す。ページ変更時は前のrender taskを中断し、破棄時はloading taskを破棄する。

実macOS WebViewで日本語・特殊文字を含む複数ページPDFを描画し、拡大とページ移動を確認した。Wasm画像デコードは無効とし、写真対応のT13で改めて検証する。
