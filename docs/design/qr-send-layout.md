# QR送信画面のレイアウト（T72）

組み込みimage_genで生成した[PC・スマホ案](qr-send-layout.png)を共通UIへ反映する。生成画像はデザイン参考で、実画面には既存のQR SVGを描画する。

PCは大きなQRを左に固定し、右に説明、容量・枚数・最短一周、状態、送信開始/停止、手動操作を配置する。追加指示により操作欄だけをスクロールさせ、展開時もQRの位置とサイズを維持する。スマホは説明とQRを上に固定し、その下に状態と主操作を優先した独立スクロール領域を置く。受信タブ・確認後の取込は共通の既存フローを使う。

送信は0.08秒固定。初期モードは送信、初期状態は停止。受信進捗は送信側では判断できないため表示しない。

## 最終生成プロンプト

```text
Use case: ui-mockup. Create a polished high fidelity UI design reference for Resume Studio QR project transfer SEND dialog, with a desktop dialog on the left and a mobile portrait screen on the right, both fully visible on a plain light gray background. Japanese interface, existing minimalist shadcn-style neutral white, charcoal black buttons, thin gray borders, small corner radii, readable typography, careful aligned 8px spacing, no gradients, no illustrations. Desktop dialog approx 820x620: header QR転送 and subtle close X; segmented tabs 送信 / 受信. Main body two columns, dominant large pure white square with black dense QR pattern at left (QR is illustrative placeholder only); right column clear heading QRで送信, instruction 受信側のカメラをこのQRに向けてください。, compact transfer stats 圧縮後 24 KiB / データ 28枚 / 1周 約2.40秒, neutral status 一時停止中 with small dot, primary full width dark button ループ送信を開始 with play icon. Under button fixed timing note 0.08秒ごとに切替. A collapsed disclosure 手動操作 for previous/next QR and jump number. Small footer 受信側に「受信完了」が出たら停止してください。. Mobile: same content in a single column at 390x844 proportion, header and tabs, heading/instruction short, large QR about300 square centered, compact fixed-width stable status strip 開始QR · 一時停止中, full width main action immediately below, inline compact stats, disclosure and quiet helper below. Both should feel calm, precise, utilitarian, QR and main action prioritized, stable alignment while QR phase changes, no timing editable field, no sender receive progress claims, no network or pairing elements, no fake device chrome or ornamental marketing graphics. Include all UI inside frame with comfortable spacing and no clipping. Render as a single landscape design sheet, flat front-facing crisp UI.
```
